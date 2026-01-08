/**
 * PACK 360 - Regional UX & Behavior Rules
 * Country-specific UX behavior, limits, and visibility rules
 * 
 * Dependencies: PACK 280 (Membership), PACK 302 (Fraud), PACK 281 (Risk)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Types
export interface RegionalUXRules {
  country: string;
  countryName: string;
  swipeLimits: {
    free: number;
    premium: number;
    vip: number;
  };
  discoveryRadiusKm: {
    min: number;
    max: number;
    default: number;
  };
  defaultPrivacyLevel: 'low' | 'medium' | 'high';
  visibilityRules: string[];
  features: {
    publicProfile: boolean;
    discoveryMode: boolean;
    liveStreaming: boolean;
    eventCreation: boolean;
    gifting: boolean;
    voiceCall: boolean;
    videoCall: boolean;
  };
  restrictions: {
    minAge: number;
    requiresVerification: boolean;
    contentFiltering: 'strict' | 'moderate' | 'relaxed';
    profileAudit: boolean;
  };
  compliance: {
    gdpr: boolean;
    coppa: boolean;
    localLaw: string[];
  };
}

export interface UserUXConfig {
  userId: string;
  country: string;
  rules: RegionalUXRules;
  overrides?: Partial<RegionalUXRules>;
  lastUpdated: number;
}

// Default global rules
const DEFAULT_RULES: Omit<RegionalUXRules, 'country' | 'countryName'> = {
  swipeLimits: {
    free: 50,
    premium: 200,
    vip: 999999
  },
  discoveryRadiusKm: {
    min: 1,
    max: 100,
    default: 25
  },
  defaultPrivacyLevel: 'medium',
  visibilityRules: ['age_appropriate', 'verified_only'],
  features: {
    publicProfile: true,
    discoveryMode: true,
    liveStreaming: true,
    eventCreation: true,
    gifting: true,
    voiceCall: true,
    videoCall: true
  },
  restrictions: {
    minAge: 18,
    requiresVerification: false,
    contentFiltering: 'moderate',
    profileAudit: false
  },
  compliance: {
    gdpr: false,
    coppa: false,
    localLaw: []
  }
};

// Country-specific rule overrides
const COUNTRY_RULES_OVERRIDES: Record<string, Partial<RegionalUXRules>> = {
  // European Union - GDPR countries
  DE: {
    countryName: 'Germany',
    defaultPrivacyLevel: 'high',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['NetzDG', 'TTDSG']
    },
    swipeLimits: {
      free: 40,
      premium: 150,
      vip: 999999
    }
  },
  FR: {
    countryName: 'France',
    defaultPrivacyLevel: 'high',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['Digital Services Act']
    }
  },
  PL: {
    countryName: 'Poland',
    defaultPrivacyLevel: 'high',
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['RODO']
    }
  },
  IT: {
    countryName: 'Italy',
    defaultPrivacyLevel: 'high',
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['Digital Services Act']
    }
  },
  ES: {
    countryName: 'Spain',
    defaultPrivacyLevel: 'high',
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['LOPDGDD']
    }
  },
  
  // United States - COPPA and state laws
  US: {
    countryName: 'United States',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'moderate',
      profileAudit: false
    },
    compliance: {
      gdpr: false,
      coppa: true,
      localLaw: ['CCPA', 'CPRA']
    },
    discoveryRadiusKm: {
      min: 1,
      max: 160, // 100 miles
      default: 40
    }
  },
  
  // United Kingdom
  GB: {
    countryName: 'United Kingdom',
    defaultPrivacyLevel: 'high',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: true,
      coppa: false,
      localLaw: ['UK GDPR', 'Online Safety Bill']
    }
  },
  
  // Conservative regions with stricter rules
  SA: {
    countryName: 'Saudi Arabia',
    defaultPrivacyLevel: 'high',
    features: {
      publicProfile: false,
      discoveryMode: true,
      liveStreaming: false,
      eventCreation: false,
      gifting: true,
      voiceCall: false,
      videoCall: false
    },
    restrictions: {
      minAge: 21,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    swipeLimits: {
      free: 20,
      premium: 50,
      vip: 999999
    }
  },
  AE: {
    countryName: 'United Arab Emirates',
    defaultPrivacyLevel: 'high',
    features: {
      publicProfile: false,
      discoveryMode: true,
      liveStreaming: false,
      eventCreation: true,
      gifting: true,
      voiceCall: true,
      videoCall: false
    },
    restrictions: {
      minAge: 21,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    }
  },
  
  // Asia-Pacific
  JP: {
    countryName: 'Japan',
    restrictions: {
      minAge: 20,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['APPI']
    }
  },
  KR: {
    countryName: 'South Korea',
    restrictions: {
      minAge: 19,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['PIPA']
    }
  },
  CN: {
    countryName: 'China',
    defaultPrivacyLevel: 'high',
    features: {
      publicProfile: false,
      discoveryMode: true,
      liveStreaming: false,
      eventCreation: false,
      gifting: true,
      voiceCall: true,
      videoCall: true
    },
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['PIPL', 'Cybersecurity Law']
    }
  },
  SG: {
    countryName: 'Singapore',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['PDPA']
    }
  },
  
  // Australia
  AU: {
    countryName: 'Australia',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['Privacy Act']
    },
    discoveryRadiusKm: {
      min: 5,
      max: 200,
      default: 50
    }
  },
  
  // Canada
  CA: {
    countryName: 'Canada',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'moderate',
      profileAudit: false
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['PIPEDA']
    }
  },
  
  // Brazil
  BR: {
    countryName: 'Brazil',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'moderate',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['LGPD']
    }
  },
  
  // India
  IN: {
    countryName: 'India',
    restrictions: {
      minAge: 18,
      requiresVerification: true,
      contentFiltering: 'strict',
      profileAudit: true
    },
    compliance: {
      gdpr: false,
      coppa: false,
      localLaw: ['IT Act', 'Intermediary Guidelines']
    },
    swipeLimits: {
      free: 30,
      premium: 100,
      vip: 999999
    }
  }
};

// Get regional UX rules for a country
export const getRegionalUXRules = functions.https.onCall(async (data, context) => {
  try {
    const { country } = data;
    const db = admin.firestore();
    
    let rules: RegionalUXRules = {
      country: country || 'GLOBAL',
      countryName: country || 'Global',
      ...DEFAULT_RULES
    };
    
    // Apply country-specific overrides
    if (country && COUNTRY_RULES_OVERRIDES[country.toUpperCase()]) {
      rules = {
        ...rules,
        ...COUNTRY_RULES_OVERRIDES[country.toUpperCase()]
      };
    }
    
    // Check for admin overrides
    const overrideDoc = await db.collection('regional-ux-overrides').doc(country || 'GLOBAL').get();
    if (overrideDoc.exists) {
      rules = {
        ...rules,
        ...overrideDoc.data()
      };
    }
    
    return { success: true, rules };
  } catch (error: any) {
    console.error('Error getting regional UX rules:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get user UX configuration
export const getUserUXConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const country = userData?.country || data.country || 'GLOBAL';
    
    // Get base rules
    let rules: RegionalUXRules = {
      country,
      countryName: country,
      ...DEFAULT_RULES
    };
    
    if (COUNTRY_RULES_OVERRIDES[country.toUpperCase()]) {
      rules = {
        ...rules,
        ...COUNTRY_RULES_OVERRIDES[country.toUpperCase()]
      };
    }
    
    // Check for user-specific overrides (e.g., VIP bypass)
    const userConfigDoc = await db.collection('user-ux-config').doc(userId).get();
    let overrides = {};
    
    if (userConfigDoc.exists) {
      overrides = userConfigDoc.data()?.overrides || {};
    }
    
    const config: UserUXConfig = {
      userId,
      country,
      rules,
      overrides,
      lastUpdated: Date.now()
    };
    
    return { success: true, config };
  } catch (error: any) {
    console.error('Error getting user UX config:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Apply regional limits to user action
export const checkRegionalLimit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { action, value } = data; // action: 'swipe', 'discovery_radius', etc.
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const country = userData?.country || 'GLOBAL';
    const membershipTier = userData?.membershipTier || 'free';
    
    // Get rules
    let rules: RegionalUXRules = {
      country,
      countryName: country,
      ...DEFAULT_RULES
    };
    
    if (COUNTRY_RULES_OVERRIDES[country.toUpperCase()]) {
      rules = {
        ...rules,
        ...COUNTRY_RULES_OVERRIDES[country.toUpperCase()]
      };
    }
    
    let allowed = true;
    let limit = 0;
    let message = '';
    
    switch (action) {
      case 'swipe':
        limit = rules.swipeLimits[membershipTier as keyof typeof rules.swipeLimits] || 50;
        allowed = value < limit;
        message = allowed ? 'Within limit' : `Daily swipe limit reached (${limit})`;
        break;
        
      case 'discovery_radius':
        const maxRadius = rules.discoveryRadiusKm.max;
        allowed = value <= maxRadius;
        limit = maxRadius;
        message = allowed ? 'Within limit' : `Maximum radius is ${maxRadius}km`;
        break;
        
      case 'live_streaming':
        allowed = rules.features.liveStreaming;
        message = allowed ? 'Feature enabled' : 'Live streaming not available in your region';
        break;
        
      case 'video_call':
        allowed = rules.features.videoCall;
        message = allowed ? 'Feature enabled' : 'Video calls not available in your region';
        break;
        
      case 'public_profile':
        allowed = rules.features.publicProfile;
        message = allowed ? 'Feature enabled' : 'Public profiles not available in your region';
        break;
        
      default:
        allowed = true;
        message = 'Unknown action';
    }
    
    return {
      success: true,
      allowed,
      limit,
      message,
      action
    };
  } catch (error: any) {
    console.error('Error checking regional limit:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Set regional UX override
export const adminSetRegionalUXOverride = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { country, overrides, reason } = data;
    
    await db.collection('regional-ux-overrides').doc(country).set({
      country,
      ...overrides,
      reason: reason || 'Admin override',
      updatedBy: context.auth.uid,
      lastUpdated: Date.now()
    }, { merge: true });
    
    return { success: true, country };
  } catch (error: any) {
    console.error('Error setting regional UX override:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Set user-specific UX override (e.g., VIP bypass)
export const adminSetUserUXOverride = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { userId, overrides, reason } = data;
    
    await db.collection('user-ux-config').doc(userId).set({
      userId,
      overrides,
      reason: reason || 'Admin override',
      updatedBy: context.auth.uid,
      lastUpdated: Date.now()
    }, { merge: true });
    
    return { success: true, userId };
  } catch (error: any) {
    console.error('Error setting user UX override:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get all country rules (for admin dashboard)
export const adminGetAllCountryRules = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const rules: Record<string, RegionalUXRules> = {};
    
    // Get default rules
    rules['GLOBAL'] = {
      country: 'GLOBAL',
      countryName: 'Global Default',
      ...DEFAULT_RULES
    };
    
    // Get all country-specific rules
    for (const [country, overrides] of Object.entries(COUNTRY_RULES_OVERRIDES)) {
      rules[country] = {
        country,
        countryName: country,
        ...DEFAULT_RULES,
        ...overrides
      };
    }
    
    // Get admin overrides
    const overridesSnapshot = await db.collection('regional-ux-overrides').get();
    overridesSnapshot.forEach((doc: any) => {
      const country = doc.id;
      if (rules[country]) {
        rules[country] = {
          ...rules[country],
          ...doc.data()
        };
      }
    });
    
    return { success: true, rules };
  } catch (error: any) {
    console.error('Error getting all country rules:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Trigger: Update user UX config on country change
export const onUserCountryChangeUX = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if country changed
    if (before.country === after.country) {
      return;
    }
    
    const userId = context.params.userId;
    const newCountry = after.country;
    const db = admin.firestore();
    
    // Get new country rules
    let rules: RegionalUXRules = {
      country: newCountry,
      countryName: newCountry,
      ...DEFAULT_RULES
    };
    
    if (COUNTRY_RULES_OVERRIDES[newCountry?.toUpperCase()]) {
      rules = {
        ...rules,
        ...COUNTRY_RULES_OVERRIDES[newCountry.toUpperCase()]
      };
    }
    
    // Update user UX config
    await db.collection('user-ux-config').doc(userId).set({
      userId,
      country: newCountry,
      rules,
      lastUpdated: Date.now()
    }, { merge: true });
    
    console.log(`Updated UX config for user ${userId} to country ${newCountry}`);
  });
