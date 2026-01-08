/**
 * PACK 84 — KYC Service
 * Client-side service for KYC operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type {
  KycStatusResponse,
  KycDocumentResponse,
  KycApplicationFormData,
} from '../types/kyc';

/**
 * Get KYC status for authenticated user
 */
export async function getKycStatus(userId: string): Promise<KycStatusResponse> {
  try {
    const callable = httpsCallable<{ userId?: string }, KycStatusResponse>(
      functions,
      'kyc_getStatus'
    );
    
    const result = await callable({ userId });
    return result.data;
  } catch (error: any) {
    console.error('Error getting KYC status:', error);
    throw new Error(error.message || 'Failed to get KYC status');
  }
}

/**
 * Submit KYC application
 */
export async function submitKycApplication(
  userId: string,
  payload: KycApplicationFormData
): Promise<{ success: boolean; documentId: string; message: string }> {
  try {
    const callable = httpsCallable<
      { payload: KycApplicationFormData },
      { success: boolean; documentId: string; message: string }
    >(functions, 'kyc_submitApplication');
    
    const result = await callable({ payload });
    return result.data;
  } catch (error: any) {
    console.error('Error submitting KYC application:', error);
    
    // Extract error message from Firebase error
    const message = error.message || error.details?.message || 'Failed to submit KYC application';
    throw new Error(message);
  }
}

/**
 * Get submitted KYC documents
 */
export async function getKycDocuments(
  userId: string
): Promise<KycDocumentResponse[]> {
  try {
    const callable = httpsCallable<
      { userId?: string },
      { documents: KycDocumentResponse[] }
    >(functions, 'kyc_getDocuments');
    
    const result = await callable({ userId });
    return result.data.documents;
  } catch (error: any) {
    console.error('Error getting KYC documents:', error);
    throw new Error(error.message || 'Failed to get KYC documents');
  }
}

/**
 * Upload image to Firebase Storage for KYC
 * @param userId - User ID for storage path
 * @param imageUri - Local image URI
 * @param imageType - Type of image (front, back, selfie)
 * @returns Storage URL
 */
export async function uploadKycImage(
  userId: string,
  imageUri: string,
  imageType: 'front' | 'back' | 'selfie'
): Promise<string> {
  try {
    // In a real implementation, this would upload to Firebase Storage
    // For now, return a placeholder URL
    // TODO: Implement actual Firebase Storage upload
    
    console.log(`Uploading KYC image for user ${userId}, type: ${imageType}`);
    
    // Simulated upload - replace with actual Firebase Storage implementation
    const timestamp = Date.now();
    const storageUrl = `kyc_images/${userId}/${imageType}_${timestamp}.jpg`;
    
    // In real implementation, use Firebase Storage:
    // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
    // import { storage } from '../lib/firebase';
    // const storageRef = ref(storage, storageUrl);
    // const response = await fetch(imageUri);
    // const blob = await response.blob();
    // await uploadBytes(storageRef, blob);
    // const downloadUrl = await getDownloadURL(storageRef);
    // return downloadUrl;
    
    return `https://storage.googleapis.com/avalo-c8c46.appspot.com/${storageUrl}`;
  } catch (error: any) {
    console.error('Error uploading KYC image:', error);
    throw new Error('Failed to upload image');
  }
}

/**
 * Validate KYC form data before submission
 */
export function validateKycFormData(
  data: Partial<KycApplicationFormData>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  if (!data.documentType) {
    errors.documentType = 'Document type is required';
  }
  
  if (!data.frontImageUrl) {
    errors.frontImageUrl = 'Front image of document is required';
  }
  
  if (!data.selfieImageUrl) {
    errors.selfieImageUrl = 'Selfie image is required';
  }
  
  if (!data.country || data.country.length !== 2) {
    errors.country = 'Valid country code is required';
  }
  
  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.fullName = 'Full name is required';
  }
  
  if (!data.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) {
    errors.dateOfBirth = 'Valid date of birth is required (YYYY-MM-DD)';
  } else {
    // Validate age (must be 18+)
    const birthDate = new Date(data.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    
    if (age < 18 || (age === 18 && (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)))) {
      errors.dateOfBirth = 'You must be at least 18 years old';
    }
    
    if (birthDate > today) {
      errors.dateOfBirth = 'Date of birth cannot be in the future';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Check if user can request payout based on KYC status
 */
export function canRequestPayout(status: KycStatusResponse): {
  canRequest: boolean;
  reason?: string;
} {
  if (status.status === 'VERIFIED' && status.level === 'BASIC') {
    return { canRequest: true };
  }
  
  if (status.status === 'NOT_STARTED') {
    return {
      canRequest: false,
      reason: 'You must complete identity verification to request payouts',
    };
  }
  
  if (status.status === 'PENDING') {
    return {
      canRequest: false,
      reason: 'Your verification is under review. Please wait for approval.',
    };
  }
  
  if (status.status === 'REJECTED') {
    return {
      canRequest: false,
      reason: 'Your verification was rejected. Please resubmit with correct information.',
    };
  }
  
  if (status.status === 'BLOCKED') {
    return {
      canRequest: false,
      reason: 'Your account is not eligible for payouts.',
    };
  }
  
  return {
    canRequest: false,
    reason: 'Verification required',
  };
}

// List of countries (ISO 3166-1 alpha-2 codes)
export const COUNTRIES = [
  { code: 'PL', name: 'Poland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'RO', name: 'Romania' },
  // Add more countries as needed
].sort((a, b) => a.name.localeCompare(b.name));