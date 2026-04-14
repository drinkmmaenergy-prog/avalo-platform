import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Types for content moderation
export interface ModerationLabels  {
  adult?: number;
  violence?: number;
  racy?: number;
  spoof?: number;
  medical?: number;
  illegal?: number;
  minorPresence?: number;
  selfHarm?: number;
  hateful?: number;
  [key: string]: any;
}

export interface ModerationResult  {
  safe?: boolean;
  labels?: ModerationLabels;
  confidence?: number;
  action?: ModerationAction;
  decision?: ModerationDecision;
  reason?: string;
  shouldEscalate?: boolean;
  [key: string]: any;
}

export interface ModerationContext  {
  userId?: string;
  contentType?: string | ModeratedContentType;
  source?: string;
  isAdultVerified?: boolean;
  associatedId?: string;
  metadata?: any;
  [key: string]: any;
}

export type ModerationDecision = 
  | 'ALLOW' 
  | 'FLAG' 
  | 'BLOCK' 
  | 'REVIEW' 
  | 'ESCALATE' 
  | 'PENDING'
  | 'AUTO_BLOCK'
  | 'REVIEW_REQUIRED'
  | 'RESTRICT';

export interface ContentModerationRecord  {
  id?: string;
  contentId?: string;
  userId?: string;
  result?: ModerationResult;
  decision?: ModerationDecision;
  createdAt?: any;
  updatedAt?: any;
  mediaUrl?: string;
  reason?: string;
  labels?: ModerationLabels;
  reviewedByAdmin?: any;
  reviewedAt?: any;
  [key: string]: any;
}

export type ModerationAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW' | 'ESCALATE';

export type ModeratedContentType = 
  | 'image' 
  | 'video' 
  | 'text' 
  | 'audio' 
  | 'profile' 
  | 'message'
  | 'PPM_MEDIA'
  | 'POST_MEDIA'
  | 'PROFILE_PHOTO'
  | 'CAROUSEL_PHOTO'
  | 'AI_COMPANION_AVATAR'
  | 'VERIFICATION_PHOTO'
  | 'MESSAGE_MEDIA'
  | 'CHAT_MESSAGE'
  | 'PROFILE_BIO'
  | 'STORY_MEDIA'
  | 'LIVE_STREAM';

export interface AdminReviewRequest  {
  contentId: string;
  reviewerId: string;
  decision: ModerationDecision;
  reason?: string;
  notes?: string;
  [key: string]: any;
}

export interface ModerationQueueItem  {
  id?: string;
  contentId: string;
  contentType: ModeratedContentType;
  userId: string;
  flaggedAt?: any;
  uploadedAt?: any;
  mediaUrl?: string;
  priority: number | 'HIGH' | 'MEDIUM' | 'LOW';
  status?: 'pending' | 'in_review' | 'resolved';
  assignedTo?: string;
  labels: ModerationLabels;
  [key: string]: any;
}




























