/**
 * PACK 133 — Avalo AI Creative Studio
 * Type Definitions
 * 
 * AI-Powered Media Enhancement & Editing:
 * - Safe image enhancement (no NSFW generation)
 * - Video enhancement (no deepfakes)
 * - Audio enhancement (no voice cloning)
 * - Text/caption generation (no manipulation)
 * - Zero monetization impact
 * - Full safety integration
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BASE TYPES
// ============================================================================

export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TEXT';

export type EnhancementType =
  | 'IMAGE_LIGHTING'
  | 'IMAGE_COLOR'
  | 'IMAGE_CLARITY'
  | 'IMAGE_NOISE_REMOVAL'
  | 'IMAGE_CROP'
  | 'VIDEO_STABILIZATION'
  | 'VIDEO_NOISE_REDUCTION'
  | 'VIDEO_ASPECT_RATIO'
  | 'VIDEO_SUBTITLES'
  | 'AUDIO_NOISE_REMOVAL'
  | 'AUDIO_EQ'
  | 'AUDIO_FILLER_REMOVAL'
  | 'AUDIO_TRANSCRIPTION'
  | 'TEXT_CAPTION'
  | 'TEXT_TRANSLATION'
  | 'TEXT_GRAMMAR';

export type ProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SAFETY_BLOCKED';

export type SafetyCheckResult = 
  | 'PASS'
  | 'FAIL_NSFW_GENERATION'
  | 'FAIL_IDENTITY_CHANGE'
  | 'FAIL_DEEPFAKE'
  | 'FAIL_VOICE_CLONE'
  | 'FAIL_MANIPULATION';

// ============================================================================
// IMAGE ENHANCEMENT
// ============================================================================

export interface ImageEnhancementRequest {
  userId: string;
  mediaId: string;
  inputUrl: string;
  enhancements: {
    lightingCorrection?: boolean;
    colorCorrection?: boolean;
    contrastClarity?: boolean;
    noiseRemoval?: boolean;
    sharpening?: boolean;
    dynamicCrop?: boolean;
    acneSmoothing?: boolean; // Safe realism only
  };
  safetyContext: {
    isAdultVerified: boolean;
    contentType: string;
  };
}

export interface ImageEnhancementResult {
  requestId: string;
  userId: string;
  mediaId: string;
  status: ProcessingStatus;
  inputUrl: string;
  outputUrl?: string;
  enhancements: string[];
  safetyCheck: {
    result: SafetyCheckResult;
    reason?: string;
    nsfwScore: number;
    identityChangeScore: number;
  };
  metadata: {
    processingTime: number;
    modelVersion: string;
    enhancementDetails: Record<string, any>;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// VIDEO ENHANCEMENT
// ============================================================================

export interface VideoEnhancementRequest {
  userId: string;
  mediaId: string;
  inputUrl: string;
  enhancements: {
    noiseReduction?: boolean;
    stabilization?: boolean;
    aspectRatioFraming?: boolean;
    autoSubtitles?: boolean;
    soundLeveling?: boolean;
  };
  safetyContext: {
    isAdultVerified: boolean;
    contentType: string;
  };
}

export interface VideoEnhancementResult {
  requestId: string;
  userId: string;
  mediaId: string;
  status: ProcessingStatus;
  inputUrl: string;
  outputUrl?: string;
  enhancements: string[];
  safetyCheck: {
    result: SafetyCheckResult;
    reason?: string;
    deepfakeScore: number;
    manipulationScore: number;
  };
  metadata: {
    processingTime: number;
    modelVersion: string;
    duration: number;
    enhancementDetails: Record<string, any>;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// AUDIO ENHANCEMENT
// ============================================================================

export interface AudioEnhancementRequest {
  userId: string;
  mediaId: string;
  inputUrl: string;
  enhancements: {
    noiseRemoval?: boolean;
    eqLeveling?: boolean;
    fillerWordTrimming?: boolean;
    transcription?: boolean;
    translation?: {
      targetLanguage: string;
      subtitlesOnly: boolean; // No voice replacement
    };
  };
  safetyContext: {
    isAdultVerified: boolean;
    contentType: string;
  };
}

export interface AudioEnhancementResult {
  requestId: string;
  userId: string;
  mediaId: string;
  status: ProcessingStatus;
  inputUrl: string;
  outputUrl?: string;
  enhancements: string[];
  transcription?: string;
  translation?: {
    language: string;
    text: string;
  };
  safetyCheck: {
    result: SafetyCheckResult;
    reason?: string;
    voiceCloneScore: number;
    manipulationScore: number;
  };
  metadata: {
    processingTime: number;
    modelVersion: string;
    duration: number;
    enhancementDetails: Record<string, any>;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// TEXT/CAPTION GENERATION
// ============================================================================

export interface TextGenerationRequest {
  userId: string;
  context: 'CAPTION' | 'DESCRIPTION' | 'TITLE' | 'TRANSLATION';
  input: {
    text?: string;
    mediaType?: MediaType;
    mediaDescription?: string;
    targetLanguage?: string;
  };
  safetyContext: {
    isAdultVerified: boolean;
    contentType: string;
  };
}

export interface TextGenerationResult {
  requestId: string;
  userId: string;
  status: ProcessingStatus;
  context: string;
  generatedText?: string;
  suggestions?: string[];
  safetyCheck: {
    result: SafetyCheckResult;
    reason?: string;
    manipulationScore: number;
    nsfwScore: number;
  };
  metadata: {
    processingTime: number;
    modelVersion: string;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// PROOF-OF-ORIGIN METADATA
// ============================================================================

export interface ProofOfOriginMetadata {
  mediaId: string;
  userId: string;
  originalHash: string; // Hash of original file
  enhancedHash: string; // Hash of enhanced file
  processingRecord: {
    requestId: string;
    enhancements: string[];
    timestamp: Timestamp;
    modelVersions: Record<string, string>;
  };
  aiDisclosure: {
    isAiEnhanced: boolean;
    enhancementTypes: string[];
    badgeEnabled: boolean; // User can opt-in to show badge
  };
  forensics: {
    fingerprintOriginal: string;
    fingerprintEnhanced: string;
    deltaSignature: string; // What changed
  };
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY VALIDATION
// ============================================================================

export interface SafetyValidationRequest {
  requestType: 'PRE_PROCESSING' | 'POST_PROCESSING';
  mediaType: MediaType;
  inputUrl: string;
  outputUrl?: string;
  userId: string;
  enhancements: string[];
  originalFingerprint?: string;
}

export interface SafetyValidationResult {
  passed: boolean;
  result: SafetyCheckResult;
  reason?: string;
  scores: {
    nsfwGeneration: number; // 0-1, blocks if >0.1
    identityChange: number; // 0-1, blocks if >0.05
    deepfakeDetection: number; // 0-1, blocks if >0.1
    voiceClone: number; // 0-1, blocks if >0.1
    contentManipulation: number; // 0-1, blocks if >0.2
  };
  violations: string[];
  timestamp: Timestamp;
}

// ============================================================================
// AI CREATIVE STUDIO DASHBOARD
// ============================================================================

export interface AIStudioDashboard {
  userId: string;
  stats: {
    totalEnhancements: number;
    imageEnhancements: number;
    videoEnhancements: number;
    audioEnhancements: number;
    textGenerated: number;
    processingTime: number; // Total seconds
    aiDisclosureBadgesEnabled: number;
  };
  recentEnhancements: Array<{
    requestId: string;
    mediaType: MediaType;
    enhancements: string[];
    status: ProcessingStatus;
    timestamp: Timestamp;
  }>;
  safetyRecord: {
    totalChecks: number;
    passed: number;
    blocked: number;
    violations: string[];
  };
  lastUpdated: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface EnhanceImageRequest {
  mediaId: string;
  inputUrl: string;
  lightingCorrection?: boolean;
  colorCorrection?: boolean;
  contrastClarity?: boolean;
  noiseRemoval?: boolean;
  sharpening?: boolean;
  dynamicCrop?: boolean;
  acneSmoothing?: boolean;
}

export interface EnhanceImageResponse {
  requestId: string;
  status: ProcessingStatus;
  outputUrl?: string;
  safetyCheck: {
    passed: boolean;
    reason?: string;
  };
  metadata: {
    processingTime: number;
    enhancements: string[];
  };
}

export interface EnhanceVideoRequest {
  mediaId: string;
  inputUrl: string;
  noiseReduction?: boolean;
  stabilization?: boolean;
  aspectRatioFraming?: boolean;
  autoSubtitles?: boolean;
  soundLeveling?: boolean;
}

export interface EnhanceVideoResponse {
  requestId: string;
  status: ProcessingStatus;
  outputUrl?: string;
  safetyCheck: {
    passed: boolean;
    reason?: string;
  };
  metadata: {
    processingTime: number;
    enhancements: string[];
  };
}

export interface EnhanceAudioRequest {
  mediaId: string;
  inputUrl: string;
  noiseRemoval?: boolean;
  eqLeveling?: boolean;
  fillerWordTrimming?: boolean;
  transcription?: boolean;
  translation?: {
    targetLanguage: string;
  };
}

export interface EnhanceAudioResponse {
  requestId: string;
  status: ProcessingStatus;
  outputUrl?: string;
  transcription?: string;
  translation?: {
    language: string;
    text: string;
  };
  safetyCheck: {
    passed: boolean;
    reason?: string;
  };
  metadata: {
    processingTime: number;
    enhancements: string[];
  };
}

export interface GenerateCaptionRequest {
  mediaType: MediaType;
  mediaDescription?: string;
  existingText?: string;
  context: 'CAPTION' | 'DESCRIPTION' | 'TITLE';
}

export interface GenerateCaptionResponse {
  requestId: string;
  suggestions: string[];
  safetyCheck: {
    passed: boolean;
    reason?: string;
  };
}

export interface TranslateTextRequest {
  text: string;
  targetLanguage: string;
  context: 'CAPTION' | 'DESCRIPTION' | 'SUBTITLE';
}

export interface TranslateTextResponse {
  requestId: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  safetyCheck: {
    passed: boolean;
    reason?: string;
  };
}

export interface GetAIStudioDashboardRequest {
  userId: string;
}

export interface GetAIStudioDashboardResponse {
  dashboard: AIStudioDashboard;
}

export interface ToggleAIBadgeRequest {
  mediaId: string;
  enabled: boolean;
}

export interface ToggleAIBadgeResponse {
  success: boolean;
  mediaId: string;
  badgeEnabled: boolean;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum AIStudioErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  SAFETY_BLOCKED = 'SAFETY_BLOCKED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  MEDIA_NOT_FOUND = 'MEDIA_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NSFW_GENERATION_DETECTED = 'NSFW_GENERATION_DETECTED',
  IDENTITY_MANIPULATION_DETECTED = 'IDENTITY_MANIPULATION_DETECTED',
  DEEPFAKE_DETECTED = 'DEEPFAKE_DETECTED',
  VOICE_CLONE_DETECTED = 'VOICE_CLONE_DETECTED',
  CONTENT_MANIPULATION_DETECTED = 'CONTENT_MANIPULATION_DETECTED',
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export interface AIStudioRateLimit {
  userId: string;
  period: '1h' | '24h' | '30d';
  limits: {
    imageEnhancements: number;
    videoEnhancements: number;
    audioEnhancements: number;
    textGenerations: number;
  };
  current: {
    imageEnhancements: number;
    videoEnhancements: number;
    audioEnhancements: number;
    textGenerations: number;
  };
  resetAt: Timestamp;
}

// ============================================================================
// AUDIT & COMPLIANCE
// ============================================================================

export interface AIStudioAuditLog {
  id: string;
  userId: string;
  action: string;
  requestType: MediaType;
  enhancements: string[];
  safetyResult: SafetyCheckResult;
  violations: string[];
  metadata: Record<string, any>;
  timestamp: Timestamp;
}