/**
 * PACK 142 — Avalo Anti-Catfish & Identity Authenticity Engine
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - No NSFW content allowed
 * - No romance monetization
 * - 18+ only, mandatory age verification
 * - Token price and 65/35 split remain untouched
 * - Identity verification cannot give visibility or ranking advantage
 * - Zero shame, zero ambiguity in UX messaging
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// IDENTITY CHECK TYPES
// ============================================================================

export type IdentityCheckStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'FLAGGED'
  | 'REJECTED'
  | 'MANUAL_REVIEW';

export type IdentityCheckType = 
  | 'LIVENESS'
  | 'PHOTO_CONSISTENCY'
  | 'VOICE_SIGNATURE'
  | 'ANTI_STOLEN'
  | 'ANTI_DEEPFAKE'
  | 'RECURRENT_AUTHENTICITY';

export interface IdentityCheck {
  checkId: string;
  userId: string;
  checkType: IdentityCheckType;
  status: IdentityCheckStatus;
  
  // Check details
  triggerReason: string;
  confidence: number; // 0-1
  
  // Results
  passed: boolean;
  flags: string[];
  evidence: IdentityCheckEvidence;
  
  // Timestamps
  initiatedAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt?: Timestamp;
  
  // For manual review
  reviewerId?: string;
  reviewNote?: string;
  reviewedAt?: Timestamp;
}

export interface IdentityCheckEvidence {
  type: IdentityCheckType;
  data: Record<string, any>;
  metadata: {
    deviceInfo?: DeviceInfo;
    locationInfo?: LocationInfo;
    ipAddress?: string;
  };
}

export interface DeviceInfo {
  deviceId: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  screenResolution: string;
}

export interface LocationInfo {
  city?: string;
  region?: string;
  country: string;
  timezone: string;
}

// ============================================================================
// LIVENESS CHECK TYPES
// ============================================================================

export type LivenessCheckStatus = 
  | 'NOT_STARTED'
  | 'RECORDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface LivenessSession {
  sessionId: string;
  userId: string;
  status: LivenessCheckStatus;
  
  // Video recording
  videoUrl?: string;
  videoDuration?: number; // seconds
  
  // Micro-movement detection
  blinkDetected: boolean;
  headRotationDetected: boolean;
  lipMovementDetected: boolean;
  
  // Anti-deepfake analysis
  deepfakeScore: number; // 0-1 (0 = real, 1 = fake)
  textureAnalysis: TextureAnalysisResult;
  
  // Results
  passed: boolean;
  confidence: number;
  flags: string[];
  
  // Timestamps
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface TextureAnalysisResult {
  jpegArtifactScore: number; // 0-1
  shadowConsistency: number; // 0-1
  lightingReflection: number; // 0-1
  ganUpsampling: number; // 0-1 (higher = more likely GAN)
  floatingFeatures: number; // 0-1 (teeth/eyes hallucination)
}

export interface MicroMovementDetection {
  timestamp: number;
  movementType: 'BLINK' | 'HEAD_ROTATION' | 'LIP_MOVEMENT';
  detected: boolean;
  confidence: number;
}

// ============================================================================
// PHOTO CONSISTENCY CHECK TYPES
// ============================================================================

export interface PhotoConsistencyCheck {
  checkId: string;
  userId: string;
  
  // Photos being compared
  profilePhotoUrls: string[];
  newPhotoUrl?: string;
  
  // Facial recognition
  facialMatches: FacialMatch[];
  overallConsistency: number; // 0-1
  
  // Appearance analysis
  filterDetection: FilterDetectionResult;
  beautyAIDetection: BeautyAIResult;
  bodyMorphDetection: BodyMorphResult;
  
  // Results
  passed: boolean;
  confidence: number;
  flags: string[];
  
  createdAt: Timestamp;
}

export interface FacialMatch {
  photo1Url: string;
  photo2Url: string;
  similarityScore: number; // 0-1
  sameIdentity: boolean;
  confidence: number;
}

export interface FilterDetectionResult {
  filterApplied: boolean;
  filterType?: string;
  filterIntensity: number; // 0-1
  confidence: number;
}

export interface BeautyAIResult {
  beautyAIUsed: boolean;
  skinSmoothingScore: number; // 0-1
  faceReshapingScore: number; // 0-1
  eyeEnlargementScore: number; // 0-1
  confidence: number;
}

export interface BodyMorphResult {
  bodyMorphDetected: boolean;
  morphType?: 'WAIST' | 'HIPS' | 'CHEST' | 'LEGS' | 'ARMS';
  morphIntensity: number; // 0-1
  confidence: number;
}

// ============================================================================
// VOICE SIGNATURE CHECK TYPES
// ============================================================================

export interface VoiceSignature {
  signatureId: string;
  userId: string;
  
  // Calibration sample
  calibrationAudioUrl: string;
  calibrationDuration: number; // seconds
  calibrationTranscript: string;
  
  // Voice characteristics
  voicePrint: VoicePrintData;
  
  // Metadata
  createdAt: Timestamp;
  lastVerifiedAt?: Timestamp;
  verificationCount: number;
}

export interface VoicePrintData {
  tone: number[]; // frequency distribution
  pace: number; // words per minute
  timbre: number[]; // spectral characteristics
  spectralFingerprint: number[]; // unique voice signature
  pitchRange: { min: number; max: number };
  formants: number[]; // vocal tract resonances
}

export interface VoiceVerificationCheck {
  checkId: string;
  userId: string;
  signatureId: string;
  
  // Sample being verified
  sampleAudioUrl: string;
  sampleDuration: number;
  
  // Comparison results
  voiceMatch: boolean;
  similarityScore: number; // 0-1
  
  // Anti-spoofing
  voiceChangerDetected: boolean;
  voiceCloneDetected: boolean;
  studioFilterDetected: boolean;
  
  // Results
  passed: boolean;
  confidence: number;
  flags: string[];
  
  verifiedAt: Timestamp;
}

// ============================================================================
// ANTI-STOLEN PHOTO TYPES
// ============================================================================

export interface StolenPhotoCheck {
  checkId: string;
  userId: string;
  photoUrl: string;
  
  // Database matching
  celebrityMatches: CelebrityMatch[];
  stockPhotoMatches: StockPhotoMatch[];
  adultContentMatches: AdultContentMatch[];
  aiGeneratedMatches: AIGeneratedMatch[];
  
  // Results
  stolenPhotoDetected: boolean;
  confidence: number;
  flags: string[];
  
  checkedAt: Timestamp;
}

export interface CelebrityMatch {
  celebrityName: string;
  similarityScore: number; // 0-1
  sourceUrl?: string;
  confidence: number;
}

export interface StockPhotoMatch {
  stockPhotoId: string;
  stockProvider: string;
  similarityScore: number;
  confidence: number;
}

export interface AdultContentMatch {
  contentId: string;
  platform: string;
  similarityScore: number;
  confidence: number;
}

export interface AIGeneratedMatch {
  generatorType: 'STYLEGAN' | 'DIFFUSION' | 'GAN' | 'OTHER';
  artifactPatterns: string[];
  confidence: number;
}

// ============================================================================
// DEEPFAKE DETECTION TYPES
// ============================================================================

export interface DeepfakeDetectionResult {
  checkId: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  
  // Analysis results
  isDeepfake: boolean;
  deepfakeScore: number; // 0-1 (1 = definitely fake)
  
  // Detection signals
  jpegQuantizationArtifacts: number; // 0-1
  inconsistentShadows: number; // 0-1
  hairEdgeAnomalies: number; // 0-1
  lightingReflectionMismatch: number; // 0-1
  ganUpsamplingAnomalies: number; // 0-1
  floatingFeatures: number; // 0-1 (teeth/eyes hallucination)
  
  // Results
  passed: boolean;
  confidence: number;
  flags: string[];
  
  detectedAt: Timestamp;
}

// ============================================================================
// IDENTITY FRAUD SOCIAL GRAPH TYPES
// ============================================================================

export interface IdentityFraudSignal {
  signalId: string;
  userId: string;
  
  // Signal type
  signalType: 
    | 'PHONE_REUSE'
    | 'DEVICE_REUSE'
    | 'PAYOUT_ACCOUNT_REUSE'
    | 'REGION_IP_MISMATCH'
    | 'PAYMENT_CARD_PATTERN'
    | 'INTERACTION_CLUSTER';
  
  // Signal data
  signalData: Record<string, any>;
  riskScore: number; // 0-1
  
  // Related users
  relatedUserIds: string[];
  
  // Results
  fraudDetected: boolean;
  confidence: number;
  
  detectedAt: Timestamp;
}

export interface SocialGraphFraudAnalysis {
  analysisId: string;
  targetUserId: string;
  
  // Network analysis
  phoneNumberCluster: string[];
  deviceFingerprintCluster: string[];
  payoutAccountCluster: string[];
  ipAddressCluster: string[];
  
  // Pattern detection
  repeatedCatfishPattern: boolean;
  coordinatedAccounts: boolean;
  massRegistrationPattern: boolean;
  
  // Results
  fraudProbability: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: string[];
  
  analyzedAt: Timestamp;
}

// ============================================================================
// RECURRENT AUTHENTICITY CHECK TYPES
// ============================================================================

export type RecurrentCheckTrigger =
  | 'PROFILE_PHOTO_CHANGE'
  | 'MULTIPLE_PHOTOS_ADDED'
  | 'APPEARANCE_CHANGE'
  | 'TIME_GAP_MISMATCH'
  | 'SUSPICIOUS_UPLOAD';

export interface RecurrentAuthenticityCheck {
  checkId: string;
  userId: string;
  triggerReason: RecurrentCheckTrigger;
  
  // What triggered the check
  triggerData: {
    oldPhotoUrls?: string[];
    newPhotoUrls?: string[];
    timeGapDays?: number;
    suspiciousPatterns?: string[];
  };
  
  // Check results
  facialConsistency: number; // 0-1
  identitySwapDetected: boolean;
  
  // Action required
  requiresReVerification: boolean;
  blocksUploads: boolean;
  
  // Results
  passed: boolean;
  confidence: number;
  flags: string[];
  
  triggeredAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// IDENTITY VERIFICATION LOG TYPES
// ============================================================================

export interface IdentityVerificationLog {
  logId: string;
  userId: string;
  
  // Log entry
  eventType: 
    | 'LIVENESS_CHECK_PASSED'
    | 'LIVENESS_CHECK_FAILED'
    | 'PHOTO_CONSISTENCY_PASSED'
    | 'PHOTO_CONSISTENCY_FAILED'
    | 'VOICE_SIGNATURE_CREATED'
    | 'VOICE_VERIFICATION_PASSED'
    | 'VOICE_VERIFICATION_FAILED'
    | 'STOLEN_PHOTO_DETECTED'
    | 'DEEPFAKE_DETECTED'
    | 'FRAUD_SIGNAL_DETECTED'
    | 'MANUAL_REVIEW_REQUIRED'
    | 'IDENTITY_APPROVED'
    | 'IDENTITY_REJECTED';
  
  // Event data
  eventData: Record<string, any>;
  
  // Results
  checkId?: string;
  outcome: 'PASS' | 'FAIL' | 'REVIEW';
  
  // Timestamps
  timestamp: Timestamp;
}

// ============================================================================
// SAFETY CASE INTEGRATION TYPES
// ============================================================================

export interface IdentitySafetyCase {
  caseId: string;
  userId: string;
  
  // Case type
  caseType: 
    | 'LIVENESS_FAILURE'
    | 'PHOTO_MISMATCH'
    | 'STOLEN_PHOTO'
    | 'DEEPFAKE_DETECTED'
    | 'VOICE_CLONE'
    | 'IDENTITY_FRAUD'
    | 'CATFISH_PATTERN';
  
  // Evidence
  checkIds: string[];
  evidence: IdentityCheckEvidence[];
  
  // Priority
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Status
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  
  // Action taken
  actionTaken?: {
    accountLocked: boolean;
    photosRemoved: string[];
    notificationSent: boolean;
    banEvasionFlagged: boolean;
  };
  
  // Timestamps
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

// ============================================================================
// THRESHOLDS & CONSTANTS
// ============================================================================

export const IDENTITY_THRESHOLDS = {
  liveness: {
    deepfakeBlock: 0.7, // Block if deepfake score > 0.7
    deepfakeReview: 0.5, // Review if > 0.5
    minMicroMovements: 2, // Require at least 2 of 3 movements
  },
  photoConsistency: {
    minSimilarity: 0.75, // Require 75% facial match
    maxFilterIntensity: 0.6, // Block if filter > 60%
    maxBeautyAI: 0.7, // Block if beauty AI > 70%
    maxBodyMorph: 0.5, // Block if body morph > 50%
  },
  voiceSignature: {
    minSimilarity: 0.8, // Require 80% voice match
    minCalibrationDuration: 5, // seconds
  },
  stolenPhoto: {
    blockThreshold: 0.85, // Block if similarity > 85%
    reviewThreshold: 0.7, // Review if > 70%
  },
  deepfake: {
    blockThreshold: 0.8, // Block if deepfake score > 80%
    reviewThreshold: 0.6, // Review if > 60%
  },
  fraud: {
    criticalRisk: 0.8, // Lock account if > 80%
    highRisk: 0.6, // Flag for review if > 60%
    mediumRisk: 0.4, // Monitor if > 40%
  },
};

// ============================================================================
// UX MESSAGING TYPES (Zero Shame, Zero Ambiguity)
// ============================================================================

export interface IdentityVerificationMessage {
  messageType: 
    | 'VERIFICATION_REQUIRED'
    | 'LIVENESS_CHECK_NEEDED'
    | 'PHOTO_REVIEW_NEEDED'
    | 'VOICE_CALIBRATION_NEEDED'
    | 'RE_VERIFICATION_NEEDED'
    | 'VERIFICATION_SUCCESS'
    | 'VERIFICATION_FAILED';
  
  title: string;
  message: string;
  actionLabel: string;
  supportLink: string;
  
  // NO shame, NO blame
  neutral: boolean;
  helpAvailable: boolean;
}

export const IDENTITY_MESSAGES: Record<string, IdentityVerificationMessage> = {
  LIVENESS_REQUIRED: {
    messageType: 'LIVENESS_CHECK_NEEDED',
    title: 'Quick Identity Verification',
    message: 'To ensure everyone on Avalo is who they say they are, we need to verify your identity. This takes less than 30 seconds.',
    actionLabel: 'Start Verification',
    supportLink: '/help/identity-verification',
    neutral: true,
    helpAvailable: true,
  },
  PHOTO_CONSISTENCY_NEEDED: {
    messageType: 'PHOTO_REVIEW_NEEDED',
    title: 'Photo Verification Needed',
    message: 'We noticed some differences in your recent photos. Please verify your identity to continue.',
    actionLabel: 'Verify Now',
    supportLink: '/help/photo-verification',
    neutral: true,
    helpAvailable: true,
  },
  VOICE_CALIBRATION_NEEDED: {
    messageType: 'VOICE_CALIBRATION_NEEDED',
    title: 'Voice Verification Setup',
    message: 'To use voice features, we need to create your voice signature. This helps keep everyone safe.',
    actionLabel: 'Set Up Voice',
    supportLink: '/help/voice-verification',
    neutral: true,
    helpAvailable: true,
  },
  RE_VERIFICATION_REQUIRED: {
    messageType: 'RE_VERIFICATION_NEEDED',
    title: 'Quick Re-verification',
    message: 'For everyone\'s safety, we need you to verify your identity again. This usually happens after profile changes.',
    actionLabel: 'Verify Again',
    supportLink: '/help/re-verification',
    neutral: true,
    helpAvailable: true,
  },
  VERIFICATION_SUCCESS: {
    messageType: 'VERIFICATION_SUCCESS',
    title: 'Verification Complete',
    message: 'You\'re all set! Your identity has been verified.',
    actionLabel: 'Continue',
    supportLink: '/help/identity-verification',
    neutral: true,
    helpAvailable: true,
  },
  VERIFICATION_FAILED: {
    messageType: 'VERIFICATION_FAILED',
    title: 'Verification Incomplete',
    message: 'We couldn\'t complete your verification. Please try again or contact support if you need help.',
    actionLabel: 'Try Again',
    supportLink: '/help/verification-issues',
    neutral: true,
    helpAvailable: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function shouldBlockUpload(check: PhotoConsistencyCheck): boolean {
  const thresholds = IDENTITY_THRESHOLDS.photoConsistency;
  
  return (
    check.overallConsistency < thresholds.minSimilarity ||
    check.filterDetection.filterIntensity > thresholds.maxFilterIntensity ||
    check.beautyAIDetection.skinSmoothingScore > thresholds.maxBeautyAI ||
    check.bodyMorphDetection.morphIntensity > thresholds.maxBodyMorph
  );
}

export function shouldBlockUser(fraudAnalysis: SocialGraphFraudAnalysis): boolean {
  return (
    fraudAnalysis.riskLevel === 'CRITICAL' ||
    fraudAnalysis.fraudProbability >= IDENTITY_THRESHOLDS.fraud.criticalRisk
  );
}

export function shouldRequireManualReview(check: IdentityCheck): boolean {
  return (
    check.status === 'FLAGGED' ||
    check.confidence < 0.6 ||
    check.flags.length >= 3
  );
}

export function getVerificationMessage(
  messageType: IdentityVerificationMessage['messageType']
): IdentityVerificationMessage {
  const key = Object.keys(IDENTITY_MESSAGES).find(
    k => IDENTITY_MESSAGES[k].messageType === messageType
  );
  
  return key 
    ? IDENTITY_MESSAGES[key] 
    : IDENTITY_MESSAGES.LIVENESS_REQUIRED;
}