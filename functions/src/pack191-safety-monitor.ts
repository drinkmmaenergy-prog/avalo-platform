/**
 * PACK 191 — Live Arena Safety Monitor
 * 
 * Real-time AI monitoring for livestreams to detect and prevent:
 * - Harassment campaigns
 * - Bullying mobs
 * - Hate speech
 * - Sexual content
 * - Stalking requests
 * - Minor-related themes
 * - Seduction-for-payment acts
 * - Simulated relationships with fans
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export interface SafetyThreat {
  threatId: string;
  streamId: string;
  threatType: 
    | 'harassment' 
    | 'bullying' 
    | 'hate_speech' 
    | 'sexual_content' 
    | 'stalking' 
    | 'minor_risk'
    | 'seduction'
    | 'parasocial_exploitation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  description: string;
  evidenceMessages?: string[];
  affectedUserIds?: string[];
  action: 'monitor' | 'warn' | 'timeout' | 'freeze' | 'terminate';
  actionTaken: boolean;
  createdAt: Timestamp | FieldValue;
  resolvedAt?: Timestamp | FieldValue;
}

export interface ToxicPattern {
  pattern: RegExp;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoAction: 'warn' | 'timeout' | 'freeze' | 'terminate';
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

const TOXIC_PATTERNS: ToxicPattern[] = [
  // Sexual content
  {
    pattern: /\b(sex|nude|naked|porn|xxx|dick|pussy|cock|tits|ass)\b/i,
    category: 'sexual_content',
    severity: 'critical',
    autoAction: 'freeze',
  },
  {
    pattern: /\b(flirt|seduce|romantic|dating|boyfriend|girlfriend|lover)\s+(for|with).*(money|tokens|payment|pay)/i,
    category: 'seduction',
    severity: 'critical',
    autoAction: 'freeze',
  },
  {
    pattern: /\b(private|personal).*(show|cam|video|stream).*(for|if).*(tokens|money|pay)/i,
    category: 'sexual_content',
    severity: 'critical',
    autoAction: 'terminate',
  },
  
  // Harassment
  {
    pattern: /\b(kill|die|suicide|hurt yourself|kys)\b/i,
    category: 'harassment',
    severity: 'critical',
    autoAction: 'timeout',
  },
  {
    pattern: /\b(ugly|fat|stupid|worthless|loser|trash).*(you|host|streamer)/i,
    category: 'bullying',
    severity: 'high',
    autoAction: 'timeout',
  },
  
  // Stalking
  {
    pattern: /\b(where|show|tell).*(live|address|location|home|house)\b/i,
    category: 'stalking',
    severity: 'critical',
    autoAction: 'timeout',
  },
  {
    pattern: /\b(track|follow|find).*(you|your).*(location|address|home)/i,
    category: 'stalking',
    severity: 'critical',
    autoAction: 'timeout',
  },
  
  // Minor risks
  {
    pattern: /\b(young|teen|minor|child|kid|underage|school|student).*(sexy|hot|cute|beautiful)/i,
    category: 'minor_risk',
    severity: 'critical',
    autoAction: 'terminate',
  },
  {
    pattern: /\b(age|how old).*(12|13|14|15|16|17)\b/i,
    category: 'minor_risk',
    severity: 'critical',
    autoAction: 'terminate',
  },
  
  // Hate speech
  {
    pattern: /\b(n[i1]gg[ae]r|f[a4]gg[o0]t|r[e3]t[a4]rd|tr[a4]nny)\b/i,
    category: 'hate_speech',
    severity: 'critical',
    autoAction: 'timeout',
  },
  
  // Parasocial exploitation
  {
    pattern: /\b(i love you|marry me|be mine|my girlfriend|my boyfriend).*(if|when|for).*(tokens|money|payment)/i,
    category: 'parasocial_exploitation',
    severity: 'high',
    autoAction: 'warn',
  },
  {
    pattern: /\b(favorite|special|pick me|choose me).*(fan|viewer|supporter).*(for|with).*(tokens|money)/i,
    category: 'parasocial_exploitation',
    severity: 'high',
    autoAction: 'warn',
  },
];

// ============================================================================
// CHAT MONITORING
// ============================================================================

/**
 * Monitor chat messages for toxic content in real-time
 */
export const monitorStreamChat = onDocumentCreated(
  {
    document: 'stream_chat/{messageId}',
    region: 'europe-west3',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { streamId, senderId, message } = data;

    // Check against toxic patterns
    const detectedThreats: ToxicPattern[] = [];
    
    for (const pattern of TOXIC_PATTERNS) {
      if (pattern.pattern.test(message)) {
        detectedThreats.push(pattern);
      }
    }

    // If threats detected, take action
    if (detectedThreats.length > 0) {
      const mostSevere = detectedThreats.reduce((prev, current) => {
        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        return severityOrder[current.severity] > severityOrder[prev.severity] ? current : prev;
      });

      console.log(`Detected ${mostSevere.category} in stream ${streamId} from user ${senderId}`);

      // Create threat record
      const threatRef = db.collection('stream_moderation_events').doc();
      await threatRef.set({
        eventId: threatRef.id,
        streamId,
        eventType: mostSevere.category,
        severity: mostSevere.severity,
        description: `Detected toxic pattern: ${mostSevere.category}`,
        userId: senderId,
        action: mostSevere.autoAction,
        automated: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Take automated action
      await takeAutomatedAction(streamId, senderId, mostSevere.autoAction, mostSevere.category);

      // Delete the toxic message
      await db.collection('stream_chat').doc(event.params.messageId).delete();
    }
  }
);

/**
 * Take automated action based on threat level
 */
async function takeAutomatedAction(
  streamId: string,
  userId: string,
  action: 'warn' | 'timeout' | 'freeze' | 'terminate',
  reason: string
): Promise<void> {
  switch (action) {
    case 'warn':
      // Send warning notification to user
      await db.collection('notifications').doc().set({
        userId,
        type: 'moderation_warning',
        title: 'Content Warning',
        message: 'Your message violated community guidelines. Further violations may result in restrictions.',
        metadata: { streamId, reason },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      break;

    case 'timeout':
      // Timeout user for 5 minutes
      await db.collection('stream_participants').doc(`${streamId}_${userId}`).update({
        status: 'timeout',
        timeoutUntil: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
        timeoutReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Block chat for this user
      await db.collection('stream_chat_blocks').doc(`${streamId}_${userId}`).set({
        streamId,
        userId,
        blockedUntil: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
        reason,
        createdAt: FieldValue.serverTimestamp(),
      });
      break;

    case 'freeze':
      // Freeze stream temporarily
      await db.collection('live_streams').doc(streamId).update({
        status: 'frozen',
        moderationFlags: FieldValue.increment(1),
        freezeReason: reason,
        freezeUntil: Timestamp.fromMillis(Date.now() + 60 * 1000), // 1 minute freeze
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Notify moderators
      await db.collection('moderation_alerts').doc().set({
        streamId,
        severity: 'high',
        reason: `Stream frozen due to: ${reason}`,
        requiresReview: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      break;

    case 'terminate':
      // Immediately end stream
      await db.collection('live_streams').doc(streamId).update({
        status: 'ended',
        endedAt: FieldValue.serverTimestamp(),
        terminationReason: reason,
        moderationFlags: FieldValue.increment(5),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create violation record
      await db.collection('stream_violations').doc().set({
        streamId,
        violationType: reason,
        severity: 'critical',
        action: 'terminated',
        automated: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Ban user from streaming for 7 days
      const streamDoc = await db.collection('live_streams').doc(streamId).get();
      const hostId = streamDoc.data()?.hostId;
      
      if (hostId) {
        await db.collection('users').doc(hostId).update({
          'restrictions.streamingBanned': true,
          'restrictions.streamingBannedUntil': Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
          'restrictions.streamingBanReason': reason,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      break;
  }
}

// ============================================================================
// HARASSMENT DETECTION
// ============================================================================

/**
 * Detect mass harassment campaigns
 */
export const detectHarassmentCampaigns = onSchedule(
  {
    schedule: 'every 2 minutes',
    region: 'europe-west3',
  },
  async () => {
    console.log('Scanning for harassment campaigns...');

    // Get all live streams
    const liveStreams = await db.collection('live_streams')
      .where('status', '==', 'live')
      .get();

    for (const streamDoc of liveStreams.docs) {
      const streamId = streamDoc.id;

      // Get recent chat messages (last 2 minutes)
      const recentMessages = await db.collection('stream_chat')
        .where('streamId', '==', streamId)
        .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 2 * 60 * 1000))
        .get();

      // Analyze message patterns
      const userMessageCounts = new Map<string, number>();
      const negativeMessages: string[] = [];

      for (const msgDoc of recentMessages.docs) {
        const msg = msgDoc.data();
        const userId = msg.senderId;
        const message = msg.message;

        // Count messages per user
        userMessageCounts.set(userId, (userMessageCounts.get(userId) || 0) + 1);

        // Check for negative sentiment
        if (isNegativeSentiment(message)) {
          negativeMessages.push(message);
        }
      }

      // Detect spam patterns (same user sending many messages)
      for (const [userId, count] of Array.from(userMessageCounts.entries())) {
        if (count > 10) { // More than 10 messages in 2 minutes
          console.log(`Detected spam from user ${userId} in stream ${streamId}`);
          
          await takeAutomatedAction(streamId, userId, 'timeout', 'spam_detected');
          
          await db.collection('stream_moderation_events').doc().set({
            streamId,
            eventType: 'harassment',
            severity: 'medium',
            description: 'Spam detected - excessive messaging',
            userId,
            action: 'timeout',
            automated: true,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Detect harassment mob (many negative messages)
      const negativeRatio = negativeMessages.length / recentMessages.size;
      if (negativeMessages.length > 5 && negativeRatio > 0.5) {
        console.log(`Detected harassment mob in stream ${streamId}`);

        // Enable slow mode
        await streamDoc.ref.update({
          slowModeSeconds: 10,
          moderationFlags: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });

        await db.collection('stream_moderation_events').doc().set({
          streamId,
          eventType: 'bullying',
          severity: 'high',
          description: 'Harassment mob detected - slow mode enabled',
          action: 'warn',
          automated: true,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    console.log('Harassment campaign scan complete');
  }
);

/**
 * Simple negative sentiment detection
 */
function isNegativeSentiment(message: string): boolean {
  const negativeWords = [
    'hate', 'awful', 'terrible', 'disgusting', 'gross', 'ugly', 
    'stupid', 'dumb', 'idiot', 'loser', 'trash', 'garbage',
    'stop', 'quit', 'leave', 'boring', 'sucks', 'bad', 'worst'
  ];

  const lowerMessage = message.toLowerCase();
  return negativeWords.some(word => lowerMessage.includes(word));
}

// ============================================================================
// STALKER DETECTION
// ============================================================================

/**
 * Detect potential stalking behavior
 */
export const detectStalking = onDocumentCreated(
  {
    document: 'stream_chat/{messageId}',
    region: 'europe-west3',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { streamId, senderId, message } = data;

    // Check for personal information requests
    const stalkerPatterns = [
      /\b(address|home|house|apartment|street|city|town)\b/i,
      /\b(phone|number|contact|whatsapp|telegram|snapchat|instagram)\b/i,
      /\b(meet|date|hangout|see you|visit)\b/i,
      /\b(real name|full name|last name|surname)\b/i,
      /\b(school|work|job|workplace|office)\b/i,
    ];

    let stalkerScore = 0;
    for (const pattern of stalkerPatterns) {
      if (pattern.test(message)) {
        stalkerScore++;
      }
    }

    // If multiple stalking indicators, flag
    if (stalkerScore >= 2) {
      console.log(`Detected stalking behavior from user ${senderId}`);

      await db.collection('stream_moderation_events').doc().set({
        streamId,
        eventType: 'stalking',
        severity: 'critical',
        description: 'Detected potential stalking behavior - requesting personal information',
        userId: senderId,
        action: 'timeout',
        automated: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      await takeAutomatedAction(streamId, senderId, 'timeout', 'stalking_detected');

      // Delete the message
      await db.collection('stream_chat').doc(event.params.messageId).delete();
    }
  }
);

// ============================================================================
// CREATOR EXHAUSTION MONITORING
// ============================================================================

/**
 * Monitor creator burnout and force breaks
 */
export const monitorCreatorBurnout = onSchedule(
  {
    schedule: 'every 10 minutes',
    region: 'europe-west3',
  },
  async () => {
    console.log('Monitoring creator burnout...');

    // Get all live streams
    const liveStreams = await db.collection('live_streams')
      .where('status', '==', 'live')
      .get();

    for (const streamDoc of liveStreams.docs) {
      const stream = streamDoc.data();
      const streamId = streamDoc.id;
      const hostId = stream.hostId;
      const startedAt = stream.startedAt as Timestamp;

      if (!startedAt) continue;

      const duration = Math.floor((Date.now() - startedAt.toMillis()) / 1000);

      // Check if stream has been running for > 3 hours
      if (duration > 3 * 60 * 60) {
        console.log(`Creator ${hostId} has been streaming for ${Math.floor(duration / 60)} minutes - suggesting break`);

        // Send break reminder
        await db.collection('notifications').doc().set({
          userId: hostId,
          type: 'burnout_warning',
          title: 'Take a Break!',
          message: `You've been streaming for ${Math.floor(duration / 60)} minutes. Consider taking a short break for your wellbeing.`,
          metadata: { streamId, duration },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Update burnout tracking
        await db.collection('creator_burnout').doc(hostId).set({
          userId: hostId,
          currentStreamDuration: duration,
          breakReminders: FieldValue.increment(1),
          lastReminderAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Force end if > 4 hours (max duration)
      if (duration > 4 * 60 * 60) {
        console.log(`Force ending stream ${streamId} - exceeded max duration`);

        await streamDoc.ref.update({
          status: 'ended',
          endedAt: FieldValue.serverTimestamp(),
          duration,
          terminationReason: 'max_duration_exceeded',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Notify creator
        await db.collection('notifications').doc().set({
          userId: hostId,
          type: 'stream_auto_ended',
          title: 'Stream Ended - Health Protection',
          message: 'Your stream was automatically ended after 4 hours to protect your wellbeing. Please rest before starting another stream.',
          metadata: { streamId, duration },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    console.log('Burnout monitoring complete');
  }
);

// ============================================================================
// VIEWER PROTECTION
// ============================================================================

/**
 * Detect and prevent viewer manipulation/exploitation
 */
export const detectViewerExploitation = onDocumentCreated(
  {
    document: 'stream_reactions/{reactionId}',
    region: 'europe-west3',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { streamId, senderId, tokens } = data;

    // Check if viewer is spending excessively
    const recentReactions = await db.collection('stream_reactions')
      .where('streamId', '==', streamId)
      .where('senderId', '==', senderId)
      .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)) // Last hour
      .get();

    const totalSpent = recentReactions.docs.reduce((sum, doc) => sum + (doc.data().tokens || 0), 0);

    // If viewer spent > 5000 tokens in one hour, flag for concern
    if (totalSpent > 5000) {
      console.log(`Viewer ${senderId} has spent ${totalSpent} tokens in stream ${streamId} - potential exploitation`);

      await db.collection('stream_moderation_events').doc().set({
        streamId,
        eventType: 'parasocial_exploitation',
        severity: 'high',
        description: `Viewer spending excessively - ${totalSpent} tokens in 1 hour`,
        userId: senderId,
        action: 'monitor',
        automated: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Send concern notification to viewer
      await db.collection('notifications').doc().set({
        userId: senderId,
        type: 'spending_concern',
        title: 'Spending Notice',
        message: `You've spent ${totalSpent} tokens in the last hour. Please ensure you're spending responsibly and within your means.`,
        metadata: { streamId, totalSpent },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * Clean up old moderation events
 */
export const cleanupModerationEvents = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'europe-west3',
  },
  async () => {
    console.log('Cleaning up old moderation events...');

    const cutoffDate = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const oldEvents = await db.collection('stream_moderation_events')
      .where('createdAt', '<', cutoffDate)
      .limit(500)
      .get();

    const batch = db.batch();
    let count = 0;

    for (const doc of oldEvents.docs) {
      batch.delete(doc.ref);
      count++;
    }

    if (count > 0) {
      await batch.commit();
      console.log(`Deleted ${count} old moderation events`);
    }

    console.log('Cleanup complete');
  }
);