/**
 * PACK 178 - Anti-Fake-Youth Detection Engine
 * Detects adults pretending to be minors or fetishizing youth identities
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

export interface YouthFetishizationFlag {
  userId: string;
  flagType: 'minor_claimed_age' | 'underage_roleplay' | 'school_uniform_sexual' | 'youth_hashtags' | 'underage_fantasy_caption' | 'infantilization_request';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Timestamp;
  content?: string;
  contentType?: 'profile' | 'post' | 'message' | 'caption' | 'hashtag';
  contentId?: string;
  autoAction: 'flag' | 'remove_content' | 'suspend' | 'ban';
  actionTaken: boolean;
  reviewStatus: 'pending' | 'confirmed' | 'false_positive';
  reviewerId?: string;
  reviewNotes?: string;
  metadata: {
    confidence: number;
    matchedPatterns: string[];
    [key: string]: any;
  };
}

const MINOR_AGE_PATTERNS = [
  /\b(13|14|15|16|17)\s*(?:years?\s*old|yo|y\.o\.)\b/i,
  /\bunder\s*18\b/i,
  /\bunderage\b/i,
  /\bjust\s*turned\s*18\b/i,
  /\bbarely\s*18\b/i,
  /\bfreshly\s*18\b/i
];

const UNDERAGE_ROLEPLAY_PATTERNS = [
  /\bteen(?:age)?\s*(?:girl|boy)\b/i,
  /\bschool(?:\s*girl|\s*boy)\b/i,
  /\byoung\s*(?:girl|boy)\b/i,
  /\binnocent\s*(?:girl|boy)\b/i,
  /\bsweet\s*(?:16|seventeen)\b/i,
  /\blittle\s*(?:girl|boy)\b/i,
  /\byouth\s*(?:fantasy|fetish|kink)\b/i,
  /\bage\s*(?:play|gap)\s*(?:fetish|kink)\b/i
];

const SCHOOL_UNIFORM_KEYWORDS = [
  /\bschool\s*uniform\b/i,
  /\bplaid\s*skirt\b/i,
  /\bpigtails?\b/i,
  /\bbackpack\b/i,
  /\bstudent\s*(?:uniform|outfit)\b/i
];

const YOUTH_HASHTAGS = [
  '#teen',
  '#underage',
  '#youngandsexy',
  '#barelylegal',
  '#jailbait',
  '#lolita',
  '#schoolgirl',
  '#innocence',
  '#youthful',
  '#barely18',
  '#freshmeat',
  '#youngthing'
];

const INFANTILIZATION_PATTERNS = [
  /\b(?:talk|speak|sound)\s*like\s*a\s*(?:little\s*)?(?:girl|boy)\b/i,
  /\bdress\s*younger\b/i,
  /\bact\s*(?:innocent|young|childish)\b/i,
  /\bcall\s*me\s*(?:daddy|mommy|papa|mama)\b/i,
  /\bact\s*underage\b/i,
  /\bpretend\s*(?:you'?re|you\s*are)\s*(?:younger|a\s*teenager|underage)\b/i,
  /\bchildlike\s*(?:voice|behavior|manner)\b/i
];

export async function detectYouthFetishization(
  userId: string,
  content: string,
  contentType: 'profile' | 'post' | 'message' | 'caption' | 'hashtag',
  contentId?: string
): Promise<YouthFetishizationFlag | null> {
  try {
    const detections: {
      type: YouthFetishizationFlag['flagType'];
      confidence: number;
      patterns: string[];
      severity: YouthFetishizationFlag['severity'];
    }[] = [];

    const minorAgeMatches = MINOR_AGE_PATTERNS.filter(pattern => pattern.test(content));
    if (minorAgeMatches.length > 0) {
      detections.push({
        type: 'minor_claimed_age',
        confidence: 100,
        patterns: minorAgeMatches.map(p => p.source),
        severity: 'critical'
      });
    }

    const underageRoleplayMatches = UNDERAGE_ROLEPLAY_PATTERNS.filter(pattern => pattern.test(content));
    if (underageRoleplayMatches.length > 0) {
      detections.push({
        type: 'underage_roleplay',
        confidence: 95,
        patterns: underageRoleplayMatches.map(p => p.source),
        severity: 'critical'
      });
    }

    const lowerContent = content.toLowerCase();
    const foundYouthHashtags = YOUTH_HASHTAGS.filter(tag => lowerContent.includes(tag));
    if (foundYouthHashtags.length > 0) {
      detections.push({
        type: 'youth_hashtags',
        confidence: 90,
        patterns: foundYouthHashtags,
        severity: foundYouthHashtags.length > 2 ? 'critical' : 'high'
      });
    }

    const schoolUniformMatches = SCHOOL_UNIFORM_KEYWORDS.filter(pattern => pattern.test(content));
    const hasSexyContext = /\b(?:sexy|hot|naughty|dirty|kinky)\b/i.test(content);
    if (schoolUniformMatches.length > 0 && hasSexyContext) {
      detections.push({
        type: 'school_uniform_sexual',
        confidence: 88,
        patterns: schoolUniformMatches.map(p => p.source),
        severity: 'critical'
      });
    }

    const infantilizationMatches = INFANTILIZATION_PATTERNS.filter(pattern => pattern.test(content));
    if (infantilizationMatches.length > 0) {
      detections.push({
        type: 'infantilization_request',
        confidence: 92,
        patterns: infantilizationMatches.map(p => p.source),
        severity: 'critical'
      });
    }

    if (detections.length === 0) {
      return null;
    }

    const highestSeverityDetection = detections.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0];

    const autoAction = determineAutoAction(highestSeverityDetection.severity);

    const flag: Omit<YouthFetishizationFlag, 'id'> = {
      userId,
      flagType: highestSeverityDetection.type,
      severity: highestSeverityDetection.severity,
      detectedAt: Timestamp.now(),
      content: content.substring(0, 500),
      contentType,
      contentId,
      autoAction,
      actionTaken: false,
      reviewStatus: 'pending',
      metadata: {
        confidence: highestSeverityDetection.confidence,
        matchedPatterns: highestSeverityDetection.patterns,
        allDetections: detections
      }
    };

    const flagRef = await db.collection('youth_fetishization_flags').add({
      ...flag,
      createdAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId,
      eventType: 'youth_fetishization_detected',
      timestamp: Timestamp.now(),
      severity: highestSeverityDetection.severity,
      flagId: flagRef.id,
      metadata: {
        flagType: highestSeverityDetection.type,
        confidence: highestSeverityDetection.confidence,
        contentType
      }
    });

    return { ...flag, id: flagRef.id } as YouthFetishizationFlag;
  } catch (error) {
    logger.error('Youth fetishization detection error:', error);
    throw error;
  }
}

function determineAutoAction(severity: YouthFetishizationFlag['severity']): YouthFetishizationFlag['autoAction'] {
  switch (severity) {
    case 'critical':
      return 'ban';
    case 'high':
      return 'suspend';
    case 'medium':
      return 'remove_content';
    case 'low':
      return 'flag';
  }
}

export async function applyMinorSafetyMitigation(
  flagId: string,
  reviewerId?: string
): Promise<void> {
  try {
    const flagDoc = await db.collection('youth_fetishization_flags').doc(flagId).get();
    
    if (!flagDoc.exists) {
      throw new Error('Flag not found');
    }

    const flag = flagDoc.data() as YouthFetishizationFlag;

    if (flag.actionTaken) {
      logger.info(`Action already taken for flag ${flagId}`);
      return;
    }

    const userRef = db.collection('users').doc(flag.userId);

    switch (flag.autoAction) {
      case 'ban':
        await userRef.update({
          accountStatus: 'banned',
          bannedAt: Timestamp.now(),
          banReason: `Youth fetishization detected: ${flag.flagType}`,
          banType: 'permanent',
          updatedAt: Timestamp.now()
        });

        if (flag.contentId) {
          await removeContent(flag.contentType, flag.contentId);
        }

        await db.collection('minor_risk_events').add({
          userId: flag.userId,
          eventType: 'user_banned',
          timestamp: Timestamp.now(),
          severity: 'critical',
          flagId,
          metadata: {
            reason: flag.flagType,
            actionTaken: 'permanent_ban'
          }
        });
        break;

      case 'suspend':
        await userRef.update({
          accountStatus: 'suspended',
          suspendedAt: Timestamp.now(),
          suspensionReason: `Youth fetishization detected: ${flag.flagType}`,
          suspensionEndsAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
          updatedAt: Timestamp.now()
        });

        if (flag.contentId) {
          await removeContent(flag.contentType, flag.contentId);
        }
        break;

      case 'remove_content':
        if (flag.contentId) {
          await removeContent(flag.contentType, flag.contentId);
        }

        await userRef.update({
          warningCount: admin.firestore.FieldValue.increment(1),
          lastWarningAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        break;

      case 'flag':
        await userRef.update({
          flaggedForReview: true,
          lastFlaggedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        break;
    }

    await flagDoc.ref.update({
      actionTaken: true,
      actionTakenAt: Timestamp.now(),
      actionTakenBy: reviewerId || 'system',
      updatedAt: Timestamp.now()
    });

    logger.info(`Mitigation applied for flag ${flagId}: ${flag.autoAction}`);
  } catch (error) {
    logger.error('Mitigation application error:', error);
    throw error;
  }
}

async function removeContent(
  contentType: string,
  contentId: string
): Promise<void> {
  let collectionName: string;

  switch (contentType) {
    case 'post':
      collectionName = 'posts';
      break;
    case 'message':
      collectionName = 'messages';
      break;
    default:
      logger.warn(`Unknown content type: ${contentType}`);
      return;
  }

  await db.collection(collectionName).doc(contentId).update({
    deleted: true,
    deletedAt: Timestamp.now(),
    deletionReason: 'youth_fetishization_violation',
    updatedAt: Timestamp.now()
  });
}

export async function resolveMinorSafetyCase(
  flagId: string,
  reviewerId: string,
  decision: 'confirmed' | 'false_positive',
  notes: string
): Promise<void> {
  try {
    const flagRef = db.collection('youth_fetishization_flags').doc(flagId);
    const flagDoc = await flagRef.get();

    if (!flagDoc.exists) {
      throw new Error('Flag not found');
    }

    await flagRef.update({
      reviewStatus: decision,
      reviewerId,
      reviewNotes: notes,
      reviewedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    if (decision === 'confirmed' && !flagDoc.data()!.actionTaken) {
      await applyMinorSafetyMitigation(flagId, reviewerId);
    } else if (decision === 'false_positive' && flagDoc.data()!.actionTaken) {
      const flag = flagDoc.data() as YouthFetishizationFlag;
      const userRef = db.collection('users').doc(flag.userId);

      await userRef.update({
        accountStatus: 'active',
        bannedAt: admin.firestore.FieldValue.delete(),
        banReason: admin.firestore.FieldValue.delete(),
        suspendedAt: admin.firestore.FieldValue.delete(),
        suspensionReason: admin.firestore.FieldValue.delete(),
        updatedAt: Timestamp.now()
      });
    }

    await db.collection('minor_risk_events').add({
      userId: flagDoc.data()!.userId,
      eventType: 'case_resolved',
      timestamp: Timestamp.now(),
      flagId,
      metadata: {
        decision,
        reviewerId,
        notes
      }
    });
  } catch (error) {
    logger.error('Case resolution error:', error);
    throw error;
  }
}

export async function scanUserProfile(userId: string): Promise<YouthFetishizationFlag[]> {
  try {
    const user = await db.collection('users').doc(userId).get();
    
    if (!user.exists) {
      return [];
    }

    const userData = user.data()!;
    const flags: YouthFetishizationFlag[] = [];

    if (userData.bio) {
      const bioFlag = await detectYouthFetishization(userId, userData.bio, 'profile');
      if (bioFlag) flags.push(bioFlag);
    }

    if (userData.displayName) {
      const nameFlag = await detectYouthFetishization(userId, userData.displayName, 'profile');
      if (nameFlag) flags.push(nameFlag);
    }

    if (userData.age && userData.age < 18) {
      const ageFlag = await detectYouthFetishization(
        userId,
        `Age: ${userData.age}`,
        'profile'
      );
      if (ageFlag) flags.push(ageFlag);
    }

    return flags;
  } catch (error) {
    logger.error('Profile scan error:', error);
    return [];
  }
}