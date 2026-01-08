/**
 * PACK 173 — Avalo Global Abuse Firewall
 * Abuse Detection Engine
 * 
 * Detects harassment, bullying, defamation, dogpiling, and other abuse
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AbuseCase,
  AbuseEvent,
  AbuseCategory,
  AbusePattern,
  ContentType,
  CommentRaid,
  DefamationReport,
  TraumaSafetyViolation,
} from './pack173-types';

// ============================================================================
// DETECTION CONSTANTS
// ============================================================================

const HARASSMENT_KEYWORDS = [
  'loser', 'idiot', 'stupid', 'trash', 'garbage', 'worthless', 'pathetic',
  'disgusting', 'waste', 'failure', 'joke', 'embarrassment', 'shame'
];

const BULLYING_PATTERNS = [
  'everyone laugh', 'look at this', 'can you believe', 'so cringe',
  'imagine being', 'this is sad', 'how embarrassing', 'what a joke'
];

const HARM_KEYWORDS = [
  'hurt yourself', 'end yourself', 'should die', 'kill yourself',
  'kys', 'k y s', 'unalive', 'off yourself'
];

const BODY_SHAMING_KEYWORDS = [
  'fat', 'ugly', 'gross', 'disgusting body', 'hideous', 'repulsive'
];

const TRAUMA_KEYWORDS = [
  'prove it', 'show receipts', 'faker', 'attention seeker', 'lying about',
  'making it up', 'never happened', 'show evidence'
];

const DEFAMATION_INDICATORS = [
  'is a scammer', 'is a thief', 'is a criminal', 'committed fraud',
  'stole from', 'is a predator', 'is dangerous', 'was arrested',
  'is guilty of', 'committed a crime'
];

// ============================================================================
// HARASSMENT DETECTION
// ============================================================================

/**
 * Detect harassment in content
 */
export async function detectHarassment(
  content: string,
  authorUserId: string,
  targetUserId: string,
  contentId: string,
  contentType: ContentType
): Promise<{
  isHarassment: boolean;
  severity: number;
  confidence: number;
  patterns: AbusePattern[];
}> {
  const patterns: AbusePattern[] = [];
  const contentLower = content.toLowerCase();
  
  // Check for direct insults
  const insultMatches = HARASSMENT_KEYWORDS.filter(keyword => 
    contentLower.includes(keyword)
  );
  
  if (insultMatches.length > 0) {
    patterns.push({
      patternType: 'REPEATED_INSULTS',
      matchCount: insultMatches.length,
      confidence: 0.85,
      evidence: insultMatches,
      metadata: { keywords: insultMatches }
    });
  }
  
  // Check for dehumanization (referring to person as "it", "that thing")
  const dehumanizingPhrases = ['that thing', 'it is', 'this creature', 'specimen'];
  const dehumanizationMatches = dehumanizingPhrases.filter(phrase =>
    contentLower.includes(phrase)
  );
  
  if (dehumanizationMatches.length > 0) {
    patterns.push({
      patternType: 'IDENTITY_ATTACK',
      matchCount: dehumanizationMatches.length,
      confidence: 0.8,
      evidence: dehumanizationMatches,
      metadata: { dehumanizing: true }
    });
  }
  
  // Check for repeated harassment from same author to same target
  const recentHarassmentCount = await checkRepeatedHarassment(
    authorUserId,
    targetUserId,
    24 // hours
  );
  
  if (recentHarassmentCount >= 3) {
    patterns.push({
      patternType: 'REPEATED_INSULTS',
      matchCount: recentHarassmentCount,
      confidence: 0.9,
      evidence: [`${recentHarassmentCount} harassment events in 24h`],
      metadata: { repeatOffender: true, count: recentHarassmentCount }
    });
  }
  
  // Calculate severity and confidence
  const severity = Math.min(100, patterns.length * 30 + insultMatches.length * 10);
  const confidence = patterns.length > 0 
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;
  
  return {
    isHarassment: patterns.length > 0,
    severity,
    confidence,
    patterns
  };
}

/**
 * Check for repeated harassment pattern
 */
async function checkRepeatedHarassment(
  authorUserId: string,
  targetUserId: string,
  hoursBack: number
): Promise<number> {
  const threshold = Timestamp.fromMillis(Date.now() - hoursBack * 3600 * 1000);
  
  const snapshot = await db
    .collection('abuse_events')
    .where('perpetratorUserIds', 'array-contains', authorUserId)
    .where('targetUserId', '==', targetUserId)
    .where('detectedAt', '>=', threshold)
    .get();
  
  return snapshot.size;
}

// ============================================================================
// BULLYING DETECTION
// ============================================================================

/**
 * Detect coordinated bullying or public humiliation
 */
export async function detectBullying(
  content: string,
  authorUserId: string,
  targetUserId: string,
  contentId: string,
  contentType: ContentType
): Promise<{
  isBullying: boolean;
  severity: number;
  confidence: number;
  patterns: AbusePattern[];
}> {
  const patterns: AbusePattern[] = [];
  const contentLower = content.toLowerCase();
  
  // Check for public humiliation patterns
  const bullyingMatches = BULLYING_PATTERNS.filter(pattern =>
    contentLower.includes(pattern)
  );
  
  if (bullyingMatches.length > 0) {
    patterns.push({
      patternType: 'REPEATED_INSULTS',
      matchCount: bullyingMatches.length,
      confidence: 0.85,
      evidence: bullyingMatches,
      metadata: { publicHumiliation: true }
    });
  }
  
  // Check for body shaming
  const bodyShameMatches = BODY_SHAMING_KEYWORDS.filter(keyword =>
    contentLower.includes(keyword)
  );
  
  if (bodyShameMatches.length > 0) {
    patterns.push({
      patternType: 'BODY_COMMENT',
      matchCount: bodyShameMatches.length,
      confidence: 0.9,
      evidence: bodyShameMatches,
      metadata: { bodyShaming: true }
    });
  }
  
  // Check for encouraging harm
  const harmMatches = HARM_KEYWORDS.filter(keyword =>
    contentLower.includes(keyword)
  );
  
  if (harmMatches.length > 0) {
    patterns.push({
      patternType: 'HARM_ENCOURAGEMENT',
      matchCount: harmMatches.length,
      confidence: 0.95,
      evidence: harmMatches,
      metadata: { encouragingHarm: true, critical: true }
    });
  }
  
  const severity = patterns.some(p => p.metadata.critical) 
    ? 100 
    : Math.min(100, patterns.length * 35);
    
  const confidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;
  
  return {
    isBullying: patterns.length > 0,
    severity,
    confidence,
    patterns
  };
}

// ============================================================================
// DEFAMATION DETECTION
// ============================================================================

/**
 * Detect defamation (false factual claims without evidence)
 */
export async function detectDefamation(
  content: string,
  authorUserId: string,
  targetUserId: string,
  contentId: string,
  contentType: ContentType
): Promise<{
  isDefamation: boolean;
  severity: number;
  confidence: number;
  patterns: AbusePattern[];
  requiresEvidence: boolean;
}> {
  const patterns: AbusePattern[] = [];
  const contentLower = content.toLowerCase();
  
  // Check for defamatory claims
  const defamationMatches = DEFAMATION_INDICATORS.filter(indicator =>
    contentLower.includes(indicator)
  );
  
  if (defamationMatches.length > 0) {
    patterns.push({
      patternType: 'DEFAMATION_CLAIM',
      matchCount: defamationMatches.length,
      confidence: 0.8,
      evidence: defamationMatches,
      metadata: { factualClaims: true }
    });
  }
  
  // Check for specific crime accusations
  const crimeKeywords = [
    'criminal', 'fraud', 'scam', 'theft', 'assault', 'abuse', 'illegal'
  ];
  const crimeMatches = crimeKeywords.filter(keyword =>
    contentLower.includes(keyword)
  );
  
  if (crimeMatches.length > 0) {
    patterns.push({
      patternType: 'DEFAMATION_CLAIM',
      matchCount: crimeMatches.length,
      confidence: 0.85,
      evidence: crimeMatches,
      metadata: { crimeAccusation: true }
    });
  }
  
  // Check for "everyone knows" or "rumor" based attacks
  const rumorIndicators = ['everyone knows', 'people say', 'rumor has it', 'word is'];
  const rumorMatches = rumorIndicators.filter(indicator =>
    contentLower.includes(indicator)
  );
  
  if (rumorMatches.length > 0) {
    patterns.push({
      patternType: 'DEFAMATION_CLAIM',
      matchCount: rumorMatches.length,
      confidence: 0.75,
      evidence: rumorMatches,
      metadata: { rumorBased: true }
    });
  }
  
  const severity = Math.min(100, patterns.length * 40 + defamationMatches.length * 15);
  const confidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;
  
  return {
    isDefamation: patterns.length > 0,
    severity,
    confidence,
    patterns,
    requiresEvidence: patterns.length > 0
  };
}

// ============================================================================
// COMMENT RAID DETECTION
// ============================================================================

/**
 * Detect coordinated comment raid
 */
export async function detectCommentRaid(
  targetUserId: string,
  targetContentId: string,
  contentType: ContentType
): Promise<{
  isRaid: boolean;
  severity: number;
  raidData?: CommentRaid;
}> {
  const timeWindowMinutes = 10;
  const threshold = Timestamp.fromMillis(Date.now() - timeWindowMinutes * 60 * 1000);
  
  // Get recent comments on this content
  const commentsSnapshot = await db
    .collection('comments')
    .where('targetContentId', '==', targetContentId)
    .where('createdAt', '>=', threshold)
    .get();
  
  const comments = commentsSnapshot.docs.map(doc => doc.data());
  const commentCount = comments.length;
  const uniqueAuthors = new Set(comments.map(c => c.authorId));
  const participantCount = uniqueAuthors.size;
  
  // Raid criteria: 10+ participants, 15+ comments in 10 minutes
  if (participantCount < 10 || commentCount < 15) {
    return { isRaid: false, severity: 0 };
  }
  
  // Check for repeated phrases (coordination evidence)
  const contentMap = new Map<string, number>();
  comments.forEach(comment => {
    const normalized = comment.content.toLowerCase().trim();
    if (normalized.length > 5) {
      contentMap.set(normalized, (contentMap.get(normalized) || 0) + 1);
    }
  });
  
  const repeatedPhrases = Array.from(contentMap.entries())
    .filter(([_, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1]);
  
  const repeatedPhrase = repeatedPhrases.length > 0 ? repeatedPhrases[0][0] : undefined;
  const repeatedPhraseCount = repeatedPhrases.length > 0 ? repeatedPhrases[0][1] : 0;
  
  // Create or update raid record
  const raidId = generateId();
  const raidData: CommentRaid = {
    raidId,
    targetUserId,
    targetContentId,
    targetContentType: contentType,
    participantUserIds: Array.from(uniqueAuthors),
    participantCount,
    commentCount,
    startedAt: threshold,
    repeatedPhrase,
    repeatedPhraseCount,
    coordinationEvidence: repeatedPhrases.length > 0 
      ? [`${repeatedPhrases.length} repeated phrases detected`]
      : [],
    severity: Math.min(100, participantCount * 3 + commentCount * 2),
    mitigated: false,
    mitigationActions: [],
    status: 'ACTIVE',
    updatedAt: serverTimestamp() as Timestamp
  };
  
  // Save raid detection
  await db.collection('comment_raids').doc(raidId).set(raidData);
  
  logger.warn('Comment raid detected', {
    raidId,
    targetUserId,
    participantCount,
    commentCount,
    severity: raidData.severity
  });
  
  return {
    isRaid: true,
    severity: raidData.severity,
    raidData
  };
}

// ============================================================================
// TRAUMA SAFETY DETECTION
// ============================================================================

/**
 * Detect trauma exploitation or shaming
 */
export async function detectTraumaExploitation(
  content: string,
  authorUserId: string,
  targetUserId: string,
  contentId: string,
  contentType: ContentType
): Promise<{
  isViolation: boolean;
  severity: number;
  violationType?: 'TRAUMA_SHAMING' | 'THERAPY_MOCKING' | 'RECEIPT_DEMAND' | 'TRAUMA_MONETIZATION';
}> {
  const contentLower = content.toLowerCase();
  
  // Check for trauma/receipt demands
  const traumaDemands = TRAUMA_KEYWORDS.filter(keyword =>
    contentLower.includes(keyword)
  );
  
  if (traumaDemands.length > 0) {
    const violationId = generateId();
    const violation: TraumaSafetyViolation = {
      violationId,
      contentId,
      contentType,
      victimUserId: targetUserId,
      perpetratorUserId: authorUserId,
      violationType: 'RECEIPT_DEMAND',
      contentSnapshot: content,
      removed: false,
      sanctionApplied: false,
      createdAt: serverTimestamp() as Timestamp
    };
    
    await db.collection('trauma_safety_violations').doc(violationId).set(violation);
    
    return {
      isViolation: true,
      severity: 85,
      violationType: 'RECEIPT_DEMAND'
    };
  }
  
  // Check for therapy mocking
  const therapyMocking = ['therapy lol', 'needs therapy', 'go to therapy', 'therapist failed'];
  const mockingMatches = therapyMocking.filter(phrase => contentLower.includes(phrase));
  
  if (mockingMatches.length > 0) {
    return {
      isViolation: true,
      severity: 70,
      violationType: 'THERAPY_MOCKING'
    };
  }
  
  return {
    isViolation: false,
    severity: 0
  };
}

// ============================================================================
// COMPREHENSIVE CONTENT ANALYSIS
// ============================================================================

/**
 * Perform comprehensive abuse detection on content
 */
export async function analyzeContentForAbuse(
  content: string,
  authorUserId: string,
  targetUserId: string,
  contentId: string,
  contentType: ContentType
): Promise<{
  hasAbuse: boolean;
  categories: AbuseCategory[];
  maxSeverity: number;
  patterns: AbusePattern[];
  recommendedActions: string[];
}> {
  // Run all detection functions
  const [harassment, bullying, defamation, trauma] = await Promise.all([
    detectHarassment(content, authorUserId, targetUserId, contentId, contentType),
    detectBullying(content, authorUserId, targetUserId, contentId, contentType),
    detectDefamation(content, authorUserId, targetUserId, contentId, contentType),
    detectTraumaExploitation(content, authorUserId, targetUserId, contentId, contentType)
  ]);
  
  const categories: AbuseCategory[] = [];
  const allPatterns: AbusePattern[] = [];
  const severities: number[] = [];
  
  if (harassment.isHarassment) {
    categories.push('HARASSMENT');
    allPatterns.push(...harassment.patterns);
    severities.push(harassment.severity);
  }
  
  if (bullying.isBullying) {
    categories.push('BULLYING');
    allPatterns.push(...bullying.patterns);
    severities.push(bullying.severity);
    
    if (bullying.patterns.some(p => p.patternType === 'HARM_ENCOURAGEMENT')) {
      categories.push('ENCOURAGING_HARM');
    }
    if (bullying.patterns.some(p => p.patternType === 'BODY_COMMENT')) {
      categories.push('BODY_SHAMING');
    }
  }
  
  if (defamation.isDefamation) {
    categories.push('DEFAMATION');
    allPatterns.push(...defamation.patterns);
    severities.push(defamation.severity);
  }
  
  if (trauma.isViolation) {
    categories.push('TRAUMA_EXPLOITATION');
    severities.push(trauma.severity);
  }
  
  const maxSeverity = severities.length > 0 ? Math.max(...severities) : 0;
  const recommendedActions = determineRecommendedActions(maxSeverity, categories);
  
  return {
    hasAbuse: categories.length > 0,
    categories,
    maxSeverity,
    patterns: allPatterns,
    recommendedActions
  };
}

/**
 * Determine recommended mitigation actions based on severity
 */
function determineRecommendedActions(severity: number, categories: AbuseCategory[]): string[] {
  const actions: string[] = [];
  
  if (severity >= 90 || categories.includes('ENCOURAGING_HARM')) {
    actions.push('REMOVE_CONTENT', 'HARD_WARNING', 'TEMP_BAN');
  } else if (severity >= 70) {
    actions.push('STEALTH_HIDE', 'SOFT_WARNING', 'THROTTLE');
  } else if (severity >= 50) {
    actions.push('STEALTH_HIDE', 'AUTO_MUTE');
  } else {
    actions.push('MONITOR');
  }
  
  if (categories.includes('DEFAMATION')) {
    actions.push('REQUEST_EVIDENCE');
  }
  
  if (categories.includes('TRAUMA_EXPLOITATION')) {
    actions.push('REMOVE_CONTENT', 'ENABLE_SHIELD_MODE');
  }
  
  return actions;
}

/**
 * Create abuse event record
 */
export async function createAbuseEvent(
  targetUserId: string,
  perpetratorUserId: string,
  contentId: string,
  contentType: ContentType,
  content: string,
  categories: AbuseCategory[],
  severity: number,
  confidence: number,
  raidId?: string
): Promise<string> {
  const eventId = generateId();
  
  const event: AbuseEvent = {
    eventId,
    targetUserId,
    targetContentId: contentId,
    targetContentType: contentType,
    perpetratorUserIds: [perpetratorUserId],
    eventType: categories[0],
    severity,
    confidence,
    content,
    contentSnapshot: { original: content },
    isPartOfRaid: !!raidId,
    raidId,
    isCoordinated: false,
    detectedAt: serverTimestamp() as Timestamp,
    mitigated: false
  };
  
  await db.collection('abuse_events').doc(eventId).set(event);
  
  return eventId;
}