/**
 * PACK 433 — Influencer Marketplace & Creator Deal Automation Engine
 * Part 1: Creator Marketplace Core
 * 
 * Features:
 * - Creator profile registry
 * - Multi-platform linking (TikTok, Instagram, YouTube)
 * - Traffic source fingerprinting
 * - Geo-based creator discovery
 * - Category tagging
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CreatorPlatform = 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'OTHER';

export type CreatorCategory =
  | 'DATING'
  | 'LIFESTYLE'
  | 'EVENTS'
  | 'AI_COMPANION'
  | 'SAFETY'
  | 'MONETIZATION';

export type CreatorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface PlatformConnection {
  platform: CreatorPlatform;
  handle: string;
  url: string;
  followers?: number;
  verified: boolean;
  connectedAt: Timestamp;
  lastVerifiedAt?: Timestamp;
}

export interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  status: CreatorStatus;
  
  // Platform connections
  platforms: PlatformConnection[];
  
  // Metadata
  categories: CreatorCategory[];
  country: string;
  language: string;
  bio?: string;
  
  // Statistics
  stats: {
    totalInstalls: number;
    totalRevenue: number;
    conversionRate: number;
    activeDeals: number;
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActive?: Timestamp;
  
  // Admin notes
  adminNotes?: string;
}

export interface TrafficSource {
  id: string;
  creatorId: string;
  source: string;
  medium: string;
  campaign?: string;
  fingerprint: string;
  country?: string;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
}

export interface CreatorDiscoveryFilters {
  category?: CreatorCategory;
  country?: string;
  minFollowers?: number;
  platforms?: CreatorPlatform[];
  status?: CreatorStatus;
  limit?: number;
}

// ============================================================================
// CREATOR ONBOARDING
// ============================================================================

/**
 * Register as a creator in the marketplace
 */
export const registerCreator = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ creatorId: string; status: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      displayName,
      email,
      categories,
      country,
      language,
      bio,
      platforms,
    } = request.data;

    // Validation
    if (!displayName || !email || !categories || !country || !language) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: displayName, email, categories, country, language'
      );
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one category is required');
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one platform connection is required');
    }

    try {
      const userId = request.auth.uid;

      // Check if user is already a creator
      const existingCreator = await db
        .collection('creator_profiles')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!existingCreator.empty) {
        throw new HttpsError('already-exists', 'User is already registered as a creator');
      }

      // Process platform connections
      const processedPlatforms: PlatformConnection[] = platforms.map((p: any) => ({
        platform: p.platform,
        handle: p.handle,
        url: p.url,
        followers: p.followers || 0,
        verified: false, // Will be verified by admin
        connectedAt: Timestamp.now(),
      }));

      // Create creator profile
      const creatorProfile: Omit<CreatorProfile, 'id'> = {
        userId,
        displayName,
        email,
        status: 'PENDING', // Requires admin approval
        platforms: processedPlatforms,
        categories,
        country,
        language,
        bio: bio || '',
        stats: {
          totalInstalls: 0,
          totalRevenue: 0,
          conversionRate: 0,
          activeDeals: 0,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const creatorRef = await db.collection('creator_profiles').add(creatorProfile);

      logger.info(`Creator registered: ${creatorRef.id}`, {
        userId,
        displayName,
        platforms: processedPlatforms.map((p) => p.platform),
      });

      return {
        creatorId: creatorRef.id,
        status: 'PENDING',
      };
    } catch (error: any) {
      logger.error('Error registering creator', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to register creator: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATOR PROFILE MANAGEMENT
// ============================================================================

/**
 * Get creator profile
 */
export const getCreatorProfile = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorProfile> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const creatorId = request.data.creatorId;

    try {
      const creatorDoc = await db.collection('creator_profiles').doc(creatorId).get();

      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator profile not found');
      }

      const profile = creatorDoc.data() as CreatorProfile;

      // Security: Users can only view their own profile (unless admin)
      if (profile.userId !== request.auth.uid) {
        // TODO: Check if user is admin
        throw new HttpsError('permission-denied', 'Cannot access another creator\'s profile');
      }

      return {
        id: creatorDoc.id,
        ...profile,
      };
    } catch (error: any) {
      logger.error('Error fetching creator profile', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to fetch profile: ${error.message}`);
    }
  }
);

/**
 * Update creator profile
 */
export const updateCreatorProfile = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId, updates } = request.data;

    if (!creatorId || !updates) {
      throw new HttpsError('invalid-argument', 'Missing creatorId or updates');
    }

    try {
      const creatorRef = db.collection('creator_profiles').doc(creatorId);
      const creatorDoc = await creatorRef.get();

      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator profile not found');
      }

      const profile = creatorDoc.data() as CreatorProfile;

      // Security check
      if (profile.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot update another creator\'s profile');
      }

      // Allowed fields for update
      const allowedUpdates: Partial<CreatorProfile> = {};

      if (updates.displayName) allowedUpdates.displayName = updates.displayName;
      if (updates.bio) allowedUpdates.bio = updates.bio;
      if (updates.categories) allowedUpdates.categories = updates.categories;
      if (updates.language) allowedUpdates.language = updates.language;

      allowedUpdates.updatedAt = Timestamp.now();

      await creatorRef.update(allowedUpdates);

      logger.info(`Creator profile updated: ${creatorId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating creator profile', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update profile: ${error.message}`);
    }
  }
);

/**
 * Add platform connection to creator profile
 */
export const addPlatformConnection = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId, platform, handle, url, followers } = request.data;

    if (!creatorId || !platform || !handle || !url) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: creatorId, platform, handle, url'
      );
    }

    try {
      const creatorRef = db.collection('creator_profiles').doc(creatorId);
      const creatorDoc = await creatorRef.get();

      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator profile not found');
      }

      const profile = creatorDoc.data() as CreatorProfile;

      // Security check
      if (profile.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot modify another creator\'s profile');
      }

      // Check if platform already connected
      const existingPlatform = profile.platforms.find((p) => p.platform === platform);
      if (existingPlatform) {
        throw new HttpsError('already-exists', `${platform} is already connected`);
      }

      const newPlatform: PlatformConnection = {
        platform,
        handle,
        url,
        followers: followers || 0,
        verified: false,
        connectedAt: Timestamp.now(),
      };

      await creatorRef.update({
        platforms: [...profile.platforms, newPlatform],
        updatedAt: Timestamp.now(),
      });

      logger.info(`Platform added to creator ${creatorId}:`, { platform, handle });

      return { success: true };
    } catch (error: any) {
      logger.error('Error adding platform connection', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to add platform: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATOR DISCOVERY
// ============================================================================

/**
 * Discover creators based on filters
 * Used by admins or for marketplace browsing
 */
export const discoverCreators = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CreatorProfile[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const filters: CreatorDiscoveryFilters = request.data.filters || {};
    const limit = Math.min(filters.limit || 20, 100);

    try {
      let query: FirebaseFirestore.Query = db.collection('creator_profiles');

      // Apply filters
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      if (filters.category) {
        query = query.where('categories', 'array-contains', filters.category);
      }

      if (filters.country) {
        query = query.where('country', '==', filters.country);
      }

      // Order by total installs (best performers first)
      query = query.orderBy('stats.totalInstalls', 'desc').limit(limit);

      const snapshot = await query.get();

      const creators: CreatorProfile[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as CreatorProfile));

      // Apply additional filters (post-query)
      let filteredCreators = creators;

      if (filters.minFollowers) {
        filteredCreators = filteredCreators.filter((creator) => {
          const totalFollowers = creator.platforms.reduce(
            (sum, p) => sum + (p.followers || 0),
            0
          );
          return totalFollowers >= (filters.minFollowers || 0);
        });
      }

      if (filters.platforms && filters.platforms.length > 0) {
        filteredCreators = filteredCreators.filter((creator) => {
          return creator.platforms.some((p) => filters.platforms?.includes(p.platform));
        });
      }

      logger.info('Creator discovery query executed', {
        filters,
        resultsCount: filteredCreators.length,
      });

      return filteredCreators;
    } catch (error: any) {
      logger.error('Error discovering creators', error);
      throw new HttpsError('internal', `Failed to discover creators: ${error.message}`);
    }
  }
);

// ============================================================================
// TRAFFIC SOURCE TRACKING
// ============================================================================

/**
 * Register a traffic source for tracking
 * Called when a user clicks a creator's link
 */
export const registerTrafficSource = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ sourceId: string; fingerprint: string }> => {
    const { creatorId, source, medium, campaign, country, metadata } = request.data;

    if (!creatorId || !source) {
      throw new HttpsError('invalid-argument', 'Missing required fields: creatorId, source');
    }

    try {
      // Generate unique fingerprint for this traffic source
      const fingerprint = generateId();

      const trafficSource: Omit<TrafficSource, 'id'> = {
        creatorId,
        source,
        medium: medium || 'referral',
        campaign,
        fingerprint,
        country,
        metadata: metadata || {},
        createdAt: Timestamp.now(),
      };

      const sourceRef = await db.collection('traffic_sources').add(trafficSource);

      logger.info(`Traffic source registered: ${sourceRef.id}`, {
        creatorId,
        source,
        fingerprint,
      });

      return {
        sourceId: sourceRef.id,
        fingerprint,
      };
    } catch (error: any) {
      logger.error('Error registering traffic source', error);
      throw new HttpsError('internal', `Failed to register traffic source: ${error.message}`);
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Approve creator application (admin only)
 */
export const approveCreator = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Verify admin role
    const { creatorId, adminNotes } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Missing creatorId');
    }

    try {
      const creatorRef = db.collection('creator_profiles').doc(creatorId);
      const creatorDoc = await creatorRef.get();

      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      await creatorRef.update({
        status: 'ACTIVE',
        adminNotes: adminNotes || '',
        updatedAt: Timestamp.now(),
      });

      logger.info(`Creator approved: ${creatorId}`, { approvedBy: request.auth.uid });

      return { success: true };
    } catch (error: any) {
      logger.error('Error approving creator', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to approve creator: ${error.message}`);
    }
  }
);

/**
 * Suspend or ban creator (admin only)
 */
export const updateCreatorStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Verify admin role
    const { creatorId, status, reason } = request.data;

    if (!creatorId || !status) {
      throw new HttpsError('invalid-argument', 'Missing creatorId or status');
    }

    if (!['PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
      throw new HttpsError('invalid-argument', 'Invalid status');
    }

    try {
      const creatorRef = db.collection('creator_profiles').doc(creatorId);
      const creatorDoc = await creatorRef.get();

      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      await creatorRef.update({
        status,
        adminNotes: reason || '',
        updatedAt: Timestamp.now(),
      });

      logger.info(`Creator status updated: ${creatorId}`, {
        newStatus: status,
        updatedBy: request.auth.uid,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating creator status', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update status: ${error.message}`);
    }
  }
);
