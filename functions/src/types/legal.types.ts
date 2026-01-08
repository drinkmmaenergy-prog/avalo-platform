/**
 * PACK 89: Legal & Policy Center - Type Definitions
 * Comprehensive types for legal document management and acceptance tracking
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// =======================================================
// 📜 LEGAL DOCUMENT TYPES
// =======================================================

/**
 * Legal document type enumeration
 */
export type LegalDocumentType = 
  | 'TOS'              // Terms of Service
  | 'PRIVACY'          // Privacy Policy
  | 'CONTENT_POLICY'   // Content Policy
  | 'SAFETY_POLICY'    // Safety Policy
  | 'PAYOUT_TERMS'     // Payout Terms & Conditions
  | 'KYC_TERMS';       // KYC Terms & Conditions

/**
 * Legal Document stored in Firestore
 */
export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: number;
  language: string; // ISO code (e.g., "en", "pl")
  title: string;
  url: string; // Storage URL to PDF/HTML version
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// =======================================================
// ✅ LEGAL ACCEPTANCE TRACKING
// =======================================================

/**
 * User's legal document acceptance record
 * Document ID: userId
 */
export interface LegalAcceptance {
  userId: string;
  accepted: {
    TOS?: number;
    PRIVACY?: number;
    CONTENT_POLICY?: number;
    SAFETY_POLICY?: number;
    PAYOUT_TERMS?: number;
    KYC_TERMS?: number;
  };
  updatedAt: Timestamp | FieldValue;
}

/**
 * Audit log entry for legal acceptances
 */
export interface LegalAcceptanceAudit {
  auditId: string;
  userId: string;
  type: LegalDocumentType;
  version: number;
  acceptedAt: Timestamp | FieldValue;
  ipAddress?: string;
  userAgent?: string;
  platform: 'mobile' | 'web';
}

// =======================================================
// 🚪 REQUIREMENT CHECKING
// =======================================================

/**
 * Legal requirement for a specific action
 */
export interface LegalRequirement {
  type: LegalDocumentType;
  currentVersion: number;
  userAcceptedVersion?: number;
  required: boolean;
  pending: boolean; // True if user needs to accept/re-accept
}

/**
 * Result of legal requirements check
 */
export interface LegalRequirementsResult {
  allSatisfied: boolean;
  requirements: LegalRequirement[];
  pendingTypes: LegalDocumentType[];
}

/**
 * Action that requires legal acceptance
 */
export type ProtectedAction = 
  | 'SIGNUP'
  | 'PUBLISH_CONTENT'
  | 'ENABLE_EARNING'
  | 'REQUEST_PAYOUT'
  | 'SUBMIT_KYC';

/**
 * Mapping of actions to required legal document types
 */
export const ACTION_REQUIREMENTS: Record<ProtectedAction, LegalDocumentType[]> = {
  SIGNUP: ['TOS', 'PRIVACY'],
  PUBLISH_CONTENT: ['CONTENT_POLICY', 'SAFETY_POLICY'],
  ENABLE_EARNING: ['PAYOUT_TERMS', 'KYC_TERMS'],
  REQUEST_PAYOUT: ['PAYOUT_TERMS'],
  SUBMIT_KYC: ['KYC_TERMS']
};

// =======================================================
// 📤 CLOUD FUNCTION REQUEST/RESPONSE TYPES
// =======================================================

/**
 * Request to get legal requirements for user
 */
export interface GetLegalRequirementsRequest {
  action: ProtectedAction;
}

/**
 * Response from getLegalRequirementsForUser
 */
export interface GetLegalRequirementsResponse {
  allSatisfied: boolean;
  requirements: LegalRequirement[];
  pendingTypes: LegalDocumentType[];
}

/**
 * Request to accept a legal document
 */
export interface AcceptLegalDocumentRequest {
  type: LegalDocumentType;
  version: number;
  platform: 'mobile' | 'web';
}

/**
 * Response from acceptLegalDocument
 */
export interface AcceptLegalDocumentResponse {
  success: boolean;
  message: string;
  newAcceptance?: {
    type: LegalDocumentType;
    version: number;
  };
}

/**
 * Request to upload a new legal document (admin only)
 */
export interface UploadLegalDocumentRequest {
  type: LegalDocumentType;
  language: string;
  title: string;
  url: string;
}

/**
 * Response from admin_uploadLegalDocument
 */
export interface UploadLegalDocumentResponse {
  success: boolean;
  message: string;
  document?: {
    id: string;
    type: LegalDocumentType;
    version: number;
  };
}

// =======================================================
// 🔒 VALIDATION ERRORS
// =======================================================

/**
 * Legal acceptance validation error
 */
export interface LegalValidationError {
  code: 'LEGAL_ACCEPTANCE_REQUIRED';
  message: string;
  requiredDocuments: {
    type: LegalDocumentType;
    currentVersion: number;
  }[];
  action: ProtectedAction;
}