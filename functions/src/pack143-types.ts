/**
 * PACK 143 - Avalo Business Suite Types
 * CRM, Smart Funnels, Sales Inside Avalo
 * 
 * Zero visibility boost, Zero external payments, Zero romantic/NSFW usage
 */

import { Timestamp } from 'firebase-admin/firestore';

export interface CRMContact {
  id: string;
  creatorId: string;
  userId: string;
  displayName: string;
  avatar: string;
  labels: string[];
  firstInteractionAt: Timestamp;
  lastInteractionAt: Timestamp;
  totalSpent: number;
  purchaseCount: number;
  purchaseHistory: PurchaseRecord[];
  engagementScore: number;
  lastPurchaseAt?: Timestamp;
  optedOutBroadcasts: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PurchaseRecord {
  productId: string;
  productType: 'digital_product' | 'club' | 'challenge' | 'event' | 'mentorship' | 'paid_chat' | 'paid_call';
  productName: string;
  amount: number;
  currency: string;
  purchasedAt: Timestamp;
}

export interface CRMSegment {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  filters: SegmentFilters;
  contactCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SegmentFilters {
  labels?: string[];
  minSpent?: number;
  maxSpent?: number;
  purchasedProducts?: string[];
  lastInteractionDays?: number;
  engagementScoreMin?: number;
  engagementScoreMax?: number;
}

export interface CRMFunnel {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'archived';
  trigger: FunnelTrigger;
  steps: FunnelStep[];
  analytics: FunnelAnalytics;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FunnelTrigger {
  type: 'new_follower' | 'first_purchase' | 'segment_entry' | 'event_registration' | 'manual';
  segmentId?: string;
  productType?: string;
}

export interface FunnelStep {
  id: string;
  order: number;
  delayHours: number;
  action: FunnelAction;
  completedCount: number;
}

export interface FunnelAction {
  type: 'show_post' | 'send_message' | 'offer_product' | 'invite_to_club' | 'promote_event';
  contentId?: string;
  productId?: string;
  messageTemplate?: string;
}

export interface FunnelAnalytics {
  totalEntered: number;
  currentActive: number;
  completedCount: number;
  conversionRate: number;
  revenueGenerated: number;
  lastUpdated: Timestamp;
}

export interface CRMBroadcast {
  id: string;
  creatorId: string;
  segmentId: string;
  subject: string;
  content: string;
  contentType: 'text' | 'post' | 'product_offer' | 'event_invite';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: Timestamp;
  sentAt?: Timestamp;
  targetCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  optOutCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CRMAnalytics {
  creatorId: string;
  period: 'day' | 'week' | 'month' | 'year';
  periodStart: Timestamp;
  periodEnd: Timestamp;
  metrics: {
    totalContacts: number;
    newContacts: number;
    totalRevenue: number;
    averageOrderValue: number;
    conversionRate: number;
    topPerformingProducts: ProductPerformance[];
    topPerformingFunnels: FunnelPerformance[];
    segmentGrowth: SegmentGrowth[];
  };
  createdAt: Timestamp;
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  productType: string;
  salesCount: number;
  revenue: number;
  conversionRate: number;
}

export interface FunnelPerformance {
  funnelId: string;
  funnelName: string;
  entriesCount: number;
  completionRate: number;
  revenue: number;
}

export interface SegmentGrowth {
  segmentId: string;
  segmentName: string;
  growthCount: number;
  growthRate: number;
}

export interface ContactLabel {
  id: string;
  creatorId: string;
  name: string;
  color: string;
  contactCount: number;
  createdAt: Timestamp;
}

export interface SafetyValidationResult {
  isValid: boolean;
  violations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const FORBIDDEN_LABEL_PATTERNS = [
  /beauty|attractive|hot|sexy|cute/i,
  /rich|wealth|money|spending/i,
  /sexual|fetish|kinky|nsfw/i,
  /relationship|dating|single|married/i,
  /vulnerable|desperate|lonely/i,
];

export const FORBIDDEN_CONTENT_PATTERNS = [
  /pay.*attention|notice.*me|exclusive.*chat/i,
  /romantic|dating|meet.*offline|sugar/i,
  /love.*you|miss.*you|thinking.*you/i,
  /paypal|venmo|cashapp|stripe|onlyfans|telegram|whatsapp/i,
  /nft|crypto|bitcoin|exclusive.*content/i,
  /escort|sugar.*daddy|sugar.*baby/i,
];

export const ALLOWED_PRODUCT_TYPES = [
  'paid_chat',
  'paid_call',
  'digital_product',
  'club',
  'challenge',
  'mentorship',
  'event',
];

export const MAX_BROADCAST_SIZE = 10000;
export const MAX_FUNNEL_STEPS = 10;
export const MAX_LABELS_PER_CONTACT = 20;