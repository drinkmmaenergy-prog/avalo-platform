/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Victim Reporting & Help System
 * 
 * Provides victims with reporting tools, legal resources, and immediate protection.
 * Victims receive zero penalties - stalkers face consequences.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  VictimHelpRequest,
  HelpRequestType,
  LegalResources,
  StalkingCase,
  MitigationAction,
  MitigationType,
} from './types/cyberstalking.types';

const db = admin.firestore();

// ============================================================================
// VICTIM REPORTING
// ============================================================================

/**
 * Report stalking behavior
 */
export const reportStalking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const victimId = context.auth.uid;
  const { stalkerId, reportType, description, evidence } = data;
  
  if (!stalkerId || !reportType) {
    throw new functions.https.HttpsError('invalid-argument', 'stalkerId and reportType are required');
  }
  
  try {
    const helpRequest = await createVictimHelpRequest(
      victimId,
      stalkerId,
      reportType as HelpRequestType,
      description,
      evidence
    );
    
    // Immediately apply protective measures for victim
    await applyVictimProtection(victimId, stalkerId);
    
    // Update or create stalking case
    await updateStalkingCaseFromReport(victimId, stalkerId, reportType, description);
    
    // Provide legal resources based on victim's country
    const resources = await getLegalResourcesForVictim(victimId);
    
    return {
      success: true,
      requestId: helpRequest.id,
      protectionApplied: true,
      legalResources: resources,
      message: 'Your report has been received. Protective measures have been applied.',
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error reporting stalking:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Report obsessive attention
 */
export const reportObsession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const victimId = context.auth.uid;
  const { observerId, description } = data;
  
  if (!observerId) {
    throw new functions.https.HttpsError('invalid-argument', 'observerId is required');
  }
  
  try {
    const helpRequest = await createVictimHelpRequest(
      victimId,
      observerId,
      'REPORT_OBSESSION',
      description
    );
    
    // Apply protective measures
    await applyVictimProtection(victimId, observerId);
    
    return {
      success: true,
      requestId: helpRequest.id,
      message: 'Your report has been received. We are reviewing the situation.',
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error reporting obsession:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Report location harassment/abuse
 */
export const reportLocationHarassment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const victimId = context.auth.uid;
  const { harasserId, description, evidence } = data;
  
  if (!harasserId) {
    throw new functions.https.HttpsError('invalid-argument', 'harasserId is required');
  }
  
  try {
    const helpRequest = await createVictimHelpRequest(
      victimId,
      harasserId,
      'REPORT_LOCATION_ABUSE',
      description,
      evidence
    );
    
    // Immediately block location access between users
    await blockAllLocationSharing(victimId, harasserId);
    
    // Apply protective measures
    await applyVictimProtection(victimId, harasserId);
    
    return {
      success: true,
      requestId: helpRequest.id,
      locationAccessBlocked: true,
      message: 'Location access has been blocked. You are protected.',
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error reporting location harassment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Request immediate protection (for urgent cases)
 */
export const requestImmediateProtection = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const victimId = context.auth.uid;
  const { threateningUserId, urgencyReason } = data;
  
  if (!threateningUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'threateningUserId is required');
  }
  
  try {
    const helpRequest = await createVictimHelpRequest(
      victimId,
      threateningUserId,
      'REQUEST_PROTECTION',
      urgencyReason,
      undefined,
      'URGENT'
    );
    
    // Apply immediate, comprehensive protection
    await applyEmergencyProtection(victimId, threateningUserId);
    
    // Escalate to moderators immediately
    await escalateToModerators(victimId, threateningUserId, urgencyReason);
    
    return {
      success: true,
      requestId: helpRequest.id,
      protectionLevel: 'MAXIMUM',
      message: 'Emergency protection applied. Moderators have been alerted.',
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error requesting protection:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get legal resources for victim
 */
export const getLegalResources = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const resources = await getLegalResourcesForVictim(userId);
    
    // Log that victim accessed legal resources
    await logVictimSupport(userId, 'LEGAL_RESOURCES_ACCESSED');
    
    return {
      success: true,
      resources,
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error getting legal resources:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get victim's help requests
 */
export const getMyHelpRequests = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const victimId = context.auth.uid;
  
  try {
    const requestsSnapshot = await db.collection('victim_help_requests')
      .where('victimUserId', '==', victimId)
      .orderBy('requestedAt', 'desc')
      .limit(50)
      .get();
    
    const requests = requestsSnapshot.docs.map(doc => doc.data() as VictimHelpRequest);
    
    return {
      success: true,
      requests,
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error getting help requests:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// VICTIM PROTECTION MEASURES
// ============================================================================

/**
 * Apply immediate victim protection
 */
async function applyVictimProtection(
  victimId: string,
  stalkerId: string
): Promise<void> {
  try {
    // 1. Auto-block stalker for victim
    await db.collection('blocks').add({
      blockerId: victimId,
      blockedUserId: stalkerId,
      createdAt: admin.firestore.Timestamp.now(),
      autoApplied: true,
      reason: 'STALKING_PROTECTION',
    });
    
    // 2. Hide victim from stalker's discovery
    await db.collection('discovery_blocks').add({
      userId: victimId,
      blockedFrom: stalkerId,
      reason: 'STALKING_PROTECTION',
      createdAt: admin.firestore.Timestamp.now(),
    });
    
    // 3. Prevent stalker from joining victim's events
    await db.collection('event_blocks').add({
      victimUserId: victimId,
      blockedUserId: stalkerId,
      reason: 'STALKING_PROTECTION',
      createdAt: admin.firestore.Timestamp.now(),
    });
    
    console.log(`[CyberstalkingReporting] Applied protection for victim ${victimId} from ${stalkerId}`);
  } catch (error) {
    console.error('[CyberstalkingReporting] Error applying protection:', error);
  }
}

/**
 * Apply emergency protection (maximum level)
 */
async function applyEmergencyProtection(
  victimId: string,
  threateningUserId: string
): Promise<void> {
  try {
    // Apply all protection measures
    await applyVictimProtection(victimId, threateningUserId);
    
    // Add emergency mitigation for stalker
    const mitigationId = generateId();
    const mitigation: MitigationAction = {
      id: mitigationId,
      caseId: `emergency_${victimId}_${Date.now()}`,
      stalkerUserId: threateningUserId,
      victimUserId: victimId,
      actionType: 'GLOBAL_TIMEOUT',
      appliedAt: admin.firestore.Timestamp.now(),
      duration: 7 * 24 * 60, // 7 days
      expiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ),
      reason: 'Emergency protection requested by victim',
      autoApplied: true,
    };
    
    await db.collection('stalking_mitigations').doc(mitigationId).set(mitigation);
    
    console.log(`[CyberstalkingReporting] Applied emergency protection for ${victimId}`);
  } catch (error) {
    console.error('[CyberstalkingReporting] Error applying emergency protection:', error);
  }
}

/**
 * Block all location sharing between victim and stalker
 */
async function blockAllLocationSharing(
  victimId: string,
  stalkerId: string
): Promise<void> {
  try {
    // Cancel any active geoshare sessions
    const sessionsSnapshot = await db.collection('geoshare_sessions')
      .where('status', '==', 'ACTIVE')
      .get();
    
    for (const doc of sessionsSnapshot.docs) {
      const session = doc.data();
      const involvesBoth = 
        (session.userA === victimId && session.userB === stalkerId) ||
        (session.userB === victimId && session.userA === stalkerId);
      
      if (involvesBoth) {
        await doc.ref.update({
          status: 'CANCELLED',
          cancelledAt: admin.firestore.Timestamp.now(),
          cancelledBy: 'SYSTEM_SAFETY',
          cancelReason: 'Safety protection applied',
        });
      }
    }
    
    // Prevent future location sharing
    await db.collection('location_share_blocks').add({
      userA: victimId,
      userB: stalkerId,
      reason: 'STALKING_PROTECTION',
      createdAt: admin.firestore.Timestamp.now(),
      permanent: true,
    });
    
    console.log(`[CyberstalkingReporting] Blocked location sharing between ${victimId} and ${stalkerId}`);
  } catch (error) {
    console.error('[CyberstalkingReporting] Error blocking location sharing:', error);
  }
}

// ============================================================================
// HELP REQUEST MANAGEMENT
// ============================================================================

/**
 * Create victim help request
 */
async function createVictimHelpRequest(
  victimId: string,
  stalkerId: string,
  requestType: HelpRequestType,
  description?: string,
  evidence?: any,
  priority: 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
): Promise<VictimHelpRequest> {
  const requestId = generateId();
  const now = admin.firestore.Timestamp.now();
  
  const helpRequest: VictimHelpRequest = {
    id: requestId,
    victimUserId: victimId,
    stalkerUserId: stalkerId,
    requestType,
    priority,
    requestedAt: now,
    responded: false,
  };
  
  await db.collection('victim_help_requests').doc(requestId).set({
    ...helpRequest,
    description,
    evidence,
  });
  
  console.log(`[CyberstalkingReporting] Created help request ${requestId} for victim ${victimId}`);
  
  return helpRequest;
}

/**
 * Update stalking case from victim report
 */
async function updateStalkingCaseFromReport(
  victimId: string,
  stalkerId: string,
  reportType: string,
  description?: string
): Promise<void> {
  try {
    // Find or create stalking case
    const casesSnapshot = await db.collection('stalking_cases')
      .where('stalkerUserId', '==', stalkerId)
      .where('victimUserId', '==', victimId)
      .where('status', 'in', ['ACTIVE', 'ESCALATED'])
      .limit(1)
      .get();
    
    const now = admin.firestore.Timestamp.now();
    
    if (casesSnapshot.empty) {
      // Create new case
      const caseId = generateId();
      const newCase: Partial<StalkingCase> = {
        id: caseId,
        victimUserId: victimId,
        stalkerUserId: stalkerId,
        status: 'ESCALATED',
        severity: 'HIGH',
        behaviors: [],
        obsessionPatterns: [],
        locationViolations: [],
        mediaRequests: [],
        firstDetectedAt: now,
        lastActivityAt: now,
        warningsSent: 0,
        chatsFrozen: 0,
        timeoutsApplied: 0,
        reportFiled: true,
        reportedAt: now,
        reviewedByModerator: false,
      };
      
      await db.collection('stalking_cases').doc(caseId).set(newCase);
    } else {
      // Update existing case
      const caseDoc = casesSnapshot.docs[0];
      await caseDoc.ref.update({
        reportFiled: true,
        reportedAt: now,
        lastActivityAt: now,
        status: 'ESCALATED', // Escalate when victim files report
      });
    }
  } catch (error) {
    console.error('[CyberstalkingReporting] Error updating case from report:', error);
  }
}

/**
 * Escalate to moderators for immediate review
 */
async function escalateToModerators(
  victimId: string,
  stalkerId: string,
  urgencyReason?: string
): Promise<void> {
  try {
    // Create moderation case (integrates with PACK 88)
    await db.collection('moderation_cases').add({
      caseType: 'STALKING_EMERGENCY',
      victimUserId: victimId,
      reportedUserId: stalkerId,
      priority: 'URGENT',
      status: 'OPEN',
      createdAt: admin.firestore.Timestamp.now(),
      description: urgencyReason || 'Victim requested immediate protection',
      requiresReview: true,
      autoEscalated: true,
    });
    
    console.log(`[CyberstalkingReporting] Escalated case to moderators: ${stalkerId} vs ${victimId}`);
  } catch (error) {
    console.error('[CyberstalkingReporting] Error escalating to moderators:', error);
  }
}

// ============================================================================
// LEGAL RESOURCES
// ============================================================================

/**
 * Get legal resources for victim based on their country
 */
async function getLegalResourcesForVictim(victimId: string): Promise<LegalResources | null> {
  try {
    // Get user's country from profile
    const userDoc = await db.collection('users').doc(victimId).get();
    const userData = userDoc.data();
    const countryCode = userData?.region?.code || userData?.country || 'US';
    
    // Get legal resources for country
    const resourcesDoc = await db.collection('legal_resources').doc(countryCode).get();
    
    if (resourcesDoc.exists) {
      return resourcesDoc.data() as LegalResources;
    }
    
    // Return default global resources if country-specific not available
    return getDefaultLegalResources();
  } catch (error) {
    console.error('[CyberstalkingReporting] Error getting legal resources:', error);
    return getDefaultLegalResources();
  }
}

/**
 * Default global legal resources
 */
function getDefaultLegalResources(): LegalResources {
  return {
    countryCode: 'GLOBAL',
    resources: {
      hotlines: [
        'National Domestic Violence Hotline (US): 1-800-799-7233',
        'International: Contact local authorities',
      ],
      websites: [
        'https://www.stalkingawareness.org/',
        'https://victimsofcrime.org/stalking-resource-center/',
      ],
      supportOrganizations: [
        'Contact your local victim support services',
        'Consult with a lawyer about restraining orders',
      ],
    },
    lastUpdated: admin.firestore.Timestamp.now(),
  };
}

/**
 * Seed legal resources for common countries
 */
export async function seedLegalResources(): Promise<void> {
  const resources: Record<string, LegalResources> = {
    US: {
      countryCode: 'US',
      resources: {
        hotlines: [
          'National Domestic Violence Hotline: 1-800-799-7233',
          'Cyberstalking Hotline: 1-800-656-4673',
        ],
        websites: [
          'https://www.justice.gov/ovw/stalking',
          'https://www.stalkingawareness.org/',
        ],
        localAuthorities: [
          'Local Police Department',
          'FBI Cyber Crime Division',
        ],
        supportOrganizations: [
          'National Center for Victims of Crime',
          'Stalking Resource Center',
        ],
      },
      lastUpdated: admin.firestore.Timestamp.now(),
    },
    GB: {
      countryCode: 'GB',
      resources: {
        hotlines: [
          'National Stalking Helpline: 0808 802 0300',
        ],
        websites: [
          'https://www.suzylamplugh.org/',
          'https://www.stalkinghelpline.org/',
        ],
        localAuthorities: [
          'Local Police',
          'Action Fraud: 0300 123 2040',
        ],
        supportOrganizations: [
          'Suzy Lamplugh Trust',
          'Paladin National Stalking Advocacy Service',
        ],
      },
      lastUpdated: admin.firestore.Timestamp.now(),
    },
    PL: {
      countryCode: 'PL',
      resources: {
        hotlines: [
          'Niebieska Linia: 800 120 002',
        ],
        websites: [
          'https://www.niebieskalinia.pl/',
        ],
        localAuthorities: [
          'Policja (997)',
          'Prokuratura',
        ],
        supportOrganizations: [
          'Centrum Praw Kobiet',
          'Fundacja Feminoteka',
        ],
      },
      lastUpdated: admin.firestore.Timestamp.now(),
    },
  };
  
  for (const [code, resource] of Object.entries(resources)) {
    await db.collection('legal_resources').doc(code).set(resource);
  }
  
  console.log('[CyberstalkingReporting] Seeded legal resources for US, GB, PL');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log victim support action
 */
async function logVictimSupport(
  victimId: string,
  action: string
): Promise<void> {
  try {
    await db.collection('victim_support_logs').add({
      victimUserId: victimId,
      action,
      timestamp: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error('[CyberstalkingReporting] Error logging support:', error);
  }
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return db.collection('_').doc().id;
}

/**
 * Resolve stalking case (admin function)
 */
export const resolveStalkingCase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { caseId, resolution, moderatorNotes } = data;
  
  if (!caseId) {
    throw new functions.https.HttpsError('invalid-argument', 'caseId is required');
  }
  
  try {
    const caseRef = db.collection('stalking_cases').doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Case not found');
    }
    
    await caseRef.update({
      status: 'RESOLVED',
      resolvedAt: admin.firestore.Timestamp.now(),
      reviewedByModerator: true,
      reviewedAt: admin.firestore.Timestamp.now(),
      reviewedBy: context.auth.uid,
      moderatorNotes,
      resolution,
    });
    
    console.log(`[CyberstalkingReporting] Resolved case ${caseId}`);
    
    return {
      success: true,
      message: 'Case resolved successfully',
    };
  } catch (error: any) {
    console.error('[CyberstalkingReporting] Error resolving case:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});