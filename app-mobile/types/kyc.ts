/**
 * PACK 84 — KYC & Identity Verification Types (Mobile)
 */

// KYC Status Types
export type KycStatus = 
  | "NOT_STARTED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "BLOCKED";

export type KycLevel = 
  | "NONE"
  | "BASIC";

export type DocumentType = 
  | "ID_CARD"
  | "PASSPORT"
  | "DRIVERS_LICENSE";

export type DocumentStatus = 
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

// KYC Status Response
export interface KycStatusResponse {
  userId: string;
  status: KycStatus;
  level: KycLevel;
  lastUpdatedAt: string;
  rejectionReason?: string;
  canRequestPayout: boolean;
}

// KYC Document Response
export interface KycDocumentResponse {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  country: string;
  fullName: string;
  dateOfBirth: string;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

// KYC Application Form Data
export interface KycApplicationFormData {
  documentType: DocumentType;
  frontImageUrl: string;
  backImageUrl?: string;
  selfieImageUrl: string;
  country: string;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
}

// UI State Types
export interface KycFormState {
  step: 'personal' | 'document' | 'upload';
  personalData: {
    fullName: string;
    dateOfBirth: string;
    country: string;
  };
  documentData: {
    documentType: DocumentType;
  };
  uploadData: {
    frontImageUrl: string;
    backImageUrl?: string;
    selfieImageUrl: string;
  };
}

// Helper function to get status display info
export function getKycStatusDisplay(status: KycStatus): {
  label: string;
  description: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'NOT_STARTED':
      return {
        label: 'Not Started',
        description: 'You must complete verification to request payouts.',
        color: '#6B7280',
        icon: 'alert-circle-outline',
      };
    case 'PENDING':
      return {
        label: 'Under Review',
        description: 'Your verification is under review. This usually takes 1-2 business days.',
        color: '#F59E0B',
        icon: 'time-outline',
      };
    case 'VERIFIED':
      return {
        label: 'Verified',
        description: 'You are verified and eligible for payouts.',
        color: '#10B981',
        icon: 'checkmark-circle-outline',
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        description: 'Your verification was rejected. Please review the reason and resubmit.',
        color: '#EF4444',
        icon: 'close-circle-outline',
      };
    case 'BLOCKED':
      return {
        label: 'Blocked',
        description: 'Your account is not eligible for payouts.',
        color: '#DC2626',
        icon: 'ban-outline',
      };
  }
}

// Helper function to get document type display name
export function getDocumentTypeDisplay(type: DocumentType): string {
  switch (type) {
    case 'ID_CARD':
      return 'ID Card';
    case 'PASSPORT':
      return 'Passport';
    case 'DRIVERS_LICENSE':
      return 'Driver\'s License';
  }
}

// Validation helpers
export function validateDateOfBirth(dateStr: string): boolean {
  // Check format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  const now = new Date();
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return false;
  }
  
  // Check if user is at least 18 years old
  const age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();
  
  if (age < 18 || (age === 18 && (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)))) {
    return false;
  }
  
  // Check if date is not in the future
  if (date > now) {
    return false;
  }
  
  return true;
}

export function validateFullName(name: string): boolean {
  return name.trim().length >= 2 && /^[a-zA-Z\s\-']+$/.test(name);
}

export function validateCountry(country: string): boolean {
  return country.length === 2 && /^[A-Z]{2}$/.test(country);
}