/**
 * PACK 138 — VIP Access 2.0 Implementation
 * 
 * Premium UX · Faster App Performance · Zero Monetization/Ranking Advantage
 * 
 * Core functionality:
 * - VIP subscription status management
 * - Profile and chat themes
 * - Private vault storage
 * - Chat enhancements
 * - Activity logging
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price & 65/35 split remain untouched
 * - VIP subscriptions DO NOT generate more income for creators
 * - NO priority attention or guaranteed reply
 * - NO feed ranking or recommendation engine influence
 * - NO NSFW or escort advantages
 * - VIP = premium comfort, NOT competitive advantage
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { getMembershipStatus } from './pack107-membership';
import {
  VIPSubscriptionStatus,
  VIPProfileTheme,
  VIPChatTheme,
  VIPUserThemes,
  VIPVaultItem,
  VIPVaultSummary,
  VIPVaultItemType,
  VIPSettings,
  VIPActivityLog,
  VIPActivityEventType,
  GetVIPStatusRequest,
  GetVIPStatusResponse,
  GetAvailableThemesRequest,
  GetAvailableThemesResponse,
  AssignThemeRequest,
  AssignThemeResponse,
  GetVaultItemsRequest,
  GetVaultItemsResponse,
  AddVaultItemRequest,
  AddVaultItemResponse,
  UpdateVIPSettingsRequest,
  UpdateVIPSettingsResponse,
  VIP_STORAGE_LIMITS,
  VIPErrorCode,
  VIPChatEnhancements,
} from './pack138-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get VIP subscription status for user
 */
export async function getVIPStatus(userId: string): Promise<VIPSubscriptionStatus> {
  try {
    // Check membership from PACK 107
    const membership = await getMembershipStatus(userId);
    
    const isVIP = membership && 
      (membership.tier === 'VIP' || membership.tier === 'ROYAL_CLUB') &&
      membership.status === 'ACTIVE';
    
    const tier = membership?.tier || 'NONE';
    
    return {
      userId,
      isActive: isVIP,
      tier,
      features: {
        themes: isVIP,
        noAds: isVIP,
        cdnOptimization: isVIP,
        chatEnhancements: isVIP,
        vault: isVIP,
        unlimitedArchive: isVIP,
        unlimitedBlocklist: isVIP,
        cloudBackup: isVIP,
      },
      activatedAt: membership?.purchasedAt,
      expiresAt: membership?.expiresAt,
      lastChecked: Timestamp.now(),
    };
  } catch (error: any) {
    logger.error(`Error getting VIP status for ${userId}`, error);
    throw error;
  }
}

/**
 * Verify user has active VIP
 */
async function verifyVIPAccess(userId: string): Promise<void> {
  const status = await getVIPStatus(userId);
  
  if (!status.isActive) {
    throw new HttpsError(
      'failed-precondition',
      'VIP subscription required for this feature'
    );
  }
}

/**
 * Log VIP activity
 */
async function logVIPActivity(
  userId: string,
  eventType: VIPActivityEventType,
  context: Record<string, any>
): Promise<void> {
  try {
    const log: Omit<VIPActivityLog, 'logId'> = {
      userId,
      eventType,
      context,
      createdAt: Timestamp.now(),
    };
    
    await db.collection('vip_activity_logs').add(log);
    
    logger.info(`VIP activity logged: ${eventType}`, { userId, context });
  } catch (error: any) {
    logger.error('Error logging VIP activity', error);
    // Don't throw - logging failure shouldn't break operations
  }
}

// ============================================================================
// VIP STATUS API
// ============================================================================

/**
 * Get user's VIP subscription status
 * Returns current status and available features
 */
export const getVIPSubscriptionStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetVIPStatusResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as GetVIPStatusRequest;
    
    // Users can only check their own status
    if (data.userId && data.userId !== userId) {
      throw new HttpsError(
        'permission-denied',
        'Cannot check another user\'s VIP status'
      );
    }
    
    try {
      const status = await getVIPStatus(userId);
      
      const availableFeatures: string[] = [];
      if (status.features.themes) availableFeatures.push('themes');
      if (status.features.noAds) availableFeatures.push('no_ads');
      if (status.features.cdnOptimization) availableFeatures.push('cdn_optimization');
      if (status.features.chatEnhancements) availableFeatures.push('chat_enhancements');
      if (status.features.vault) availableFeatures.push('vault');
      if (status.features.unlimitedArchive) availableFeatures.push('unlimited_archive');
      if (status.features.unlimitedBlocklist) availableFeatures.push('unlimited_blocklist');
      if (status.features.cloudBackup) availableFeatures.push('cloud_backup');
      
      return { status, availableFeatures };
    } catch (error: any) {
      logger.error('Error getting VIP status', error);
      throw new HttpsError('internal', 'Failed to get VIP status');
    }
  }
);

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Get available themes for user
 * Returns themes based on user's VIP tier
 */
export const getAvailableThemes = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetAvailableThemesResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as GetAvailableThemesRequest;
    
    if (!data.type || (data.type !== 'profile' && data.type !== 'chat')) {
      throw new HttpsError('invalid-argument', 'Invalid theme type');
    }
    
    try {
      const status = await getVIPStatus(userId);
      
      // Build query
      const collectionName = data.type === 'profile' ? 'vip_themes' : 'vip_chat_themes';
      let query = db.collection(collectionName)
        .where('enabled', '==', true)
        .orderBy('displayOrder', 'asc');
      
      if (data.category) {
        query = query.where('category', '==', data.category);
      }
      
      const themesSnapshot = await query.get();
      
      // Filter themes based on user tier
      const themes = themesSnapshot.docs
        .map(doc => ({ ...doc.data(), themeId: doc.id }) as VIPProfileTheme | VIPChatTheme)
        .filter(theme => {
          if (status.tier === 'NONE') return false;
          if (status.tier === 'ROYAL_CLUB') return true;
          if (status.tier === 'VIP') return theme.requiredTier === 'VIP';
          return false;
        });
      
      return {
        themes: themes as Array<VIPProfileTheme | VIPChatTheme>,
        userTier: status.tier,
      };
    } catch (error: any) {
      logger.error('Error getting available themes', error);
      throw new HttpsError('internal', 'Failed to get themes');
    }
  }
);

/**
 * Assign theme to user's profile or chat
 */
export const assignTheme = onCall(
  { region: 'europe-west3' },
  async (request): Promise<AssignThemeResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as AssignThemeRequest;
    
    if (!data.themeId || !data.type) {
      throw new HttpsError('invalid-argument', 'Missing themeId or type');
    }
    
    try {
      // Verify VIP access
      await verifyVIPAccess(userId);
      
      // Verify theme exists and is available
      const collectionName = data.type === 'profile' ? 'vip_themes' : 'vip_chat_themes';
      const themeDoc = await db.collection(collectionName).doc(data.themeId).get();
      
      if (!themeDoc.exists) {
        throw new HttpsError('not-found', 'Theme not found');
      }
      
      const theme = themeDoc.data();
      if (!theme?.enabled) {
        throw new HttpsError('failed-precondition', 'Theme not available');
      }
      
      // Check tier requirement
      const status = await getVIPStatus(userId);
      if (theme.requiredTier === 'ROYAL_CLUB' && status.tier !== 'ROYAL_CLUB') {
        throw new HttpsError(
          'failed-precondition',
          'This theme requires Royal Club membership'
        );
      }
      
      // Update user's theme selection
      const userThemesRef = db.collection('vip_user_themes').doc(userId);
      const updateData: Partial<VIPUserThemes> = {
        userId,
        updatedAt: Timestamp.now(),
      };
      
      if (data.type === 'profile') {
        updateData.profileThemeId = data.themeId;
      } else {
        updateData.chatThemeId = data.themeId;
      }
      
      await userThemesRef.set(updateData, { merge: true });
      
      // Log activity
      await logVIPActivity(userId, 'THEME_CHANGED', {
        themeId: data.themeId,
        themeType: data.type,
        themeName: theme.name,
      });
      
      logger.info(`Theme assigned for ${userId}`, {
        type: data.type,
        themeId: data.themeId,
      });
      
      return {
        success: true,
        assignedThemeId: data.themeId,
      };
    } catch (error: any) {
      logger.error('Error assigning theme', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to assign theme');
    }
  }
);

// ============================================================================
// VAULT MANAGEMENT
// ============================================================================

/**
 * Get vault items for user
 */
export const getVaultItems = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetVaultItemsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as GetVaultItemsRequest;
    
    try {
      // Verify VIP access
      await verifyVIPAccess(userId);
      
      // Build query
      const vaultRef = db.collection('vip_vault').doc(userId).collection('items');
      let query = vaultRef.orderBy('createdAt', 'desc');
      
      if (data.type) {
        query = query.where('type', '==', data.type);
      }
      
      if (data.tag) {
        query = query.where('tags', 'array-contains', data.tag);
      }
      
      const limit = data.limit || 50;
      query = query.limit(limit + 1); // Get one extra to check hasMore
      
      if (data.offset) {
        query = query.offset(data.offset);
      }
      
      const itemsSnapshot = await query.get();
      const hasMore = itemsSnapshot.docs.length > limit;
      const items = itemsSnapshot.docs
        .slice(0, limit)
        .map(doc => ({ ...doc.data(), itemId: doc.id }) as VIPVaultItem);
      
      // Get vault summary
      const summaryDoc = await db.collection('vip_vault').doc(userId).get();
      const summary = summaryDoc.data() as VIPVaultSummary | undefined;
      
      const status = await getVIPStatus(userId);
      const storageLimit = VIP_STORAGE_LIMITS[status.tier];
      
      const defaultSummary: VIPVaultSummary = {
        userId,
        totalItems: items.length,
        itemsByType: {} as Record<VIPVaultItemType, number>,
        storageUsed: 0,
        storageLimit,
        lastUpdated: Timestamp.now(),
      };
      
      return {
        items,
        summary: summary || defaultSummary,
        hasMore,
      };
    } catch (error: any) {
      logger.error('Error getting vault items', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get vault items');
    }
  }
);

/**
 * Add item to vault
 */
export const addVaultItem = onCall(
  { region: 'europe-west3' },
  async (request): Promise<AddVaultItemResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as AddVaultItemRequest;
    
    if (!data.type || !data.data) {
      throw new HttpsError('invalid-argument', 'Missing type or data');
    }
    
    try {
      // Verify VIP access
      await verifyVIPAccess(userId);
      
      // Check storage limits
      const summaryDoc = await db.collection('vip_vault').doc(userId).get();
      const summary = summaryDoc.data() as VIPVaultSummary | undefined;
      const status = await getVIPStatus(userId);
      const storageLimit = VIP_STORAGE_LIMITS[status.tier];
      
      if (summary && summary.storageUsed >= storageLimit) {
        throw new HttpsError(
          'resource-exhausted',
          'Vault storage limit reached'
        );
      }
      
      // Create vault item
      const itemId = generateId();
      const vaultItem: Omit<VIPVaultItem, 'itemId'> = {
        userId,
        type: data.type,
        data: data.data,
        userNote: data.userNote,
        tags: data.tags || [],
        starred: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      await db
        .collection('vip_vault')
        .doc(userId)
        .collection('items')
        .doc(itemId)
        .set(vaultItem);
      
      // Update summary
      const itemsByType = summary?.itemsByType || {} as Record<VIPVaultItemType, number>;
      itemsByType[data.type] = (itemsByType[data.type] || 0) + 1;
      
      const updatedSummary: VIPVaultSummary = {
        userId,
        totalItems: (summary?.totalItems || 0) + 1,
        itemsByType,
        storageUsed: summary?.storageUsed || 0,
        storageLimit,
        lastUpdated: Timestamp.now(),
      };
      
      await db.collection('vip_vault').doc(userId).set(updatedSummary, { merge: true });
      
      // Log activity
      await logVIPActivity(userId, 'VAULT_ITEM_ADDED', {
        itemId,
        itemType: data.type,
      });
      
      logger.info(`Vault item added for ${userId}`, {
        itemId,
        type: data.type,
      });
      
      return {
        success: true,
        itemId,
      };
    } catch (error: any) {
      logger.error('Error adding vault item', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to add vault item');
    }
  }
);

/**
 * Remove item from vault
 */
export const removeVaultItem = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const { itemId } = request.data;
    
    if (!itemId) {
      throw new HttpsError('invalid-argument', 'Missing itemId');
    }
    
    try {
      // Verify VIP access
      await verifyVIPAccess(userId);
      
      // Get item to update summary
      const itemDoc = await db
        .collection('vip_vault')
        .doc(userId)
        .collection('items')
        .doc(itemId)
        .get();
      
      if (!itemDoc.exists) {
        throw new HttpsError('not-found', 'Vault item not found');
      }
      
      const item = itemDoc.data() as VIPVaultItem;
      
      // Delete item
      await itemDoc.ref.delete();
      
      // Update summary
      const summaryDoc = await db.collection('vip_vault').doc(userId).get();
      const summary = summaryDoc.data() as VIPVaultSummary | undefined;
      
      if (summary) {
        const itemsByType = summary.itemsByType;
        if (itemsByType[item.type]) {
          itemsByType[item.type] = Math.max(0, itemsByType[item.type] - 1);
        }
        
        await db.collection('vip_vault').doc(userId).update({
          totalItems: Math.max(0, summary.totalItems - 1),
          itemsByType,
          lastUpdated: serverTimestamp(),
        });
      }
      
      // Log activity
      await logVIPActivity(userId, 'VAULT_ITEM_REMOVED', {
        itemId,
        itemType: item.type,
      });
      
      logger.info(`Vault item removed for ${userId}`, { itemId });
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error removing vault item', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to remove vault item');
    }
  }
);

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get VIP settings for user
 */
export const getVIPSettings = onCall(
  { region: 'europe-west3' },
  async (request): Promise<VIPSettings> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    
    try {
      await verifyVIPAccess(userId);
      
      const settingsDoc = await db.collection('vip_settings').doc(userId).get();
      
      if (!settingsDoc.exists) {
        // Return default settings
        const status = await getVIPStatus(userId);
        const storageLimit = VIP_STORAGE_LIMITS[status.tier];
        
        const defaultSettings: VIPSettings = {
          userId,
          cdnOptimization: true,
          cloudStorageLimit: storageLimit,
          noAds: true,
          autoPlayMedia: true,
          autoDownloadMessages: false,
          unlimitedArchive: true,
          unlimitedBlocklist: true,
          updatedAt: Timestamp.now(),
        };
        
        await db.collection('vip_settings').doc(userId).set(defaultSettings);
        
        return defaultSettings;
      }
      
      return settingsDoc.data() as VIPSettings;
    } catch (error: any) {
      logger.error('Error getting VIP settings', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get VIP settings');
    }
  }
);

/**
 * Update VIP settings
 */
export const updateVIPSettings = onCall(
  { region: 'europe-west3' },
  async (request): Promise<UpdateVIPSettingsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const data = request.data as UpdateVIPSettingsRequest;
    
    if (!data.settings) {
      throw new HttpsError('invalid-argument', 'Missing settings');
    }
    
    try {
      await verifyVIPAccess(userId);
      
      const updateData = {
        ...data.settings,
        userId,
        updatedAt: Timestamp.now(),
      };
      
      await db.collection('vip_settings').doc(userId).set(updateData, { merge: true });
      
      const updatedDoc = await db.collection('vip_settings').doc(userId).get();
      const settings = updatedDoc.data() as VIPSettings;
      
      // Log activity
      await logVIPActivity(userId, 'SETTINGS_UPDATED', {
        updatedFields: Object.keys(data.settings),
      });
      
      logger.info(`VIP settings updated for ${userId}`);
      
      return {
        success: true,
        settings,
      };
    } catch (error: any) {
      logger.error('Error updating VIP settings', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to update VIP settings');
    }
  }
);

// ============================================================================
// CHAT ENHANCEMENTS
// ============================================================================

/**
 * Get chat enhancements settings
 */
export const getChatEnhancements = onCall(
  { region: 'europe-west3' },
  async (request): Promise<VIPChatEnhancements> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    
    try {
      await verifyVIPAccess(userId);
      
      const enhancementsDoc = await db.collection('vip_chat_enhancements').doc(userId).get();
      
      if (!enhancementsDoc.exists) {
        const defaultEnhancements: VIPChatEnhancements = {
          userId,
          enabledStickers: [],
          enabledReactions: [],
          autoSaveMedia: false,
          quickTranslate: true,
          updatedAt: Timestamp.now(),
        };
        
        await db.collection('vip_chat_enhancements').doc(userId).set(defaultEnhancements);
        
        return defaultEnhancements;
      }
      
      return enhancementsDoc.data() as VIPChatEnhancements;
    } catch (error: any) {
      logger.error('Error getting chat enhancements', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to get chat enhancements');
    }
  }
);

/**
 * Update chat enhancements
 */
export const updateChatEnhancements = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const updates = request.data;
    
    try {
      await verifyVIPAccess(userId);
      
      const updateData = {
        ...updates,
        userId,
        updatedAt: Timestamp.now(),
      };
      
      await db.collection('vip_chat_enhancements').doc(userId).set(updateData, { merge: true });
      
      // Log activity
      await logVIPActivity(userId, 'CHAT_ENHANCEMENT_ENABLED', {
        updates: Object.keys(updates),
      });
      
      logger.info(`Chat enhancements updated for ${userId}`);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error updating chat enhancements', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to update chat enhancements');
    }
  }
);