import * as functions from 'firebase-functions';
import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';

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
  creatorBlockedViewer: boolean;
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
  creator: CreatorProfile,
  viewerProfile: any
): number {
  if (!viewerProfile) return 0;
  
  let score = 0;
  
  // Language match
  if (viewerProfile.preferredLanguages && creator.languages) {
    const languageMatch = viewerProfile.preferredLanguages.some((lang: string) =>
      creator.languages.includes(lang)
    );
    if (languageMatch) score += 10;
  }
  
  // Country match
  if (viewerProfile.location?.country && creator.mainLocationCountry) {
    if (viewerProfile.location.country === creator.mainLocationCountry) {
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
// ENDPOINT: GET /creator/marketplace
// ============================================================================

export const getCreatorMarketplace = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const viewerId = context.auth.uid;
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
    let query = db.collection('creator_profiles')
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
      const cursorDoc = await db.collection('creator_profiles').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    
    // Process results
    const creators: any[] = [];
    const trustChecks: Promise<any>[] = [];
    
    snapshot.forEach(doc => {
      const creator = doc.data() as CreatorProfile;
      trustChecks.push(getTrustEngineStatus(creator.userId));
      creators.push(creator);
    });
    
    const trustStatuses = await Promise.all(trustChecks);
    
    // Filter and rank creators
    const filteredCreators = creators
      .map((creator, index) => ({
        ...creator,
        trustStatus: trustStatuses[index],
      }))
      .filter(creator => {
        // Filter blocked users
        if (viewerBlockedUsers.has(creator.userId)) return false;
        if (usersBlockingViewer.has(creator.userId)) return false;
        
        // Filter users not allowed to earn
        if (!creator.trustStatus.earnModeAllowed) return false;
        
        // Filter extreme high-risk
        if (creator.trustStatus.isHighRisk && 
            creator.trustStatus.riskFlags.includes('SCAM_SUSPECT')) {
          return false;
        }
        
        // Apply price filters
        if (filters.minPriceTokens !== undefined && 
            creator.baseMessageTokenCost < filters.minPriceTokens) {
          return false;
        }
        
        if (filters.maxPriceTokens !== undefined && 
            creator.baseMessageTokenCost > filters.maxPriceTokens) {
          return false;
        }
        
        return true;
      })
      .map(creator => {
        // Calculate personalization score
        const personalizationScore = calculatePersonalizationScore(creator, viewerProfile);
        
        // Calculate royal boost
        let royalBoost = 0;
        if (creator.royalTier === 'ROYAL_PLATINUM') royalBoost = 3;
        else if (creator.royalTier === 'ROYAL_GOLD') royalBoost = 2;
        else if (creator.royalTier === 'ROYAL_SILVER') royalBoost = 1;
        
        return {
          ...creator,
          rankingScore: personalizationScore + royalBoost + (creator.trustStatus.trustScore / 10),
        };
      })
      .sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Determine pagination
    const hasMore = filteredCreators.length > limit;
    const items = hasMore ? filteredCreators.slice(0, limit) : filteredCreators;
    const nextCursor = hasMore ? items[items.length - 1].userId : null;
    
    // Format response
    const response = {
      items: items.map(creator => ({
        userId: creator.userId,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl,
        shortBio: creator.shortBio,
        languages: creator.languages,
        mainLocationCity: creator.mainLocationCity,
        mainLocationCountry: creator.mainLocationCountry,
        earnsFromChat: creator.earnsFromChat,
        baseMessageTokenCost: creator.baseMessageTokenCost,
        ppmMediaFromTokens: creator.ppmMediaFromTokens,
        royalTier: creator.royalTier,
        trustScore: creator.trustStatus.trustScore,
        isHighRisk: creator.trustStatus.isHighRisk,
        lastActiveAt: creator.lastActiveAt.toMillis(),
      })),
      nextCursor,
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching creator marketplace:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch creator marketplace');
  }
});

// ============================================================================
// ENDPOINT: GET /creator/profile
// ============================================================================

export const getCreatorProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const viewerId = context.auth.uid;
  const creatorId = data.creatorId;
  
  if (!creatorId) {
    throw new functions.https.HttpsError('invalid-argument', 'creatorId is required');
  }
  
  try {
    // Get creator profile
    const creatorDoc = await db.collection('creator_profiles').doc(creatorId).get();
    
    if (!creatorDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Creator profile not found');
    }
    
    const creator = creatorDoc.data() as CreatorProfile;
    
    // Check relationship status
    const viewerBlockedUsers = await getUserBlockList(viewerId);
    const usersBlockingViewer = await getUsersThatBlockedUser(viewerId);
    
    const relationship: RelationshipStatus = {
      viewerBlockedCreator: viewerBlockedUsers.has(creatorId),
      creatorBlockedViewer: usersBlockingViewer.has(creatorId),
    };
    
    // Get trust status
    const trustStatus = await getTrustEngineStatus(creatorId);
    
    // Format response
    const response = {
      creator: {
        userId: creator.userId,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl,
        shortBio: creator.shortBio,
        languages: creator.languages,
        mainLocationCity: creator.mainLocationCity,
        mainLocationCountry: creator.mainLocationCountry,
        earnsFromChat: creator.earnsFromChat,
        baseMessageTokenCost: creator.baseMessageTokenCost,
        ppmMediaFromTokens: creator.ppmMediaFromTokens,
        royalTier: creator.royalTier,
        trustScore: trustStatus.trustScore,
        isHighRisk: trustStatus.isHighRisk,
        lastActiveAt: creator.lastActiveAt.toMillis(),
      },
      relationship,
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to fetch creator profile');
  }
});