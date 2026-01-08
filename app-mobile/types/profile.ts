/**
 * PACK 276 - Profile Engine Types
 * Complete profile schema with face-first photos, gender, preferences, verification, and safety flags
 */

export type Gender = 'male' | 'female' | 'nonbinary';
export type Orientation = 'female' | 'male' | 'both';
export type PhotoType = 'face' | 'lifestyle';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface ProfilePhoto {
  url: string;
  order: number; // 1-10
  type: PhotoType; // 'face' for slots 1-6, 'lifestyle' for 7-10
  uploadedAt?: string;
  aiDetected?: boolean; // AI detection result
  faceDetected?: boolean; // Face detection result
}

export interface ProfileVerification {
  onboardingSelfie: string | null; // URL to verification selfie
  status: VerificationStatus;
  reason: string | null; // Rejection reason if any
  verifiedAt?: string;
  lastAttempt?: string;
}

export interface ProfileSettings {
  incognito: boolean; // Hidden from discovery/swipe
  passportEnabled: boolean; // Location override enabled
  aiAvatarAllowed: boolean; // User preference for AI avatars in feed
  notifications: boolean;
}

export interface SafetyFlags {
  mismatchReports: number; // Count of appearance mismatch reports
  fraudRisk: boolean; // Flagged for potential fraud
  banRisk: boolean; // Risk of ban
  lastMismatchCheck?: string;
  shadowBanned?: boolean; // Temporary restriction
}

export interface PassportLocation {
  enabled: boolean;
  city: string;
  country: string;
  lat: number;
  lng: number;
  setAt?: string;
}

export interface UserProfile {
  userId: string;
  
  // Basic Info
  gender: Gender;
  orientation: Orientation;
  age: number;
  birthdate: string; // ISO date
  country: string; // ISO country code
  city: string;
  
  // Profile Data
  bio?: string;
  name?: string;
  interests?: string[];
  hobbies?: string[];
  
  // Photos (1-10)
  photos: ProfilePhoto[];
  
  // Verification
  verification: ProfileVerification;
  
  // Profile Score (0-100)
  profileScore: number;
  
  // Settings
  settings: ProfileSettings;
  
  // Safety
  safetyFlags: SafetyFlags;
  
  // Location
  location?: {
    current: {
      lat: number;
      lng: number;
      city: string;
      country: string;
    };
    passport?: PassportLocation;
  };
  
  // Timestamps
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  lastActive?: string;
  
  // Additional flags
  isActive?: boolean;
  isBanned?: boolean;
  isDeleted?: boolean;
}

export interface PhotoUploadRequest {
  userId: string;
  slot: number; // 1-10
  imageData: string; // base64 or URL
  type?: PhotoType; // Auto-determined if not provided
}

export interface PhotoUploadResult {
  success: boolean;
  photo?: ProfilePhoto;
  error?: string;
  reason?: 'ai_detected' | 'no_face' | 'invalid_slot' | 'quota_exceeded';
}

export interface SelfieVerificationRequest {
  userId: string;
  selfieData: string; // base64 image
}

export interface SelfieVerificationResult {
  success: boolean;
  status: VerificationStatus;
  confidence?: number; // 0-1 match confidence
  reason?: string;
}

export interface ProfileScoreBreakdown {
  total: number; // 0-100
  breakdown: {
    photos: number; // Up to 30 (20 for 3+ face photos, 10 for 6 photos)
    bio: number; // 10
    basicInfo: number; // 10
    verification: number; // 20
    interests: number; // 10
    location: number; // 10
    safetyPenalty: number; // -30 max
  };
}

export interface MismatchReport {
  reporterId: string;
  reportedUserId: string;
  meetingId?: string; // Calendar meeting ID if applicable
  eventId?: string; // Event ID if applicable
  reason: string;
  photos?: string[]; // Evidence photos
  timestamp: string;
  verified: boolean; // Admin verified
  actionTaken?: 'warning' | 'shadowban' | 'refund' | 'ban';
}

export interface AIDetectionResult {
  isAI: boolean;
  confidence: number; // 0-1
  hasFace: boolean;
  faceConfidence: number; // 0-1
  warnings: string[];
}

export interface OnboardingProgress {
  userId: string;
  step: 'gender' | 'orientation' | 'birthdate' | 'location' | 'photos' | 'verification' | 'complete';
  completed: string[]; // Array of completed steps
  startedAt: string;
  completedAt?: string;
}

// Profile display filters
export interface ProfileFilters {
  gender?: Gender;
  orientation?: Orientation;
  minAge?: number;
  maxAge?: number;
  city?: string;
  country?: string;
  verified?: boolean;
  minScore?: number;
  hideIncognito?: boolean;
  hideFlagged?: boolean;
}

// Discovery/Swipe visibility rules
export interface VisibilityRules {
  showInDiscovery: boolean;
  showInSwipe: boolean;
  showInFeed: boolean;
  reason?: 'incognito' | 'unverified' | 'low_score' | 'safety_flag' | 'ai_only' | 'incomplete';
}

export interface ProfileUpdateRequest {
  userId: string;
  updates: Partial<UserProfile>;
}

export interface ProfileCompletionStatus {
  isComplete: boolean;
  missingFields: string[];
  score: number;
  canBeVisible: boolean;
  blockers: string[]; // Critical issues preventing visibility
}