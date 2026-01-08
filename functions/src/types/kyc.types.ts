/**
 * PACK 84 — KYC & Identity Verification Types
 * Type definitions for KYC and identity verification
 */

// KYC Status Types
export type KycStatus = 
  | "NOT_STARTED"   // User has not submitted KYC
  | "PENDING"       // KYC submitted, awaiting review
  | "VERIFIED"      // KYC approved, user can request payouts
  | "REJECTED"      // KYC rejected, user can resubmit
  | "BLOCKED";      // Permanently blocked from payouts

export type KycLevel = 
  | "NONE"          // No verification
  | "BASIC";        // Basic ID verification (required for payouts)

// Document Types
export type DocumentType = 
  | "ID_CARD"
  | "PASSPORT"
  | "DRIVERS_LICENSE";

export type DocumentStatus = 
  | "PENDING"       // Submitted, awaiting review
  | "APPROVED"      // Verified by admin
  | "REJECTED";     // Rejected by admin

// User KYC Status (Collection: user_kyc_status)
export interface UserKycStatus {
  userId: string;                    // Primary key / doc id
  status: KycStatus;                 // Current KYC status
  level: KycLevel;                   // Verification level
  lastUpdatedAt: FirebaseFirestore.Timestamp;
  reviewerId?: string;               // Admin who last changed status
  rejectionReason?: string;          // If status = REJECTED or BLOCKED
}

// User KYC Document (Collection: user_kyc_documents)
export interface UserKycDocument {
  id: string;                        // UUID
  userId: string;                    // Owner
  status: DocumentStatus;            // Document review status
  documentType: DocumentType;        // Type of ID document
  frontImageUrl: string;             // Storage URL for front of document
  backImageUrl?: string;             // Optional back image (for two-sided docs)
  selfieImageUrl: string;            // Selfie holding document
  country: string;                   // ISO country code (e.g., "PL", "DE")
  fullName: string;                  // Full name from document
  dateOfBirth: string;               // YYYY-MM-DD format
  submittedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewerId?: string;               // Admin who reviewed
  rejectionReason?: string;          // If status = REJECTED
}

// KYC Application Payload (for submission)
export interface KycApplicationPayload {
  documentType: DocumentType;
  frontImageUrl: string;
  backImageUrl?: string;
  selfieImageUrl: string;
  country: string;
  fullName: string;
  dateOfBirth: string;              // YYYY-MM-DD
}

// KYC Review Actions
export interface ApproveKycPayload {
  userId: string;
  documentId: string;
  reviewerId: string;
}

export interface RejectKycPayload {
  userId: string;
  documentId: string;
  reviewerId: string;
  reason: string;
}

export interface BlockKycPayload {
  userId: string;
  reviewerId: string;
  reason: string;
}

// Response Types
export interface KycStatusResponse {
  userId: string;
  status: KycStatus;
  level: KycLevel;
  lastUpdatedAt: string;            // ISO string
  rejectionReason?: string;
  canRequestPayout: boolean;        // Computed field
}

export interface KycDocumentResponse {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  country: string;
  fullName: string;
  dateOfBirth: string;
  submittedAt: string;              // ISO string
  reviewedAt?: string;              // ISO string
  rejectionReason?: string;
  // Note: Image URLs not returned to client for security
}

// Error Types
export class KycError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "KycError";
  }
}

// KYC Error Codes
export const KYC_ERROR_CODES = {
  // Submission errors
  INVALID_STATUS_FOR_SUBMISSION: "INVALID_STATUS_FOR_SUBMISSION",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_DOCUMENT_TYPE: "INVALID_DOCUMENT_TYPE",
  INVALID_DATE_FORMAT: "INVALID_DATE_FORMAT",
  
  // Verification errors
  KYC_REQUIRED: "KYC_REQUIRED",
  KYC_PENDING: "KYC_PENDING",
  KYC_REJECTED: "KYC_REJECTED",
  KYC_BLOCKED: "KYC_BLOCKED",
  
  // Review errors
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  ALREADY_REVIEWED: "ALREADY_REVIEWED",
  
  // General errors
  UNAUTHORIZED: "UNAUTHORIZED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const;