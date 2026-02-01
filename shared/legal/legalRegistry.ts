// Stub types for legal registry
export interface LegalDocument {
  id: string;
  type: 'TOS' | 'PRIVACY' | 'COMMUNITY' | 'COOKIE';
  version: string;
  content: string;
  effectiveDate: any;
}

export interface UserConsent {
  userId: string;
  documentId: string;
  version: string;
  acceptedAt: any;
}

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {};
export const getCurrentLegalVersion = (type: string): string => '1.0.0';
