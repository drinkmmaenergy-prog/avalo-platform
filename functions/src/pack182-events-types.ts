/**
 * PACK 182: Avalo Pro Event Host Suite
 * Type definitions for professional event hosting system
 * 
 * CRITICAL SAFETY RULES:
 * - Educational, lifestyle, career, fitness, or creative events ONLY
 * - Zero tolerance for romantic/NSFW/escort events
 * - Token-only payments (65% creator / 35% Avalo)
 * - Location privacy until ticket purchase
 * - No algorithm boosts or visibility manipulation
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// EVENT CATEGORIES & TYPES
// ============================================================================

/**
 * Allowed safe event categories
 */
export enum EventCategory {
  FITNESS = 'FITNESS',           // Yoga, HIIT, training
  BUSINESS = 'BUSINESS',         // Marketing, startup, career
  CREATIVE = 'CREATIVE',         // Photography, art, music
  TRAVEL = 'TRAVEL',             // Hiking, cultural tours
  LIFESTYLE = 'LIFESTYLE',       // Productivity, wellness
  ENTERTAINMENT = 'ENTERTAINMENT', // Gaming, comedy (SFW only)
}

/**
 * Event delivery format
 */
export enum EventFormat {
  IN_PERSON = 'IN_PERSON',       // Physical meetup
  ONLINE = 'ONLINE',             // Livestream/webinar
  HYBRID = 'HYBRID',             // Both online and in-person
}

/**
 * Event status lifecycle
 */
export enum EventStatus {
  DRAFT = 'DRAFT',               // Being created
  SCHEDULED = 'SCHEDULED',       // Published, accepting registrations
  LIVE = 'LIVE',                 // Currently happening
  COMPLETED = 'COMPLETED',       // Finished successfully
  CANCELLED = 'CANCELLED',       // Cancelled by host
}

/**
 * Ticket types
 */
export enum TicketType {
  STANDARD = 'STANDARD',         // Regular admission
  VIP = 'VIP',                   // Premium experience (no romantic perks)
  GROUP = 'GROUP',               // Multi-person bundle
}

/**
 * Attendee status
 */
export enum AttendeeStatus {
  REGISTERED = 'REGISTERED',     // Ticket purchased
  WAITLISTED = 'WAITLISTED',     // On waitlist
  CHECKED_IN = 'CHECKED_IN',     // Arrived at event
  NO_SHOW = 'NO_SHOW',           // Didn't attend
  CANCELLED = 'CANCELLED',       // User cancelled
  REFUNDED = 'REFUNDED',         // Refund issued
}

// ============================================================================
// CORE EVENT TYPES
// ============================================================================

/**
 * Professional event with scheduling and materials
 */
export interface ProEvent {
  eventId: string;
  
  // Host information
  hostUserId: string;
  hostName: string;
  hostAvatar?: string;
  coHosts?: EventCoHost[];
  
  // Basic details
  title: string;
  description: string;
  category: EventCategory;
  format: EventFormat;
  
  // Scheduling
  startTime: Timestamp;
  endTime: Timestamp;
  timezone: string;
  schedule?: EventScheduleBlock[];
  
  // Pricing & capacity
  ticketTypes: EventTicketType[];
  capacity: number;
  attendeeCount: number;
  waitlistCount: number;
  
  // Location (conditional access)
  region: string;
  locationDetails?: EventLocation;
  onlineDetails?: EventOnlineDetails;
  
  // Materials & resources
  materials?: EventMaterial[];
  
  // Safety & compliance
  requiresApproval: boolean;
  ageRestriction?: number; // Minimum age
  safetyRules: string[];
  
  // Status & metadata
  status: EventStatus;
  isActive: boolean;
  featuredImage?: string;
  tags: string[];
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

/**
 * Co-host with permissions
 */
export interface EventCoHost {
  userId: string;
  userName: string;
  userAvatar?: string;
  role: 'CO_HOST' | 'ASSISTANT';
  permissions: {
    canEditSchedule: boolean;
    canManageAttendees: boolean;
    canCheckIn: boolean;
    canPostAnnouncements: boolean;
  };
  addedAt: Timestamp;
}

/**
 * Schedule block for event agenda
 */
export interface EventScheduleBlock {
  blockId: string;
  title: string;
  description?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  hostUserId: string; // Who's leading this segment
  materials?: string[]; // Material IDs
  isBreak: boolean;
}

/**
 * Ticket type configuration
 */
export interface EventTicketType {
  ticketTypeId: string;
  name: string; // "Standard", "VIP", "Early Bird"
  description?: string;
  priceTokens: number;
  capacity?: number; // Max tickets of this type
  soldCount: number;
  perks?: string[]; // Non-romantic perks only
  isAvailable: boolean;
}

/**
 * Physical location details (hidden until ticket purchase)
 */
export interface EventLocation {
  venue?: string;
  address: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  accessInstructions?: string;
  // Address hidden until 24-72h before event
  addressRevealTime?: Timestamp;
}

/**
 * Online event details
 */
export interface EventOnlineDetails {
  platform: 'ZOOM' | 'GOOGLE_MEET' | 'AVALO_STREAM' | 'OTHER';
  joinUrl?: string; // Hidden until event start
  meetingId?: string;
  passcode?: string;
  streamingLink?: string;
  isRecorded: boolean;
}

/**
 * Event material (PDF, video, etc.)
 */
export interface EventMaterial {
  materialId: string;
  title: string;
  description?: string;
  type: 'PDF' | 'VIDEO' | 'AUDIO' | 'LINK' | 'FILE';
  fileUrl: string;
  fileSize?: number;
  isPreviewable: boolean;
  availableAt: 'BEFORE' | 'DURING' | 'AFTER'; // When attendees can access
  uploadedAt: Timestamp;
}

// ============================================================================
// TICKET & ATTENDANCE
// ============================================================================

/**
 * Event ticket purchase
 */
export interface EventTicket {
  ticketId: string;
  eventId: string;
  eventTitle: string;
  
  // Purchaser
  userId: string;
  userName: string;
  userEmail?: string;
  
  // Ticket details
  ticketTypeId: string;
  ticketTypeName: string;
  priceTokens: number;
  
  // Revenue split
  platformFee: number; // 35%
  hostEarnings: number; // 65%
  
  // Status
  status: AttendeeStatus;
  
  // Check-in
  checkInCode: string; // QR code
  checkedInAt?: Timestamp;
  checkedInBy?: string; // Host/co-host who checked in
  
  // Access control
  hasLocationAccess: boolean;
  hasOnlineAccess: boolean;
  
  // Transactions
  purchaseTransactionId: string;
  refundTransactionId?: string;
  
  // Timestamps
  purchasedAt: Timestamp;
  cancelledAt?: Timestamp;
}

/**
 * Waitlist entry
 */
export interface EventWaitlist {
  waitlistId: string;
  eventId: string;
  userId: string;
  userName: string;
  ticketTypeId: string;
  
  position: number;
  notified: boolean;
  notifiedAt?: Timestamp;
  
  // Expiry for notification response
  expiresAt?: Timestamp;
  
  joinedAt: Timestamp;
}

// ============================================================================
// POST-EVENT FEATURES
// ============================================================================

/**
 * Event feedback and rating
 */
export interface EventFeedback {
  feedbackId: string;
  eventId: string;
  userId: string;
  
  // Ratings (1-5)
  overallRating: number;
  contentQuality: number;
  hostPerformance: number;
  venueRating?: number; // For in-person events
  
  // Safety check
  feltSafe: boolean;
  matchedDescription: boolean;
  wouldRecommend: boolean;
  
  // Text feedback
  positiveComments?: string;
  improvementSuggestions?: string;
  
  // Red flags
  reportConcern: boolean;
  concernDetails?: string;
  
  submittedAt: Timestamp;
}

/**
 * Event certificate of completion
 */
export interface EventCertificate {
  certificateId: string;
  eventId: string;
  eventTitle: string;
  userId: string;
  userName: string;
  
  // Certificate details
  completionDate: Timestamp;
  certificateUrl: string; // PDF URL
  verificationCode: string; // For authenticity check
  
  issuedAt: Timestamp;
}

/**
 * Event photo gallery (SFW only)
 */
export interface EventGallery {
  galleryId: string;
  eventId: string;
  
  photos: EventPhoto[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Gallery photo
 */
export interface EventPhoto {
  photoId: string;
  uploadedBy: string; // Host or attendee
  photoUrl: string;
  caption?: string;
  isModerated: boolean;
  isFeatured: boolean;
  uploadedAt: Timestamp;
}

// ============================================================================
// SAFETY & MODERATION
// ============================================================================

/**
 * Event safety log entry
 */
export interface EventSafetyLog {
  logId: string;
  eventId: string;
  
  logType: 'RISK_FLAG' | 'ATTENDEE_DENIED' | 'INCIDENT_REPORTED' | 'SAFETY_CONCERN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  description: string;
  userId?: string; // User involved
  reportedBy?: string;
  
  actionTaken?: string;
  resolvedAt?: Timestamp;
  
  createdAt: Timestamp;
}

/**
 * Blocked event patterns (blacklist)
 */
export interface BlockedEventPattern {
  patternId: string;
  pattern: string; // Regex or keyword
  category: 'ROMANTIC' | 'NSFW' | 'ESCORT' | 'ILLEGAL' | 'SCAM';
  severity: 'HIGH' | 'CRITICAL';
  
  createdAt: Timestamp;
}

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * Event analytics snapshot
 */
export interface EventAnalytics {
  eventId: string;
  
  // Registration metrics
  totalTicketsSold: number;
  totalRevenue: number;
  hostEarnings: number;
  platformFee: number;
  
  // Attendance metrics
  registeredCount: number;
  checkedInCount: number;
  noShowCount: number;
  attendanceRate: number;
  
  // Engagement metrics
  feedbackCount: number;
  averageRating: number;
  recommendationRate: number;
  
  // Safety metrics
  safetyIncidents: number;
  concernReports: number;
  
  snapshotAt: Timestamp;
}

// ============================================================================
// VALIDATION & CONFIGURATION
// ============================================================================

/**
 * Event creation/update validation result
 */
export interface EventValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Event configuration constants
 */
export const EVENT_CONFIG = {
  // Timing constraints
  minDuration: 30 * 60 * 1000,           // 30 minutes
  maxDuration: 8 * 60 * 60 * 1000,       // 8 hours
  minAdvanceNotice: 24 * 60 * 60 * 1000, // 24 hours
  maxAdvanceNotice: 180 * 24 * 60 * 60 * 1000, // 180 days
  
  // Address reveal timing
  addressRevealMinHours: 24,
  addressRevealMaxHours: 72,
  
  // Pricing
  minPriceTokens: 0,  // Free events allowed
  maxPriceTokens: 50000,
  platformFeePercentage: 0.35, // 35%
  hostEarningsPercentage: 0.65, // 65%
  
  // Capacity
  minCapacity: 1,
  maxCapacity: 10000,
  
  // Safety
  requiresBackgroundCheck: true,
  autoBlockHighRiskUsers: true,
  
  // Refunds
  hostCancelRefundPercentage: 1.0,   // 100% refund
  userCancelRefundPercentage: 0.0,   // No refund
  
  // Check-in
  checkInCodeLength: 8,
  checkInWindowBeforeMinutes: 30,
  checkInWindowAfterMinutes: 60,
};

/**
 * Blocked keywords for NSFW/romantic content detection
 */
export const BLOCKED_KEYWORDS = [
  // Romantic/dating
  'date', 'dating', 'romance', 'romantic', 'flirt', 'flirting',
  'girlfriend', 'boyfriend', 'sugar', 'escort', 'companion',
  'intimacy', 'intimate', 'cuddle', 'kiss', 'makeout',
  
  // NSFW
  'adult', 'sexy', 'hot', 'seduction', 'sensual',
  'lingerie', 'nude', 'naked', 'nsfw', 'xxx',
  
  // Escort coded
  'gfe', 'pse', 'meet and greet', 'private time',
  'one on one', '1on1', 'exclusive access',
  
  // Jealousy/hierarchy
  'vip meet', 'private meet', 'get closer', 'special access',
  'favorite fan', 'top supporter',
];

/**
 * Safe event examples by category
 */
export const SAFE_EVENT_EXAMPLES = {
  FITNESS: [
    'Morning Yoga Flow',
    'HIIT Bootcamp Challenge',
    'Marathon Training Group',
    '5K Fun Run',
  ],
  BUSINESS: [
    'Digital Marketing Workshop',
    'Startup Pitch Practice',
    'LinkedIn Networking Event',
    'Career Development Seminar',
  ],
  CREATIVE: [
    'Street Photography Walk',
    'Watercolor Painting Class',
    'Music Production Basics',
    'Creative Writing Workshop',
  ],
  TRAVEL: [
    'Mountain Hiking Adventure',
    'City Cultural Tour',
    'Food Tasting Walk',
    'Historical Landmarks Visit',
  ],
  LIFESTYLE: [
    'Productivity Masterclass',
    'Mindfulness Meditation',
    'Personal Finance 101',
    'Healthy Cooking Demo',
  ],
  ENTERTAINMENT: [
    'Gaming Tournament',
    'Stand-Up Comedy Night',
    'Trivia Competition',
    'Board Game Meetup',
  ],
};

/**
 * Helper function to validate event data
 */
export function validateEventData(event: Partial<ProEvent>): EventValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Title validation
  if (!event.title || event.title.length < 5) {
    errors.push('Title must be at least 5 characters');
  }
  if (event.title && event.title.length > 100) {
    errors.push('Title must be less than 100 characters');
  }
  
  // Description validation
  if (!event.description || event.description.length < 20) {
    errors.push('Description must be at least 20 characters');
  }
  if (event.description && event.description.length > 5000) {
    errors.push('Description must be less than 5000 characters');
  }
  
  // Category validation
  if (event.category && !Object.values(EventCategory).includes(event.category)) {
    errors.push('Invalid event category');
  }
  
  // Ticket pricing validation
  if (event.ticketTypes) {
    event.ticketTypes.forEach((ticket, index) => {
      if (ticket.priceTokens < EVENT_CONFIG.minPriceTokens) {
        errors.push(`Ticket ${index + 1}: Price cannot be negative`);
      }
      if (ticket.priceTokens > EVENT_CONFIG.maxPriceTokens) {
        errors.push(`Ticket ${index + 1}: Price exceeds maximum (${EVENT_CONFIG.maxPriceTokens} tokens)`);
      }
    });
  }
  
  // Capacity validation
  if (event.capacity) {
    if (event.capacity < EVENT_CONFIG.minCapacity) {
      errors.push(`Capacity must be at least ${EVENT_CONFIG.minCapacity}`);
    }
    if (event.capacity > EVENT_CONFIG.maxCapacity) {
      errors.push(`Capacity cannot exceed ${EVENT_CONFIG.maxCapacity}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if text contains blocked keywords
 */
export function containsBlockedKeywords(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  return BLOCKED_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Generate unique check-in code
 */
export function generateCheckInCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < EVENT_CONFIG.checkInCodeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Calculate revenue split
 */
export function calculateRevenueSplit(priceTokens: number): {
  platformFee: number;
  hostEarnings: number;
} {
  const platformFee = Math.floor(priceTokens * EVENT_CONFIG.platformFeePercentage);
  const hostEarnings = priceTokens - platformFee;
  
  return { platformFee, hostEarnings };
}

console.log('✅ PACK 182 Event Types loaded - Professional Event Hosting System');