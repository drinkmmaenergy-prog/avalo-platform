/**
 * PACK 295 - Globalization & Localization
 * Legal Documents Routing and Management
 */

import { LocaleCode, FALLBACK_LOCALE_ORDER } from "./locales";

/**
 * Legal document types
 */
export type LegalDocType = 
  | "TERMS_OF_SERVICE"
  | "PRIVACY_POLICY"
  | "COMMUNITY_GUIDELINES"
  | "SAFETY_POLICY"
  | "COOKIE_POLICY"
  | "AGE_VERIFICATION_POLICY";

/**
 * Legal document metadata
 */
export interface LegalDocument {
  docId: LegalDocType;
  version: string; // e.g., "2025-01-01-v1"
  locale: LocaleCode;
  region: string; // "GLOBAL" | ISO 3166-1 alpha-2
  title: string;
  url: string;
  requiredForSignup: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  supersededBy: string | null; // docId:version or null
}

/**
 * User's legal acceptance record
 */
export interface LegalAcceptance {
  docId: LegalDocType;
  version: string;
  acceptedAt: string; // ISO datetime
  ipAddress?: string;
  userAgent?: string;
}

/**
 * User legal acceptances collection document
 */
export interface UserLegalAcceptances {
  userId: string;
  acceptances: LegalAcceptance[];
  lastUpdated: string; // ISO datetime
}

/**
 * Priority order for selecting legal documents
 * 1. Same region + same locale
 * 2. Same region + fallback locale
 * 3. GLOBAL + same locale
 * 4. GLOBAL + fallback locale
 */
export function selectLegalDocument(
  documents: LegalDocument[],
  docType: LegalDocType,
  userLocale: LocaleCode,
  userRegion: string
): LegalDocument | null {
  const candidates = documents.filter(doc => doc.docId === docType);
  
  if (candidates.length === 0) {
    return null;
  }
  
  // Priority 1: Same region + same locale
  let match = candidates.find(
    doc => doc.region === userRegion && doc.locale === userLocale
  );
  if (match) return match;
  
  // Priority 2: Same region + fallback locale
  for (const fallbackLocale of FALLBACK_LOCALE_ORDER) {
    match = candidates.find(
      doc => doc.region === userRegion && doc.locale === fallbackLocale
    );
    if (match) return match;
  }
  
  // Priority 3: GLOBAL + same locale
  match = candidates.find(
    doc => doc.region === "GLOBAL" && doc.locale === userLocale
  );
  if (match) return match;
  
  // Priority 4: GLOBAL + fallback locale
  for (const fallbackLocale of FALLBACK_LOCALE_ORDER) {
    match = candidates.find(
      doc => doc.region === "GLOBAL" && doc.locale === fallbackLocale
    );
    if (match) return match;
  }
  
  // Fallback: Return any document of the requested type
  return candidates[0] || null;
}

/**
 * Check if user has accepted a specific version of a document
 */
export function hasAcceptedDocument(
  acceptances: UserLegalAcceptances | null,
  docType: LegalDocType,
  requiredVersion: string
): boolean {
  if (!acceptances) return false;
  
  const acceptance = acceptances.acceptances.find(a => a.docId === docType);
  return acceptance?.version === requiredVersion;
}

/**
 * Check if user needs to accept new legal documents
 */
export function needsLegalAcceptance(
  currentDocs: LegalDocument[],
  userAcceptances: UserLegalAcceptances | null,
  userLocale: LocaleCode,
  userRegion: string
): LegalDocument[] {
  const requiredDocs = currentDocs.filter(doc => doc.requiredForSignup);
  const unaccepted: LegalDocument[] = [];
  
  for (const docType of ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "COMMUNITY_GUIDELINES"] as LegalDocType[]) {
    const selectedDoc = selectLegalDocument(currentDocs, docType, userLocale, userRegion);
    
    if (selectedDoc && selectedDoc.requiredForSignup) {
      if (!hasAcceptedDocument(userAcceptances, docType, selectedDoc.version)) {
        unaccepted.push(selectedDoc);
      }
    }
  }
  
  return unaccepted;
}

/**
 * Create legal acceptance record
 */
export function createAcceptanceRecord(
  docType: LegalDocType,
  version: string,
  ipAddress?: string,
  userAgent?: string
): LegalAcceptance {
  return {
    docId: docType,
    version,
    acceptedAt: new Date().toISOString(),
    ipAddress,
    userAgent,
  };
}

/**
 * Get legal document display title
 */
export function getLegalDocTitle(docType: LegalDocType): string {
  const titles: Record<LegalDocType, string> = {
    TERMS_OF_SERVICE: "Terms of Service",
    PRIVACY_POLICY: "Privacy Policy",
    COMMUNITY_GUIDELINES: "Community Guidelines",
    SAFETY_POLICY: "Safety Policy",
    COOKIE_POLICY: "Cookie Policy",
    AGE_VERIFICATION_POLICY: "Age Verification Policy",
  };
  
  return titles[docType];
}