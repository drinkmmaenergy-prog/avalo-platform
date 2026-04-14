import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  detectFanEntitlement,
  applyCreatorIndependenceMeasures,
  enforceCreatorBoundaryTools,
  checkActiveRestriction
} from '../services/pack181-independence.service';
import { BoundaryViolationContext } from '../types/pack181-independence.types';
import { admin, timestamp } from "../runtime";


const db = getFirestore();

export async function interceptMessage(
  fanId: string,
  earnerId: string,
  messageContent: string,
  chatId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  actionTaken?: string;
}> {
  try {
    const restrictionCheck = await checkActiveRestriction(fanId, earnerId);
    if (restrictionCheck.restricted) {
      const restriction = restrictionCheck.restriction!;
      return {
        allowed: false,
        reason: `You are currently restricted from messaging this earner. Restriction type: ${restriction.restrictionType}. Reason: ${restriction.reason}`,
        actionTaken: 'blocked_by_restriction'
      };
    }

    const boundaryCheck = await enforceCreatorBoundaryTools(
      earnerId,
      messageContent,
      fanId
    );

    if (boundaryCheck.blocked) {
      return {
        allowed: false,
        reason: boundaryCheck.reason || 'Message blocked by earner boundaries',
        actionTaken: 'blocked_by_boundary'
      };
    }

    const chatHistorySnapshot = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const chatHistory = chatHistorySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        content: data.content || '',
        timestamp: data.timestamp as Timestamp,
        senderId: data.senderId
      };
    });

    const previousViolationsSnapshot = await db
      .collection('earner_independence_cases')
      .where('fanId', '==', fanId)
      .where('earnerId', '==', earnerId)
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    const previousViolations = previousViolationsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        violationType: data.violationType,
        timestamp: data.timestamp as Timestamp,
        severity: data.severity
      };
    });

    const context: BoundaryViolationContext = {
      fanId,
      earnerId,
      messageContent,
      chatHistory,
      previousViolations
    };

    const detectionResult = await detectFanEntitlement(context);

    if (detectionResult.detected && detectionResult.recommendedAction) {
      const { recommendedAction } = detectionResult;

      if (recommendedAction.severity === 'critical' || 
          recommendedAction.type === 'ban' ||
          recommendedAction.type === 'freeze') {
        await applyCreatorIndependenceMeasures(
          fanId,
          earnerId,
          recommendedAction,
          detectionResult
        );

        return {
          allowed: false,
          reason: `Your message has been blocked due to ${detectionResult.eventType}. ${recommendedAction.reason}`,
          actionTaken: recommendedAction.type
        };
      }

      if (recommendedAction.type === 'block' || recommendedAction.type === 'cooldown') {
        await applyCreatorIndependenceMeasures(
          fanId,
          earnerId,
          recommendedAction,
          detectionResult
        );

        return {
          allowed: false,
          reason: `Your message has been blocked. A ${recommendedAction.type} has been applied. ${recommendedAction.reason}`,
          actionTaken: recommendedAction.type
        };
      }

      if (recommendedAction.type === 'warning') {
        await applyCreatorIndependenceMeasures(
          fanId,
          earnerId,
          recommendedAction,
          detectionResult
        );

        return {
          allowed: true,
          reason: `Warning: ${recommendedAction.reason}`,
          actionTaken: 'warning_issued'
        };
      }
    }

    return {
      allowed: true
    };
  } catch (error) {
    console.error('Error in message interceptor:', error);
    return {
      allowed: true
    };
  }
}

export async function checkMessageBeforeSend(
  fanId: string,
  earnerId: string,
  messageContent: string
): Promise<{
  canSend: boolean;
  warningMessage?: string;
  blockMessage?: string;
}> {
  try {
    const restrictionCheck = await checkActiveRestriction(fanId, earnerId);
    if (restrictionCheck.restricted) {
      const restriction = restrictionCheck.restriction!;
      const endTimeStr = restriction.endTime 
        ? restriction.endTime.toDate().toLocaleString()
        : 'indefinitely';
      
      return {
        canSend: false,
        blockMessage: `You are currently restricted from messaging this earner until ${endTimeStr}. Reason: ${restriction.reason}`
      };
    }

    const boundaryCheck = await enforceCreatorBoundaryTools(
      earnerId,
      messageContent,
      fanId
    );

    if (boundaryCheck.blocked) {
      return {
        canSend: false,
        blockMessage: 'This message contains content that violates the earner\'s boundaries. Please revise your message.'
      };
    }

    return {
      canSend: true
    };
  } catch (error) {
    console.error('Error checking message before send:', error);
    return {
      canSend: true
    };
  }
}

export async function displayBoundaryBanner(
  earnerId: string
): Promise<{
  showBanner: boolean;
  bannerText?: string;
}> {
  try {
    const settingsDoc = await db
      .collection('earner_boundary_settings')
      .doc(earnerId)
      .get();

    if (!settingsDoc.exists) {
      return { showBanner: false };
    }

    const settings = settingsDoc.data();

    if (!settings?.showBoundaryBanner) {
      return { showBanner: false };
    }

    const bannerText = settings.customBannerText || 
      'Purchases support creative work. They do not guarantee emotional access.';

    return {
      showBanner: true,
      bannerText
    };
  } catch (error) {
    console.error('Error getting boundary banner:', error);
    return { showBanner: false };
  }
}

export async function monitorFanBehaviorRealtime(
  fanId: string,
  earnerId: string,
  action: 'message' | 'purchase' | 'interaction'
): Promise<void> {
  try {
    const recentEventsSnapshot = await db
      .collection('fan_entitlement_events')
      .where('fanId', '==', fanId)
      .where('earnerId', '==', earnerId)
      .where('timestamp', '>=', Timestamp.fromMillis(Date.now() - 3600000))
      .get();

    if (recentEventsSnapshot.size >= 5) {
      const highSeverityEvents = recentEventsSnapshot.docs.filter(
        doc => doc.data().severity === 'high' || doc.data().severity === 'critical'
      );

      if (highSeverityEvents.length >= 2) {
        console.warn(`High-risk fan behavior detected: Fan ${fanId} to Creator ${earnerId}`);
      }
    }
  } catch (error) {
    console.error('Error monitoring fan behavior:', error);
  }
}



























