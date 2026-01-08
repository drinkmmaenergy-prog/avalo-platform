/**
 * PACK 198 — Advanced Moderation System
 * Real-time content filtering and anti-harassment protection
 */

import * as admin from 'firebase-admin';
import { EventModerationFlag, ModerationAction } from './types';
import { calculateToxicityScore, shouldAutoModerate } from './validation';

const db = admin.firestore();

export interface ModerationContext {
  eventId: string;
  userId: string;
  sessionId: string;
  userHistory: {
    warnings: number;
    previousFlags: number;
    totalMessages: number;
    flaggedMessages: number;
  };
}

export interface ModerationDecision {
  shouldBlock: boolean;
  action: ModerationAction | null;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HarassmentPattern {
  type: 'harassment' | 'spam' | 'toxicity' | 'inappropriate' | 'copyright';
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

const HARASSMENT_PATTERNS: HarassmentPattern[] = [
  {
    type: 'harassment',
    pattern: /\b(kill yourself|kys|die|suicide)\b/i,
    severity: 'critical',
    description: 'Self-harm or violence encouragement',
  },
  {
    type: 'harassment',
    pattern: /\b(rape|sexually assault|molest)\b/i,
    severity: 'critical',
    description: 'Sexual violence threats',
  },
  {
    type: 'harassment',
    pattern: /\b(stupid|idiot|dumb|moron|retard)\b/i,
    severity: 'medium',
    description: 'Personal insults',
  },
  {
    type: 'harassment',
    pattern: /\b(ugly|gross|disgusting|hideous)\b/i,
    severity: 'medium',
    description: 'Appearance-based harassment',
  },
  {
    type: 'inappropriate',
    pattern: /\b(what's your number|send nudes|private chat|dm me)\b/i,
    severity: 'high',
    description: 'Inappropriate solicitation',
  },
  {
    type: 'inappropriate',
    pattern: /\b(you['']re so hot|looking sexy|beautiful eyes|gorgeous body)\b/i,
    severity: 'medium',
    description: 'Unwanted romantic advances',
  },
  {
    type: 'inappropriate',
    pattern: /\b(hook up|netflix and chill|come over|my place)\b/i,
    severity: 'high',
    description: 'Sexual proposition',
  },
  {
    type: 'spam',
    pattern: /\b(click here|buy now|limited offer|act fast|subscribe)\b/i,
    severity: 'low',
    description: 'Promotional spam',
  },
  {
    type: 'toxicity',
    pattern: /\b(n[i!1]gg[e3]r|f[a@]gg[o0]t|c[u*]nt|b[i!1]tch)\b/i,
    severity: 'critical',
    description: 'Hate speech or slurs',
  },
];

export async function analyzeModerationContext(
  eventId: string,
  userId: string
): Promise<ModerationContext['userHistory']> {
  const sessions = await db
    .collection('event_sessions')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();

  let warnings = 0;
  let totalMessages = 0;

  for (const sessionDoc of sessions.docs) {
    const session = sessionDoc.data();
    warnings += session.warnings || 0;
    totalMessages += session.messagesPosted || 0;
  }

  const flags = await db
    .collection('event_moderation_flags')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();

  const flaggedMessages = await db
    .collection('event_chat_logs')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('flagged', '==', true)
    .get();

  return {
    warnings,
    previousFlags: flags.size,
    totalMessages,
    flaggedMessages: flaggedMessages.size,
  };
}

export function detectHarassmentPatterns(content: string): HarassmentPattern[] {
  const matches: HarassmentPattern[] = [];

  for (const pattern of HARASSMENT_PATTERNS) {
    if (pattern.pattern.test(content)) {
      matches.push(pattern);
    }
  }

  return matches;
}

export async function moderateContent(
  content: string,
  context: ModerationContext,
  eventThreshold: number
): Promise<ModerationDecision> {
  const toxicityScore = calculateToxicityScore(content);

  const harassmentPatterns = detectHarassmentPatterns(content);

  let highestSeverity: ModerationDecision['severity'] = 'low';
  const reasons: string[] = [];

  for (const pattern of harassmentPatterns) {
    reasons.push(pattern.description);

    if (pattern.severity === 'critical') {
      highestSeverity = 'critical';
    } else if (pattern.severity === 'high' && highestSeverity !== 'critical') {
      highestSeverity = 'high';
    } else if (pattern.severity === 'medium' && highestSeverity === 'low') {
      highestSeverity = 'medium';
    }
  }

  if (highestSeverity === 'critical') {
    return {
      shouldBlock: true,
      action: ModerationAction.BLOCK,
      reason: reasons.join(', '),
      severity: highestSeverity,
    };
  }

  const autoModDecision = shouldAutoModerate(toxicityScore, eventThreshold, {
    warnings: context.userHistory.warnings,
    previousFlags: context.userHistory.previousFlags,
  });

  if (autoModDecision.shouldModerate) {
    return {
      shouldBlock: true,
      action: autoModDecision.action as ModerationAction,
      reason: reasons.length > 0 ? reasons.join(', ') : 'High toxicity score detected',
      severity: highestSeverity,
    };
  }

  if (context.userHistory.flaggedMessages > 3) {
    return {
      shouldBlock: true,
      action: ModerationAction.SHADOW_MUTE,
      reason: 'Pattern of flagged messages',
      severity: 'medium',
    };
  }

  const flagRate =
    context.userHistory.totalMessages > 0
      ? context.userHistory.flaggedMessages / context.userHistory.totalMessages
      : 0;

  if (flagRate > 0.5 && context.userHistory.totalMessages > 5) {
    return {
      shouldBlock: true,
      action: ModerationAction.WARNING,
      reason: 'High ratio of flagged messages',
      severity: 'medium',
    };
  }

  return {
    shouldBlock: false,
    action: null,
    reason: 'Content passed moderation',
    severity: 'low',
  };
}

export async function createModerationFlag(
  eventId: string,
  targetType: 'message' | 'question' | 'user' | 'content',
  targetId: string,
  userId: string,
  decision: ModerationDecision,
  detectionReasons: string[]
): Promise<EventModerationFlag> {
  const flagRef = db.collection('event_moderation_flags').doc();

  const flag: EventModerationFlag = {
    id: flagRef.id,
    eventId,
    targetType,
    targetId,
    userId,
    flagType: 'toxicity',
    severity: decision.severity,
    autoDetected: true,
    detectionScore: 0,
    detectionReasons,
    action: decision.action!,
    actionAt: admin.firestore.Timestamp.now(),
    reviewed: false,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await flagRef.set(flag);

  return flag;
}

export async function applyModerationAction(
  eventId: string,
  userId: string,
  action: ModerationAction,
  reason: string
): Promise<void> {
  const sessions = await db
    .collection('event_sessions')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where('leftAt', '==', null)
    .get();

  for (const sessionDoc of sessions.docs) {
    const updates: any = {};

    switch (action) {
      case ModerationAction.WARNING:
        updates.warnings = admin.firestore.FieldValue.increment(1);
        break;
      case ModerationAction.SHADOW_MUTE:
        updates.muted = true;
        break;
      case ModerationAction.BLOCK:
        updates.blocked = true;
        updates.leftAt = admin.firestore.Timestamp.now();
        break;
    }

    await sessionDoc.ref.update(updates);
  }

  if (action === ModerationAction.BLOCK) {
    const messages = await db
      .collection('event_chat_logs')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .get();

    for (const messageDoc of messages.docs) {
      await messageDoc.ref.update({
        hidden: true,
        moderationReason: reason,
      });
    }
  }
}

export async function calculateLiveToxicityScore(eventId: string): Promise<number> {
  const recentMessages = await db
    .collection('event_chat_logs')
    .where('eventId', '==', eventId)
    .where(
      'timestamp',
      '>=',
      admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000)
    )
    .get();

  if (recentMessages.empty) {
    return 0;
  }

  let totalToxicity = 0;
  for (const messageDoc of recentMessages.docs) {
    const message = messageDoc.data();
    totalToxicity += message.toxicityScore || 0;
  }

  return totalToxicity / recentMessages.size;
}

export async function detectSpamPatterns(
  eventId: string,
  userId: string,
  content: string
): Promise<boolean> {
  const recentMessages = await db
    .collection('event_chat_logs')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .where(
      'timestamp',
      '>=',
      admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 1000)
    )
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get();

  if (recentMessages.size >= 5) {
    return true;
  }

  const similarMessages = recentMessages.docs.filter((doc) => {
    const message = doc.data();
    return message.content === content;
  });

  if (similarMessages.length >= 3) {
    return true;
  }

  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlPattern);
  if (urls && urls.length > 2) {
    return true;
  }

  return false;
}

export async function hideReplaySegment(
  eventId: string,
  startTimestamp: number,
  endTimestamp: number,
  reason: string
): Promise<void> {
  const messages = await db
    .collection('event_chat_logs')
    .where('eventId', '==', eventId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(startTimestamp))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromMillis(endTimestamp))
    .where('flagged', '==', true)
    .get();

  for (const messageDoc of messages.docs) {
    await messageDoc.ref.update({
      hidden: true,
      moderationReason: `Replay segment hidden: ${reason}`,
    });
  }
}

export async function generateModerationReport(eventId: string): Promise<{
  totalFlags: number;
  flagsByType: Record<string, number>;
  flagsBySeverity: Record<string, number>;
  blockedUsers: number;
  mutedUsers: number;
  averageToxicity: number;
  topOffenders: Array<{ userId: string; flagCount: number }>;
}> {
  const flags = await db
    .collection('event_moderation_flags')
    .where('eventId', '==', eventId)
    .get();

  const flagsByType: Record<string, number> = {};
  const flagsBySeverity: Record<string, number> = {};
  const userFlagCounts: Record<string, number> = {};

  for (const flagDoc of flags.docs) {
    const flag = flagDoc.data() as EventModerationFlag;

    flagsByType[flag.flagType] = (flagsByType[flag.flagType] || 0) + 1;
    flagsBySeverity[flag.severity] = (flagsBySeverity[flag.severity] || 0) + 1;
    userFlagCounts[flag.userId] = (userFlagCounts[flag.userId] || 0) + 1;
  }

  const sessions = await db
    .collection('event_sessions')
    .where('eventId', '==', eventId)
    .get();

  let blockedUsers = 0;
  let mutedUsers = 0;

  for (const sessionDoc of sessions.docs) {
    const session = sessionDoc.data();
    if (session.blocked) blockedUsers++;
    if (session.muted) mutedUsers++;
  }

  const averageToxicity = await calculateLiveToxicityScore(eventId);

  const topOffenders = Object.entries(userFlagCounts)
    .map(([userId, flagCount]) => ({ userId, flagCount }))
    .sort((a, b) => b.flagCount - a.flagCount)
    .slice(0, 10);

  return {
    totalFlags: flags.size,
    flagsByType,
    flagsBySeverity,
    blockedUsers,
    mutedUsers,
    averageToxicity,
    topOffenders,
  };
}