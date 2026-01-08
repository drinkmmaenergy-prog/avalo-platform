/**
 * PACK 138 — VIP Access 2.0 Types
 * 
 * Premium UX improvements for VIP members
 * Zero monetization, ranking, or NSFW advantages
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price & 65/35 split remain untouched
 * - NO income generation advantage
 * - NO visibility or ranking boost
 * - NO priority attention or guaranteed reply
 * - NO feed ranking influence
 * - NO NSFW or escort advantages
 * - Purely comfort and UX improvements
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// VIP SUBSCRIPTION (extends PACK 107)
// ============================================================================

/**
 * Enhanced VIP subscription status
 */
export interface VIPSubscriptionStatus {
  /** User ID */
  userId: string;
  
  /** Is VIP active */
  isActive: boolean;
  
  /** Subscription tier (from PACK 107) */
  tier: 'NONE' | 'VIP' | 'ROYAL_CLUB';
  
  /** Features enabled */
  features: {
    themes: boolean;
    noAds: boolean;
    cdnOptimization: boolean;
    chatEnhancements: boolean;
    vault: boolean;
    unlimitedArchive: boolean;
    unlimitedBlocklist: boolean;
    cloudBackup: boolean;
  };
  
  /** Timestamps */
  activatedAt?: Timestamp;
  expiresAt?: Timestamp;
  
  /** Last checked */
  lastChecked: Timestamp;
}

// ============================================================================
// PROFILE THEMES
// ============================================================================

/**
 * VIP Profile Theme
 */
export interface VIPProfileTheme {
  /** Theme ID */
  themeId: string;
  
  /** Theme name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Required tier */
  requiredTier: 'VIP' | 'ROYAL_CLUB';
  
  /** Category */
  category: 'classic' | 'modern' | 'elegant' | 'playful' | 'seasonal' | 'special';
  
  /** Theme configuration */
  config: {
    /** Profile layout style */
    layout?: 'default' | 'centered' | 'split' | 'minimal';
    
    /** Background style */
    background?: {
      type: 'solid' | 'gradient' | 'pattern';
      colors: string[];
      patternUrl?: string;
      opacity?: number;
    };
    
    /** Border/frame style */
    frame?: {
      type: 'none' | 'solid' | 'gradient' | 'animated';
      colors: string[];
      width: number;
      style?: 'round' | 'square' | 'elegant';
    };
    
    /** Text styling */
    textStyle?: {
      bioFont?: string;
      bioColor?: string;
      nameColor?: string;
      accentColor?: string;
    };
    
    /** Banner style */
    banner?: {
      type: 'none' | 'static' | 'dynamic';
      url?: string;
      height?: number;
      animationUrl?: string; // Lottie JSON
    };
    
    /** Holiday/special edition */
    specialEdition?: {
      event: string;
      availableFrom: Timestamp;
      availableTo: Timestamp;
    };
  };
  
  /** Preview image */
  previewImageUrl: string;
  
  /** Is enabled */
  enabled: boolean;
  
  /** Display order */
  displayOrder: number;
  
  /** Timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * User's selected themes
 */
export interface VIPUserThemes {
  /** User ID */
  userId: string;
  
  /** Selected profile theme */
  profileThemeId?: string;
  
  /** Selected chat theme */
  chatThemeId?: string;
  
  /** Last updated */
  updatedAt: Timestamp;
}

// ============================================================================
// CHAT ENHANCEMENTS
// ============================================================================

/**
 * VIP Chat Theme
 */
export interface VIPChatTheme {
  /** Theme ID */
  themeId: string;
  
  /** Theme name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Required tier */
  requiredTier: 'VIP' | 'ROYAL_CLUB';
  
  /** Chat configuration */
  config: {
    /** Wallpaper */
    wallpaper?: {
      type: 'solid' | 'gradient' | 'image';
      colors?: string[];
      imageUrl?: string;
      opacity?: number;
    };
    
    /** Bubble style */
    bubbleStyle?: {
      senderColor: string;
      receiverColor: string;
      textColor: string;
      borderRadius: number;
    };
    
    /** Input style */
    inputStyle?: {
      backgroundColor: string;
      textColor: string;
      placeholderColor: string;
    };
  };
  
  /** Preview image */
  previewImageUrl: string;
  
  /** Is enabled */
  enabled: boolean;
  
  /** Display order */
  displayOrder: number;
  
  /** Timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * VIP Sticker Pack
 */
export interface VIPStickerPack {
  /** Pack ID */
  packId: string;
  
  /** Pack name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Required tier */
  requiredTier: 'VIP' | 'ROYAL_CLUB';
  
  /** Stickers in pack */
  stickers: Array<{
    stickerId: string;
    name: string;
    imageUrl: string;
    animated: boolean;
    animationUrl?: string; // Lottie or GIF
  }>;
  
  /** Pack icon */
  iconUrl: string;
  
  /** Is enabled */
  enabled: boolean;
  
  /** Timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * VIP Reaction Pack
 */
export interface VIPReactionPack {
  /** Pack ID */
  packId: string;
  
  /** Pack name */
  name: string;
  
  /** Required tier */
  requiredTier: 'VIP' | 'ROYAL_CLUB';
  
  /** Reactions in pack */
  reactions: Array<{
    reactionId: string;
    emoji: string;
    animated: boolean;
    animationUrl?: string;
  }>;
  
  /** Is enabled */
  enabled: boolean;
  
  /** Timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * User's chat enhancements settings
 */
export interface VIPChatEnhancements {
  /** User ID */
  userId: string;
  
  /** Selected wallpaper theme */
  wallpaperId?: string;
  
  /** Enabled sticker packs */
  enabledStickers: string[];
  
  /** Enabled reaction packs */
  enabledReactions: string[];
  
  /** Auto-save media to vault */
  autoSaveMedia: boolean;
  
  /** Quick translate enabled */
  quickTranslate: boolean;
  
  /** Last updated */
  updatedAt: Timestamp;
}

// ============================================================================
// VIP VAULT (Private Storage)
// ============================================================================

/**
 * VIP Vault item types
 */
export type VIPVaultItemType = 
  | 'bookmarked_profile'
  | 'purchased_content'
  | 'chat_memory'
  | 'challenge_memory'
  | 'call_note'
  | 'custom_note';

/**
 * VIP Vault item
 */
export interface VIPVaultItem {
  /** Item ID */
  itemId: string;
  
  /** User ID (owner) */
  userId: string;
  
  /** Item type */
  type: VIPVaultItemType;
  
  /** Item data (type-specific) */
  data: {
    /** For bookmarked_profile */
    profileId?: string;
    profileName?: string;
    profilePhotoUrl?: string;
    
    /** For purchased_content */
    contentId?: string;
    contentUrl?: string;
    contentType?: 'photo' | 'video' | 'voice';
    
    /** For chat_memory (text-only, no media links) */
    chatId?: string;
    otherUserId?: string;
    messageText?: string;
    
    /** For challenge_memory */
    challengeId?: string;
    challengeName?: string;
    
    /** For call_note */
    callId?: string;
    noteText?: string;
    
    /** For custom_note */
    customTitle?: string;
    customNote?: string;
  };
  
  /** User-added notes */
  userNote?: string;
  
  /** Tags for organization */
  tags: string[];
  
  /** Is starred/favorited */
  starred: boolean;
  
  /** Timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * VIP Vault summary
 */
export interface VIPVaultSummary {
  /** User ID */
  userId: string;
  
  /** Total items */
  totalItems: number;
  
  /** Items by type */
  itemsByType: Record<VIPVaultItemType, number>;
  
  /** Storage used (bytes) */
  storageUsed: number;
  
  /** Storage limit (bytes) */
  storageLimit: number;
  
  /** Last updated */
  lastUpdated: Timestamp;
}

// ============================================================================
// VIP SETTINGS
// ============================================================================

/**
 * VIP Settings
 */
export interface VIPSettings {
  /** User ID */
  userId: string;
  
  /** CDN optimization enabled */
  cdnOptimization: boolean;
  
  /** Cloud storage limit (bytes) */
  cloudStorageLimit: number;
  
  /** No ads enabled */
  noAds: boolean;
  
  /** Auto-play media in feed */
  autoPlayMedia: boolean;
  
  /** Auto-download messages */
  autoDownloadMessages: boolean;
  
  /** Unlimited archive enabled */
  unlimitedArchive: boolean;
  
  /** Unlimited blocklist enabled */
  unlimitedBlocklist: boolean;
  
  /** Last updated */
  updatedAt: Timestamp;
}

// ============================================================================
// VIP ACTIVITY LOGGING
// ============================================================================

/**
 * VIP Activity Event Type
 */
export type VIPActivityEventType =
  | 'VIP_ACTIVATED'
  | 'VIP_EXPIRED'
  | 'THEME_CHANGED'
  | 'VAULT_ITEM_ADDED'
  | 'VAULT_ITEM_REMOVED'
  | 'CHAT_ENHANCEMENT_ENABLED'
  | 'SETTINGS_UPDATED'
  | 'CDN_OPTIMIZATION_USED'
  | 'STICKER_PACK_ENABLED'
  | 'REACTION_PACK_ENABLED';

/**
 * VIP Activity Log
 */
export interface VIPActivityLog {
  /** Log ID */
  logId: string;
  
  /** User ID */
  userId: string;
  
  /** Event type */
  eventType: VIPActivityEventType;
  
  /** Event context */
  context: Record<string, any>;
  
  /** IP address (optional) */
  ipAddress?: string;
  
  /** User agent (optional) */
  userAgent?: string;
  
  /** Timestamp */
  createdAt: Timestamp;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Get VIP status request
 */
export interface GetVIPStatusRequest {
  userId?: string;
}

/**
 * Get VIP status response
 */
export interface GetVIPStatusResponse {
  status: VIPSubscriptionStatus;
  availableFeatures: string[];
}

/**
 * Get available themes request
 */
export interface GetAvailableThemesRequest {
  type: 'profile' | 'chat';
  category?: string;
}

/**
 * Get available themes response
 */
export interface GetAvailableThemesResponse {
  themes: Array<VIPProfileTheme | VIPChatTheme>;
  userTier: 'NONE' | 'VIP' | 'ROYAL_CLUB';
}

/**
 * Assign theme request
 */
export interface AssignThemeRequest {
  themeId: string;
  type: 'profile' | 'chat';
}

/**
 * Assign theme response
 */
export interface AssignThemeResponse {
  success: boolean;
  assignedThemeId: string;
}

/**
 * Get vault items request
 */
export interface GetVaultItemsRequest {
  type?: VIPVaultItemType;
  limit?: number;
  offset?: number;
  tag?: string;
}

/**
 * Get vault items response
 */
export interface GetVaultItemsResponse {
  items: VIPVaultItem[];
  summary: VIPVaultSummary;
  hasMore: boolean;
}

/**
 * Add vault item request
 */
export interface AddVaultItemRequest {
  type: VIPVaultItemType;
  data: VIPVaultItem['data'];
  userNote?: string;
  tags?: string[];
}

/**
 * Add vault item response
 */
export interface AddVaultItemResponse {
  success: boolean;
  itemId: string;
}

/**
 * Update VIP settings request
 */
export interface UpdateVIPSettingsRequest {
  settings: Partial<Omit<VIPSettings, 'userId' | 'updatedAt'>>;
}

/**
 * Update VIP settings response
 */
export interface UpdateVIPSettingsResponse {
  success: boolean;
  settings: VIPSettings;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * VIP storage limits
 */
export const VIP_STORAGE_LIMITS = {
  NONE: 0,
  VIP: 10 * 1024 * 1024 * 1024, // 10 GB
  ROYAL_CLUB: 50 * 1024 * 1024 * 1024, // 50 GB
} as const;

/**
 * VIP feature flags
 */
export const VIP_FEATURE_FLAGS = {
  VIP_ACCESS_ENABLED: 'vip_access_2_enabled',
  VIP_THEMES_ENABLED: 'vip_themes_enabled',
  VIP_VAULT_ENABLED: 'vip_vault_enabled',
  VIP_CHAT_ENHANCEMENTS_ENABLED: 'vip_chat_enhancements_enabled',
  VIP_CDN_OPTIMIZATION_ENABLED: 'vip_cdn_optimization_enabled',
} as const;

/**
 * VIP error codes
 */
export type VIPErrorCode =
  | 'VIP_NOT_ACTIVE'
  | 'THEME_NOT_FOUND'
  | 'THEME_NOT_AVAILABLE'
  | 'VAULT_LIMIT_REACHED'
  | 'VAULT_ITEM_NOT_FOUND'
  | 'INVALID_THEME_TYPE'
  | 'FEATURE_NOT_ENABLED'
  | 'TIER_INSUFFICIENT';