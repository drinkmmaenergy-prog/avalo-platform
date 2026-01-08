/**
 * PACK 157 — Avalo Offline Business Verification & Physical Venue Partnerships
 * TypeScript type definitions
 * 
 * CRITICAL SAFETY RULES:
 * - ZERO tolerance for romantic/dating venues
 * - ZERO tolerance for NSFW/adult entertainment
 * - NO visibility boosts in feed
 * - NO external payment links
 * - Strictly SFW professional venues only
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BUSINESS PARTNER TYPES
// ============================================================================

/**
 * Allowed business categories (STRICTLY SFW)
 */
export enum BusinessCategory {
  // Fitness & Wellness
  GYM = 'GYM',
  YOGA_STUDIO = 'YOGA_STUDIO',
  CALISTHENICS_PARK = 'CALISTHENICS_PARK',
  DANCE_STUDIO = 'DANCE_STUDIO',
  MARTIAL_ARTS = 'MARTIAL_ARTS',
  
  // Creative & Arts
  ART_STUDIO = 'ART_STUDIO',
  MUSIC_SPACE = 'MUSIC_SPACE',
  PHOTOGRAPHY_LAB = 'PHOTOGRAPHY_LAB',
  MAKER_SPACE = 'MAKER_SPACE',
  
  // Business & Coworking
  COWORKING_SPACE = 'COWORKING_SPACE',
  CONFERENCE_HALL = 'CONFERENCE_HALL',
  CAFE_WORKSHOP = 'CAFE_WORKSHOP',
  
  // Education & Learning
  TUTORING_CENTER = 'TUTORING_CENTER',
  LANGUAGE_SCHOOL = 'LANGUAGE_SCHOOL',
  
  // Beauty & Wellness (NON-SENSUAL)
  SALON = 'SALON',
  SPA = 'SPA',
  CLINIC = 'CLINIC',
  
  // Other Professional
  BOOKSTORE = 'BOOKSTORE',
  COMMUNITY_CENTER = 'COMMUNITY_CENTER',
}

/**
 * Partnership verification status
 */
export enum PartnershipStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

/**
 * Document requirements for verification
 */
export enum DocumentType {
  BUSINESS_LICENSE = 'BUSINESS_LICENSE',
  REGISTRATION_CERTIFICATE = 'REGISTRATION_CERTIFICATE',
  INSURANCE_CERTIFICATE = 'INSURANCE_CERTIFICATE',
  TAX_ID = 'TAX_ID',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  OWNER_ID = 'OWNER_ID',
}

/**
 * Safety violation types
 */
export enum ViolationType {
  NSFW_CONTENT = 'NSFW_CONTENT',
  ROMANTIC_EVENT = 'ROMANTIC_EVENT',
  DATING_THEME = 'DATING_THEME',
  EXTERNAL_PAYMENT = 'EXTERNAL_PAYMENT',
  UNAUTHORIZED_FILMING = 'UNAUTHORIZED_FILMING',
  ALCOHOL_CENTERED = 'ALCOHOL_CENTERED',
  INAPPROPRIATE_MARKETING = 'INAPPROPRIATE_MARKETING',
  CONTACT_HARVESTING = 'CONTACT_HARVESTING',
}

// ============================================================================
// BUSINESS PARTNER RECORD
// ============================================================================

export interface BusinessPartner {
  partnerId: string;
  
  // Business Information
  businessName: string;
  legalName: string;
  category: BusinessCategory;
  description: string;
  
  // Contact Information
  email: string;
  phone: string;
  website?: string;
  
  // Location
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Owner/Manager
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  
  // Verification Status
  status: PartnershipStatus;
  verificationLevel: 'NONE' | 'BASIC' | 'VERIFIED';
  
  // Documents
  uploadedDocuments: {
    type: DocumentType;
    url: string;
    uploadedAt: Timestamp;
  }[];
  
  // Review
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  rejectionReason?: string;
  
  // Safety & Compliance
  safetyScore: number; // 0-100
  violationCount: number;
  lastViolation?: Timestamp;
  suspensionReason?: string;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt?: Timestamp;
  
  // Features (NO VISIBILITY BOOST)
  canHostEvents: boolean;
  canSellTickets: boolean;
  maxEventsPerMonth: number;
  
  // Analytics (for business only, no feed impact)
  totalEventsHosted: number;
  totalAttendees: number;
  totalRevenue: number; // In tokens
}

// ============================================================================
// VENUE PROFILE
// ============================================================================

export interface VenueProfile {
  venueId: string;
  partnerId: string;
  
  // Venue Details
  venueName: string;
  category: BusinessCategory;
  description: string;
  
  // Location (same as business or different)
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Capacity & Features
  capacity: number;
  amenities: string[];
  photos: string[]; // URLs to venue photos (must be SFW)
  
  // Operating Hours
  operatingHours: {
    [day: string]: {
      open: string; // HH:MM format
      close: string;
      closed?: boolean;
    };
  };
  
  // Policies
  cancellationPolicy: string;
  accessibilityInfo?: string;
  parkingInfo?: string;
  
  // Status
  isActive: boolean;
  isVerified: boolean;
  
  // Safety
  safetyRating: number; // Based on attendee surveys
  lastSafetyCheck?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// VENUE EVENT
// ============================================================================

export interface VenueEvent {
  eventId: string;
  venueId: string;
  partnerId: string;
  
  // Event Details
  title: string;
  description: string;
  eventType: 'WORKSHOP' | 'CLASS' | 'TRAINING' | 'MEETUP' | 'CHALLENGE' | 'SEMINAR';
  
  // Hosting
  hostedBy?: string; // Creator userId (optional)
  hostName?: string;
  hostAvatar?: string;
  
  // Pricing
  priceTokens: number;
  capacity: number;
  attendeesCount: number;
  
  // Scheduling
  startTime: Timestamp;
  endTime: Timestamp;
  duration: number; // in minutes
  
  // Location (from venue)
  venueName: string;
  venueAddress: string;
  
  // Status
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  isActive: boolean;
  requiresApproval: boolean;
  
  // Safety
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  contentModerated: boolean;
  nsfwScore: number;
  romanticScore: number;
  
  // Check-in
  checkInEnabled: boolean;
  checkInCode?: string;
  checkInStartTime?: Timestamp;
  
  // Revenue Split (same as regular events: 65% creator / 35% Avalo)
  platformFeePercentage: number; // 0.35
  venueCommission: number; // Optional commission to venue (from creator's 65%)
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // userId who created the event
  
  // Tags (for filtering, NO FEED BOOST)
  tags: string[];
  region: string;
}

// ============================================================================
// VENUE ATTENDANCE
// ============================================================================

export interface VenueAttendance {
  attendanceId: string;
  eventId: string;
  venueId: string;
  
  // Attendee
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Registration
  registeredAt: Timestamp;
  registrationStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DENIED';
  
  // Payment
  tokensAmount: number;
  platformFee: number;
  creatorEarnings: number;
  venueCommission: number;
  transactionId?: string;
  
  // Check-in
  checkedIn: boolean;
  checkInTime?: Timestamp;
  checkInMethod?: 'QR_CODE' | 'MANUAL' | 'AUTO';
  qrCodeData?: string;
  
  // Safety
  riskCheckPassed: boolean;
  riskScore: number;
  denialReason?: string;
  
  // Post-event
  feedbackSubmitted: boolean;
  safetyRating?: number; // 1-5
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// VENUE SAFETY CASE
// ============================================================================

export interface VenueSafetyCase {
  caseId: string;
  venueId: string;
  partnerId: string;
  eventId?: string;
  
  // Violation
  violationType: ViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  
  // Reporter
  reportedBy?: string;
  reportedByType: 'USER' | 'SYSTEM' | 'MODERATOR' | 'AMBASSADOR';
  
  // Evidence
  evidenceUrls: string[];
  witnessStatements: string[];
  
  // Status
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED';
  
  // Resolution
  resolution?: {
    action: 'WARNING' | 'SUSPENSION' | 'REVOCATION' | 'NO_ACTION';
    notes: string;
    decidedBy: string;
    decidedAt: Timestamp;
  };
  
  // Impact
  affectedUsers: string[];
  refundsIssued: number;
  
  // Integration with Ambassador system (PACK 152)
  ambassadorNotified: boolean;
  cityLeaderNotified: boolean;
  regionalResponse?: string;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// VALIDATION & HELPERS
// ============================================================================

/**
 * Blocked keywords for romantic/NSFW events
 */
export const BLOCKED_VENUE_KEYWORDS = [
  // Dating/Romantic
  'dating', 'speed dating', 'singles', 'meetup singles', 'find love',
  'romantic', 'flirt', 'hookup', 'one night', 'casual encounter',
  
  // NSFW/Adult
  'strip', 'nude', 'naked', 'adult', 'xxx', 'erotic', 'sensual massage',
  'escort', 'prostitute', 'sex work', 'happy ending',
  
  // Suggestive
  'hot models', 'sexy', 'seductive', 'intimate encounter',
  'meet hot', 'beautiful girls', 'handsome guys to meet',
  
  // Polish equivalents
  'randki', 'szybkie randki', 'singiel', 'znajdź miłość', 'flirt',
  'klub dla singli', 'erotyczny', 'masaż erotyczny',
];

/**
 * Check if text contains blocked romantic/NSFW keywords
 */
export function containsBlockedVenueContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BLOCKED_VENUE_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Calculate romantic score (0-1, higher = more romantic)
 */
export function calculateRomanticScore(text: string): number {
  const romanticTerms = [
    'date', 'dating', 'romance', 'love', 'couple', 'singles',
    'flirt', 'attraction', 'chemistry', 'partner', 'relationship',
  ];
  
  const lowerText = text.toLowerCase();
  let score = 0;
  let matchCount = 0;
  
  romanticTerms.forEach(term => {
    const matches = (lowerText.match(new RegExp(term, 'gi')) || []).length;
    if (matches > 0) {
      score += matches * 0.2;
      matchCount += matches;
    }
  });
  
  return Math.min(1.0, score / Math.max(1, matchCount / 2));
}

/**
 * Validate business partner data
 */
export function validateBusinessPartnerData(data: Partial<BusinessPartner>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!data.businessName || data.businessName.length < 3) {
    errors.push('Business name must be at least 3 characters');
  }
  
  if (!data.legalName || data.legalName.length < 3) {
    errors.push('Legal name is required');
  }
  
  if (!data.category || !Object.values(BusinessCategory).includes(data.category)) {
    errors.push('Invalid business category');
  }
  
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email is required');
  }
  
  if (!data.phone || data.phone.length < 10) {
    errors.push('Valid phone number is required');
  }
  
  if (!data.address || !data.address.street || !data.address.city || !data.address.country) {
    errors.push('Complete address is required');
  }
  
  // Check for blocked content in description
  if (data.description && containsBlockedVenueContent(data.description)) {
    errors.push('Business description contains inappropriate content');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate venue event data
 */
export function validateVenueEventData(data: Partial<VenueEvent>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!data.title || data.title.length < 5) {
    errors.push('Event title must be at least 5 characters');
  }
  
  if (!data.description || data.description.length < 20) {
    errors.push('Event description must be at least 20 characters');
  }
  
  if (data.priceTokens !== undefined && data.priceTokens < 0) {
    errors.push('Price cannot be negative');
  }
  
  if (!data.capacity || data.capacity < 1) {
    errors.push('Capacity must be at least 1');
  }
  
  // Check for blocked content
  if (data.title && containsBlockedVenueContent(data.title)) {
    errors.push('Event title contains inappropriate romantic/NSFW content');
  }
  
  if (data.description && containsBlockedVenueContent(data.description)) {
    errors.push('Event description contains inappropriate romantic/NSFW content');
  }
  
  // Check romantic score
  const romanticScore = calculateRomanticScore(
    `${data.title || ''} ${data.description || ''}`
  );
  
  if (romanticScore > 0.3) {
    errors.push('Event appears to have romantic/dating themes which are not allowed');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if business category is allowed
 */
export function isAllowedBusinessCategory(category: string): boolean {
  return Object.values(BusinessCategory).includes(category as BusinessCategory);
}

/**
 * Get forbidden venue categories (should never be approved)
 */
export const FORBIDDEN_VENUE_TYPES = [
  'strip club',
  'escort service',
  'adult entertainment',
  'erotic massage',
  'nightclub with flirting theme',
  'dating bar',
  'singles bar',
  'sensual spa',
];

// ============================================================================
// CONFIGURATION
// ============================================================================

export const VENUE_CONFIG = {
  // Limits
  maxEventsPerMonth: 20,
  maxCapacityPerEvent: 500,
  minEventDuration: 30, // minutes
  maxEventDuration: 480, // 8 hours
  minAdvanceNotice: 24 * 60 * 60 * 1000, // 24 hours
  
  // Fees (aligned with regular events)
  platformFeePercentage: 0.35, // 35% to Avalo
  creatorEarningsPercentage: 0.65, // 65% to creator
  maxVenueCommission: 0.10, // max 10% from creator's share
  
  // Safety thresholds
  nsfwThreshold: 0.3,
  romanticThreshold: 0.3,
  violationAutoSuspendThreshold: 3,
  
  // Review
  pendingReviewTimeout: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// ERROR CODES
// ============================================================================

export const VENUE_ERROR_CODES = {
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  BLOCKED_CONTENT: 'BLOCKED_CONTENT',
  ROMANTIC_CONTENT: 'ROMANTIC_CONTENT',
  NSFW_CONTENT: 'NSFW_CONTENT',
  PARTNER_SUSPENDED: 'PARTNER_SUSPENDED',
  PARTNER_NOT_VERIFIED: 'PARTNER_NOT_VERIFIED',
  VENUE_NOT_ACTIVE: 'VENUE_NOT_ACTIVE',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  EXTERNAL_PAYMENT_DETECTED: 'EXTERNAL_PAYMENT_DETECTED',
  VIOLATION_LIMIT_EXCEEDED: 'VIOLATION_LIMIT_EXCEEDED',
} as const;

export type VenueErrorCode = typeof VENUE_ERROR_CODES[keyof typeof VENUE_ERROR_CODES];

/**
 * Custom error class for venue operations
 */
export class VenueError extends Error {
  constructor(
    public code: VenueErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'VenueError';
  }
}