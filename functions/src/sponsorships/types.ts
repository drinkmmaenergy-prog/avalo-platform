/**
 * PACK 151 - Sponsorship Marketplace Types
 * Ethical brand-creator collaboration system
 */

export type SponsorshipDealType =
  | 'product_placement'
  | 'branded_content'
  | 'challenge_sponsorship'
  | 'event_sponsorship'
  | 'curriculum_sponsorship';

export type SponsorshipStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'awaiting_approval'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type DeliverableType = 'post' | 'reel' | 'event' | 'challenge' | 'curriculum';

export type DeliverableStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface SponsorshipOffer {
  id: string;
  brandId: string;
  brandName: string;
  brandLogo?: string;
  title: string;
  description: string;
  dealType: SponsorshipDealType;
  status: SponsorshipStatus;
  
  requirements: {
    minFollowers?: number;
    categories?: string[];
    regions?: string[];
    deliverableCount: number;
    deliverableTypes: DeliverableType[];
    timeline: string;
    reviewRights: boolean;
  };
  
  compensation: {
    amount: number;
    currency: string;
    useTokens: boolean;
    splitRatio?: { creator: number; platform: number };
  };
  
  maxCreators: number;
  currentCreators: number;
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
    isActive: boolean;
  };
  
  safetyFlags: {
    hasRomanticContent: boolean;
    hasNSFWContent: boolean;
    hasExternalLinks: boolean;
    isVerified: boolean;
  };
}

export interface SponsorshipContract {
  id: string;
  offerId: string;
  brandId: string;
  creatorId: string;
  
  status: SponsorshipStatus;
  
  deliverables: {
    type: DeliverableType;
    description: string;
    deadline: Date;
    status: DeliverableStatus;
  }[];
  
  compensation: {
    amount: number;
    currency: string;
    useTokens: boolean;
    escrowId?: string;
    paidAt?: Date;
  };
  
  agreement: {
    acceptedAt: Date;
    termsVersion: string;
    deliverableCount: number;
    timeline: string;
  };
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  };
}

export interface SponsorshipDeliverable {
  id: string;
  contractId: string;
  offerId: string;
  creatorId: string;
  brandId: string;
  
  type: DeliverableType;
  description: string;
  
  content: {
    contentId?: string;
    contentType?: string;
    url?: string;
    caption?: string;
    mediaUrls?: string[];
  };
  
  status: DeliverableStatus;
  
  review: {
    submittedAt?: Date;
    reviewedAt?: Date;
    approvedBy?: string;
    rejectionReason?: string;
    revisionRequested?: boolean;
  };
  
  safetyCheck: {
    hasRomanticContent: boolean;
    hasNSFWContent: boolean;
    hasExternalLinks: boolean;
    hasSeductivePosing: boolean;
    passed: boolean;
    checkedAt?: Date;
  };
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    deadline: Date;
  };
}

export interface SponsorshipReview {
  id: string;
  contractId: string;
  offerId: string;
  reviewerId: string;
  revieweeId: string;
  reviewerType: 'brand' | 'creator';
  
  rating: number;
  
  criteria: {
    timeliness: number;
    quality: number;
    professionalism: number;
    communication: number;
  };
  
  comment?: string;
  
  metadata: {
    createdAt: Date;
    isPublic: boolean;
  };
}

export interface SponsorshipApplication {
  id: string;
  offerId: string;
  creatorId: string;
  brandId: string;
  
  status: 'pending' | 'approved' | 'rejected';
  
  portfolio: {
    recentWork: string[];
    followerCount: number;
    engagementRate: number;
    categories: string[];
  };
  
  message?: string;
  
  metadata: {
    appliedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
  };
}

export interface SponsorshipAnalytics {
  contractId: string;
  offerId: string;
  creatorId: string;
  period: {
    start: Date;
    end: Date;
  };
  
  performance: {
    viewCount: number;
    clickThrough: number;
    salesAttributed: number;
    revenue: number;
    engagement: number;
  };
  
  demographics: {
    regionBreakdown: Record<string, number>;
    ageBreakdown: Record<string, number>;
    retentionImpact: number;
  };
  
  metadata: {
    lastUpdated: Date;
  };
}

export interface SponsorshipEarnings {
  creatorId: string;
  totalEarnings: number;
  currency: string;
  
  breakdown: {
    completed: number;
    pending: number;
    inEscrow: number;
  };
  
  history: {
    contractId: string;
    amount: number;
    completedAt: Date;
    paidOut: boolean;
  }[];
  
  metadata: {
    lastUpdated: Date;
  };
}

export interface CreateSponsorshipOfferInput {
  brandId: string;
  title: string;
  description: string;
  dealType: SponsorshipDealType;
  requirements: SponsorshipOffer['requirements'];
  compensation: SponsorshipOffer['compensation'];
  maxCreators: number;
  expiresAt?: Date;
}

export interface ApplyToSponsorshipInput {
  offerId: string;
  creatorId: string;
  message?: string;
  portfolioItems: string[];
}

export interface SubmitDeliverableInput {
  contractId: string;
  deliverableId: string;
  content: {
    contentId: string;
    contentType: string;
    caption?: string;
  };
}

export interface ReviewDeliverableInput {
  deliverableId: string;
  approved: boolean;
  rejectionReason?: string;
  revisionRequested?: boolean;
}

export interface RateSponsorshipInput {
  contractId: string;
  reviewerId: string;
  reviewerType: 'brand' | 'creator';
  rating: number;
  criteria: SponsorshipReview['criteria'];
  comment?: string;
}

export interface SponsorshipSafetyViolation {
  type: 'romantic' | 'nsfw' | 'seductive' | 'external_links' | 'attention_funnel';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detected: Date;
  evidence?: string[];
}

export interface SponsorshipModeration {
  targetId: string;
  targetType: 'offer' | 'contract' | 'deliverable' | 'review';
  moderatorId: string;
  
  action: 'approved' | 'rejected' | 'flagged' | 'banned';
  reason?: string;
  violations?: SponsorshipSafetyViolation[];
  
  escalationLevel: number;
  
  metadata: {
    reviewedAt: Date;
    notes?: string;
  };
}