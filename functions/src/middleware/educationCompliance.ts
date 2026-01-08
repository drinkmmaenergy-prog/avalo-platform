import { ScamDetectionResult } from '../types/education.types';

const BLOCKED_CATEGORIES = [
  'crypto',
  'forex',
  'trading_signals',
  'get_rich',
  'alpha_male',
  'pickup_artist',
  'escort',
  'seduction',
  'romance_coaching'
];

const SCAM_KEYWORDS = [
  'get rich quick',
  'guaranteed income',
  'earn.*week',
  'no skills needed',
  'become rich overnight',
  'financial freedom guaranteed',
  'passive income guaranteed',
  '100% profit',
  'risk-free money',
  'easy money',
  'make money while you sleep',
  'get rich in.*days',
  'millionaire in.*months',
  'unlimited income potential',
  'no work required',
  'automatic wealth',
  'instant riches'
];

const MANIPULATIVE_KEYWORDS = [
  'alpha male secrets',
  'seduce.*women',
  'pickup techniques',
  'emotional manipulation',
  'dark psychology sales',
  'nlp manipulation',
  'control.*minds',
  'hypnotic selling'
];

const EROTIC_KEYWORDS = [
  'escort business',
  'sex work',
  'adult entertainment',
  'intimate services',
  'sensual coaching',
  'romantic access',
  'private relationship',
  'exclusive intimacy'
];

const GAMBLING_KEYWORDS = [
  'forex signals',
  'crypto pump',
  'trading bot',
  'guaranteed profit',
  'binary options',
  'sports betting system',
  'casino strategy',
  'gambling system'
];

export function detectScamClaims(text: string): ScamDetectionResult {
  const lowerText = text.toLowerCase();
  const flags: string[] = [];
  const reasons: string[] = [];
  let riskScore = 0;

  for (const keyword of SCAM_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(lowerText)) {
      flags.push(`scam_keyword_${keyword}`);
      reasons.push(`Contains suspicious claim: "${keyword}"`);
      riskScore += 25;
    }
  }

  for (const keyword of MANIPULATIVE_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(lowerText)) {
      flags.push(`manipulative_${keyword}`);
      reasons.push(`Contains manipulative content: "${keyword}"`);
      riskScore += 30;
    }
  }

  for (const keyword of EROTIC_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(lowerText)) {
      flags.push(`erotic_${keyword}`);
      reasons.push(`Contains prohibited erotic content: "${keyword}"`);
      riskScore += 50;
    }
  }

  for (const keyword of GAMBLING_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(lowerText)) {
      flags.push(`gambling_${keyword}`);
      reasons.push(`Contains gambling-related content: "${keyword}"`);
      riskScore += 40;
    }
  }

  const incomePromiseRegex = /\b\d{1,3}[,.]?\d{0,3}\s*(pln|usd|eur|gbp|dollars?|euros?|pounds?)\s*(per|\/|\ba\b)\s*(week|month|day)\b/i;
  if (incomePromiseRegex.test(lowerText)) {
    flags.push('specific_income_promise');
    reasons.push('Contains specific income promise (e.g., "5000 PLN/week")');
    riskScore += 35;
  }

  const percentagePromiseRegex = /\b\d{2,3}%\s*(profit|return|roi|gains?)\b/i;
  if (percentagePromiseRegex.test(lowerText)) {
    flags.push('percentage_promise');
    reasons.push('Contains unrealistic percentage promise');
    riskScore += 30;
  }

  const guaranteedRegex = /\bguaranteed?\s*(income|profit|results?|success|money|wealth)\b/i;
  if (guaranteedRegex.test(lowerText)) {
    flags.push('guaranteed_results');
    reasons.push('Makes guaranteed income/success claims');
    riskScore += 25;
  }

  const cryptoRegex = /\b(bitcoin|crypto|blockchain|nft|defi|web3)\s*(invest|trading|course)\b/i;
  if (cryptoRegex.test(lowerText)) {
    flags.push('crypto_content');
    reasons.push('Contains cryptocurrency investment content');
    riskScore += 45;
  }

  riskScore = Math.min(riskScore, 100);

  const isScam = riskScore >= 50;
  const confidence = riskScore / 100;

  return {
    isScam,
    confidence,
    flags,
    reasons,
    riskScore
  };
}

export function isBlockedCategory(category: string): boolean {
  const lowerCategory = category.toLowerCase();
  return BLOCKED_CATEGORIES.some(blocked => lowerCategory.includes(blocked));
}

export function validateCourseContent(data: {
  title: string;
  description: string;
  category: string;
  price: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (isBlockedCategory(data.category)) {
    errors.push(`Category "${data.category}" is permanently blocked`);
  }

  const titleCheck = detectScamClaims(data.title);
  if (titleCheck.isScam) {
    errors.push(`Title contains prohibited claims: ${titleCheck.reasons.join(', ')}`);
  }

  const descriptionCheck = detectScamClaims(data.description);
  if (descriptionCheck.isScam) {
    errors.push(`Description contains prohibited claims: ${descriptionCheck.reasons.join(', ')}`);
  }

  if (data.price < 0) {
    errors.push('Price cannot be negative');
  }

  if (data.price > 50000) {
    errors.push('Price exceeds maximum allowed (50,000 currency units)');
  }

  const combinedRisk = (titleCheck.riskScore + descriptionCheck.riskScore) / 2;
  if (combinedRisk >= 30) {
    errors.push(`Overall content risk score too high: ${combinedRisk.toFixed(1)}/100`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateMarketingClaim(claim: string): { valid: boolean; reason?: string } {
  const scamCheck = detectScamClaims(claim);
  
  if (scamCheck.isScam) {
    return {
      valid: false,
      reason: `Marketing claim violates policy: ${scamCheck.reasons[0]}`
    };
  }

  const realisticEarnings = /learn.*earn|improve.*income|grow.*business/i;
  if (!realisticEarnings.test(claim) && /earn|income|money|profit/i.test(claim)) {
    return {
      valid: false,
      reason: 'Income claims must be realistic and contextual'
    };
  }

  return { valid: true };
}

export function calculateComplianceScore(course: {
  title: string;
  description: string;
  category: string;
  price: number;
}): number {
  let score = 100;

  const titleCheck = detectScamClaims(course.title);
  score -= titleCheck.riskScore * 0.5;

  const descriptionCheck = detectScamClaims(course.description);
  score -= descriptionCheck.riskScore * 0.7;

  if (isBlockedCategory(course.category)) {
    score -= 50;
  }

  if (course.price > 30000) {
    score -= 10;
  } else if (course.price > 20000) {
    score -= 5;
  }

  if (course.price === 0) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function detectEroticUpsells(upsellData: {
  title: string;
  description: string;
  benefits?: string[];
}): boolean {
  const allText = [
    upsellData.title,
    upsellData.description,
    ...(upsellData.benefits || [])
  ].join(' ').toLowerCase();

  const eroticPatterns = [
    /private.*time/i,
    /exclusive.*access.*(?:me|coach|mentor)/i,
    /personal.*relationship/i,
    /intimate.*session/i,
    /romantic.*reward/i,
    /sensual/i,
    /seductive/i,
    /emotional.*bond/i,
    /loyalty.*reward.*(?:romantic|intimate|personal)/i
  ];

  return eroticPatterns.some(pattern => pattern.test(allText));
}

export function validateUpsell(upsellData: {
  title: string;
  description: string;
  type: string;
  benefits?: string[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const allowedTypes = ['bonus_module', 'template', 'worksheet', 'coaching_session', 'certificate'];
  if (!allowedTypes.includes(upsellData.type)) {
    errors.push(`Upsell type "${upsellData.type}" is not allowed`);
  }

  if (detectEroticUpsells(upsellData)) {
    errors.push('Upsell contains prohibited erotic or romantic content');
  }

  const scamCheck = detectScamClaims(upsellData.description);
  if (scamCheck.isScam) {
    errors.push(`Upsell contains scam claims: ${scamCheck.reasons.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function detectMinorTargetedContent(data: {
  title: string;
  description: string;
  targetAudience?: string[];
}): boolean {
  const allText = [
    data.title,
    data.description,
    ...(data.targetAudience || [])
  ].join(' ').toLowerCase();

  const minorPatterns = [
    /\bkids?\b/i,
    /\bchildren\b/i,
    /\bteen(s|ager)?\b/i,
    /\byouth\b/i,
    /under\s*18/i,
    /\bminor(s)?\b/i,
    /\badolescent(s)?\b/i,
    /school\s*age/i
  ];

  return minorPatterns.some(pattern => pattern.test(allText));
}

export function enforceRealisticClaims(text: string): string[] {
  const violations: string[] = [];

  if (/\d{4,}\s*(?:pln|usd|eur).*(?:week|day)/i.test(text)) {
    violations.push('Contains unrealistic short-term income claim');
  }

  if (/(?:no|zero|without)\s*(?:skills?|experience|work)/i.test(text)) {
    violations.push('Claims no skills or work required');
  }

  if (/(?:overnight|instant|immediate).*(?:success|rich|wealth|money)/i.test(text)) {
    violations.push('Claims instant success or wealth');
  }

  if (/100%.*(?:guaranteed|certain|sure)/i.test(text)) {
    violations.push('Makes 100% guarantee claims');
  }

  return violations;
}

export interface ComplianceCheckResult {
  passed: boolean;
  score: number;
  scamRisk: number;
  violations: string[];
  warnings: string[];
  blockedContent: string[];
}

export function performFullComplianceCheck(courseData: {
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  price: number;
  targetAudience?: string[];
  learningObjectives?: string[];
}): ComplianceCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const blockedContent: string[] = [];

  if (isBlockedCategory(courseData.category)) {
    blockedContent.push(`Category "${courseData.category}" is permanently blocked`);
  }

  const contentValidation = validateCourseContent(courseData);
  if (!contentValidation.valid) {
    violations.push(...contentValidation.errors);
  }

  if (detectMinorTargetedContent(courseData)) {
    warnings.push('Course appears to target minors - additional review required');
  }

  const titleViolations = enforceRealisticClaims(courseData.title);
  if (titleViolations.length > 0) {
    violations.push(...titleViolations.map(v => `Title: ${v}`));
  }

  const descViolations = enforceRealisticClaims(courseData.description);
  if (descViolations.length > 0) {
    violations.push(...descViolations.map(v => `Description: ${v}`));
  }

  const titleScam = detectScamClaims(courseData.title);
  const descScam = detectScamClaims(courseData.description);
  const scamRisk = (titleScam.riskScore + descScam.riskScore) / 2;

  const score = calculateComplianceScore(courseData);

  const passed = violations.length === 0 && blockedContent.length === 0 && scamRisk < 50;

  return {
    passed,
    score,
    scamRisk,
    violations,
    warnings,
    blockedContent
  };
}