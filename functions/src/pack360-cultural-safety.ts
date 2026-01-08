/**
 * PACK 360 - Cultural Content Safety Layer
 * Auto enforcement per country with content filtering and compliance
 * 
 * Dependencies: PACK 302 (Fraud), PACK 281 (Risk), PACK 359 (DSA)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Types
export interface CulturalSafetyProfile {
  country: string;
  countryName: string;
  tier: 'allowed' | 'restricted' | 'blocked';
  contentRules: {
    explicitNudity: 'allowed' | 'restricted' | 'blocked';
    suggestiveContent: 'allowed' | 'restricted' | 'blocked';
    adultThemes: 'allowed' | 'restricted' | 'blocked';
    romanticContent: 'allowed' | 'restricted' | 'blocked';
    politicalContent: 'allowed' | 'restricted' | 'blocked';
    religiousContent: 'allowed' | 'restricted' | 'blocked';
    lgbtqContent: 'allowed' | 'restricted' | 'blocked';
  };
  prohibitedKeywords: string[];
  mediaFilter: {
    requiresModeration: boolean;
    autoBlock: string[]; // List of content types to auto-block
    manualReview: string[]; // List of content types requiring manual review
  };
  ageVerification: {
    required: boolean;
    method: 'document' | 'credit_card' | 'biometric' | 'none';
    minimumAge: number;
  };
  reportingThreshold: {
    autoSuspend: number; // Number of reports before auto-suspension
    escalateToReview: number; // Number of reports before manual review
  };
  legalCompliance: string[];
}

export interface ContentModerationResult {
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
  autoBlocked: boolean;
  warnings: string[];
  country: string;
}

// Default cultural safety profile
const DEFAULT_SAFETY_PROFILE: Omit<CulturalSafetyProfile, 'country' | 'countryName'> = {
  tier: 'allowed',
  contentRules: {
    explicitNudity: 'restricted',
    suggestiveContent: 'allowed',
    adultThemes: 'allowed',
    romanticContent: 'allowed',
    politicalContent: 'allowed',
    religiousContent: 'allowed',
    lgbtqContent: 'allowed'
  },
  prohibitedKeywords: [
    'minor', 'child', 'underage', 'kid', 'teenager',
    'drugs', 'weapons', 'violence', 'suicide',
    'terrorism', 'extremism', 'hate', 'racist'
  ],
  mediaFilter: {
    requiresModeration: true,
    autoBlock: ['nudity_explicit', 'violence_graphic', 'hate_symbols'],
    manualReview: ['suggestive_content', 'partial_nudity']
  },
  ageVerification: {
    required: false,
    method: 'none',
    minimumAge: 18
  },
  reportingThreshold: {
    autoSuspend: 5,
    escalateToReview: 3
  },
  legalCompliance: ['basic_safety', 'adult_content_warning']
};

// Country-specific safety profiles
const COUNTRY_SAFETY_PROFILES: Record<string, Partial<CulturalSafetyProfile>> = {
  // United States - Moderate
  US: {
    countryName: 'United States',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'restricted',
      suggestiveContent: 'allowed',
      adultThemes: 'allowed',
      romanticContent: 'allowed',
      politicalContent: 'allowed',
      religiousContent: 'allowed',
      lgbtqContent: 'allowed'
    },
    ageVerification: {
      required: true,
      method: 'credit_card',
      minimumAge: 18
    },
    legalCompliance: ['COPPA', 'CCPA', 'Section_230']
  },
  
  // European Union - Moderate with GDPR
  DE: {
    countryName: 'Germany',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'restricted',
      suggestiveContent: 'allowed',
      adultThemes: 'allowed',
      romanticContent: 'allowed',
      politicalContent: 'allowed',
      religiousContent: 'allowed',
      lgbtqContent: 'allowed'
    },
    mediaFilter: {
      requiresModeration: true,
      autoBlock: ['nudity_explicit', 'violence_graphic', 'hate_symbols', 'nazi_symbols'],
      manualReview: ['suggestive_content', 'partial_nudity', 'political_content']
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['GDPR', 'NetzDG', 'DSA']
  },
  FR: {
    countryName: 'France',
    tier: 'allowed',
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['GDPR', 'DSA']
  },
  PL: {
    countryName: 'Poland',
    tier: 'allowed',
    legalCompliance: ['GDPR', 'RODO']
  },
  GB: {
    countryName: 'United Kingdom',
    tier: 'allowed',
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['UK_GDPR', 'Online_Safety_Bill']
  },
  
  // Middle East - Highly Restricted
  SA: {
    countryName: 'Saudi Arabia',
    tier: 'restricted',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'blocked',
      adultThemes: 'restricted',
      romanticContent: 'restricted',
      politicalContent: 'blocked',
      religiousContent: 'blocked',
      lgbtqContent: 'blocked'
    },
    prohibitedKeywords: [
      ...DEFAULT_SAFETY_PROFILE.prohibitedKeywords,
      'alcohol', 'dating', 'kiss', 'intimate', 'sexy',
      'gay', 'lesbian', 'lgbt', 'pride', 'transgender'
    ],
    mediaFilter: {
      requiresModeration: true,
      autoBlock: [
        'nudity_explicit', 'nudity_partial', 'suggestive_content',
        'intimate_poses', 'revealing_clothing', 'lgbtq_symbols',
        'alcohol', 'political_symbols'
      ],
      manualReview: ['romantic_content', 'casual_attire']
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 21
    },
    reportingThreshold: {
      autoSuspend: 2,
      escalateToReview: 1
    },
    legalCompliance: ['Islamic_Law', 'Saudi_Cybercrime_Law']
  },
  AE: {
    countryName: 'United Arab Emirates',
    tier: 'restricted',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'blocked',
      adultThemes: 'restricted',
      romanticContent: 'allowed',
      politicalContent: 'restricted',
      religiousContent: 'restricted',
      lgbtqContent: 'blocked'
    },
    mediaFilter: {
      requiresModeration: true,
      autoBlock: [
        'nudity_explicit', 'nudity_partial', 'suggestive_content',
        'lgbtq_symbols'
      ],
      manualReview: ['romantic_content', 'political_content']
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 21
    },
    reportingThreshold: {
      autoSuspend: 2,
      escalateToReview: 1
    },
    legalCompliance: ['UAE_Cybercrime_Law']
  },
  
  // China - Highly Restricted
  CN: {
    countryName: 'China',
    tier: 'restricted',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'blocked',
      adultThemes: 'restricted',
      romanticContent: 'allowed',
      politicalContent: 'blocked',
      religiousContent: 'blocked',
      lgbtqContent: 'restricted'
    },
    mediaFilter: {
      requiresModeration: true,
      autoBlock: [
        'nudity_explicit', 'nudity_partial', 'political_symbols',
        'religious_symbols', 'protest_imagery'
      ],
      manualReview: ['suggestive_content', 'western_media', 'romantic_content']
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    reportingThreshold: {
      autoSuspend: 2,
      escalateToReview: 1
    },
    legalCompliance: ['PIPL', 'Cybersecurity_Law', 'CAC_Regulations']
  },
  
  // Asia - Moderate to Strict
  JP: {
    countryName: 'Japan',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'restricted',
      suggestiveContent: 'allowed',
      adultThemes: 'allowed',
      romanticContent: 'allowed',
      politicalContent: 'allowed',
      religiousContent: 'allowed',
      lgbtqContent: 'allowed'
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 20
    },
    legalCompliance: ['APPI', 'Act_on_Regulation_of_Dating_Services']
  },
  KR: {
    countryName: 'South Korea',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'restricted',
      adultThemes: 'allowed',
      romanticContent: 'allowed',
      politicalContent: 'allowed',
      religiousContent: 'allowed',
      lgbtqContent: 'allowed'
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 19
    },
    legalCompliance: ['PIPA', 'Information_and_Communication_Network_Act']
  },
  IN: {
    countryName: 'India',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'restricted',
      adultThemes: 'restricted',
      romanticContent: 'allowed',
      politicalContent: 'restricted',
      religiousContent: 'restricted',
      lgbtqContent: 'allowed'
    },
    mediaFilter: {
      requiresModeration: true,
      autoBlock: ['nudity_explicit', 'nudity_partial', 'religious_insult'],
      manualReview: ['suggestive_content', 'political_content', 'religious_content']
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['IT_Act', 'Intermediary_Guidelines']
  },
  SG: {
    countryName: 'Singapore',
    tier: 'allowed',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'restricted',
      adultThemes: 'allowed',
      romanticContent: 'allowed',
      politicalContent: 'restricted',
      religiousContent: 'restricted',
      lgbtqContent: 'restricted'
    },
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['PDPA', 'Broadcasting_Act']
  },
  
  // Russia - Restricted
  RU: {
    countryName: 'Russia',
    tier: 'restricted',
    contentRules: {
      explicitNudity: 'blocked',
      suggestiveContent: 'restricted',
      adultThemes: 'restricted',
      romanticContent: 'allowed',
      politicalContent: 'blocked',
      religiousContent: 'restricted',
      lgbtqContent: 'blocked'
    },
    prohibitedKeywords: [
      ...DEFAULT_SAFETY_PROFILE.prohibitedKeywords,
      'lgbt', 'gay', 'pride', 'protest', 'opposition'
    ],
    ageVerification: {
      required: true,
      method: 'document',
      minimumAge: 18
    },
    legalCompliance: ['Federal_Law_149', 'Yarovaya_Law']
  }
};

// Get cultural safety profile for country
export const getCulturalSafetyProfile = functions.https.onCall(async (data, context) => {
  try {
    const { country } = data;
    const db = admin.firestore();
    
    let profile: CulturalSafetyProfile = {
      country: country || 'GLOBAL',
      countryName: country || 'Global',
      ...DEFAULT_SAFETY_PROFILE
    };
    
    // Apply country-specific profile
    if (country && COUNTRY_SAFETY_PROFILES[country.toUpperCase()]) {
      profile = {
        ...profile,
        ...COUNTRY_SAFETY_PROFILES[country.toUpperCase()]
      };
    }
    
    // Check for admin overrides
    const overrideDoc = await db.collection('cultural-safety-overrides').doc(country || 'GLOBAL').get();
    if (overrideDoc.exists) {
      profile = {
        ...profile,
        ...overrideDoc.data()
      };
    }
    
    return { success: true, profile };
  } catch (error: any) {
    console.error('Error getting cultural safety profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Moderate content based on cultural rules
export const moderateContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { contentType, contentData, country } = data;
    const db = admin.firestore();
    
    // Get safety profile
    let profile: CulturalSafetyProfile = {
      country: country || 'GLOBAL',
      countryName: country || 'Global',
      ...DEFAULT_SAFETY_PROFILE
    };
    
    if (country && COUNTRY_SAFETY_PROFILES[country.toUpperCase()]) {
      profile = {
        ...profile,
        ...COUNTRY_SAFETY_PROFILES[country.toUpperCase()]
      };
    }
    
    const result: ContentModerationResult = {
      allowed: true,
      reason: '',
      requiresReview: false,
      autoBlocked: false,
      warnings: [],
      country
    };
    
    // Check content type against rules
    if (contentType === 'profile_photo' || contentType === 'media') {
      // Check media filter rules
      if (contentData.aiLabels) {
        for (const label of contentData.aiLabels) {
          if (profile.mediaFilter.autoBlock.includes(label)) {
            result.allowed = false;
            result.autoBlocked = true;
            result.reason = `Content blocked: ${label} not allowed in ${country}`;
            break;
          }
          if (profile.mediaFilter.manualReview.includes(label)) {
            result.requiresReview = true;
            result.warnings.push(`Content requires manual review: ${label}`);
          }
        }
      }
    }
    
    // Check text content for prohibited keywords
    if (contentData.text) {
      const lowerText = contentData.text.toLowerCase();
      for (const keyword of profile.prohibitedKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          result.warnings.push(`Prohibited keyword detected: ${keyword}`);
          result.requiresReview = true;
        }
      }
    }
    
    // Log moderation result
    await db.collection('content-moderation-logs').add({
      userId: context.auth.uid,
      country,
      contentType,
      result,
      timestamp: Date.now()
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Error moderating content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Check if feature is allowed in country
export const checkFeatureAvailability = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { feature, country } = data;
    const db = admin.firestore();
    
    // Get user country if not provided
    let userCountry = country;
    if (!userCountry) {
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      userCountry = userDoc.data()?.country || 'GLOBAL';
    }
    
    // Get safety profile
    let profile: CulturalSafetyProfile = {
      country: userCountry,
      countryName: userCountry,
      ...DEFAULT_SAFETY_PROFILE
    };
    
    if (COUNTRY_SAFETY_PROFILES[userCountry.toUpperCase()]) {
      profile = {
        ...profile,
        ...COUNTRY_SAFETY_PROFILES[userCountry.toUpperCase()]
      };
    }
    
    // Check feature against content rules
    const featureToRule: Record<string, keyof typeof profile.contentRules> = {
      'explicit_content': 'explicitNudity',
      'suggestive_media': 'suggestiveContent',
      'adult_chat': 'adultThemes',
      'romantic_features': 'romanticContent',
      'political_discussion': 'politicalContent',
      'religious_discussion': 'religiousContent',
      'lgbtq_content': 'lgbtqContent'
    };
    
    const rule = featureToRule[feature];
    const status = rule ? profile.contentRules[rule] : 'allowed';
    
    return {
      success: true,
      feature,
      country: userCountry,
      status, // 'allowed', 'restricted', 'blocked'
      message: status === 'blocked' 
        ? `Feature not available in ${userCountry}` 
        : status === 'restricted'
        ? `Feature restricted in ${userCountry}`
        : 'Feature available'
    };
  } catch (error: any) {
    console.error('Error checking feature availability:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Update cultural safety profile
export const adminUpdateCulturalSafetyProfile = functions.https.onCall(async (data, context) => {
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
    
    const { country, updates, reason } = data;
    
    await db.collection('cultural-safety-overrides').doc(country).set({
      country,
      ...updates,
      reason: reason || 'Admin update',
      updatedBy: context.auth.uid,
      lastUpdated: Date.now()
    }, { merge: true });
    
    return { success: true, country };
  } catch (error: any) {
    console.error('Error updating cultural safety profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get all safety profiles (for admin dashboard)
export const adminGetAllSafetyProfiles = functions.https.onCall(async (data, context) => {
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
    
    const profiles: Record<string, CulturalSafetyProfile> = {};
    
    // Get default profile
    profiles['GLOBAL'] = {
      country: 'GLOBAL',
      countryName: 'Global Default',
      ...DEFAULT_SAFETY_PROFILE
    };
    
    // Get all country profiles
    for (const [country, overrides] of Object.entries(COUNTRY_SAFETY_PROFILES)) {
      profiles[country] = {
        country,
        countryName: country,
        ...DEFAULT_SAFETY_PROFILE,
        ...overrides
      };
    }
    
    return { success: true, profiles };
  } catch (error: any) {
    console.error('Error getting all safety profiles:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Trigger: Auto-moderate user content on creation
export const onContentCreated = functions.firestore
  .document('user-content/{contentId}')
  .onCreate(async (snap, context) => {
    const content = snap.data();
    const db = admin.firestore();
    
    try {
      // Get user's country
      const userDoc = await db.collection('users').doc(content.userId).get();
      const country = userDoc.data()?.country || 'GLOBAL';
      
      // Get safety profile
      let profile: CulturalSafetyProfile = {
        country,
        countryName: country,
        ...DEFAULT_SAFETY_PROFILE
      };
      
      if (COUNTRY_SAFETY_PROFILES[country.toUpperCase()]) {
        profile = {
          ...profile,
          ...COUNTRY_SAFETY_PROFILES[country.toUpperCase()]
        };
      }
      
      let needsReview = false;
      let autoBlock = false;
      const warnings: string[] = [];
      
      // Check for auto-block criteria
      if (content.aiLabels) {
        for (const label of content.aiLabels) {
          if (profile.mediaFilter.autoBlock.includes(label)) {
            autoBlock = true;
            break;
          }
          if (profile.mediaFilter.manualReview.includes(label)) {
            needsReview = true;
            warnings.push(label);
          }
        }
      }
      
      // Update content status
      await snap.ref.update({
        moderationStatus: autoBlock ? 'blocked' : needsReview ? 'pending_review' : 'approved',
        moderationWarnings: warnings,
        moderatedAt: Date.now(),
        moderatedBy: 'auto'
      });
      
      // Create moderation log
      await db.collection('content-moderation-logs').add({
        contentId: context.params.contentId,
        userId: content.userId,
        country,
        autoBlock,
        needsReview,
        warnings,
        timestamp: Date.now()
      });
      
      console.log(`Auto-moderated content ${context.params.contentId}: ${autoBlock ? 'blocked' : needsReview ? 'review' : 'approved'}`);
    } catch (error) {
      console.error('Error auto-moderating content:', error);
    }
  });
