import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Types for legal registry
export interface LegalDocument {
  id: string;
  type: LegalDocType;
  version: string;
  content: string;
  effectiveDate: any;
  lang?: LegalLang;
}

export type LegalDocType = 'TOS' | 'PRIVACY' | 'COMMUNITY' | 'COOKIE' | 'CREATOR_AGREEMENT' | 'PAYMENT_TERMS';

export type LegalLang = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'pl' | 'ru' | 'ja' | 'ko' | 'zh';

export interface UserConsent {
  userId: string;
  documentId: string;
  version: string;
  acceptedAt: any;
}

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {};

export const LEGAL_DOCS: Record<LegalDocType, { currentVersion: string; requiredForSignup: boolean }> = {
  TOS: { currentVersion: '1.0.0', requiredForSignup: true },
  PRIVACY: { currentVersion: '1.0.0', requiredForSignup: true },
  COMMUNITY: { currentVersion: '1.0.0', requiredForSignup: true },
  COOKIE: { currentVersion: '1.0.0', requiredForSignup: false },
  CREATOR_AGREEMENT: { currentVersion: '1.0.0', requiredForSignup: false },
  PAYMENT_TERMS: { currentVersion: '1.0.0', requiredForSignup: false },
};

export const getCurrentLegalVersion = (type: string): string => '1.0.0';




























