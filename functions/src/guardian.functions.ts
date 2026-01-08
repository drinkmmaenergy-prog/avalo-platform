/**
 * PACK 180: Guardian Cloud Functions
 * Real-time conversation monitoring and intervention functions
 */

import * as functions from 'firebase-functions';
import { guardianService } from './services/guardian.service';
import { guardianRewriteService } from './services/guardianRewrite.service';
import { RewriteIntent } from './types/guardian.types';

// ============================================================================
// Message Analysis Trigger
// ============================================================================

/**
 * Analyze new messages for safety risks
 * Triggered when a new message is created in any conversation
 */
export const analyzeMessage = functions.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    try {
      const messageData = snap.data();
      const { conversationId, messageId } = context.params;
      
      // Skip system messages
      if (messageData.type === 'system' || !messageData.senderId) {
        return null;
      }
      
      // Get message content
      const content = messageData.content || messageData.text || '';
      
      if (!content || content.trim().length === 0) {
        return null;
      }
      
      // Analyze for risks and trigger intervention if needed
      const analysis = await guardianService.analyzeAndIntervene(
        conversationId,
        messageData.senderId,
        messageId,
        content
      );
      
      if (analysis && analysis.recommendations.shouldIntervene) {
        console.log('Guardian intervention triggered:', {
          conversationId,
          messageId,
          riskLevel: analysis.riskDetection.riskLevel,
          interventionType: analysis.recommendations.interventionType
        });
      }
      
      return null;
      
    } catch (error) {
      console.error('Error analyzing message:', error);
      return null;
    }
  });

// ============================================================================
// Cooling Session Management
// ============================================================================

/**
 * Expire cooling sessions automatically
 * Runs every 5 minutes to check for expired sessions
 */
export const expireCoolingSessions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      const db = require('./init').db;
      const now = require('firebase-admin').firestore.Timestamp.now();
      
      // Find active sessions that have expired
      const expiredSessions = await db
        .collection('guardian_cooling_sessions')
        .where('status', '==', 'active')
        .where('expiresAt', '<=', now)
        .get();
      
      const batch = db.batch();
      let count = 0;
      
      expiredSessions.docs.forEach((doc: any) => {
        batch.update(doc.ref, {
          status: 'expired',
          updatedAt: now
        });
        count++;
      });
      
      if (count > 0) {
        await batch.commit();
        console.log(`Expired ${count} cooling sessions`);
      }
      
      return null;
      
    } catch (error) {
      console.error('Error expiring cooling sessions:', error);
      return null;
    }
  });

// ============================================================================
// HTTP Callable Functions
// ============================================================================

/**
 * Request message rewrite assistance
 */
export const requestMessageRewrite = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { conversationId, originalMessage, rewriteIntent } = data;
  
  // Validate inputs
  if (!conversationId || !originalMessage || !rewriteIntent) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  const validIntents: RewriteIntent[] = [
    'calm_tone',
    'clarify_intent',
    'express_boundary',
    'apologize',
    'decline_politely'
  ];
  
  if (!validIntents.includes(rewriteIntent)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid rewrite intent');
  }
  
  try {
    const result = await guardianRewriteService.requestRewrite(
      userId,
      conversationId,
      originalMessage,
      rewriteIntent
    );
    
    return {
      success: true,
      requestId: result.requestId,
      rewrittenMessage: result.rewrittenMessage,
      alternatives: result.alternatives
    };
    
  } catch (error) {
    console.error('Error requesting rewrite:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate rewrite');
  }
});

/**
 * Accept a rewritten message
 */
export const acceptRewrite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { requestId } = data;
  
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing requestId');
  }
  
  try {
    await guardianRewriteService.acceptRewrite(requestId);
    return { success: true };
    
  } catch (error) {
    console.error('Error accepting rewrite:', error);
    throw new functions.https.HttpsError('internal', 'Failed to accept rewrite');
  }
});

/**
 * Reject a rewritten message
 */
export const rejectRewrite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { requestId } = data;
  
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing requestId');
  }
  
  try {
    await guardianRewriteService.rejectRewrite(requestId);
    return { success: true };
    
  } catch (error) {
    console.error('Error rejecting rewrite:', error);
    throw new functions.https.HttpsError('internal', 'Failed to reject rewrite');
  }
});

/**
 * Resolve an intervention
 */
export const resolveIntervention = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { interventionId, resolution, feedback } = data;
  
  if (!interventionId || !resolution) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    await guardianService.resolveIntervention(interventionId, resolution, feedback);
    return { success: true };
    
  } catch (error) {
    console.error('Error resolving intervention:', error);
    throw new functions.https.HttpsError('internal', 'Failed to resolve intervention');
  }
});

/**
 * Check if user has active cooling in conversation
 */
export const checkCoolingStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { conversationId } = data;
  
  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing conversationId');
  }
  
  try {
    const isCooling = await guardianService.isUserCooling(conversationId, userId);
    const activeMeasures = await guardianService.getActiveCoolingMeasures(conversationId, userId);
    
    return {
      isCooling,
      activeMeasures
    };
    
  } catch (error) {
    console.error('Error checking cooling status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check cooling status');
  }
});

/**
 * Update guardian settings
 */
export const updateGuardianSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { enabled, interventionLevel, autoRewriteSuggestions, notifyOnIntervention } = data;
  
  try {
    const db = require('./init').db;
    const Timestamp = require('firebase-admin').firestore.Timestamp;
    
    const settingsRef = db.collection('guardian_settings').doc(userId);
    const settingsDoc = await settingsRef.get();
    
    const settingsData = {
      userId,
      enabled: enabled !== undefined ? enabled : true,
      interventionLevel: interventionLevel || 'moderate',
      autoRewriteSuggestions: autoRewriteSuggestions !== undefined ? autoRewriteSuggestions : true,
      notifyOnIntervention: notifyOnIntervention !== undefined ? notifyOnIntervention : true,
      updatedAt: Timestamp.now()
    };
    
    if (settingsDoc.exists) {
      await settingsRef.update(settingsData);
    } else {
      await settingsRef.set({
        ...settingsData,
        createdAt: Timestamp.now()
      });
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error updating guardian settings:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update settings');
  }
});

/**
 * Get guardian settings
 */
export const getGuardianSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const db = require('./init').db;
    const Timestamp = require('firebase-admin').firestore.Timestamp;
    
    const settingsRef = db.collection('guardian_settings').doc(userId);
    const settingsDoc = await settingsRef.get();
    
    if (settingsDoc.exists) {
      return settingsDoc.data();
    }
    
    // Return default settings
    return {
      userId,
      enabled: true,
      interventionLevel: 'moderate',
      autoRewriteSuggestions: true,
      notifyOnIntervention: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
  } catch (error) {
    console.error('Error getting guardian settings:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get settings');
  }
});