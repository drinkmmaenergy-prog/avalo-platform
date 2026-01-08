/**
 * PACK 331 — AI Avatar Template Marketplace
 * TypeScript Type Definitions
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// ENUMS
// ============================================================================

export type AvatarStyle = 'REALISTIC' | 'ANIME' | 'ILLUSTRATION' | 'OTHER';

export type GenderPresentation = 'FEMININE' | 'MASCULINE' | 'ANDROGYNOUS' | 'OTHER';

export type TemplateStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'DEACTIVATED';

// ============================================================================
// AI AVATAR TEMPLATE
// ============================================================================

export interface AIAvatarTemplate {
  id: string;
  ownerUserId: string | null; // null = Avalo official
  name: string;
  description: string;
  
  imageUrl: string; // final avatar preview
  style: AvatarStyle;
  genderPresentation: GenderPresentation;
  
  priceTokens: number; // one-time unlock price (200-2000 range)
  isActive: boolean;
  
  isOfficialAvalo: boolean; // true => 100% Avalo revenue
  tags: string[]; // e.g. "gamer", "elegant", "tattoos"
  
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  
  stats: {
    totalPurchases: number;
    totalEarningsTokens: number;
    totalUsageSessions: number;
  };
  
  // Moderation fields
  moderationStatus?: TemplateStatus;
  moderatedBy?: string;
  moderatedAt?: Timestamp | FieldValue;
  rejectionReason?: string;
}

// ============================================================================
// AI AVATAR TEMPLATE PURCHASE
// ============================================================================

export interface AIAvatarTemplatePurchase {
  id: string;
  buyerUserId: string;
  templateId: string;
  
  purchasedAt: Timestamp | FieldValue;
  
  priceTokens: number;
  ownerUserId: string | null; // null = Avalo official
  isOfficialAvalo: boolean;
}

// ============================================================================
// EXTENDED AI COMPANION TYPE
// ============================================================================

export interface AICompanionWithAvatar {
  // ... existing AICompanion fields
  avatarTemplateId?: string; // Reference to purchased template
  avatarImageUrl?: string; // URL from template or custom
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateAvatarTemplateRequest {
  ownerUserId: string;
  name: string;
  description: string;
  imageUrl: string;
  style: AvatarStyle;
  genderPresentation: GenderPresentation;
  tags: string[];
  priceTokens: number;
}

export interface CreateAvatarTemplateResponse {
  success: boolean;
  templateId?: string;
  error?: string;
}

export interface PurchaseAvatarTemplateRequest {
  buyerUserId: string;
  templateId: string;
}

export interface PurchaseAvatarTemplateResponse {
  success: boolean;
  purchaseId?: string;
  error?: string;
  split?: {
    ownerEarned: number;
    avaloEarned: number;
  };
}

export interface ListAvatarTemplatesRequest {
  filters?: {
    style?: AvatarStyle;
    genderPresentation?: GenderPresentation;
    tags?: string[];
    priceMin?: number;
    priceMax?: number;
    officialOnly?: boolean;
    creatorOnly?: boolean;
  };
  sort?: 'popular' | 'new' | 'top_earning' | 'price_low' | 'price_high';
  limit?: number;
  offset?: number;
}

export interface ListAvatarTemplatesResponse {
  success: boolean;
  templates?: AIAvatarTemplate[];
  total?: number;
  error?: string;
}

export interface GetCreatorStatsResponse {
  success: boolean;
  stats?: {
    totalTemplates: number;
    activeTemplates: number;
    totalSales: number;
    totalEarningsTokens: number;
    templates: Array<{
      templateId: string;
      name: string;
      sales: number;
      earnings: number;
      usageSessions: number;
    }>;
  };
  error?: string;
}

// ============================================================================
// MODERATION TYPES
// ============================================================================

export interface TemplateModerationAction {
  templateId: string;
  moderatorId: string;
  action: 'approve' | 'reject' | 'deactivate';
  reason?: string;
  timestamp: Timestamp | FieldValue;
}

export interface TemplateReport {
  reportId: string;
  templateId: string;
  reporterId: string;
  reason: string;
  description?: string;
  reportedAt: Timestamp | FieldValue;
  status: 'pending' | 'reviewed' | 'resolved';
  reviewedBy?: string;
  reviewedAt?: Timestamp | FieldValue;
  action?: string;
}

// ============================================================================
// REVENUE SPLIT CONSTANTS
// ============================================================================

export const AVATAR_TEMPLATE_REVENUE_SPLIT = {
  CREATOR_SHARE: 0.65, // 65% to creator
  AVALO_SHARE: 0.35, // 35% to Avalo
  OFFICIAL_AVALO_SHARE: 1.0, // 100% to Avalo for official templates
} as const;

export const AVATAR_TEMPLATE_PRICE_LIMITS = {
  MIN_TOKENS: 200,
  MAX_TOKENS: 2000,
} as const;

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface AvatarTemplateStats {
  templateId: string;
  totalPurchases: number;
  totalEarningsTokens: number;
  totalUsageSessions: number;
  lastPurchaseAt?: Timestamp | FieldValue;
  lastUsedAt?: Timestamp | FieldValue;
}

export interface UserAvatarPurchases {
  userId: string;
  purchasedTemplates: string[]; // template IDs
  totalSpent: number;
  purchaseCount: number;
}