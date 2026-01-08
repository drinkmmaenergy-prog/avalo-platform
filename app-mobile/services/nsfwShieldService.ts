/**
 * PACK 249 - AI Chat Shield for NSFW & Sexting Risk Management
 * 
 * CORE MISSION: Allow adult content, block crimes.
 * - Flirting, sexting, dirty-talk, fantasies: ALLOWED
 * - Minors, non-consent, incest, forced sex: BLOCKED
 * 
 * Detection strategy:
 * 1. On-device detection first (fast, private)
 * 2. Cloud analysis only if risk score > threshold
 * 3. Consent-based approach (ask before explicit content)
 * 4. Soft messaging (no shame)
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  NSFWDetection,
  NSFWConsent,
  NSFWSafeZone,
  NSFWContentType,
  NSFWRiskLevel,
  NSFWAction,
  ProhibitedPattern,
  ProhibitedContentType,
  PROHIBITED_NSFW_PATTERNS,
  DEFAULT_CONSENT_CONFIG,
  NSFW_DETECTION_THRESHOLDS,
  NSFW_SAFETY_MESSAGES,
  NSFWUserRiskScore,
  NSFWRiskIncident,
  NSFWChatMetadata,
} from '../types/nsfw-shield.types';

// ============================================================================
// ON-DEVICE DETECTION (Privacy First)
// ============================================================================

/**
 * Analyze message for NSFW content using on-device detection
 * This runs locally without sending data to cloud unless risk is high
 */
export async function analyzeMessageForNSFW(
  messageText: string,
  messageId: string,
  chatId: string,
  senderId: string,
  receiverId: string
): Promise<NSFWDetection | null> {
  if (!messageText || messageText.trim().length === 0) {
    return null;
  }

  const text = messageText.toLowerCase();
  
  // Step 1: On-device pattern matching for PROHIBITED content
  const prohibitedPatterns = detectProhibitedPatterns(text);
  
  if (prohibitedPatterns.length === 0) {
    // No prohibited content detected - message is safe
    return null;
  }

  // Step 2: Determine content type and risk level
  const { contentType, riskLevel } = categorizeNSFWContent(prohibitedPatterns);
  
  // Step 3: Determine if cloud analysis is needed
  const maxConfidence = Math.max(...prohibitedPatterns.map(p => p.confidence));
  const requiresCloudAnalysis = maxConfidence >= NSFW_DETECTION_THRESHOLDS.CLOUD_ANALYSIS;
  
  // Step 4: Determine action
  const actionTaken = determineNSFWAction(riskLevel, maxConfidence);
  
  const detection: NSFWDetection = {
    messageId,
    chatId,
    senderId,
    receiverId,
    messageText: messageText.substring(0, 100), // Store snippet only
    detectedAt: new Date(),
    contentType,
    riskLevel,
    prohibitedPatterns,
    requiresCloudAnalysis,
    actionTaken,
  };

  // Store detection if prohibited or gray zone
  if (riskLevel === 'PROHIBITED' || riskLevel === 'GRAY_ZONE') {
    await storeNSFWDetection(detection);
    
    // Update user risk score (async, non-blocking)
    updateUserNSFWRiskScore(senderId, prohibitedPatterns).catch(err => {
      console.error('[NSFW Shield] Failed to update risk score:', err);
    });
  }

  return detection;
}

/**
 * On-device pattern detection for prohibited content
 * Returns empty array if content is safe adult content
 */
function detectProhibitedPatterns(text: string): ProhibitedPattern[] {
  const patterns: ProhibitedPattern[] = [];

  for (const patternDef of PROHIBITED_NSFW_PATTERNS) {
    for (const keyword of patternDef.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        // Calculate confidence based on context
        const confidence = calculateConfidence(text, keyword, patternDef.requiresContext);
        
        if (confidence > 0.3) { // Minimum confidence threshold
          patterns.push({
            type: patternDef.type,
            matchedPhrase: keyword,
            confidence,
            context: extractContext(text, keyword),
            severity: patternDef.severity,
          });
        }
      }
    }
  }

  return patterns;
}

/**
 * Calculate confidence score based on context
 */
function calculateConfidence(
  text: string,
  keyword: string,
  requiresContext: boolean = false
): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence if keyword appears multiple times
  const occurrences = (text.match(new RegExp(keyword, 'gi')) || []).length;
  confidence += Math.min(occurrences * 0.1, 0.3);

  // Increase confidence for CRITICAL patterns
  if (keyword.includes('minor') || keyword.includes('child') || keyword.includes('underage')) {
    confidence += 0.3;
  }

  // Decrease confidence if context is required but not clear
  if (requiresContext) {
    const hasNegation = /no|not|never|don't|doesn't/.test(text);
    if (hasNegation) {
      confidence -= 0.2;
    }
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Extract context around matched keyword
 */
function extractContext(text: string, keyword: string): string {
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) return '';

  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + keyword.length + 30);
  return text.substring(start, end);
}

/**
 * Categorize NSFW content type and risk level
 */
function categorizeNSFWContent(
  patterns: ProhibitedPattern[]
): { contentType: NSFWContentType; riskLevel: NSFWRiskLevel } {
  
  if (patterns.length === 0) {
    return { contentType: 'SAFE_FLIRT', riskLevel: 'SAFE' };
  }

  // Check for CRITICAL patterns (minors, non-consent)
  const hasCritical = patterns.some(p => p.severity === 'CRITICAL');
  if (hasCritical) {
    const type = patterns.find(p => p.severity === 'CRITICAL')?.type;
    if (type?.includes('MINOR')) {
      return { contentType: 'PROHIBITED_MINOR', riskLevel: 'PROHIBITED' };
    }
    if (type?.includes('FORCED') || type?.includes('NON_CONSENT')) {
      return { contentType: 'PROHIBITED_NONCONSENT', riskLevel: 'PROHIBITED' };
    }
  }

  // Check for HIGH patterns
  const hasHigh = patterns.some(p => p.severity === 'HIGH');
  if (hasHigh) {
    const type = patterns.find(p => p.severity === 'HIGH')?.type;
    if (type?.includes('INCEST')) {
      return { contentType: 'PROHIBITED_INCEST', riskLevel: 'PROHIBITED' };
    }
    if (type?.includes('VIOLENCE')) {
      return { contentType: 'PROHIBITED_FORCED', riskLevel: 'PROHIBITED' };
    }
  }

  // MEDIUM severity or multiple patterns = gray zone
  return { contentType: 'GRAY_ZONE', riskLevel: 'GRAY_ZONE' };
}

/**
 * Determine what action to take based on risk level
 */
function determineNSFWAction(riskLevel: NSFWRiskLevel, confidence: number): NSFWAction {
  if (riskLevel === 'PROHIBITED') {
    return confidence >= NSFW_DETECTION_THRESHOLDS.IMMEDIATE_BLOCK 
      ? 'BLOCK_IMMEDIATE' 
      : 'FLAG_FOR_REVIEW';
  }

  if (riskLevel === 'GRAY_ZONE') {
    return 'FLAG_FOR_REVIEW';
  }

  if (riskLevel === 'CONSENT_NEEDED') {
    return 'REQUEST_CONSENT';
  }

  return 'ALLOW';
}

// ============================================================================
// CONSENT MECHANISM
// ============================================================================

/**
 * Check if both participants have consented to explicit content
 */
export async function checkNSFWSafeZone(chatId: string): Promise<boolean> {
  try {
    const safeZoneDoc = await getDoc(doc(db, 'nsfw_safe_zones', chatId));
    
    if (!safeZoneDoc.exists()) {
      return false;
    }

    const data = safeZoneDoc.data() as NSFWSafeZone;
    return data.bothConsented === true;
  } catch (error) {
    console.error('[NSFW Shield] Error checking safe zone:', error);
    return false;
  }
}

/**
 * Record user consent for NSFW content in a specific chat
 */
export async function recordNSFWConsent(
  userId: string,
  chatId: string,
  receiverId: string
): Promise<void> {
  const consent: NSFWConsent = {
    userId,
    chatId,
    consentedAt: new Date(),
    consentVersion: DEFAULT_CONSENT_CONFIG.consentVersion,
    isAdult: true, // User confirmed 18+
    acceptedTerms: true,
  };

  // Store consent
  await setDoc(doc(db, 'nsfw_consents', `${chatId}_${userId}`), {
    ...consent,
    consentedAt: serverTimestamp(),
  });

  // Update safe zone
  await updateNSFWSafeZone(chatId, userId, receiverId);
}

/**
 * Update NSFW Safe Zone status
 * Activated only when BOTH participants consent
 */
async function updateNSFWSafeZone(
  chatId: string,
  userId: string,
  otherUserId: string
): Promise<void> {
  const safeZoneRef = doc(db, 'nsfw_safe_zones', chatId);
  const safeZoneDoc = await getDoc(safeZoneRef);

  if (!safeZoneDoc.exists()) {
    // Create new safe zone
    await setDoc(safeZoneRef, {
      chatId,
      participantIds: [userId, otherUserId],
      bothConsented: false,
      consentRecords: {
        [userId]: {
          consented: true,
          consentedAt: serverTimestamp(),
        },
      },
    });
  } else {
    // Update existing safe zone
    const data = safeZoneDoc.data() as NSFWSafeZone;
    const otherUserConsented = data.consentRecords[otherUserId]?.consented === true;

    await updateDoc(safeZoneRef, {
      [`consentRecords.${userId}.consented`]: true,
      [`consentRecords.${userId}.consentedAt`]: serverTimestamp(),
      bothConsented: otherUserConsented, // Both consented now
      activatedAt: otherUserConsented ? serverTimestamp() : null,
    });
  }
}

/**
 * Check if specific user has consented in this chat
 */
export async function hasUserConsented(userId: string, chatId: string): Promise<boolean> {
  try {
    const consentDoc = await getDoc(doc(db, 'nsfw_consents', `${chatId}_${userId}`));
    return consentDoc.exists();
  } catch (error) {
    console.error('[NSFW Shield] Error checking consent:', error);
    return false;
  }
}

// ============================================================================
// RISK SCORING
// ============================================================================

/**
 * Update user's NSFW risk score based on detected patterns
 */
async function updateUserNSFWRiskScore(
  userId: string,
  patterns: ProhibitedPattern[]
): Promise<void> {
  const riskRef = doc(db, 'nsfw_user_risk_scores', userId);
  const riskDoc = await getDoc(riskRef);

  // Calculate severity points
  let totalPoints = 0;
  const incidents: NSFWRiskIncident[] = [];

  for (const pattern of patterns) {
    let points = 0;
    switch (pattern.severity) {
      case 'CRITICAL': points = 40; break;
      case 'HIGH': points = 25; break;
      case 'MEDIUM': points = 15; break;
      case 'LOW': points = 5; break;
    }

    totalPoints += points;
    
    incidents.push({
      incidentId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: pattern.type,
      severityPoints: points,
      actionTaken: 'FLAG_FOR_REVIEW',
    });
  }

  if (!riskDoc.exists()) {
    // Create new risk score
    const newScore: NSFWUserRiskScore = {
      userId,
      totalScore: totalPoints,
      lastUpdated: new Date(),
      incidents,
      accountRestricted: totalPoints >= NSFW_DETECTION_THRESHOLDS.RISK_SCORE_RESTRICT,
      requiresManualReview: totalPoints >= NSFW_DETECTION_THRESHOLDS.RISK_SCORE_WARNING,
    };

    await setDoc(riskRef, {
      ...newScore,
      lastUpdated: serverTimestamp(),
      incidents: incidents.map(i => ({ ...i, timestamp: serverTimestamp() })),
    });
  } else {
    // Update existing score
    const currentScore = riskDoc.data() as NSFWUserRiskScore;
    const newTotal = Math.min(100, currentScore.totalScore + totalPoints);

    await updateDoc(riskRef, {
      totalScore: newTotal,
      lastUpdated: serverTimestamp(),
      incidents: [...currentScore.incidents, ...incidents].slice(-20), // Keep last 20
      accountRestricted: newTotal >= NSFW_DETECTION_THRESHOLDS.RISK_SCORE_RESTRICT,
      requiresManualReview: newTotal >= NSFW_DETECTION_THRESHOLDS.RISK_SCORE_WARNING,
    });
  }
}

/**
 * Get user's current NSFW risk score
 */
export async function getUserNSFWRiskScore(userId: string): Promise<number> {
  try {
    const riskDoc = await getDoc(doc(db, 'nsfw_user_risk_scores', userId));
    
    if (!riskDoc.exists()) {
      return 0;
    }

    const data = riskDoc.data() as NSFWUserRiskScore;
    return data.totalScore || 0;
  } catch (error) {
    console.error('[NSFW Shield] Error getting risk score:', error);
    return 0;
  }
}

/**
 * Check if user's account is restricted due to NSFW violations
 */
export async function isAccountNSFWRestricted(userId: string): Promise<boolean> {
  try {
    const riskDoc = await getDoc(doc(db, 'nsfw_user_risk_scores', userId));
    
    if (!riskDoc.exists()) {
      return false;
    }

    const data = riskDoc.data() as NSFWUserRiskScore;
    return data.accountRestricted === true;
  } catch (error) {
    console.error('[NSFW Shield] Error checking restriction:', error);
    return false;
  }
}

// ============================================================================
// CLOUD-BASED RISK ASSESSMENT (For elevated cases only)
// ============================================================================

/**
 * Perform cloud-based analysis for high-risk content
 * This is called ONLY when on-device detection flags something as risky
 */
export async function performCloudNSFWAnalysis(
  detection: NSFWDetection
): Promise<{ confirmed: boolean; confidence: number; recommendation: NSFWAction }> {
  // TODO: Integrate with cloud ML model for deeper analysis
  // For now, return conservative recommendation based on on-device detection
  
  const maxConfidence = Math.max(...detection.prohibitedPatterns.map(p => p.confidence));
  
  return {
    confirmed: detection.riskLevel === 'PROHIBITED',
    confidence: maxConfidence,
    recommendation: detection.actionTaken,
  };
}

// ============================================================================
// STORAGE & REPORTING
// ============================================================================

/**
 * Store NSFW detection for moderation review
 */
async function storeNSFWDetection(detection: NSFWDetection): Promise<void> {
  try {
    await setDoc(doc(db, 'nsfw_detections', detection.messageId), {
      ...detection,
      detectedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[NSFW Shield] Error storing detection:', error);
  }
}

/**
 * Get chat NSFW metadata
 */
export async function getChatNSFWMetadata(chatId: string): Promise<NSFWChatMetadata | null> {
  try {
    const metadataDoc = await getDoc(doc(db, 'nsfw_chat_metadata', chatId));
    
    if (!metadataDoc.exists()) {
      return null;
    }

    return metadataDoc.data() as NSFWChatMetadata;
  } catch (error) {
    console.error('[NSFW Shield] Error getting chat metadata:', error);
    return null;
  }
}

/**
 * Update chat NSFW metadata
 */
export async function updateChatNSFWMetadata(
  chatId: string,
  updates: Partial<NSFWChatMetadata>
): Promise<void> {
  try {
    const metadataRef = doc(db, 'nsfw_chat_metadata', chatId);
    
    await setDoc(metadataRef, {
      chatId,
      ...updates,
      lastContentCheck: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('[NSFW Shield] Error updating chat metadata:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get appropriate warning message based on risk level
 */
export function getNSFWWarningMessage(riskLevel: NSFWRiskLevel): string | null {
  switch (riskLevel) {
    case 'PROHIBITED':
      return NSFW_SAFETY_MESSAGES.CONTENT_BLOCKED;
    case 'GRAY_ZONE':
      return NSFW_SAFETY_MESSAGES.MINOR_WARNING;
    case 'CONSENT_NEEDED':
      return NSFW_SAFETY_MESSAGES.CONSENT_PROMPT;
    default:
      return null;
  }
}

/**
 * Check if message should be blocked before sending
 */
export function shouldBlockMessage(detection: NSFWDetection | null): boolean {
  if (!detection) return false;
  
  return detection.actionTaken === 'BLOCK_IMMEDIATE';
}

/**
 * Check if consent prompt should be shown
 */
export async function shouldShowConsentPrompt(
  chatId: string,
  userId: string
): Promise<boolean> {
  const hasConsented = await hasUserConsented(userId, chatId);
  const inSafeZone = await checkNSFWSafeZone(chatId);
  
  return !hasConsented && !inSafeZone;
}

/**
 * Detect if message contains explicit content that needs consent
 * This is for consensual adult content, NOT prohibited content
 */
export function detectsExplicitContent(messageText: string): boolean {
  const text = messageText.toLowerCase();
  
  // Simple heuristic for explicit sexual content
  const explicitKeywords = [
    'fuck', 'cock', 'pussy', 'dick', 'cum', 'orgasm',
    'blowjob', 'anal', 'sex', 'nude', 'naked', 'tits', 'ass'
  ];
  
  return explicitKeywords.some(keyword => text.includes(keyword));
}