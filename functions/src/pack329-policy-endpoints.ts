/**
 * PACK 329 — Regional Regulation Toggles & Content Policy Matrix
 * Cloud Functions Endpoints
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

type Region = 'EU' | 'US' | 'ROW';
type Platform = 'MOBILE' | 'WEB';
type Surface = 'PROFILE' | 'GALLERY' | 'FEED' | 'CHAT' | 'CALL' | 'AI' | 'EVENT';
type ViolationType =
  | 'EXPLICIT_NUDITY'
  | 'GENITALS_VISIBLE'
  | 'SEX_ACTS'
  | 'MINOR_CONTENT'
  | 'VIOLENCE'
  | 'HATE_SPEECH'
  | 'POLITICAL_CONTENT'
  | 'RELIGIOUS_FLAME'
  | 'ILLEGAL_CONTENT'
  | 'BESTIALITY'
  | 'SELF_HARM'
  | 'HARASSMENT';

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get user's region from profile
 */
async function getUserRegion(userId: string): Promise<Region> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return 'ROW';
    }

    const userData = userDoc.data();
    const countryCode = userData?.countryCode || userData?.country;
    
    return getRegionFromCountryCode(countryCode);
  } catch (error) {
    console.error('Error getting user region:', error);
    return 'ROW';
  }
}

/**
 * Determine region from country code
 */
function getRegionFromCountryCode(countryCode: string | null | undefined): Region {
  if (!countryCode) {
    return 'ROW';
  }

  const EU_COUNTRIES = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ]);

  const upperCode = countryCode.toUpperCase();

  if (EU_COUNTRIES.has(upperCode)) {
    return 'EU';
  }

  if (upperCode === 'US') {
    return 'US';
  }

  return 'ROW';
}

/**
 * Check if user is admin
 */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    return userDoc.exists && userDoc.data()?.role === 'ADMIN';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONTENT VALIDATION ENDPOINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate content before upload/publish
 */
export const pack329_validateContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { surface, platform, contentType, isPrivate } = data;
  const userId = context.auth.uid;

  if (!surface || !platform || !contentType) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'surface, platform, and contentType are required'
    );
  }

  try {
    const region = await getUserRegion(userId);

    // Load policy configuration
    const policyDoc = await db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX').get();
    
    if (!policyDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content policy not configured');
    }

    const policy = policyDoc.data();
    const regionalPolicy = policy?.regions?.[region];
    const platformFlags = policy?.platformFlags?.[platform.toLowerCase()];

    if (!regionalPolicy || !platformFlags) {
      throw new functions.https.HttpsError('internal', 'Policy configuration error');
    }

    // Validation logic based on surface
    let allowed = true;
    let reason = '';

    switch (surface) {
      case 'PROFILE':
      case 'GALLERY':
        // Check profile nudity level
        const nudityLevel = platform === 'MOBILE' 
          ? regionalPolicy.mobileProfileNudity 
          : regionalPolicy.webProfileNudity;
        allowed = nudityLevel === 'SOFT_EROTIC_ONLY' || 
                  nudityLevel === 'ARTISTIC_NUDITY' ||
                  nudityLevel === 'FULL_NUDITY';
        if (!allowed) {
          reason = 'Profile nudity not allowed in this region';
        }
        break;

      case 'FEED':
        // Feed is more restrictive
        allowed = !platformFlags.allowNudityInFeed;
        if (!allowed) {
          reason = 'Explicit nudity not allowed in feed';
        }
        break;

      case 'CHAT':
        // Private chat allows erotic content
        if (isPrivate) {
          allowed = platformFlags.allowNudityInPrivateChat && regionalPolicy.chatAllowedErotic;
        } else {
          allowed = false;
          reason = 'Explicit content only allowed in private chats';
        }
        break;

      case 'AI':
        // AI companions follow chat rules
        allowed = platformFlags.allowEroticRoleplayInChat && regionalPolicy.chatAllowedErotic;
        if (!allowed) {
          reason = 'Erotic content not allowed for AI in this region';
        }
        break;

      case 'EVENT':
        // Events are public, no explicit content
        allowed = false;
        reason = 'Events must be safe and appropriate';
        break;

      default:
        allowed = false;
        reason = 'Unknown surface type';
    }

    return {
      success: true,
      allowed,
      reason: allowed ? undefined : reason,
      region,
      policy: {
        surface,
        platform,
        region,
      },
    };
  } catch (error: any) {
    console.error('Error validating content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET POLICY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get effective content policy for user
 */
export const pack329_getPolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const region = await getUserRegion(userId);

    // Load policy configuration
    const policyDoc = await db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX').get();
    
    if (!policyDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content policy not configured');
    }

    const policy = policyDoc.data();

    return {
      success: true,
      region,
      policy: {
        defaultRegion: policy?.defaultRegion,
        userRegion: region,
        regionalPolicy: policy?.regions?.[region],
        common: policy?.common,
        platformFlags: policy?.platformFlags,
      },
    };
  } catch (error: any) {
    console.error('Error getting policy:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// REPORT POLICY VIOLATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Report a policy violation
 */
export const pack329_reportViolation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    targetUserId,
    violationType,
    surface,
    contentId,
    contentType,
    description,
  } = data;

  const reporterId = context.auth.uid;

  if (!targetUserId || !violationType || !surface) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'targetUserId, violationType, and surface are required'
    );
  }

  try {
    const region = await getUserRegion(targetUserId);
    const platform = data.platform || 'MOBILE';

    // Create violation record
    const violationRef = await db.collection('policyViolations').add({
      userId: targetUserId,
      reportedBy: reporterId,
      violationType,
      surface,
      region,
      platform,
      contentId: contentId || null,
      contentType: contentType || null,
      description: description || '',
      severity: getViolationSeverity(violationType),
      status: 'PENDING',
      autoDetected: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
    });

    // Create regional content report
    await db.collection('regionalContentReports').add({
      reportedBy: reporterId,
      targetUserId,
      contentType: surface,
      violationType,
      contentId: contentId || null,
      description: description || '',
      status: 'PENDING',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Policy violation reported: ${violationRef.id}`);

    return {
      success: true,
      violationId: violationRef.id,
      message: 'Violation reported successfully',
    };
  } catch (error: any) {
    console.error('Error reporting violation:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET VIOLATION HISTORY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get user's violation history (own violations only, or admin)
 */
export const pack329_getViolations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;
  const requesterId = context.auth.uid;

  // Check if user can view violations
  const isAdminUser = await isAdmin(requesterId);
  
  if (userId !== requesterId && !isAdminUser) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Cannot view other users violations'
    );
  }

  try {
    const violationsSnapshot = await db
      .collection('policyViolations')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const violations = violationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString(),
    }));

    return {
      success: true,
      violations,
    };
  } catch (error: any) {
    console.error('Error getting violations:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN: UPDATE POLICY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Update content policy (admin only)
 */
export const pack329_admin_updatePolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isAdminUser = await isAdmin(context.auth.uid);
  
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { region, policyUpdates } = data;

  if (!region || !policyUpdates) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'region and policyUpdates are required'
    );
  }

  try {
    const policyRef = db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX');
    
    await policyRef.update({
      [`regions.${region}`]: policyUpdates,
      'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      'metadata.updatedBy': context.auth.uid,
    });

    console.log(`Policy updated for region ${region} by ${context.auth.uid}`);

    return {
      success: true,
      message: `Policy updated for ${region}`,
    };
  } catch (error: any) {
    console.error('Error updating policy:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN: SEED POLICY (ONE-TIME SETUP)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Seed initial policy configuration (admin only, run once)
 */
export const pack329_admin_seedPolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isAdminUser = await isAdmin(context.auth.uid);
  
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const { seedContentPolicy, GLOBAL_POLICY_MATRIX } = await import('./pack329-seed-policy');
    
    await seedContentPolicy(db);

    console.log('Policy seeded successfully');

    return {
      success: true,
      message: 'Policy configuration seeded successfully',
      policy: GLOBAL_POLICY_MATRIX,
    };
  } catch (error: any) {
    console.error('Error seeding policy:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// HELPER: GET VIOLATION SEVERITY
// ═══════════════════════════════════════════════════════════════════════

function getViolationSeverity(violationType: ViolationType): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  switch (violationType) {
    case 'MINOR_CONTENT':
    case 'ILLEGAL_CONTENT':
    case 'BESTIALITY':
      return 'CRITICAL';

    case 'SEX_ACTS':
    case 'GENITALS_VISIBLE':
    case 'VIOLENCE':
    case 'HATE_SPEECH':
      return 'HIGH';

    case 'EXPLICIT_NUDITY':
    case 'HARASSMENT':
    case 'SELF_HARM':
      return 'MEDIUM';

    case 'POLITICAL_CONTENT':
    case 'RELIGIOUS_FLAME':
      return 'LOW';

    default:
      return 'LOW';
  }
}