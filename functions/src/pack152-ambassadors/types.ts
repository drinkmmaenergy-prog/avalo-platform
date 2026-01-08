/**
 * PACK 152 - Global Ambassadors & City Leaders Program
 * Type definitions for offline community growth
 * 
 * ZERO ROMANCE/NSFW/ATTENTION-FOR-PAYMENT DYNAMICS
 */

export interface AmbassadorProfile {
  userId: string;
  status: 'pending' | 'approved' | 'active' | 'suspended' | 'revoked';
  role: 'ambassador' | 'city_leader' | 'regional_manager';
  
  // Location
  city: string;
  country: string;
  countryCode: string;
  timezone: string;
  
  // Training & Compliance
  trainingCompleted: boolean;
  trainingCompletedAt?: Date;
  complianceSignedAt: Date;
  lastBackgroundCheck?: Date;
  
  // Performance (business metrics only)
  eventsHosted: number;
  usersOnboarded: number;
  creatorsOnboarded: number;
  totalAttendees: number;
  averageSatisfactionScore: number;
  
  // Earnings
  totalTokensEarned: number;
  pendingTokens: number;
  
  // Admin
  approvedBy?: string;
  approvedAt?: Date;
  revokedBy?: string;
  revokedAt?: Date;
  revokedReason?: string;
  supervisorId?: string; // City Leader ID for Ambassadors
  
  createdAt: Date;
  updatedAt: Date;
}

export type EventType = 
  | 'wellness_workshop'
  | 'fitness_meetup'
  | 'photography_walk'
  | 'creator_collaboration'
  | 'business_networking'
  | 'beauty_masterclass'
  | 'creator_growth_seminar'
  | 'outdoor_challenge'
  | 'tech_gaming_night'
  | 'skill_workshop'
  | 'professional_networking';

export interface AmbassadorEvent {
  eventId: string;
  ambassadorId: string;
  ambassadorRole: 'ambassador' | 'city_leader';
  
  // Event Details
  title: string;
  description: string;
  eventType: EventType;
  
  // Location
  venue: string;
  address: string;
  city: string;
  country: string;
  countryCode: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  
  // Schedule
  startTime: Date;
  endTime: Date;
  timezone: string;
  
  // Capacity
  maxAttendees: number;
  registeredCount: number;
  attendedCount: number;
  
  // Safety & Compliance
  safetyRulesUrl: string;
  photographyConsentRequired: boolean;
  ageRestriction: number; // Minimum age (default 18)
  status: 'draft' | 'pending_approval' | 'approved' | 'active' | 'completed' | 'cancelled';
  
  // Validation flags
  complianceApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  
  // QR Check-in
  checkInQRCode: string;
  checkInEnabled: boolean;
  
  // Ticket pricing (optional)
  ticketPrice?: number;
  currency?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface EventAttendance {
  attendanceId: string;
  eventId: string;
  userId: string;
  ambassadorId: string;
  
  // Registration
  registeredAt: Date;
  
  // Check-in
  checkedIn: boolean;
  checkInTime?: Date;
  checkInMethod: 'qr_code' | 'manual';
  
  // Safety Confirmations
  safetyRulesAccepted: boolean;
  photographyConsentGiven: boolean;
  
  // Feedback
  satisfactionScore?: number; // 1-5
  feedback?: string;
  
  // Creator Onboarding
  newCreatorOnboarded: boolean;
  newUserOnboarded: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorPerformance {
  ambassadorId: string;
  period: string; // YYYY-MM format
  
  // Event Metrics
  eventsHosted: number;
  totalAttendees: number;
  averageAttendance: number;
  averageSatisfactionScore: number;
  
  // Growth Metrics
  newUsersOnboarded: number;
  newCreatorsOnboarded: number;
  verifiedCreators: number;
  
  // Revenue Impact (aggregated, not personal)
  estimatedCreatorRevenueUplift: number;
  ticketRevenue: number;
  
  // Earnings
  tokensEarned: number;
  tokensPending: number;
  
  // Compliance
  complianceViolations: number;
  warningsIssued: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CityLeaderReport {
  cityLeaderId: string;
  city: string;
  country: string;
  period: string; // YYYY-MM format
  
  // Team Metrics
  activeAmbassadors: number;
  totalEventsHosted: number;
  totalAttendees: number;
  
  // Growth
  newUsersOnboarded: number;
  newCreatorsOnboarded: number;
  
  // Compliance
  complianceViolations: number;
  ambassadorsSuspended: number;
  ambassadorsRevoked: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorApplication {
  applicationId: string;
  userId: string;
  
  // Application Details
  city: string;
  country: string;
  countryCode: string;
  timezone: string;
  
  // Motivation
  motivation: string;
  experienceDescription: string;
  
  // Background
  identityVerified: boolean;
  backgroundCheckCompleted: boolean;
  over18: boolean;
  
  // Status
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorTrainingModule {
  moduleId: string;
  title: string;
  description: string;
  order: number;
  
  // Content
  contentType: 'video' | 'article' | 'quiz';
  contentUrl: string;
  duration: number; // minutes
  
  // Requirements
  required: boolean;
  passingScore?: number; // for quizzes
  
  // Topics covered
  topics: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorTrainingProgress {
  userId: string;
  moduleId: string;
  
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  
  // For quizzes
  score?: number;
  attempts: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorEarningsRecord {
  recordId: string;
  ambassadorId: string;
  
  // Earning Source
  sourceType: 'event_hosted' | 'user_onboarded' | 'creator_onboarded' | 'ticket_revenue';
  sourceId: string; // eventId or userId
  
  // Amount
  tokensEarned: number;
  status: 'pending' | 'approved' | 'paid' | 'disputed';
  
  // Verification
  verifiedBy?: string;
  verifiedAt?: Date;
  
  // Payment
  paidAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorComplianceIncident {
  incidentId: string;
  ambassadorId: string;
  eventId?: string;
  
  // Incident Details
  incidentType: 'romantic_theme' | 'nsfw_content' | 'harassment' | 'safety_violation' | 'unauthorized_photography' | 'alcohol_misuse' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  
  // Evidence
  reportedBy: string;
  evidenceUrls: string[];
  witnessStatements: string[];
  
  // Investigation
  investigatedBy?: string;
  investigationNotes?: string;
  investigationCompletedAt?: Date;
  
  // Resolution
  status: 'reported' | 'under_investigation' | 'resolved' | 'dismissed';
  resolution?: 'warning' | 'suspension' | 'revocation' | 'no_action';
  resolutionNotes?: string;
  resolvedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

// Forbidden event patterns (for validation)
export const FORBIDDEN_EVENT_PATTERNS: string[] = [
  'speed dating',
  'singles',
  'meet beautiful',
  'romantic',
  'flirt',
  'hookup',
  'dating',
  'intimacy',
  'sensual',
  'sexy',
  'hot',
  'mingle',
  'kink',
  'fetish',
  'escort',
  'sugar',
  '18+',
  'adults only',
  'after dark',
  'night club',
  'bar crawl'
];

// Approved event keywords
export const APPROVED_EVENT_KEYWORDS: string[] = [
  'wellness',
  'fitness',
  'photography',
  'creator',
  'business',
  'networking',
  'beauty',
  'masterclass',
  'seminar',
  'workshop',
  'skill',
  'professional',
  'tech',
  'gaming',
  'outdoor',
  'challenge',
  'collaboration',
  'growth'
];