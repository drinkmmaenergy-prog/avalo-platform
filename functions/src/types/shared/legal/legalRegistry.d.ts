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
export declare const LEGAL_DOCUMENTS: Record<string, LegalDocument>;
export declare const getCurrentLegalVersion: (type: string) => string;
