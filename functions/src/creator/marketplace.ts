import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

import * as functions from 'firebase-functions';
import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, admin, auth, onCall } from '../runtime';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorProfile {
  userId: string;
  displayName: string;
  avatarUrl: string;
  shortBio: string;
  languages: string[];
  mainLocationCity?: string;
  mainLocationCountry?: string;
  earnsFromChat: boolean;
  baseMessageTokenCost: number;
  ppmMediaFromTokens: number;
  aiCompanionAvailable: boolean;
  royalTier: 'NONE' | 'ROYAL_SILVER' | 'ROYAL_GOLD' | 'ROYAL_PLATINUM';
  trustScore: number;
  riskFlags: string[];
  ratingScore?: number;
  lastActiveAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface CreatorMarketplaceFilters {
  language?: string;
  country?: string;
  minPriceTokens?: number;
  maxPriceTokens?: number;
  royalOnly?: boolean;
}

interface RelationshipStatus {
  viewerBlockedCreator: boolean;
  earnerBlockedViewer: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserBlockList(userId: string): Promise<Set<string>> {
  const blockedUsersRef = db.collection('blocked_users').doc(userId);
  const doc = await blockedUsersRef.get();
  
  if (!doc.exists) {
    return new Set();
  }
  
  const data = doc.data();
  const blockedIds: string[] = data?.blockedUserIds || [];
  return new Set(blockedIds);
}

async function getUsersThatBlockedUser(userId: string): Promise<Set<string>> {
  // Query for documents where blockedUserIds array contains userId
  const snapshot = await db.collection('blocked_users')
    .where('blockedUserIds', 'array-contains', userId)
    .get();
  
  const blockerIds = new Set<string>();
  snapshot.forEach(doc => {
    blockerIds.add(doc.id);
  });
  
  return blockerIds;
}

async function getTrustEngineStatus(userId: string): Promise<{
  trustScore: number;
  earnModeAllowed: boolean;
  isHighRisk: boolean;
  riskFlags: string[];
}> {
  const trustDoc = await db.collection('user_trust_scores').doc(userId).get();
  
  if (!trustDoc.exists) {
    return {
      trustScore: 50,
      earnModeAllowed: true,
      isHighRisk: false,
      riskFlags: [],
    };
  }
  
  const data = trustDoc.data();
  return {
    trustScore: data?.trustScore || 50,
    earnModeAllowed: data?.earnModeAllowed !== false,
    isHighRisk: data?.isHighRisk === true,
    riskFlags: data?.riskFlags || [],
  };
}

async function getUserPersonalizationProfile(userId: string): Promise<any> {
  const profileDoc = await db.collection('user_personalization_profiles').doc(userId).get();
  
  if (!profileDoc.exists) {
    return null;
  }
  
  return profileDoc.data();
}

function calculatePersonalizationScore(
  earner: CreatorProfile,
  viewerProfile: any
): number {
  if (!viewerProfile) return 0;
  
  let score = 0;
  
  // Language match
  if (viewerProfile.preferredLanguages && earner.languages) {
    const languageMatch = viewerProfile.preferredLanguages.some((lang: string) =>
      earner.languages.includes(lang)
    );
    if (languageMatch) score += 10;
  }
  
  // Country match
  if (viewerProfile.location?.country && earner.mainLocationCountry) {
    if (viewerProfile.location.country === earner.mainLocationCountry) {
      score += 8;
    }
  }
  
  // Interest match (conceptual)
  if (viewerProfile.interests && viewerProfile.interests.length > 0) {
    score += 5;
  }
  
  return score;
}

// ============================================================================
// ENDPOINT: GET /earner/marketplace
// ============================================================================

export const getCreatorMarketplace = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const viewerId = request.auth.uid;
  const filters: CreatorMarketplaceFilters = data.filters || {};
  const limit = data.limit || 20;
  const cursor = data.cursor;
  
  try {
    // Get viewer's block lists
    const viewerBlockedUsers = await getUserBlockList(viewerId);
    const usersBlockingViewer = await getUsersThatBlockedUser(viewerId);
    
    // Get viewer's personalization profile
    const viewerProfile = await getUserPersonalizationProfile(viewerId);
    
    // Build query
    let query = db.collection('earner_profiles')
      .where('earnsFromChat', '==', true)
      .limit(limit + 1); // +1 for pagination cursor
    
    // Apply filters
    if (filters.language) {
      query = query.where('languages', 'array-contains', filters.language);
    }
    
    if (filters.country) {
      query = query.where('mainLocationCountry', '==', filters.country);
    }
    
    if (filters.royalOnly) {
      query = query.where('royalTier', '!=', 'NONE');
    }
    
    // Apply cursor
    if (cursor) {
      const cursorDoc = await db.collection('earner_profiles').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    
    // Process results
    const earners: any[] = [];
    const trustChecks: Promise<any>[] = [];
    
    snapshot.forEach(doc => {
      const earner = doc.data() as CreatorProfile;
      trustChecks.push(getTrustEngineStatus(earner.userId));
      earners.push(earner);
    });
    
    const trustStatuses = await Promise.all(trustChecks);
    
    // Filter and rank earners
    const filteredCreators = earners
      .map((earner, index) => ({
        ...earner,
        trustStatus: trustStatuses[index],
      }))
      .filter(earner => {
        // Filter blocked users
        if (viewerBlockedUsers.has(earner.userId)) return false;
        if (usersBlockingViewer.has(earner.userId)) return false;
        
        // Filter users not allowed to earn
        if (!earner.trustStatus.earnModeAllowed) return false;
        
        // Filter extreme high-risk
        if (earner.trustStatus.isHighRisk && 
            earner.trustStatus.riskFlags.includes('SCAM_SUSPECT')) {
          return false;
        }
        
        // Apply price filters
        if (filters.minPriceTokens !== undefined && 
            earner.baseMessageTokenCost < filters.minPriceTokens) {
          return false;
        }
        
        if (filters.maxPriceTokens !== undefined && 
            earner.baseMessageTokenCost > filters.maxPriceTokens) {
          return false;
        }
        
        return true;
      })
      .map(earner => {
        // Calculate personalization score
        const personalizationScore = calculatePersonalizationScore(earner, viewerProfile);
        
        // Calculate royal boost
        let royalBoost = 0;
        if (earner.royalTier === 'ROYAL_PLATINUM') royalBoost = 3;
        else if (earner.royalTier === 'ROYAL_GOLD') royalBoost = 2;
        else if (earner.royalTier === 'ROYAL_SILVER') royalBoost = 1;
        
        return {
          ...earner,
          rankingScore: personalizationScore + royalBoost + (earner.trustStatus.trustScore / 10),
        };
      })
      .sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Determine pagination
    const hasMore = filteredCreators.length > limit;
    const items = hasMore ? filteredCreators.slice(0, limit) : filteredCreators;
    const nextCursor = hasMore ? items[items.length - 1].userId : null;
    
    // Format response
    const response = {
      items: items.map(earner => ({
        userId: earner.userId,
        displayName: earner.displayName,
        avatarUrl: earner.avatarUrl,
        shortBio: earner.shortBio,
        languages: earner.languages,
        mainLocationCity: earner.mainLocationCity,
        mainLocationCountry: earner.mainLocationCountry,
        earnsFromChat: earner.earnsFromChat,
        baseMessageTokenCost: earner.baseMessageTokenCost,
        ppmMediaFromTokens: earner.ppmMediaFromTokens,
        royalTier: earner.royalTier,
        trustScore: earner.trustStatus.trustScore,
        isHighRisk: earner.trustStatus.isHighRisk,
        lastActiveAt: earner.lastActiveAt.toMillis(),
      })),
      nextCursor,
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching earner marketplace:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch earner marketplace');
  }
});

// ============================================================================
// ENDPOINT: GET /earner/profile
// ============================================================================

export const getCreatorProfile = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const viewerId = request.auth.uid;
  const earnerId = data.earnerId;
  
  if (!earnerId) {
    throw new functions.https.HttpsError('invalid-argument', 'earnerId is required');
  }
  
  try {
    // Get earner profile
    const earnerDoc = await db.collection('earner_profiles').doc(earnerId).get();
    
    if (!earnerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Creator profile not found');
    }
    
    const earner = earnerDoc.data() as CreatorProfile;
    
    // Check relationship status
    const viewerBlockedUsers = await getUserBlockList(viewerId);
    const usersBlockingViewer = await getUsersThatBlockedUser(viewerId);
    
    const relationship: RelationshipStatus = {
      viewerBlockedCreator: viewerBlockedUsers.has(earnerId),
      earnerBlockedViewer: usersBlockingViewer.has(earnerId),
    };
    
    // Get trust status
    const trustStatus = await getTrustEngineStatus(earnerId);
    
    // Format response
    const response = {
      earner: {
        userId: earner.userId,
        displayName: earner.displayName,
        avatarUrl: earner.avatarUrl,
        shortBio: earner.shortBio,
        languages: earner.languages,
        mainLocationCity: earner.mainLocationCity,
        mainLocationCountry: earner.mainLocationCountry,
        earnsFromChat: earner.earnsFromChat,
        baseMessageTokenCost: earner.baseMessageTokenCost,
        ppmMediaFromTokens: earner.ppmMediaFromTokens,
        royalTier: earner.royalTier,
        trustScore: trustStatus.trustScore,
        isHighRisk: trustStatus.isHighRisk,
        lastActiveAt: earner.lastActiveAt.toMillis(),
      },
      relationship,
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching earner profile:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to fetch earner profile');
  }
});

























