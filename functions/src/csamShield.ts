/**
 * CSAM Shield Engine
 * Phase 22: Child Sexual Abuse Material Protection
 * 
 * CRITICAL SAFETY MODULE
 * This module implements detection and blocking of child sexual abuse material.
 * It uses a human-in-the-loop model where automatic detection triggers immediate
 * protective actions, but reporting to authorities requires human moderator confirmation.
 * 
 * IMPORTANT: This is 100% ADDITIVE - does not modify existing monetization or business logic.
 */

import { db, serverTimestamp, generateId } from './init.js';
import type {
  CsamRiskSource,
  CsamRiskLevel,
  CsamDetectionChannel,
  CsamIncidentStatus,
  CsamIncident,
  CsamCheckResult,
  CsamAutoAction,
  CsamReport,
  CreateIncidentRequest,
  CsamShieldConfig,
} from './types/csam.js';

// Simple logger (matches pattern from other modules)
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * CSAM Shield Configuration
 * These patterns are intentionally conservative to minimize false positives
 * while catching clear violations.
 */
export const CSAM_CONFIG: CsamShieldConfig = {
  autoBlockThreshold: 'HIGH',
  
  // English child-related terms
  childTerms: [
    'child', 'kid', 'minor', 'underage', 'teen', 'teenager',
    'boy', 'girl', 'young', 'youth', 'juvenile', 'adolescent',
    'schoolgirl', 'schoolboy', 'student', 'pupil'
  ],
  
  // English sexual terms (partial list for safety)
  sexualTerms: [
    'sex', 'sexual', 'nude', 'naked', 'explicit', 'intimate',
    'erotic', 'porn', 'xxx', 'nsfw', 'adult', 'mature'
  ],
  
  // Language-specific patterns
  supportedLanguages: {
    en: {
      childTerms: [
        'child', 'kid', 'minor', 'underage', 'teen', 'teenager',
        'boy', 'girl', 'young', 'youth', 'juvenile', 'adolescent',
        'schoolgirl', 'schoolboy', 'student', 'pupil', 'preteen'
      ],
      sexualTerms: [
        'sex', 'sexual', 'nude', 'naked', 'explicit', 'intimate',
        'erotic', 'porn', 'xxx', 'nsfw', 'adult', 'mature', 'seduce'
      ],
    },
    pl: {
      childTerms: [
        'dziecko', 'dziecko', 'nieletni', 'nieletnią', 'nastolatek',
        'nastolatka', 'chłopiec', 'dziewczyna', 'młody', 'młoda',
        'uczeń', 'uczennica', 'małoletni', 'małoletnia'
      ],
      sexualTerms: [
        'seks', 'seksualny', 'nagi', 'naga', 'eksplicytny', 'intymny',
        'erotyczny', 'porno', 'xxx', 'dorosły', 'uwieść'
      ],
    },
  },
  
  // Combined risk patterns (compiled at runtime)
  combinedRiskPatterns: [],
  
  // Actions per risk level
  actionsPerLevel: {
    LOW: {
      freezeAccount: false,
      hideContentFromPublic: false,
      blockNewContent: false,
      notifyModerator: false,
    },
    MEDIUM: {
      freezeAccount: false,
      hideContentFromPublic: false,
      blockNewContent: false,
      notifyModerator: true,
    },
    HIGH: {
      freezeAccount: true,
      hideContentFromPublic: true,
      blockNewContent: true,
      notifyModerator: true,
    },
    CRITICAL: {
      freezeAccount: true,
      hideContentFromPublic: true,
      blockNewContent: true,
      notifyModerator: true,
    },
  },
};

// ============================================================================
// TEXT EVALUATION
// ============================================================================

/**
 * Evaluate text for CSAM risk
 * Uses rule-based heuristics to detect concerning patterns
 * 
 * @param text - Text to evaluate
 * @param locale - Language code (en, pl, etc.)
 * @returns Risk assessment result
 */
export function evaluateTextForCsamRisk(
  text: string,
  locale: string = 'en'
): CsamCheckResult {
  
  if (!text || text.trim().length === 0) {
    return {
      isFlagged: false,
      riskLevel: 'LOW',
      reasonCodes: [],
    };
  }
  
  const normalizedText = text.toLowerCase().trim();
  const reasonCodes: string[] = [];
  
  // Get language-specific terms or fallback to English
  const langTerms = CSAM_CONFIG.supportedLanguages[locale] || CSAM_CONFIG.supportedLanguages.en;
  
  // Check for child-related terms
  let childTermCount = 0;
  for (const term of langTerms.childTerms) {
    if (normalizedText.includes(term.toLowerCase())) {
      childTermCount++;
      reasonCodes.push(`child_term:${term}`);
    }
  }
  
  // Check for sexual terms
  let sexualTermCount = 0;
  for (const term of langTerms.sexualTerms) {
    if (normalizedText.includes(term.toLowerCase())) {
      sexualTermCount++;
      reasonCodes.push(`sexual_term:${term}`);
    }
  }
  
  // Age-specific patterns (numbers + child context)
  const agePatterns = /\b([0-9]|1[0-7])\s*(year|yr|yo|age|old|lat)\b/gi;
  const ageMatches = normalizedText.match(agePatterns);
  if (ageMatches && ageMatches.length > 0) {
    childTermCount += ageMatches.length;
    reasonCodes.push('age_pattern_detected');
  }
  
  // Determine risk level based on pattern combinations
  let riskLevel: CsamRiskLevel = 'LOW';
  let isFlagged = false;
  
  // CRITICAL: Strong combination of child + sexual terms
  if (childTermCount >= 2 && sexualTermCount >= 2) {
    riskLevel = 'CRITICAL';
    isFlagged = true;
  }
  // HIGH: Clear combination of child + sexual terms
  else if (childTermCount >= 1 && sexualTermCount >= 2) {
    riskLevel = 'HIGH';
    isFlagged = true;
  }
  // HIGH: Multiple age-specific patterns with sexual context
  else if (ageMatches && ageMatches.length >= 1 && sexualTermCount >= 1) {
    riskLevel = 'HIGH';
    isFlagged = true;
  }
  // MEDIUM: Some concerning patterns but not definitive
  else if ((childTermCount >= 2 && sexualTermCount >= 1) || 
           (childTermCount >= 1 && sexualTermCount >= 1 && ageMatches)) {
    riskLevel = 'MEDIUM';
    isFlagged = true;
  }
  // LOW: Isolated terms without clear combination
  else if (childTermCount > 0 || sexualTermCount > 0) {
    riskLevel = 'LOW';
    isFlagged = false; // Don't flag single terms out of context
  }
  
  return {
    isFlagged,
    riskLevel,
    reasonCodes,
  };
}

// ============================================================================
// INCIDENT MANAGEMENT
// ============================================================================

/**
 * Create a new CSAM incident
 * This is called when HIGH or CRITICAL risk is detected
 * 
 * @param params - Incident creation parameters
 * @returns Created incident ID
 */
export async function createCsamIncident(
  params: CreateIncidentRequest
): Promise<string> {
  
  const incidentId = generateId();
  
  const incident: Partial<CsamIncident> = {
    incidentId,
    userId: params.userId,
    suspectUserId: params.suspectUserId,
    source: params.source,
    detectionChannel: params.detectionChannel,
    riskLevel: params.riskLevel,
    detectedAt: serverTimestamp(),
    
    // Content references (NEVER store actual CSAM)
    contentSnippet: params.contentSnippet ? params.contentSnippet.substring(0, 200) : undefined,
    messageIds: params.messageIds || [],
    mediaIds: params.mediaIds || [],
    sessionIds: params.sessionIds || [],
    questionIds: params.questionIds || [],
    
    status: 'OPEN_REVIEW',
    
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  await db.collection('csamIncidents').doc(incidentId).set(incident);
  
  logger.warn(`CSAM incident created: ${incidentId} for user ${params.userId} (${params.riskLevel})`);
  
  return incidentId;
}

/**
 * Apply immediate protective actions based on risk level
 * This freezes account and hides content for HIGH/CRITICAL risks
 * 
 * @param userId - User ID to protect against
 * @param riskLevel - Risk level detected
 * @param incidentId - Associated incident ID
 */
export async function applyImmediateProtectiveActions(
  userId: string,
  riskLevel: CsamRiskLevel,
  incidentId: string
): Promise<void> {
  
  const actions = CSAM_CONFIG.actionsPerLevel[riskLevel];
  
  if (!actions.freezeAccount && !actions.hideContentFromPublic) {
    // No protective actions needed for this risk level
    return;
  }
  
  const userRef = db.collection('users').doc(userId);
  const updates: any = {
    'safety.lastCsamCheckAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // Add to incident list
  const { arrayUnion } = await import('./init');
  updates['safety.csamIncidentIds'] = arrayUnion(incidentId);
  
  if (actions.freezeAccount) {
    // Mark account as under CSAM review
    updates['safety.csamUnderReview'] = true;
    
    // Integration with trust engine - record highest severity risk event
    try {
      const { recordRiskEvent } = await import('./trustEngine.js');
      await recordRiskEvent({
        userId,
        eventType: 'chat', // Use existing event type
        metadata: {
          csamIncidentId: incidentId,
          riskLevel,
          reason: 'CSAM_SUSPECT',
        },
      });
    } catch (error) {
      logger.error('Failed to record risk event:', error);
    }
  }
  
  if (actions.hideContentFromPublic) {
    // Block visibility in discovery/feed/etc
    updates['safety.safetyVisibilityBlocked'] = true;
  }
  
  await userRef.update(updates);
  
  logger.warn(`Protective actions applied for user ${userId}: freeze=${actions.freezeAccount}, hide=${actions.hideContentFromPublic}`);
}

/**
 * Hide all public content for a user
 * Additional helper for content moderation
 * 
 * @param userId - User ID to hide content for
 */
export async function hidePublicContentForUser(userId: string): Promise<void> {
  
  await db.collection('users').doc(userId).update({
    'safety.safetyVisibilityBlocked': true,
    'safety.lastCsamCheckAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  logger.warn(`Public content hidden for user ${userId}`);
}

/**
 * Update CSAM incident status
 * This is called by moderators to confirm or clear incidents
 * 
 * @param incidentId - Incident ID to update
 * @param newStatus - New status to set
 * @param moderatorUserId - Moderator making the change
 * @param note - Optional moderator note
 */
export async function updateCsamIncidentStatus(
  incidentId: string,
  newStatus: CsamIncidentStatus,
  moderatorUserId: string,
  note?: string
): Promise<void> {
  
  const incidentRef = db.collection('csamIncidents').doc(incidentId);
  const incidentSnap = await incidentRef.get();
  
  if (!incidentSnap.exists) {
    throw new Error('Incident not found');
  }
  
  const incident = incidentSnap.data() as CsamIncident;
  
  const updates: any = {
    status: newStatus,
    moderatorUserId,
    moderatorNote: note,
    updatedAt: serverTimestamp(),
  };
  
  // Handle specific status transitions
  if (newStatus === 'CONFIRMED_CSAM') {
    // Ensure account remains frozen and hidden
    await applyImmediateProtectiveActions(incident.userId, 'CRITICAL', incidentId);
    
    // Block further content creation
    await db.collection('users').doc(incident.userId).update({
      'safety.csamUnderReview': true,
      'safety.safetyVisibilityBlocked': true,
      'safety.contentCreationBlocked': true,
      updatedAt: serverTimestamp(),
    });
    
    logger.warn(`CSAM incident ${incidentId} CONFIRMED by moderator ${moderatorUserId}`);
  }
  
  if (newStatus === 'CLEARED_FALSE_POSITIVE') {
    // Unfreeze account but keep incident record
    await db.collection('users').doc(incident.userId).update({
      'safety.csamUnderReview': false,
      'safety.safetyVisibilityBlocked': false,
      'safety.contentCreationBlocked': false,
      updatedAt: serverTimestamp(),
    });
    
    logger.info(`CSAM incident ${incidentId} cleared as false positive by moderator ${moderatorUserId}`);
  }
  
  if (newStatus === 'ESCALATED_TO_AUTHORITIES') {
    updates.reportedToAuthoritiesAt = serverTimestamp();
    logger.warn(`CSAM incident ${incidentId} escalated to authorities by moderator ${moderatorUserId}`);
  }
  
  await incidentRef.update(updates);
}

/**
 * Report CSAM to authorities
 * PLACEHOLDER: This should be implemented with actual external API integrations
 * 
 * @param incident - Incident to report
 * @returns Report ID
 */
export async function reportCsamToAuthorities(
  incident: CsamIncident
): Promise<string> {
  
  const reportId = generateId();
  
  // Create report record
  const report: Partial<CsamReport> = {
    reportId,
    incidentId: incident.incidentId,
    reportedAt: serverTimestamp(),
    reportedBy: incident.moderatorUserId || 'system',
    incidentSummary: `Risk Level: ${incident.riskLevel}, Source: ${incident.source}`,
    userIds: [incident.userId, incident.suspectUserId].filter(Boolean) as string[],
    createdAt: serverTimestamp(),
  };
  
  await db.collection('csamReports').doc(reportId).set(report);
  
  // PLACEHOLDER: Integrate with external reporting APIs
  // Examples:
  // - NCMEC CyberTipline (US): https://report.cybertip.org/
  // - INHOPE (International): https://www.inhope.org/
  // - National hotlines per jurisdiction
  
  logger.warn(`CSAM report created: ${reportId} for incident ${incident.incidentId}`);
  logger.warn('PLACEHOLDER: Actual external report not sent - requires API integration');
  
  return reportId;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get CSAM incident by ID
 * 
 * @param incidentId - Incident ID
 * @returns Incident data or null
 */
export async function getCsamIncident(incidentId: string): Promise<CsamIncident | null> {
  const incidentSnap = await db.collection('csamIncidents').doc(incidentId).get();
  
  if (!incidentSnap.exists) {
    return null;
  }
  
  return incidentSnap.data() as CsamIncident;
}

/**
 * Check if user has active CSAM incidents
 * 
 * @param userId - User ID to check
 * @returns True if user has open incidents
 */
export async function userHasActiveCsamIncidents(userId: string): Promise<boolean> {
  const incidentsSnap = await db.collection('csamIncidents')
    .where('userId', '==', userId)
    .where('status', 'in', ['OPEN_REVIEW', 'CONFIRMED_CSAM'])
    .limit(1)
    .get();
  
  return !incidentsSnap.empty;
}

/**
 * Check if user is under CSAM review
 * 
 * @param userId - User ID to check
 * @returns True if under review
 */
export async function isUserUnderCsamReview(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return false;
  }
  
  const userData = userSnap.data();
  return userData?.safety?.csamUnderReview === true;
}

/**
 * Placeholder for image CSAM risk evaluation
 * This should integrate with image hashing services (PhotoDNA, etc.)
 * 
 * @param imageUrl - Image URL or storage path
 * @returns Risk assessment result
 */
export async function evaluateImageForCsamRisk(
  imageUrl: string
): Promise<CsamCheckResult> {
  
  // PLACEHOLDER: Integrate with image CSAM detection services
  // Examples:
  // - Microsoft PhotoDNA
  // - Google Content Safety API
  // - AWS Rekognition with custom models
  
  logger.warn('PLACEHOLDER: Image CSAM detection not implemented - requires external service integration');
  
  return {
    isFlagged: false,
    riskLevel: 'LOW',
    reasonCodes: ['image_scan_not_implemented'],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  evaluateTextForCsamRisk,
  createCsamIncident,
  applyImmediateProtectiveActions,
  hidePublicContentForUser,
  updateCsamIncidentStatus,
  reportCsamToAuthorities,
  getCsamIncident,
  userHasActiveCsamIncidents,
  isUserUnderCsamReview,
  evaluateImageForCsamRisk,
};