/**
 * PACK 342 - Profile Creator Types
 * Shared types for profile creation and verification
 */

export type Gender = 'female' | 'male' | 'nonbinary';

export type PhotoSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface ProfilePhoto {
  id: string;
  slot: PhotoSlot;
  url: string;
  storagePath: string;
  uploadedAt: Date;
  faceDetected?: boolean;
  verifiedFace?: boolean;
  aiCheckStatus?: 'pending' | 'approved' | 'rejected';
  aiCheckMessage?: string;
}

export interface ProfileBasicInfo {
  nickname: string;
  age: number;
  dateOfBirth?: Date;
  gender: Gender;
  preferences: Gender[]; // Who user is interested in
  bio?: string;
  location?: {
    city?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
}

export interface SelfieVerification {
  id: string;
  userId: string;
  selfiePhotoUrl: string;
  storagePath: string;
  matchedPhotoSlot: number | null; // Which of photos 1-6 was matched
  livenessCheckPassed: boolean;
  faceMatchScore: number; // 0-100
  verifiedAt?: Date;
  status: 'pending' | 'passed' | 'failed' | 'retry';
  attemptNumber: number;
  maxAttempts: number;
  failureReason?: string;
}

export interface VideoBio {
  id: string;
  url: string;
  storagePath: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  uploadedAt: Date;
  hasSound: boolean;
  verified: boolean;
}

export interface ProfileCreationProgress {
  userId: string;
  currentStep: ProfileCreationStep;
  stepsCompleted: ProfileCreationStep[];
  basicInfoComplete: boolean;
  primaryPhotosComplete: boolean; // At least 1 face photo
  selfieVerificationComplete: boolean;
  profileActivated: boolean;
  canSkipLifestyleGallery: boolean;
  canSkipVideoBio: boolean;
}

export type ProfileCreationStep =
  | 'basic_info'
  | 'primary_photos'
  | 'selfie_verification'
  | 'lifestyle_gallery'
  | 'video_bio'
  | 'completed';

export interface PhotoValidationResult {
  isValid: boolean;
  faceDetected: boolean;
  errors: PhotoValidationError[];
  warnings: PhotoValidationWarning[];
}

export type PhotoValidationError =
  | 'no_face_detected'
  | 'multiple_faces'
  | 'animal_detected'
  | 'landscape_only'
  | 'object_only'
  | 'group_photo'
  | 'low_quality'
  | 'inappropriate_content'
  | 'minor_detected';

export type PhotoValidationWarning =
  | 'low_lighting'
  | 'face_partially_obscured'
  | 'low_resolution'
  | 'blurry';

export interface ProfileBadge {
  type: 'selfie_verified' | 'video_verified' | 'vip' | 'royal' | 'influencer';
  earnedAt: Date;
  visible: boolean;
}

export interface UserProfile {
  userId: string;
  basicInfo: ProfileBasicInfo;
  photos: ProfilePhoto[];
  videoBio?: VideoBio;
  badges: ProfileBadge[];
  verification: {
    selfieVerified: boolean;
    selfieVerifiedAt?: Date;
    videoVerified: boolean;
    lastVerificationCheck?: Date;
  };
  createdAt: Date;
  lastUpdatedAt: Date;
  isActive: boolean;
  isHidden: boolean;
  hideReason?: string;
}

export interface PhotoUploadOptions {
  slot: PhotoSlot;
  requireFaceDetection: boolean;
  maxSizeBytes: number;
  allowedFormats: string[];
  compressQuality: number;
}

export interface VideoBioOptions {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  maxSizeBytes: number;
  requireSound: boolean;
  requireFrontCamera: boolean;
}

// Default constants
export const PRIMARY_PHOTO_SLOTS: PhotoSlot[] = [1, 2, 3, 4, 5, 6];
export const LIFESTYLE_PHOTO_SLOTS: PhotoSlot[] = [7, 8, 9, 10, 11, 12];
export const MIN_PRIMARY_PHOTOS = 1;
export const MAX_PRIMARY_PHOTOS = 6;
export const MAX_LIFESTYLE_PHOTOS = 6;
export const MAX_SELFIE_ATTEMPTS = 3;
export const VIDEO_BIO_MIN_DURATION = 5;
export const VIDEO_BIO_MAX_DURATION = 30;
export const MIN_FACE_MATCH_SCORE = 75;

export const PHOTO_UPLOAD_OPTIONS: PhotoUploadOptions = {
  slot: 1,
  requireFaceDetection: true,
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  compressQuality: 0.8,
};

export const VIDEO_BIO_OPTIONS: VideoBioOptions = {
  minDurationSeconds: VIDEO_BIO_MIN_DURATION,
  maxDurationSeconds: VIDEO_BIO_MAX_DURATION,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  requireSound: true,
  requireFrontCamera: true,
};
