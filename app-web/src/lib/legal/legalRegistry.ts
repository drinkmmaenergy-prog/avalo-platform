/**
 * PACK 338a - Legal Document Registry (Web)
 * Local web-only legal document registry
 */

export interface LegalDocument {
  title: string;
  version: string;
  effectiveDate: string;
  url: string;
}

export interface LegalDocumentSet {
  en: LegalDocument;
  pl: LegalDocument;
}

export const LEGAL_DOCS: Record<string, LegalDocumentSet> = {
  terms: {
    en: {
      title: 'Terms of Service',
      version: '2.1',
      effectiveDate: '2025-01-01',
      url: '/legal/terms-en',
    },
    pl: {
      title: 'Regulamin',
      version: '2.1',
      effectiveDate: '2025-01-01',
      url: '/legal/terms-pl',
    },
  },
  privacy: {
    en: {
      title: 'Privacy Policy',
      version: '2.0',
      effectiveDate: '2025-01-01',
      url: '/legal/privacy-en',
    },
    pl: {
      title: 'Polityka Prywatności',
      version: '2.0',
      effectiveDate: '2025-01-01',
      url: '/legal/privacy-pl',
    },
  },
  guidelines: {
    en: {
      title: 'Community Guidelines',
      version: '1.5',
      effectiveDate: '2025-01-01',
      url: '/legal/guidelines-en',
    },
    pl: {
      title: 'Zasady Społeczności',
      version: '1.5',
      effectiveDate: '2025-01-01',
      url: '/legal/guidelines-pl',
    },
  },
  refunds: {
    en: {
      title: 'Refund Policy',
      version: '1.2',
      effectiveDate: '2025-01-01',
      url: '/legal/refunds-en',
    },
    pl: {
      title: 'Polityka Zwrotów',
      version: '1.2',
      effectiveDate: '2025-01-01',
      url: '/legal/refunds-pl',
    },
  },
  ageVerification: {
    en: {
      title: 'Age Verification Policy',
      version: '1.1',
      effectiveDate: '2025-01-01',
      url: '/legal/age-verification-en',
    },
    pl: {
      title: 'Polityka Weryfikacji Wieku',
      version: '1.1',
      effectiveDate: '2025-01-01',
      url: '/legal/age-verification-pl',
    },
  },
};

export type LegalDocKey = keyof typeof LEGAL_DOCS;

export function getAllLegalDocKeys(): LegalDocKey[] {
  return Object.keys(LEGAL_DOCS) as LegalDocKey[];
}

