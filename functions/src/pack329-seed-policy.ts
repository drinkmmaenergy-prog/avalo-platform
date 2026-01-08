/**
 * PACK 329 — Seed Content Policy Matrix
 * 
 * Initialize the global content policy matrix in Firestore.
 * Run this once during deployment or when policy needs to be updated.
 */

import * as admin from 'firebase-admin';

export const GLOBAL_POLICY_MATRIX = {
  id: 'GLOBAL_POLICY_MATRIX',
  defaultRegion: 'EU',
  
  regions: {
    EU: {
      // App Store / Google Play compliant
      mobileProfileNudity: 'SOFT_EROTIC_ONLY', // bikini, lingerie, buttocks covered/partially visible; no genitals, no explicit sex acts
      webProfileNudity: 'SOFT_EROTIC_ONLY',    // for now same as mobile
      chatAllowedErotic: true,                 // sexting between consenting adults allowed
      explicitPornMediaAllowed: false,         // no hardcore porn videos/images anywhere
    },
    US: {
      mobileProfileNudity: 'SOFT_EROTIC_ONLY',
      webProfileNudity: 'SOFT_EROTIC_ONLY',
      chatAllowedErotic: true,
      explicitPornMediaAllowed: false,
    },
    ROW: {
      mobileProfileNudity: 'SOFT_EROTIC_ONLY',
      webProfileNudity: 'SOFT_EROTIC_ONLY',
      chatAllowedErotic: true,
      explicitPornMediaAllowed: false, // can be relaxed in future, but now stay safe
    }
  },

  common: {
    minAge: 18,
    politicalContentAllowed: false,          // NO politics on platform
    religiousDebatesAllowed: false,          // NO religious flame wars
    hateSpeechAllowed: false,                // NO hate speech
    selfHarmContentAllowed: false,           // NO self-harm content
    childSexualContentAllowed: false,        // NEVER allow child sexual content
    bestialityAllowed: false,                // NO bestiality
    violenceGlorificationAllowed: false,     // NO violence glorification
  },

  platformFlags: {
    mobile: {
      allowExplicitPorn: false,              // Keep App Store / Google Play compliant
      allowEroticRoleplayInChat: true,       // Adult erotic chat allowed between consenting adults
      allowNudityInFeed: false,              // Feed is "public square" - no explicit nudity
      allowNudityInPrivateChat: true,        // Within adult bounds, no minors, no extreme violence
    },
    web: {
      allowExplicitPorn: false,              // Per current decision to avoid store/risk
      allowEroticRoleplayInChat: true,       // Adult erotic chat allowed
      allowNudityInFeed: false,              // Feed stays clean
      allowNudityInPrivateChat: true,        // Private chats allow adult content
    }
  },

  metadata: {
    version: '1.0.0',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    description: 'Global content policy matrix for Avalo - App Store and Google Play compliant',
    notes: [
      '18+ only platform',
      'Dating + flirting + romance + adult sexuality allowed',
      'NO minors, child sexual content, violence, hate speech',
      'NO political or religious flame wars',
      'Soft erotic content (bikini, lingerie) allowed in profiles',
      'Erotic chat between consenting adults allowed',
      'Feed and events are public - no explicit nudity',
      'Can be relaxed for web-only surfaces in future without affecting mobile stores'
    ]
  }
};

/**
 * Seed the content policy matrix into Firestore
 */
export async function seedContentPolicy(db: admin.firestore.Firestore): Promise<void> {
  try {
    console.log('Seeding content policy matrix...');
    
    const policyRef = db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX');
    
    await policyRef.set(GLOBAL_POLICY_MATRIX, { merge: true });
    
    console.log('✅ Content policy matrix seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding content policy:', error);
    throw error;
  }
}

/**
 * Update a specific region's policy
 */
export async function updateRegionalPolicy(
  db: admin.firestore.Firestore,
  region: 'EU' | 'US' | 'ROW',
  policy: Partial<typeof GLOBAL_POLICY_MATRIX.regions.EU>
): Promise<void> {
  try {
    console.log(`Updating ${region} policy...`);
    
    const policyRef = db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX');
    
    await policyRef.update({
      [`regions.${region}`]: {
        ...GLOBAL_POLICY_MATRIX.regions[region],
        ...policy
      },
      'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ ${region} policy updated successfully`);
  } catch (error) {
    console.error(`❌ Error updating ${region} policy:`, error);
    throw error;
  }
}

/**
 * Update platform flags
 */
export async function updatePlatformFlags(
  db: admin.firestore.Firestore,
  platform: 'mobile' | 'web',
  flags: Partial<typeof GLOBAL_POLICY_MATRIX.platformFlags.mobile>
): Promise<void> {
  try {
    console.log(`Updating ${platform} platform flags...`);
    
    const policyRef = db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX');
    
    await policyRef.update({
      [`platformFlags.${platform}`]: {
        ...GLOBAL_POLICY_MATRIX.platformFlags[platform],
        ...flags
      },
      'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ ${platform} platform flags updated successfully`);
  } catch (error) {
    console.error(`❌ Error updating ${platform} platform flags:`, error);
    throw error;
  }
}

/**
 * Get current policy from Firestore
 */
export async function getCurrentPolicy(db: admin.firestore.Firestore): Promise<any> {
  try {
    const policyDoc = await db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX').get();
    
    if (!policyDoc.exists) {
      return null;
    }
    
    return policyDoc.data();
  } catch (error) {
    console.error('Error getting current policy:', error);
    throw error;
  }
}

// Export for use in Cloud Functions or admin scripts
export const pack329SeedPolicy = {
  seedContentPolicy,
  updateRegionalPolicy,
  updatePlatformFlags,
  getCurrentPolicy,
  GLOBAL_POLICY_MATRIX
};