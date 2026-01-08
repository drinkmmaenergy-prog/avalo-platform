/**
 * PACK 158 — Evidence Classification Engine
 * 
 * Determines what content should be stored in legal evidence vault
 * STRICT PRIVACY PROTECTION: Only legal violations, never consensual adult content
 */

import {
  LegalEvidenceCategory,
  ProtectedPrivacyCategory,
  LegalViolationSeverity,
  EvidenceClassificationInput,
  EvidenceClassificationResult,
  PrivacyProtectionCheck,
  SafetyPrivacyDecision,
} from './types/pack158-legal-evidence.types';

const CHILD_EXPLOITATION_KEYWORDS = [
  'child', 'minor', 'underage', 'young', 'teen',
  'school', 'kid', 'baby', 'infant',
];

const VIOLENCE_THREAT_KEYWORDS = [
  'kill', 'murder', 'hurt', 'attack', 'shoot',
  'stab', 'beat', 'assault', 'violence', 'weapon',
];

const HARASSMENT_KEYWORDS = [
  'hate', 'ugly', 'disgusting', 'worthless', 'die',
  'slur', 'racist', 'homophobic', 'transphobic',
];

const BLACKMAIL_KEYWORDS = [
  'blackmail', 'extort', 'expose', 'leak', 'reveal',
  'publish', 'share', 'tell everyone', 'ruin',
];

const FRAUD_KEYWORDS = [
  'scam', 'fraud', 'fake', 'stolen', 'laundering',
  'chargeback', 'refund abuse', 'credit card',
];

const SEXUAL_SERVICES_KEYWORDS = [
  'escort', 'prostitution', 'sex work', 'hourly rate',
  'per hour', 'meetup fee', 'incall', 'outcall',
];

const EXTERNAL_FUNNEL_KEYWORDS = [
  'onlyfans', 'fansly', 'manyvids', 'chaturbate',
  'patreon', 'linktree', 'telegram', 'snapchat premium',
];

const CONSENSUAL_ROMANTIC_KEYWORDS = [
  'beautiful', 'handsome', 'cute', 'like you',
  'date', 'meet up', 'hang out', 'get to know',
  'interested', 'attracted', 'chemistry',
];

const CONSENSUAL_SEXUAL_KEYWORDS = [
  'sexy', 'hot', 'attractive', 'turned on',
  'exciting', 'pleasure', 'intimate', 'desire',
];

export async function classifyEvidence(
  input: EvidenceClassificationInput
): Promise<EvidenceClassificationResult> {
  const content = typeof input.content === 'string' ? input.content : '';
  const lowerContent = content.toLowerCase();

  const privacyCheck = checkPrivacyProtection(input);
  if (privacyCheck.cannotStore) {
    return {
      shouldStore: false,
      reasoning: privacyCheck.reasoning,
      isProtectedPrivacy: true,
      protectedCategory: privacyCheck.protectedCategory,
      triggeredLaws: [],
      requiresImmediateAction: false,
      confidence: 0.95,
    };
  }

  const legalCategory = detectLegalViolation(input, lowerContent);
  
  if (!legalCategory) {
    return {
      shouldStore: false,
      reasoning: 'No legal violation detected',
      isProtectedPrivacy: false,
      triggeredLaws: [],
      requiresImmediateAction: false,
      confidence: 0.9,
    };
  }

  const severity = determineSeverity(legalCategory, lowerContent);
  const laws = mapCategoryToLaws(legalCategory);

  return {
    shouldStore: true,
    category: legalCategory,
    severity,
    reasoning: `Legal violation detected: ${legalCategory}`,
    isProtectedPrivacy: false,
    triggeredLaws: laws,
    requiresImmediateAction: severity === LegalViolationSeverity.FEDERAL_CRIME,
    confidence: 0.85,
  };
}

function checkPrivacyProtection(
  input: EvidenceClassificationInput
): PrivacyProtectionCheck {
  const content = typeof input.content === 'string' ? input.content : '';
  const lowerContent = content.toLowerCase();

  const hasMonetization = detectMonetization(lowerContent);
  const hasCoercion = detectCoercion(lowerContent);
  const hasMinorIndicators = detectMinorIndicators(lowerContent);

  if (hasMinorIndicators) {
    return {
      isProtected: false,
      reasoning: 'Child safety concern overrides privacy protection',
      cannotStore: false,
    };
  }

  if (hasCoercion) {
    return {
      isProtected: false,
      reasoning: 'Coercion detected - not consensual',
      cannotStore: false,
    };
  }

  const hasRomanticKeywords = CONSENSUAL_ROMANTIC_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );
  const hasSexualKeywords = CONSENSUAL_SEXUAL_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );

  if ((hasRomanticKeywords || hasSexualKeywords) && !hasMonetization) {
    const category = hasRomanticKeywords 
      ? ProtectedPrivacyCategory.ROMANTIC_CONVERSATION
      : ProtectedPrivacyCategory.CONSENSUAL_SEXUAL_CONVERSATION;

    return {
      isProtected: true,
      protectedCategory: category,
      reasoning: 'Consensual adult conversation - protected privacy',
      cannotStore: true,
    };
  }

  return {
    isProtected: false,
    reasoning: 'No privacy protection applies',
    cannotStore: false,
  };
}

function detectLegalViolation(
  input: EvidenceClassificationInput,
  lowerContent: string
): LegalEvidenceCategory | null {
  if (detectChildExploitation(lowerContent, input.context)) {
    return LegalEvidenceCategory.CHILD_EXPLOITATION;
  }

  if (detectViolenceThreats(lowerContent)) {
    return LegalEvidenceCategory.VIOLENCE_THREATS;
  }

  if (detectHarassmentHateCrimes(lowerContent)) {
    return LegalEvidenceCategory.HARASSMENT_HATE_CRIMES;
  }

  if (detectBlackMailExtortion(lowerContent)) {
    return LegalEvidenceCategory.BLACKMAIL_EXTORTION;
  }

  if (detectFraudFinancialCrime(lowerContent, input.context)) {
    return LegalEvidenceCategory.FRAUD_FINANCIAL_CRIME;
  }

  if (detectIPTheftPiracy(lowerContent)) {
    return LegalEvidenceCategory.IP_THEFT_PIRACY;
  }

  if (detectRefundScams(lowerContent, input.context)) {
    return LegalEvidenceCategory.REFUND_SCAMS;
  }

  if (detectSexualServicesPricing(lowerContent)) {
    return LegalEvidenceCategory.SEXUAL_SERVICES_PRICING;
  }

  if (detectExternalNSFWFunnels(lowerContent)) {
    return LegalEvidenceCategory.EXTERNAL_NSFW_FUNNELS;
  }

  if (detectConsentWithdrawalIgnored(input.context)) {
    return LegalEvidenceCategory.CONSENT_WITHDRAWAL_IGNORED;
  }

  return null;
}

function detectChildExploitation(
  lowerContent: string,
  context: EvidenceClassificationInput['context']
): boolean {
  const hasChildKeywords = CHILD_EXPLOITATION_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );
  
  const hasSexualContext = lowerContent.match(
    /(sex|sexual|nude|naked|picture|photo|video|meet)/i
  );

  return hasChildKeywords && !!hasSexualContext;
}

function detectViolenceThreats(lowerContent: string): boolean {
  const threatScore = VIOLENCE_THREAT_KEYWORDS.reduce((score, kw) => {
    return score + (lowerContent.includes(kw) ? 1 : 0);
  }, 0);

  const hasDirectThreat = lowerContent.match(
    /(i will|im going to|i'll|gonna) (kill|hurt|attack|beat)/i
  );

  return threatScore >= 2 || !!hasDirectThreat;
}

function detectHarassmentHateCrimes(lowerContent: string): boolean {
  const harassmentScore = HARASSMENT_KEYWORDS.reduce((score, kw) => {
    return score + (lowerContent.includes(kw) ? 1 : 0);
  }, 0);

  const hasTargetedHate = lowerContent.match(
    /(you are|you're|all (women|men|blacks|whites|gays|trans))/i
  );

  return harassmentScore >= 3 || !!hasTargetedHate;
}

function detectBlackMailExtortion(lowerContent: string): boolean {
  const hasBlackmailKeywords = BLACKMAIL_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );

  const hasConditional = lowerContent.match(
    /(unless you|if you don't|pay me or)/i
  );

  return hasBlackmailKeywords && !!hasConditional;
}

function detectFraudFinancialCrime(
  lowerContent: string,
  context: EvidenceClassificationInput['context']
): boolean {
  const hasFraudKeywords = FRAUD_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );

  const hasFinancialIndicators = lowerContent.match(
    /(refund|chargeback|stolen card|fake payment|money laundering)/i
  );

  return hasFraudKeywords || !!hasFinancialIndicators;
}

function detectIPTheftPiracy(lowerContent: string): boolean {
  const hasIPKeywords = lowerContent.match(
    /(pirated|stolen content|leaked|ripped|cracked)/i
  );

  const hasDistributionIntent = lowerContent.match(
    /(share|upload|distribute|sell|repost)/i
  );

  return !!hasIPKeywords && !!hasDistributionIntent;
}

function detectRefundScams(
  lowerContent: string,
  context: EvidenceClassificationInput['context']
): boolean {
  const hasRefundAbuse = lowerContent.match(
    /(chargeback after|refund trick|get money back|dispute payment)/i
  );

  return !!hasRefundAbuse;
}

function detectSexualServicesPricing(lowerContent: string): boolean {
  const hasServiceKeywords = SEXUAL_SERVICES_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );

  const hasPricing = lowerContent.match(
    /(\$|€|£|\d+).*(hour|session|night|meet|incall|outcall)/i
  );

  return hasServiceKeywords || (!!hasPricing && lowerContent.includes('meet'));
}

function detectExternalNSFWFunnels(lowerContent: string): boolean {
  const hasExternalPlatform = EXTERNAL_FUNNEL_KEYWORDS.some(kw => 
    lowerContent.includes(kw)
  );

  const hasRedirect = lowerContent.match(
    /(check out my|follow me on|subscribe to|link in bio)/i
  );

  return hasExternalPlatform && !!hasRedirect;
}

function detectConsentWithdrawalIgnored(
  context: EvidenceClassificationInput['context']
): boolean {
  const hasConsentWithdrawal = context.metadata?.consentRevoked || 
    context.metadata?.userBlocked || 
    context.metadata?.stopRequested;

  const messageSentAfter = context.metadata?.messagesAfterStop > 0;

  return hasConsentWithdrawal && messageSentAfter;
}

function detectMonetization(lowerContent: string): boolean {
  const monetizationPatterns = [
    /pay.*(me|for)/i,
    /\$\d+/,
    /price|cost|fee|charge/i,
    /buy|purchase|subscribe/i,
    /tip|donation/i,
  ];

  return monetizationPatterns.some(pattern => pattern.test(lowerContent));
}

function detectCoercion(lowerContent: string): boolean {
  const coercionPatterns = [
    /(you have to|you must|you need to)/i,
    /(or else|otherwise|if you don't)/i,
    /(force|make you|pressure)/i,
  ];

  return coercionPatterns.some(pattern => pattern.test(lowerContent));
}

function detectMinorIndicators(lowerContent: string): boolean {
  const agePatterns = [
    /\b(1[0-7]|[0-9])\s*(years?\s*old|y\.?o\.?)\b/i,
    /\bunderage\b/i,
    /\bminor\b/i,
  ];

  return agePatterns.some(pattern => pattern.test(lowerContent));
}

function determineSeverity(
  category: LegalEvidenceCategory,
  content: string
): LegalViolationSeverity {
  switch (category) {
    case LegalEvidenceCategory.CHILD_EXPLOITATION:
      return LegalViolationSeverity.FEDERAL_CRIME;
    
    case LegalEvidenceCategory.VIOLENCE_THREATS:
      return content.includes('kill') || content.includes('murder')
        ? LegalViolationSeverity.FELONY
        : LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.HARASSMENT_HATE_CRIMES:
      return LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.BLACKMAIL_EXTORTION:
      return LegalViolationSeverity.FELONY;
    
    case LegalEvidenceCategory.FRAUD_FINANCIAL_CRIME:
      return LegalViolationSeverity.FELONY;
    
    case LegalEvidenceCategory.IP_THEFT_PIRACY:
      return LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.REFUND_SCAMS:
      return LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.SEXUAL_SERVICES_PRICING:
      return LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.EXTERNAL_NSFW_FUNNELS:
      return LegalViolationSeverity.MISDEMEANOR;
    
    case LegalEvidenceCategory.CONSENT_WITHDRAWAL_IGNORED:
      return LegalViolationSeverity.MISDEMEANOR;
    
    default:
      return LegalViolationSeverity.MISDEMEANOR;
  }
}

function mapCategoryToLaws(category: LegalEvidenceCategory): string[] {
  const lawMap: Record<LegalEvidenceCategory, string[]> = {
    [LegalEvidenceCategory.CHILD_EXPLOITATION]: [
      '18 USC 2251', '18 USC 2252', 'COPPA',
    ],
    [LegalEvidenceCategory.VIOLENCE_THREATS]: [
      '18 USC 875', 'State assault statutes',
    ],
    [LegalEvidenceCategory.HARASSMENT_HATE_CRIMES]: [
      '18 USC 249', 'State hate crime statutes',
    ],
    [LegalEvidenceCategory.BLACKMAIL_EXTORTION]: [
      '18 USC 873', '18 USC 1030',
    ],
    [LegalEvidenceCategory.FRAUD_FINANCIAL_CRIME]: [
      '18 USC 1341', '18 USC 1343', '18 USC 1956',
    ],
    [LegalEvidenceCategory.IP_THEFT_PIRACY]: [
      '17 USC 501', 'DMCA',
    ],
    [LegalEvidenceCategory.REFUND_SCAMS]: [
      '18 USC 1341', 'Wire fraud statutes',
    ],
    [LegalEvidenceCategory.SEXUAL_SERVICES_PRICING]: [
      'State prostitution statutes', 'FOSTA-SESTA',
    ],
    [LegalEvidenceCategory.EXTERNAL_NSFW_FUNNELS]: [
      'Platform TOS violations',
    ],
    [LegalEvidenceCategory.CONSENT_WITHDRAWAL_IGNORED]: [
      'Harassment statutes', 'Cyberstalking laws',
    ],
  };

  return lawMap[category] || [];
}

export async function makeSafetyPrivacyDecision(
  input: EvidenceClassificationInput
): Promise<SafetyPrivacyDecision> {
  const classification = await classifyEvidence(input);

  if (classification.isProtectedPrivacy) {
    return {
      decision: 'PROTECT_PRIVACY',
      category: classification.protectedCategory,
      reasoning: classification.reasoning,
      confidence: classification.confidence,
    };
  }

  if (classification.shouldStore) {
    return {
      decision: 'STORE_EVIDENCE',
      category: classification.category,
      reasoning: classification.reasoning,
      confidence: classification.confidence,
    };
  }

  if (classification.confidence < 0.7) {
    return {
      decision: 'REQUIRES_REVIEW',
      reasoning: 'Low confidence classification - human review needed',
      confidence: classification.confidence,
    };
  }

  return {
    decision: 'PROTECT_PRIVACY',
    reasoning: 'No legal violation, privacy protection applies',
    confidence: 0.9,
  };
}