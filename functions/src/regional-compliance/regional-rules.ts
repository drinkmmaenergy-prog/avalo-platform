/**
 * PACK 199: Regional Rules Data Structures
 * Predefined compliance rules for each region
 */

import { RegionalRule, RegionCode } from './types';
import { Timestamp } from 'firebase-admin/firestore';

const currentTimestamp = Timestamp.now();

export const REGIONAL_RULES: Record<RegionCode, RegionalRule> = {
  EU: {
    id: 'eu-gdpr-dma',
    regionCode: 'EU',
    countryCode: 'EU',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'GDPR',
          description: 'General Data Protection Regulation',
          enforced: true,
          minAge: 16,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: true,
        },
        {
          ruleName: 'DMA',
          description: 'Digital Markets Act',
          enforced: true,
          minAge: 18,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: true,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'EU Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Clear labeling required for sponsored content',
          restrictedCategories: ['alcohol', 'gambling', 'medical-claims'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'EU Content Moderation',
          modestyRequired: false,
          defamationSensitivity: 'medium',
          harassmentThreshold: 3,
          streamingRestrictions: ['hate-speech', 'violence'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'EU Consumer Rights Directive',
          refundPeriodDays: 14,
          coolingOffPeriod: true,
          mandatoryWarnings: ['digital-content-no-refund'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'EU Financial Compliance',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'eu-cyberbullying',
        category: 'cyberbullying',
        threshold: 3,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'EU Crisis Helpline',
            phone: '116123',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['hate', 'threat', 'abuse'],
          sensitive: ['discrimination', 'harassment'],
          prohibited: ['violence', 'exploitation'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'supplements',
        subcategory: 'health-claims',
        prohibited: false,
        requiresLicense: true,
        ageRestricted: false,
        warningRequired: true,
        autoRemove: false,
        reason: 'EU requires licensed health claims',
      },
    ],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'gdpr-consent',
        language: 'en',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  US: {
    id: 'us-coppa-ftc',
    regionCode: 'US',
    countryCode: 'US',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'COPPA',
          description: 'Children Online Privacy Protection Act',
          enforced: true,
          minAge: 13,
          consentRequired: true,
          dataRetentionDays: 730,
          rightToErasure: true,
          dataPortability: false,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'FTC Advertising Guidelines',
          transparencyRequired: true,
          disclosureFormat: 'Clear and conspicuous disclosure',
          restrictedCategories: ['tobacco', 'firearms', 'medical-devices'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'US Content Moderation',
          modestyRequired: false,
          defamationSensitivity: 'medium',
          harassmentThreshold: 5,
          streamingRestrictions: ['illegal-activities', 'minors'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'State Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: false,
          mandatoryWarnings: ['california-prop65'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'US Financial Regulations',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: false,
        },
      ],
    },
    safetyRules: [
      {
        id: 'us-harassment',
        category: 'harassment',
        threshold: 5,
        autoEscalate: false,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'National Suicide Prevention Lifeline',
            phone: '988',
            website: 'https://988lifeline.org',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['threat', 'stalking', 'abuse'],
          sensitive: ['bullying', 'harassment'],
          prohibited: ['violence', 'child-exploitation'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'supplements',
        subcategory: 'dietary',
        prohibited: false,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: true,
        autoRemove: false,
        reason: 'FDA disclaimer required',
      },
    ],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'coppa-notice',
        language: 'en',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  UK: {
    id: 'uk-asa',
    regionCode: 'UK',
    countryCode: 'GB',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'UK GDPR',
          description: 'UK General Data Protection Regulation',
          enforced: true,
          minAge: 16,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'ASA Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Clear #ad or #sponsored tags',
          restrictedCategories: ['gambling', 'alcohol', 'junk-food'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'UK Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'high',
          harassmentThreshold: 3,
          streamingRestrictions: ['hate-speech', 'terrorism'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'UK Consumer Rights',
          refundPeriodDays: 14,
          coolingOffPeriod: true,
          mandatoryWarnings: ['digital-content-exemptions'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'UK Financial Conduct',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'uk-defamation',
        category: 'defamation',
        threshold: 2,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'Samaritans',
            phone: '116123',
            website: 'https://www.samaritans.org',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['libel', 'slander', 'defamation'],
          sensitive: ['harassment', 'bullying'],
          prohibited: ['violence', 'terrorism'],
        },
      },
    ],
    marketplaceRestrictions: [],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'uk-data-protection',
        language: 'en',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  BR: {
    id: 'br-lgpd',
    regionCode: 'BR',
    countryCode: 'BR',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'LGPD',
          description: 'Lei Geral de Proteção de Dados',
          enforced: true,
          minAge: 18,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Brazilian Advertising Code',
          transparencyRequired: true,
          disclosureFormat: 'Publicidade or Patrocinado label required',
          restrictedCategories: ['tobacco', 'alcohol', 'medication'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Brazilian Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'medium',
          harassmentThreshold: 4,
          streamingRestrictions: ['violence', 'drugs'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'CDC - Código de Defesa do Consumidor',
          refundPeriodDays: 7,
          coolingOffPeriod: true,
          mandatoryWarnings: ['digital-purchases'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Brazilian Financial Rules',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'br-harassment',
        category: 'harassment',
        threshold: 4,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'CVV - Centro de Valorização da Vida',
            phone: '188',
            website: 'https://www.cvv.org.br',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['ameaça', 'abuso', 'assédio'],
          sensitive: ['discriminação', 'bullying'],
          prohibited: ['violência', 'exploração'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'gambling',
        subcategory: 'betting',
        prohibited: false,
        requiresLicense: true,
        ageRestricted: true,
        warningRequired: true,
        autoRemove: false,
        reason: 'Gambling regulated by Brazilian law',
      },
    ],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'lgpd-consent',
        language: 'pt-BR',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  AE: {
    id: 'ae-uae-compliance',
    regionCode: 'AE',
    countryCode: 'AE',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'UAE Data Protection Law',
          description: 'UAE Federal Data Protection Law',
          enforced: true,
          minAge: 21,
          consentRequired: true,
          dataRetentionDays: 180,
          rightToErasure: false,
          dataPortability: false,
          geoBlocking: true,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'UAE Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Clear sponsorship disclosure',
          restrictedCategories: ['alcohol', 'gambling', 'dating', 'immodest-content'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'UAE Content Standards',
          modestyRequired: true,
          defamationSensitivity: 'critical',
          harassmentThreshold: 1,
          streamingRestrictions: ['immodest-attire', 'alcohol', 'religious-criticism', 'political-content'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'UAE Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: false,
          mandatoryWarnings: ['sharia-compliance'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'UAE Financial Regulations',
          cryptoAllowed: false,
          taxReporting: false,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'ae-modesty',
        category: 'cyberbullying',
        threshold: 1,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'police',
            name: 'UAE Police CID',
            phone: '999',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['immodest', 'inappropriate', 'offensive'],
          sensitive: ['religious', 'political', 'royal-family'],
          prohibited: ['blasphemy', 'pornography', 'drugs', 'alcohol'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'clothing',
        subcategory: 'revealing-fitness-wear',
        prohibited: true,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: false,
        autoRemove: true,
        reason: 'Immodest clothing prohibited in UAE',
      },
      {
        category: 'crypto',
        subcategory: 'trading-signals',
        prohibited: true,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: false,
        autoRemove: true,
        reason: 'Crypto trading not allowed',
      },
    ],
    uxAdaptations: [
      {
        type: 'warning',
        contentKey: 'uae-modesty-requirements',
        language: 'ar',
        mandatory: true,
        frequency: 'on-action',
      },
    ],
  },

  SA: {
    id: 'sa-saudi-compliance',
    regionCode: 'SA',
    countryCode: 'SA',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'Saudi Data Protection Law',
          description: 'Personal Data Protection Law (PDPL)',
          enforced: true,
          minAge: 21,
          consentRequired: true,
          dataRetentionDays: 180,
          rightToErasure: false,
          dataPortability: false,
          geoBlocking: true,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Saudi Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Clear disclosure in Arabic',
          restrictedCategories: ['alcohol', 'gambling', 'dating', 'immodest-products'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Saudi Content Standards',
          modestyRequired: true,
          defamationSensitivity: 'critical',
          harassmentThreshold: 1,
          streamingRestrictions: ['immodest-attire', 'mixing-genders', 'religious-criticism', 'political-content', 'royal-criticism'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'Saudi Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: false,
          mandatoryWarnings: ['sharia-compliance', 'halal-certification'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Saudi Financial Regulations',
          cryptoAllowed: false,
          taxReporting: false,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'sa-strict-modesty',
        category: 'cyberbullying',
        threshold: 1,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'police',
            name: 'Saudi Police',
            phone: '999',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['immodest', 'inappropriate', 'blasphemous'],
          sensitive: ['religious', 'political', 'royal-family', 'gender-mixing'],
          prohibited: ['blasphemy', 'pornography', 'drugs', 'alcohol', 'lgbt'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'clothing',
        subcategory: 'all-revealing-wear',
        prohibited: true,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: false,
        autoRemove: true,
        reason: 'Strict modesty requirements in Saudi Arabia',
      },
      {
        category: 'crypto',
        subcategory: 'all-crypto-products',
        prohibited: true,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: false,
        autoRemove: true,
        reason: 'Crypto not permitted',
      },
    ],
    uxAdaptations: [
      {
        type: 'warning',
        contentKey: 'saudi-strict-modesty',
        language: 'ar',
        mandatory: true,
        frequency: 'daily',
      },
    ],
  },

  JP: {
    id: 'jp-japan-compliance',
    regionCode: 'JP',
    countryCode: 'JP',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'APPI',
          description: 'Act on Protection of Personal Information',
          enforced: true,
          minAge: 20,
          consentRequired: true,
          dataRetentionDays: 730,
          rightToErasure: true,
          dataPortability: false,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Japan Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'PR or 広告 label required',
          restrictedCategories: ['medical-claims', 'cosmetic-claims'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Japan Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'critical',
          harassmentThreshold: 2,
          streamingRestrictions: ['defamation', 'privacy-violation'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'Japan Consumer Protection',
          refundPeriodDays: 8,
          coolingOffPeriod: true,
          mandatoryWarnings: ['specified-commercial-transactions'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Japan Financial Regulations',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'jp-defamation-sensitive',
        category: 'defamation',
        threshold: 1,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'Tokyo Metropolitan Police',
            phone: '110',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['名誉毀損', '侮辱', 'プライバシー侵害'],
          sensitive: ['個人情報', '誹謗中傷'],
          prohibited: ['脅迫', '暴力', '詐欺'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'skincare',
        subcategory: 'whitening-products',
        prohibited: false,
        requiresLicense: true,
        ageRestricted: false,
        warningRequired: true,
        autoRemove: false,
        reason: 'Unapproved whitening products require government certification',
      },
    ],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'japan-privacy-notice',
        language: 'ja',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  KR: {
    id: 'kr-korea-compliance',
    regionCode: 'KR',
    countryCode: 'KR',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'PIPA',
          description: 'Personal Information Protection Act',
          enforced: true,
          minAge: 19,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Korea Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: '협찬 or 광고 label required',
          restrictedCategories: ['medical-claims', 'cosmetic-surgery'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Korea Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'critical',
          harassmentThreshold: 2,
          streamingRestrictions: ['defamation', 'cyberbullying', 'privacy-violation'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'Korea Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: true,
          mandatoryWarnings: ['digital-content-terms'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Korea Financial Regulations',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'kr-cyberbullying-sensitive',
        category: 'cyberbullying',
        threshold: 2,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'Korea Suicide Prevention Center',
            phone: '1393',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['명예훼손', '모욕', '사이버괴롭힘'],
          sensitive: ['개인정보', '악플'],
          prohibited: ['협박', '폭력', '사기'],
        },
      },
    ],
    marketplaceRestrictions: [],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'korea-privacy-notice',
        language: 'ko',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  IN: {
    id: 'in-india-compliance',
    regionCode: 'IN',
    countryCode: 'IN',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'DPDPA',
          description: 'Digital Personal Data Protection Act',
          enforced: true,
          minAge: 18,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'India Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Sponsored or Paid Partnership label',
          restrictedCategories: ['tobacco', 'alcohol', 'political-ads'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'India Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'high',
          harassmentThreshold: 3,
          streamingRestrictions: ['religious-content', 'political-content', 'regional-tensions'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'India Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: false,
          mandatoryWarnings: ['digital-marketplace-rules'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'India Financial Regulations',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'in-scam-protection',
        category: 'harassment',
        threshold: 3,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'police',
            name: 'National Cyber Crime Portal',
            phone: '155260',
            website: 'https://cybercrime.gov.in',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['scam', 'fraud', 'harassment'],
          sensitive: ['religious', 'caste', 'communal'],
          prohibited: ['violence', 'terrorism', 'child-exploitation'],
        },
      },
    ],
    marketplaceRestrictions: [
      {
        category: 'crypto',
        subcategory: 'financial-scams',
        prohibited: true,
        requiresLicense: false,
        ageRestricted: false,
        warningRequired: false,
        autoRemove: true,
        reason: 'Financial scams strictly prohibited',
      },
    ],
    uxAdaptations: [
      {
        type: 'warning',
        contentKey: 'india-scam-warning',
        language: 'en',
        mandatory: true,
        frequency: 'weekly',
      },
    ],
  },

  AU: {
    id: 'au-australia-compliance',
    regionCode: 'AU',
    countryCode: 'AU',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'Privacy Act',
          description: 'Australian Privacy Principles',
          enforced: true,
          minAge: 18,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: true,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Australian Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Ad or Sponsored label required',
          restrictedCategories: ['gambling', 'alcohol', 'tobacco'],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Australia Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'medium',
          harassmentThreshold: 4,
          streamingRestrictions: ['violence', 'drugs'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'Australian Consumer Law',
          refundPeriodDays: 14,
          coolingOffPeriod: true,
          mandatoryWarnings: ['acl-consumer-guarantees'],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Australian Financial Regulations',
          cryptoAllowed: true,
          taxReporting: true,
          antiMoneyLaundering: true,
          kycRequired: true,
        },
      ],
    },
    safetyRules: [
      {
        id: 'au-online-safety',
        category: 'cyberbullying',
        threshold: 4,
        autoEscalate: true,
        localAuthorities: [
          {
            type: 'crisis',
            name: 'Lifeline Australia',
            phone: '131114',
            website: 'https://www.lifeline.org.au',
            available24x7: true,
          },
        ],
        terminology: {
          offensive: ['abuse', 'threat', 'harassment'],
          sensitive: ['bullying', 'discrimination'],
          prohibited: ['violence', 'child-exploitation'],
        },
      },
    ],
    marketplaceRestrictions: [],
    uxAdaptations: [
      {
        type: 'legal-popup',
        contentKey: 'australia-consumer-rights',
        language: 'en',
        mandatory: true,
        frequency: 'once',
      },
    ],
  },

  OTHER: {
    id: 'other-default',
    regionCode: 'OTHER',
    countryCode: 'XX',
    enabled: true,
    lastUpdated: currentTimestamp,
    version: '1.0.0',
    legalFramework: {
      dataProtection: [
        {
          ruleName: 'Default Data Protection',
          description: 'Generic data protection standards',
          enforced: true,
          minAge: 18,
          consentRequired: true,
          dataRetentionDays: 365,
          rightToErasure: true,
          dataPortability: false,
          geoBlocking: false,
        },
      ],
      advertisingRules: [
        {
          ruleName: 'Default Advertising Standards',
          transparencyRequired: true,
          disclosureFormat: 'Clear disclosure required',
          restrictedCategories: [],
        },
      ],
      contentModeration: [
        {
          ruleName: 'Default Content Standards',
          modestyRequired: false,
          defamationSensitivity: 'medium',
          harassmentThreshold: 5,
          streamingRestrictions: ['illegal-activities'],
        },
      ],
      consumerProtection: [
        {
          ruleName: 'Default Consumer Protection',
          refundPeriodDays: 7,
          coolingOffPeriod: false,
          mandatoryWarnings: [],
        },
      ],
      financialCompliance: [
        {
          ruleName: 'Default Financial Compliance',
          cryptoAllowed: true,
          taxReporting: false,
          antiMoneyLaundering: false,
          kycRequired: false,
        },
      ],
    },
    safetyRules: [
      {
        id: 'other-safety',
        category: 'cyberbullying',
        threshold: 5,
        autoEscalate: false,
        localAuthorities: [],
        terminology: {
          offensive: ['threat', 'abuse', 'harassment'],
          sensitive: ['bullying', 'discrimination'],
          prohibited: ['violence', 'exploitation'],
        },
      },
    ],
    marketplaceRestrictions: [],
    uxAdaptations: [],
  },
};