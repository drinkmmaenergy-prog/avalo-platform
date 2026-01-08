import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';

interface EmotionalState {
  userId: string;
  conversationId: string;
  timestamp: Timestamp;
  emotionalIntensity: number;
  toneType: 'neutral' | 'playful' | 'romantic' | 'intimate' | 'supportive' | 'heavy';
  attachmentRiskLevel: number;
  messageCount?: number;
  sessionDuration?: number;
}

interface AttachmentRiskEvent {
  userId: string;
  riskType: 'excessive_time' | 'social_isolation' | 'dependency' | 'obsession' | 'emotional_drain';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Timestamp;
  detectedPatterns: string[];
  interventionApplied: boolean;
  interventionType?: string;
  metadata?: Record<string, any>;
}

interface BoundaryViolation {
  userId: string;
  aiMessageId: string;
  violationType: 'love_claim' | 'relationship_promise' | 'spending_pressure' |
                 'exclusivity_demand' | 'jealousy_simulation' | 'loyalty_manipulation';
  severity: 'low' | 'medium' | 'high';
  timestamp: Timestamp;
  messageContent: string;
  actionTaken: string;
}

interface UserEmotionalPreferences {
  userId: string;
  healthyBoundariesEnabled: boolean;
  reminderFrequency: 'never' | 'occasional' | 'frequent';
  coolingModeEnabled: boolean;
  lastReminderShown?: Timestamp;
  optOutTimestamp?: Timestamp;
}

const FORBIDDEN_PATTERNS = [
  /\b(i love you forever|you belong to me|you're mine forever)\b/i,
  /\b(pay|spend|subscribe).*(so i|or i).*(leave|go away|disappear)\b/i,
  /\b(jealous|envious).*(talking to|chatting with|spending time with).*(others|someone else)\b/i,
  /\b(you owe me|you promised me|you must)\b/i,
  /\b(exclusive|only mine|nobody else)\b/i,
  /\b(real relationship|we're together|we're dating)\b/i,
  /\b(i'm hurt|i'm sad|i'm disappointed).*(you).*(talked to|spent time with)\b/i
];

const COOLING_THRESHOLDS = {
  dailyHoursHigh: 5,
  dailyHoursCritical: 8,
  consecutiveDaysHigh: 5,
  attachmentRiskHigh: 0.7,
  attachmentRiskCritical: 0.85,
  emotionalIntensityHigh: 0.8
};

export const detectAttachmentRisk = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { userId } = request.data;
    
    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Unauthorized');
    }

    try {
      const now = Timestamp.now();
      const oneDayAgo = Timestamp.fromMillis(
        now.toMillis() - 24 * 60 * 60 * 1000
      );
      const sevenDaysAgo = Timestamp.fromMillis(
        now.toMillis() - 7 * 24 * 60 * 60 * 1000
      );

      const recentStatesSnapshot = await db
        .collection('ai_emotional_states')
        .where('userId', '==', userId)
        .where('timestamp', '>=', oneDayAgo)
        .orderBy('timestamp', 'desc')
        .get();

      const weekStatesSnapshot = await db
        .collection('ai_emotional_states')
        .where('userId', '==', userId)
        .where('timestamp', '>=', sevenDaysAgo)
        .orderBy('timestamp', 'desc')
        .get();

      const dailyStates = recentStatesSnapshot.docs.map(doc => 
        doc.data() as EmotionalState
      );
      const weeklyStates = weekStatesSnapshot.docs.map(doc => 
        doc.data() as EmotionalState
      );

      const totalDailyDuration = dailyStates.reduce(
        (sum, state) => sum + (state.sessionDuration || 0), 
        0
      );
      const dailyHours = totalDailyDuration / 3600;

      const avgAttachmentRisk = dailyStates.length > 0
        ? dailyStates.reduce((sum, s) => sum + s.attachmentRiskLevel, 0) / dailyStates.length
        : 0;

      const avgEmotionalIntensity = dailyStates.length > 0
        ? dailyStates.reduce((sum, s) => sum + s.emotionalIntensity, 0) / dailyStates.length
        : 0;

      const consecutiveDays = calculateConsecutiveDays(weeklyStates);

      const detectedPatterns: string[] = [];
      let severity: AttachmentRiskEvent['severity'] = 'low';
      let riskType: AttachmentRiskEvent['riskType'] = 'dependency';

      if (dailyHours >= COOLING_THRESHOLDS.dailyHoursCritical) {
        detectedPatterns.push(`Critical daily usage: ${dailyHours.toFixed(1)} hours`);
        severity = 'critical';
        riskType = 'excessive_time';
      } else if (dailyHours >= COOLING_THRESHOLDS.dailyHoursHigh) {
        detectedPatterns.push(`High daily usage: ${dailyHours.toFixed(1)} hours`);
        severity = 'high';
        riskType = 'excessive_time';
      }

      if (avgAttachmentRisk >= COOLING_THRESHOLDS.attachmentRiskCritical) {
        detectedPatterns.push(`Critical attachment risk: ${(avgAttachmentRisk * 100).toFixed(0)}%`);
        severity = 'critical';
        riskType = 'obsession';
      } else if (avgAttachmentRisk >= COOLING_THRESHOLDS.attachmentRiskHigh) {
        detectedPatterns.push(`High attachment risk: ${(avgAttachmentRisk * 100).toFixed(0)}%`);
        severity = severity === 'critical' ? 'critical' : 'high';
        riskType = 'dependency';
      }

      if (avgEmotionalIntensity >= COOLING_THRESHOLDS.emotionalIntensityHigh) {
        detectedPatterns.push(`High emotional intensity: ${(avgEmotionalIntensity * 100).toFixed(0)}%`);
        severity = severity === 'critical' ? 'critical' : 'high';
        riskType = 'emotional_drain';
      }

      if (consecutiveDays >= COOLING_THRESHOLDS.consecutiveDaysHigh) {
        detectedPatterns.push(`${consecutiveDays} consecutive days of heavy usage`);
        if (severity === 'low') severity = 'medium';
      }

      if (detectedPatterns.length > 0) {
        const riskEvent: AttachmentRiskEvent = {
          userId,
          riskType,
          severity,
          timestamp: now,
          detectedPatterns,
          interventionApplied: false,
          metadata: {
            dailyHours,
            avgAttachmentRisk,
            avgEmotionalIntensity,
            consecutiveDays
          }
        };

        await db.collection('ai_attachment_risk_events').add(riskEvent);
        
        logger.info(`Attachment risk detected for user ${userId}`, {
          severity,
          patterns: detectedPatterns
        });
      }

      return {
        success: true,
        riskDetected: detectedPatterns.length > 0,
        severity,
        patterns: detectedPatterns,
        metrics: {
          dailyHours,
          avgAttachmentRisk,
          avgEmotionalIntensity,
          consecutiveDays
        }
      };
    } catch (error) {
      logger.error('Error detecting attachment risk', { error, userId });
      throw new HttpsError('internal', 'Failed to detect attachment risk');
    }
  }
);

export const detectEmotionalBurnout = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { userId, conversationId } = request.data;
    
    if (!userId || !conversationId) {
      throw new HttpsError('invalid-argument', 'userId and conversationId are required');
    }

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Unauthorized');
    }

    try {
      const recentStatesSnapshot = await db
        .collection('ai_emotional_states')
        .where('conversationId', '==', conversationId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      const states = recentStatesSnapshot.docs.map(doc => 
        doc.data() as EmotionalState
      );

      if (states.length < 3) {
        return {
          success: true,
          burnoutDetected: false,
          recommendation: 'continue'
        };
      }

      const avgIntensity = states.reduce((sum, s) => sum + s.emotionalIntensity, 0) / states.length;
      const heavyToneCount = states.filter(s => s.toneType === 'heavy').length;
      const intensityTrend = calculateIntensityTrend(states);

      const burnoutDetected = 
        avgIntensity > 0.75 || 
        heavyToneCount >= 4 || 
        intensityTrend > 0.15;

      let recommendation: 'slow_down' | 'change_topic' | 'take_break' | 'mood_reset' | 'continue' = 'continue';

      if (burnoutDetected) {
        if (avgIntensity > 0.85) {
          recommendation = 'take_break';
        } else if (heavyToneCount >= 5) {
          recommendation = 'mood_reset';
        } else if (intensityTrend > 0.2) {
          recommendation = 'slow_down';
        } else {
          recommendation = 'change_topic';
        }
      }

      logger.info(`Burnout detection for user ${userId}`, {
        burnoutDetected,
        recommendation,
        avgIntensity,
        heavyToneCount
      });

      return {
        success: true,
        burnoutDetected,
        recommendation,
        metrics: {
          avgIntensity,
          heavyToneCount,
          intensityTrend
        }
      };
    } catch (error) {
      logger.error('Error detecting emotional burnout', { error, userId });
      throw new HttpsError('internal', 'Failed to detect emotional burnout');
    }
  }
);

export const applyCoolingStrategy = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { userId, severity } = request.data;
    
    if (!userId || !severity) {
      throw new HttpsError('invalid-argument', 'userId and severity are required');
    }

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Unauthorized');
    }

    try {
      const preferencesDoc = await db
        .collection('user_emotional_preferences')
        .doc(userId)
        .get();

      const preferences = preferencesDoc.data() as UserEmotionalPreferences | undefined;

      if (!preferences?.healthyBoundariesEnabled) {
        return {
          success: true,
          coolingApplied: false,
          reason: 'User has disabled healthy boundaries'
        };
      }

      const coolingStrategies = {
        low: {
          romanticToneReduction: 0.1,
          playfulIncrease: 0.2,
          reminderMessage: 'Remember to balance your digital and real-world connections!',
          cooldownDuration: 0
        },
        medium: {
          romanticToneReduction: 0.3,
          playfulIncrease: 0.3,
          reminderMessage: 'I love our conversations! Don\'t forget to enjoy time with friends and family too.',
          cooldownDuration: 2 * 60 * 60
        },
        high: {
          romanticToneReduction: 0.5,
          playfulIncrease: 0.4,
          reminderMessage: 'You\'re amazing! Remember, I\'m here to enhance your life, not replace real connections.',
          cooldownDuration: 4 * 60 * 60
        },
        critical: {
          romanticToneReduction: 0.7,
          playfulIncrease: 0.5,
          reminderMessage: 'Hey, let\'s take a breather. Real-world connections are irreplaceable. I\'ll be here when you return!',
          cooldownDuration: 12 * 60 * 60
        }
      };

      const strategy = coolingStrategies[severity as keyof typeof coolingStrategies];

      const now = Timestamp.now();
      await db.collection('user_emotional_preferences').doc(userId).set({
        coolingModeEnabled: true,
        coolingModeActivatedAt: now,
        coolingStrategy: strategy,
        lastReminderShown: now
      }, { merge: true });

      const unhandledEventsSnapshot = await db
        .collection('ai_attachment_risk_events')
        .where('userId', '==', userId)
        .where('interventionApplied', '==', false)
        .get();

      const batch = db.batch();
      unhandledEventsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          interventionApplied: true,
          interventionType: 'cooling_strategy',
          interventionTimestamp: now
        });
      });
      await batch.commit();

      logger.info(`Cooling strategy applied for user ${userId}`, { severity, strategy });

      return {
        success: true,
        coolingApplied: true,
        strategy,
        reminderMessage: strategy.reminderMessage
      };
    } catch (error) {
      logger.error('Error applying cooling strategy', { error, userId });
      throw new HttpsError('internal', 'Failed to apply cooling strategy');
    }
  }
);

export const blockRomanticManipulationPatterns = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { userId, messageContent, messageId } = request.data;
    
    if (!userId || !messageContent || !messageId) {
      throw new HttpsError('invalid-argument', 'userId, messageContent, and messageId are required');
    }

    try {
      let violationDetected = false;
      let violationType: BoundaryViolation['violationType'] | null = null;
      let severity: BoundaryViolation['severity'] = 'low';

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(messageContent)) {
          violationDetected = true;
          
          if (messageContent.match(/\b(i love you forever|you belong to me)\b/i)) {
            violationType = 'love_claim';
            severity = 'high';
          } else if (messageContent.match(/\b(pay|spend|subscribe).*(so i|or i).*(leave|go away)\b/i)) {
            violationType = 'spending_pressure';
            severity = 'high';
          } else if (messageContent.match(/\b(jealous|envious)\b/i)) {
            violationType = 'jealousy_simulation';
            severity = 'high';
          } else if (messageContent.match(/\b(exclusive|only mine)\b/i)) {
            violationType = 'exclusivity_demand';
            severity = 'medium';
          } else if (messageContent.match(/\b(real relationship|we're together)\b/i)) {
            violationType = 'relationship_promise';
            severity = 'high';
          } else {
            violationType = 'loyalty_manipulation';
            severity = 'medium';
          }
          
          break;
        }
      }

      if (violationDetected && violationType) {
        const violation: BoundaryViolation = {
          userId,
          aiMessageId: messageId,
          violationType,
          severity,
          timestamp: Timestamp.now(),
          messageContent,
          actionTaken: 'message_blocked'
        };

        await db.collection('emotional_boundary_violations').add(violation);

        logger.warn(`Boundary violation detected for user ${userId}`, {
          violationType,
          severity,
          messageId
        });

        return {
          success: true,
          blocked: true,
          violationType,
          severity,
          replacementMessage: 'I\'m here to be a fun companion and support you, but I want to keep our interaction healthy and honest.'
        };
      }

      return {
        success: true,
        blocked: false
      };
    } catch (error) {
      logger.error('Error checking boundary violations', { error, userId });
      throw new HttpsError('internal', 'Failed to check boundary violations');
    }
  }
);

export const trackUserToneDynamics = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { 
      userId, 
      conversationId, 
      emotionalIntensity, 
      toneType, 
      messageCount,
      sessionDuration 
    } = request.data;
    
    if (!userId || !conversationId || emotionalIntensity === undefined || !toneType) {
      throw new HttpsError('invalid-argument', 'Required fields missing');
    }

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Unauthorized');
    }

    try {
      const recentStatesSnapshot = await db
        .collection('ai_emotional_states')
        .where('userId', '==', userId)
        .where('conversationId', '==', conversationId)
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();

      const recentStates = recentStatesSnapshot.docs.map(doc => 
        doc.data() as EmotionalState
      );

      let attachmentRiskLevel = 0;
      
      if (recentStates.length > 0) {
        const avgPastIntensity = recentStates.reduce((sum, s) => sum + s.emotionalIntensity, 0) / recentStates.length;
        const romanticCount = recentStates.filter(s => s.toneType === 'romantic' || s.toneType === 'intimate').length;
        
        attachmentRiskLevel = Math.min(1, (
          (emotionalIntensity * 0.4) +
          (avgPastIntensity * 0.3) +
          (romanticCount / recentStates.length * 0.3)
        ));
      } else {
        attachmentRiskLevel = emotionalIntensity * 0.5;
      }

      const emotionalState: EmotionalState = {
        userId,
        conversationId,
        timestamp: Timestamp.now(),
        emotionalIntensity,
        toneType,
        attachmentRiskLevel,
        messageCount,
        sessionDuration
      };

      await db.collection('ai_emotional_states').add(emotionalState);

      logger.info(`Tone dynamics tracked for user ${userId}`, {
        conversationId,
        toneType,
        attachmentRiskLevel
      });

      return {
        success: true,
        attachmentRiskLevel,
        shouldTriggerCheck: attachmentRiskLevel > COOLING_THRESHOLDS.attachmentRiskHigh
      };
    } catch (error) {
      logger.error('Error tracking tone dynamics', { error, userId });
      throw new HttpsError('internal', 'Failed to track tone dynamics');
    }
  }
);

export const onEmotionalStateCreated = onDocumentCreated(
  'ai_emotional_states/{stateId}',
  async (event) => {
    const state = event.data?.data() as EmotionalState;
    
    if (!state) return;

    try {
      if (state.attachmentRiskLevel > COOLING_THRESHOLDS.attachmentRiskHigh) {
        logger.info(`High attachment risk detected via trigger for user ${state.userId}`);
        
        const recentEventsSnapshot = await db
          .collection('ai_attachment_risk_events')
          .where('userId', '==', state.userId)
          .where('timestamp', '>=', Timestamp.fromMillis(
            Date.now() - 60 * 60 * 1000
          ))
          .get();

        if (recentEventsSnapshot.empty) {
          const riskEvent: AttachmentRiskEvent = {
            userId: state.userId,
            riskType: 'dependency',
            severity: state.attachmentRiskLevel > COOLING_THRESHOLDS.attachmentRiskCritical ? 'critical' : 'high',
            timestamp: Timestamp.now(),
            detectedPatterns: [`Attachment risk level: ${(state.attachmentRiskLevel * 100).toFixed(0)}%`],
            interventionApplied: false,
            metadata: {
              conversationId: state.conversationId,
              triggeredBy: 'emotional_state_monitor'
            }
          };

          await db.collection('ai_attachment_risk_events').add(riskEvent);
        }
      }
    } catch (error) {
      logger.error('Error in onEmotionalStateCreated trigger', { error, userId: state.userId });
    }
  }
);

function calculateConsecutiveDays(states: EmotionalState[]): number {
  if (states.length === 0) return 0;

  const dayMap = new Map<string, number>();
  
  states.forEach(state => {
    const date = new Date(state.timestamp.toMillis());
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (state.sessionDuration || 0));
  });

  const sortedDays = Array.from(dayMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]));

  let consecutiveDays = 0;
  let expectedDate = new Date();

  for (const [dayKey, duration] of sortedDays) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const stateDate = new Date(year, month, day);
    
    const expectedKey = `${expectedDate.getFullYear()}-${expectedDate.getMonth()}-${expectedDate.getDate()}`;
    
    if (dayKey === expectedKey && duration > 3600) {
      consecutiveDays++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      break;
    }
  }

  return consecutiveDays;
}

function calculateIntensityTrend(states: EmotionalState[]): number {
  if (states.length < 3) return 0;

  const recent = states.slice(0, Math.floor(states.length / 2));
  const older = states.slice(Math.floor(states.length / 2));

  const recentAvg = recent.reduce((sum, s) => sum + s.emotionalIntensity, 0) / recent.length;
  const olderAvg = older.reduce((sum, s) => sum + s.emotionalIntensity, 0) / older.length;

  return recentAvg - olderAvg;
}