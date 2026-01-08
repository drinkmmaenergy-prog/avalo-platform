/**
 * PACK 198 — Avalo Webinars & Global Skill Summits
 * Professional Livestream Conferences with Real-Time Translation
 * Zero Parasocial or NSFW Monetization
 */

import { Timestamp } from 'firebase-admin/firestore';

export enum EventCategory {
  BUSINESS = 'business',
  FITNESS = 'fitness',
  NUTRITION = 'nutrition',
  SOCIAL_MEDIA = 'social_media',
  PERSONAL_DEVELOPMENT = 'personal_development',
  MUSIC_ART = 'music_art',
  GAMING = 'gaming',
  TRAVEL_CULTURE = 'travel_culture',
}

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export enum TicketType {
  SINGLE = 'single',
  MULTI_EVENT_PASS = 'multi_event_pass',
  BOOTCAMP = 'bootcamp',
  CERTIFICATE = 'certificate',
}

export enum AttendeeRole {
  HOST = 'host',
  PRESENTER = 'presenter',
  MODERATOR = 'moderator',
  ATTENDEE = 'attendee',
}

export enum QuestionStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
  DISMISSED = 'dismissed',
}

export enum ModerationAction {
  WARNING = 'warning',
  SHADOW_MUTE = 'shadow_mute',
  BLOCK = 'block',
}

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  category: EventCategory;
  status: EventStatus;
  thumbnailUrl?: string;
  bannerUrl?: string;
  
  // Scheduling
  scheduledStartTime: Timestamp;
  scheduledEndTime: Timestamp;
  actualStartTime?: Timestamp;
  actualEndTime?: Timestamp;
  timezone: string;
  
  // Ticketing
  ticketType: TicketType;
  price: number;
  currency: string;
  maxAttendees?: number;
  soldTickets: number;
  
  // Features
  enableChat: boolean;
  enableQA: boolean;
  enablePolls: boolean;
  enableBreakoutRooms: boolean;
  enableDownloadables: boolean;
  enableCertificate: boolean;
  
  // Translation
  primaryLanguage: string;
  enableTranslation: boolean;
  supportedLanguages: string[];
  glossaryId?: string;
  
  // Replay
  allowReplay: boolean;
  replayUrl?: string;
  replayExpiresAt?: Timestamp;
  
  // Moderation
  toxicityThreshold: number;
  autoModeration: boolean;
  
  // Metadata
  tags: string[];
  presenters: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Analytics
  totalViews: number;
  peakConcurrentViewers: number;
  averageWatchTime: number;
  
  // Revenue (65% creator / 35% Avalo)
  totalRevenue: number;
  creatorShare: number;
  platformShare: number;
}

export interface EventTicket {
  id: string;
  eventId: string;
  userId: string;
  ticketType: TicketType;
  price: number;
  currency: string;
  
  // Payment
  paymentIntentId: string;
  paymentStatus: 'pending' | 'completed' | 'refunded';
  purchasedAt: Timestamp;
  
  // Access
  accessGranted: boolean;
  accessCode: string;
  expiresAt?: Timestamp;
  
  // Multi-event pass
  eventsIncluded?: string[];
  eventsAttended?: string[];
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventSession {
  id: string;
  eventId: string;
  userId: string;
  
  // Session tracking
  joinedAt: Timestamp;
  leftAt?: Timestamp;
  duration: number;
  
  // Role
  role: AttendeeRole;
  
  // Engagement
  messagesPosted: number;
  questionsAsked: number;
  pollsAnswered: number;
  
  // Quality
  connectionQuality: 'excellent' | 'good' | 'poor';
  buffering: number;
  
  // Moderation
  warnings: number;
  muted: boolean;
  blocked: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventMaterial {
  id: string;
  eventId: string;
  uploaderId: string;
  
  // File info
  type: 'slides' | 'document' | 'worksheet' | 'certificate_template' | 'glossary';
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  
  // Access
  availableAt?: Timestamp;
  availableAfterFunding?: number;
  downloadable: boolean;
  
  // Copyright check
  copyrightChecked: boolean;
  copyrightStatus: 'clear' | 'flagged' | 'reviewing';
  
  // Metadata
  description?: string;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventTranslation {
  id: string;
  eventId: string;
  
  // Language pair
  sourceLanguage: string;
  targetLanguage: string;
  
  // Translation data
  subtitles: Record<string, string>;
  audioStreamUrl?: string;
  
  // Glossary
  customTerms: Record<string, string>;
  
  // Quality
  accuracy: number;
  reviewStatus: 'automated' | 'human_reviewed';
  
  // Restrictions
  containsBlockedContent: boolean;
  blockedReasons?: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventChatMessage {
  id: string;
  eventId: string;
  userId: string;
  sessionId: string;
  
  // Message content
  content: string;
  type: 'text' | 'system' | 'question' | 'poll_response';
  
  // Moderation
  toxicityScore: number;
  flagged: boolean;
  hidden: boolean;
  moderatedBy?: string;
  moderationReason?: string;
  
  // Reply
  replyToId?: string;
  
  // Metadata
  timestamp: Timestamp;
  translated?: Record<string, string>;
}

export interface EventQuestion {
  id: string;
  eventId: string;
  userId: string;
  sessionId: string;
  
  // Question
  question: string;
  status: QuestionStatus;
  
  // Voting
  upvotes: number;
  upvotedBy: string[];
  
  // Answer
  answeredBy?: string;
  answer?: string;
  answeredAt?: Timestamp;
  
  // Priority
  isPaid: boolean;
  paidAmount?: number;
  priority: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventPoll {
  id: string;
  eventId: string;
  createdBy: string;
  
  // Poll
  question: string;
  options: string[];
  
  // Results
  votes: Record<string, number>;
  voterIds: string[];
  
  // Settings
  allowMultiple: boolean;
  anonymous: boolean;
  
  // Timing
  startTime: Timestamp;
  endTime?: Timestamp;
  active: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventModerationFlag {
  id: string;
  eventId: string;
  
  // Target
  targetType: 'message' | 'question' | 'user' | 'content';
  targetId: string;
  userId: string;
  
  // Flag
  flagType: 'harassment' | 'spam' | 'toxicity' | 'inappropriate' | 'copyright';
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Detection
  autoDetected: boolean;
  detectionScore: number;
  detectionReasons: string[];
  
  // Action taken
  action?: ModerationAction;
  actionBy?: string;
  actionAt?: Timestamp;
  
  // Review
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventCertificate {
  id: string;
  eventId: string;
  userId: string;
  
  // Certificate
  certificateUrl: string;
  certificateCode: string;
  
  // Verification
  verified: boolean;
  verificationUrl: string;
  
  // Requirements
  attendancePercentage: number;
  completedActivities: string[];
  
  // Metadata
  issuedAt: Timestamp;
  expiresAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventBreakoutRoom {
  id: string;
  eventId: string;
  
  // Room
  name: string;
  topic?: string;
  maxParticipants?: number;
  
  // Participants
  participants: string[];
  moderators: string[];
  
  // Status
  active: boolean;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventAnalytics {
  eventId: string;
  timestamp: Timestamp;
  
  // Viewers
  currentViewers: number;
  peakViewers: number;
  totalUniqueViewers: number;
  
  // Engagement
  messagesPerMinute: number;
  questionsAsked: number;
  pollsAnswered: number;
  
  // Revenue
  ticketsSold: number;
  revenueGenerated: number;
  
  // Quality
  averageConnectionQuality: number;
  bufferingEvents: number;
  
  // Geography
  viewersByCountry: Record<string, number>;
  viewersByLanguage: Record<string, number>;
  
  // Moderation
  flaggedMessages: number;
  blockedUsers: number;
  toxicityAverage: number;
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: EventCategory;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  timezone: string;
  ticketType: TicketType;
  price: number;
  currency: string;
  maxAttendees?: number;
  enableChat: boolean;
  enableQA: boolean;
  enablePolls: boolean;
  enableBreakoutRooms: boolean;
  enableDownloadables: boolean;
  enableCertificate: boolean;
  primaryLanguage: string;
  enableTranslation: boolean;
  supportedLanguages: string[];
  allowReplay: boolean;
  tags: string[];
  presenters: string[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: EventCategory;
  scheduledStartTime?: Date;
  scheduledEndTime?: Date;
  timezone?: string;
  price?: number;
  maxAttendees?: number;
  enableChat?: boolean;
  enableQA?: boolean;
  enablePolls?: boolean;
  enableBreakoutRooms?: boolean;
  enableDownloadables?: boolean;
  enableCertificate?: boolean;
  supportedLanguages?: string[];
  allowReplay?: boolean;
  tags?: string[];
  presenters?: string[];
  status?: EventStatus;
}

export interface PurchaseTicketInput {
  eventId: string;
  ticketType: TicketType;
  paymentMethodId: string;
  eventsIncluded?: string[];
}

export interface JoinEventInput {
  eventId: string;
  accessCode: string;
}

export interface SubmitQuestionInput {
  eventId: string;
  question: string;
  isPaid: boolean;
  paidAmount?: number;
}

export interface CreatePollInput {
  eventId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
  duration?: number;
}

export interface VotePollInput {
  eventId: string;
  pollId: string;
  optionIndexes: number[];
}

export interface SendMessageInput {
  eventId: string;
  content: string;
  replyToId?: string;
}

export interface UploadMaterialInput {
  eventId: string;
  type: 'slides' | 'document' | 'worksheet' | 'certificate_template' | 'glossary';
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadable: boolean;
  availableAt?: Date;
  availableAfterFunding?: number;
  description?: string;
}

export interface ModerateContentInput {
  eventId: string;
  targetType: 'message' | 'question' | 'user';
  targetId: string;
  action: ModerationAction;
  reason: string;
}

export interface GenerateCertificateInput {
  eventId: string;
  userId: string;
}