/**
 * PACK 342 - Photo & Profile Validation Rules
 * Unified validation rules for profile creation
 */

import {
  PhotoValidationResult,
  PhotoValidationError,
  PhotoValidationWarning,
  PhotoSlot,
  PRIMARY_PHOTO_SLOTS,
  ProfileBasicInfo,
  MIN_FACE_MATCH_SCORE,
} from './types';

/**
 * Validate photo for primary slots (1-6) - FACE ONLY
 */
export function validatePrimaryPhoto(
  imageData: {
    faceDetected: boolean;
    faceCount: number;
    objectsDetected?: string[];
    quality?: number;
    hasAnimal?: boolean;
    isLandscape?: boolean;
    isMinor?: boolean;
  }
): PhotoValidationResult {
  const errors: PhotoValidationError[] = [];
  const warnings: PhotoValidationWarning[] = [];

  // CRITICAL: Minor detection
  if (imageData.isMinor) {
    errors.push('minor_detected');
    return {
      isValid: false,
      faceDetected: false,
      errors,
      warnings,
    };
  }

  // RULE 1: Face Required
  if (!imageData.faceDetected || imageData.faceCount === 0) {
    errors.push('no_face_detected');
  }

  // RULE 2: No group photos (multiple faces) as main profile photo
  if (imageData.faceCount > 1) {
    errors.push('group_photo');
  }

  // RULE 3: No animals
  if (imageData.hasAnimal) {
    errors.push('animal_detected');
  }

  // RULE 4: No pure landscapes
  if (imageData.isLandscape && !imageData.faceDetected) {
    errors.push('landscape_only');
  }

  // RULE 5: No objects only
  if (imageData.objectsDetected && imageData.objectsDetected.length > 0 && !imageData.faceDetected) {
    errors.push('object_only');
  }

  // RULE 6: Quality check
  if (imageData.quality && imageData.quality < 50) {
    errors.push('low_quality');
  } else if (imageData.quality && imageData.quality < 70) {
    warnings.push('low_resolution');
  }

  const isValid = errors.length === 0;
  const faceDetected = imageData.faceDetected && imageData.faceCount ===1;

  return {
    isValid,
    faceDetected,
    errors,
    warnings,
  };
}

/**
 * Validate lifestyle photo for slots 7+ - No restrictions
 */
export function validateLifestylePhoto(
  imageData: {
    quality?: number;
    isMinor?: boolean;
    inappropriate?: boolean;
  }
): PhotoValidationResult {
  const errors: PhotoValidationError[] = [];
  const warnings: PhotoValidationWarning[] = [];

  // CRITICAL: Minor detection
  if (imageData.isMinor) {
    errors.push('minor_detected');
    return {
      isValid: false,
      faceDetected: false, // Not required for lifestyle
      errors,
      warnings,
    };
  }

  // RULE: No inappropriate content
  if (imageData.inappropriate) {
    errors.push('inappropriate_content');
  }

  // Quality warning
  if (imageData.quality && imageData.quality < 50) {
    warnings.push('low_resolution');
  }

  return {
    isValid: errors.length === 0,
    faceDetected: false, // Not required for lifestyle photos
    errors,
    warnings,
  };
}

/**
 * Validate basic profile info
 */
export interface BasicInfoValidation {
  isValid: boolean;
  errors: {
    nickname?: string;
    age?: string;
    gender?: string;
    preferences?: string;
  };
}

export function validateBasicInfo(info: Partial<ProfileBasicInfo>): BasicInfoValidation {
  const errors: BasicInfoValidation['errors'] = {};

  // Nickname validation
  if (!info.nickname || info.nickname.trim().length === 0) {
    errors.nickname = 'Nickname is required';
  } else if (info.nickname.trim().length < 2) {
    errors.nickname = 'Nickname must be at least 2 characters';
  } else if (info.nickname.trim().length > 30) {
    errors.nickname = 'Nickname must be less than 30 characters';
  }

  // Age validation
  if (!info.age) {
    errors.age = 'Age is required';
  } else if (info.age < 18) {
    errors.age = 'Must be 18 or older';
  } else if (info.age > 120) {
    errors.age = 'Invalid age';
  }

  // Gender validation
  if (!info.gender) {
    errors.gender = 'Gender is required';
  }

  // Preferences validation
  if (!info.preferences || info.preferences.length === 0) {
    errors.preferences = 'Please select at least one preference';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate selfie verification match score
 */
export function validateSelfieMatch(faceMatchScore: number): {
  isValid: boolean;
  message: string;
} {
  if (faceMatchScore >= MIN_FACE_MATCH_SCORE) {
    return {
      isValid: true,
      message: 'Face match successful!',
    };
  } else if (faceMatchScore >= 50) {
    return {
      isValid: false,
      message: 'Face match score too low. Please ensure good lighting and face the camera directly.',
    };
  } else {
    return {
      isValid: false,
      message: 'Face does not match profile photos. Please try again or update your photos.',
    };
  }
}

/**
 * Validate video bio
 */
export interface VideoBioValidation {
  isValid: boolean;
  errors: string[];
}

export function validateVideoBio(video: {
  durationSeconds: number;
  hasSound: boolean;
  sizeBytes: number;
  maxSizeBytes: number;
  minDuration: number;
  maxDuration: number;
}): VideoBioValidation {
  const errors: string[] = [];

  if (video.durationSeconds < video.minDuration) {
    errors.push(`Video must be at least ${video.minDuration} seconds long`);
  }

  if (video.durationSeconds > video.maxDuration) {
    errors.push(`Video must be less than ${video.maxDuration} seconds long`);
  }

  if (!video.hasSound) {
    errors.push('Video must have sound');
  }

  if (video.sizeBytes > video.maxSizeBytes) {
    const maxMB = Math.round(video.maxSizeBytes / (1024 * 1024));
    errors.push(`Video size must be less than ${maxMB}MB`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if photo slot requires face detection
 */
export function requiresFaceDetection(slot: PhotoSlot): boolean {
  return PRIMARY_PHOTO_SLOTS.includes(slot);
}

/**
 * Get validation error message for user display
 */
export function getErrorMessage(error: PhotoValidationError, locale: 'en' | 'pl' = 'en'): string {
  const messages = {
    en: {
      no_face_detected: 'No face detected. Please upload a clear photo of your face.',
      multiple_faces: 'Multiple faces detected. Please upload a photo with only you.',
      animal_detected: 'Animals are not allowed in primary photos. Use lifestyle gallery instead.',
      landscape_only: 'Landscape photos are not allowed in primary photos. Please upload a photo with your face.',
      object_only: 'Objects-only photos are not allowed. Please upload a photo with your face.',
      group_photo: 'Group photos are not allowed as main profile photo. Please upload a solo photo.',
      low_quality: 'Photo quality is too low. Please upload a higher quality image.',
      inappropriate_content: 'Inappropriate content detected. Please upload a different photo.',
      minor_detected: 'Minor detected in photo. This platform is 18+ only.',
    },
    pl: {
      no_face_detected: 'Nie wykryto twarzy. Prześlij wyraźne zdjęcie swojej twarzy.',
      multiple_faces: 'Wykryto wiele twarzy. Prześlij zdjęcie tylko siebie.',
      animal_detected: 'Zwierzęta nie są dozwolone na głównych zdjęciach. Użyj galerii lifestyle.',
      landscape_only: 'Zdjęcia krajobrazów nie są dozwolone na głównych zdjęciach. Prześlij zdjęcie z twarzą.',
      object_only: 'Zdjęcia tylko obiektów nie są dozwolone. Prześlij zdjęcie z twarzą.',
      group_photo: 'Zdjęcia grupowe nie są dozwolone jako główne zdjęcie profilowe. Prześlij zdjęcie solo.',
      low_quality: 'Jakość zdjęcia jest zbyt niska. Prześlij obraz wyższej jakości.',
      inappropriate_content: 'Wykryto nieodpowiednią treść. Prześlij inne zdjęcie.',
      minor_detected: 'Wykryto nieletniego na zdjęciu. Ta platforma jest tylko dla osób 18+.',
    },
  };

  return messages[locale][error] || messages.en[error];
}

/**
 * Get validation warning message for user display
 */
export function getWarningMessage(warning: PhotoValidationWarning, locale: 'en' | 'pl' = 'en'): string {
  const messages = {
    en: {
      low_lighting: 'Photo has low lighting. Consider taking a photo in better light.',
      face_partially_obscured: 'Your face is partially obscured. For best results, ensure your face is fully visible.',
      low_resolution: 'Photo resolution is low. Consider uploading a higher resolution image.',
      blurry: 'Photo appears blurry. Try taking a sharper photo.',
    },
    pl: {
      low_lighting: 'Zdjęcie ma słabe oświetlenie. Rozważ zrobienie zdjęcia przy lepszym świetle.',
      face_partially_obscured: 'Twoja twarz jest częściowo zasłonięta. Dla najlepszych rezultatów upewnij się, że twoja twarz jest w pełni widoczna.',
      low_resolution: 'Rozdzielczość zdjęcia jest niska. Rozważ przesłanie obrazu o wyższej rozdzielczości.',
      blurry: 'Zdjęcie wydaje się rozmazane. Spróbuj zrobić ostrzejsze zdjęcie.',
    },
  };

  return messages[locale][warning] || messages.en[warning];
}
