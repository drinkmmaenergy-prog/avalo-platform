/**
 * PACK 151 - Sponsorship Safety Guards
 * Automatic detection and blocking of NSFW, romantic, and manipulative content
 */

import { SponsorshipSafetyViolation } from './types';

const ROMANTIC_KEYWORDS = [
  'date', 'dating', 'flirt', 'flirting', 'romance', 'romantic', 'love',
  'boyfriend', 'girlfriend', 'sugar', 'escort', 'companion', 'affection',
  'intimacy', 'intimate', 'sensual', 'seductive', 'sexy', 'hot',
  'dm me', 'private chat', 'personal attention', 'special attention',
  'emotional support', 'companionship', 'exclusive time', 'private time'
];

const NSFW_KEYWORDS = [
  'nsfw', 'adult', 'explicit', 'erotic', 'sexual', 'nude', 'naked',
  'onlyfans', 'of link', 'adult content', 'xxx', '18+', 'mature content',
  'spicy', 'naughty', 'kinky', 'fetish'
];

const EXTERNAL_PAYMENT_KEYWORDS = [
  'paypal', 'venmo', 'cashapp', 'cash app', 'telegram', 'whatsapp',
  'snapchat', 'instagram dm', 'twitter dm', 'discord', 'kik',
  'onlyfans', 'patreon', 'buy me a coffee', 'ko-fi', 'tip me',
  'send me', 'payment outside', 'direct payment'
];

const ATTENTION_FUNNEL_PATTERNS = [
  'buy this and i\'ll',
  'support me and get',
  'purchase and receive',
  'dm for special',
  'private review if you',
  'exclusive access if',
  'special treatment for buyers'
];

const SEDUCTIVE_POSING_INDICATORS = [
  'lingerie', 'bikini', 'underwear', 'bra', 'bedroom', 'bed',
  'provocative', 'revealing', 'cleavage', 'sultry', 'alluring'
];

export class SponsorshipSafetyGuard {
  
  static checkText(text: string): SponsorshipSafetyViolation[] {
    const violations: SponsorshipSafetyViolation[] = [];
    const lowerText = text.toLowerCase();

    const romanticMatches = ROMANTIC_KEYWORDS.filter(kw => lowerText.includes(kw));
    if (romanticMatches.length > 0) {
      violations.push({
        type: 'romantic',
        severity: romanticMatches.length > 2 ? 'high' : 'medium',
        description: `Romantic content detected: ${romanticMatches.join(', ')}`,
        detected: new Date(),
        evidence: romanticMatches
      });
    }

    const nsfwMatches = NSFW_KEYWORDS.filter(kw => lowerText.includes(kw));
    if (nsfwMatches.length > 0) {
      violations.push({
        type: 'nsfw',
        severity: 'critical',
        description: `NSFW content detected: ${nsfwMatches.join(', ')}`,
        detected: new Date(),
        evidence: nsfwMatches
      });
    }

    const externalMatches = EXTERNAL_PAYMENT_KEYWORDS.filter(kw => lowerText.includes(kw));
    if (externalMatches.length > 0) {
      violations.push({
        type: 'external_links',
        severity: 'high',
        description: `External payment platform detected: ${externalMatches.join(', ')}`,
        detected: new Date(),
        evidence: externalMatches
      });
    }

    const attentionMatches = ATTENTION_FUNNEL_PATTERNS.filter(pattern => 
      lowerText.includes(pattern)
    );
    if (attentionMatches.length > 0) {
      violations.push({
        type: 'attention_funnel',
        severity: 'high',
        description: `Attention funnel pattern detected: ${attentionMatches.join(', ')}`,
        detected: new Date(),
        evidence: attentionMatches
      });
    }

    const seductiveMatches = SEDUCTIVE_POSING_INDICATORS.filter(kw => lowerText.includes(kw));
    if (seductiveMatches.length > 0) {
      violations.push({
        type: 'seductive',
        severity: 'high',
        description: `Seductive posing indicator detected: ${seductiveMatches.join(', ')}`,
        detected: new Date(),
        evidence: seductiveMatches
      });
    }

    return violations;
  }

  static checkCaption(caption: string): { passed: boolean; violations: SponsorshipSafetyViolation[] } {
    const violations = this.checkText(caption);
    
    const criticalViolations = violations.filter(v => 
      v.severity === 'critical' || v.type === 'nsfw'
    );

    if (criticalViolations.length > 0) {
      return { passed: false, violations };
    }

    const highSeverityCount = violations.filter(v => v.severity === 'high').length;
    if (highSeverityCount >= 2) {
      return { passed: false, violations };
    }

    return { passed: violations.length === 0, violations };
  }

  static checkOfferDescription(description: string): { passed: boolean; violations: SponsorshipSafetyViolation[] } {
    const violations = this.checkText(description);
    
    const blocked = violations.filter(v => 
      v.type === 'romantic' || v.type === 'nsfw' || v.type === 'attention_funnel'
    );

    return { passed: blocked.length === 0, violations };
  }

  static validateDeliverableContent(content: {
    caption?: string;
    description?: string;
  }): { 
    passed: boolean; 
    violations: SponsorshipSafetyViolation[];
    flags: {
      hasRomanticContent: boolean;
      hasNSFWContent: boolean;
      hasExternalLinks: boolean;
      hasSeductivePosing: boolean;
    };
  } {
    const allText = [content.caption, content.description].filter(Boolean).join(' ');
    const violations = this.checkText(allText);

    const flags = {
      hasRomanticContent: violations.some(v => v.type === 'romantic'),
      hasNSFWContent: violations.some(v => v.type === 'nsfw'),
      hasExternalLinks: violations.some(v => v.type === 'external_links'),
      hasSeductivePosing: violations.some(v => v.type === 'seductive')
    };

    const criticalViolations = violations.filter(v => 
      v.type === 'nsfw' || 
      v.type === 'romantic' ||
      (v.type === 'external_links' && v.severity === 'high')
    );

    return {
      passed: criticalViolations.length === 0,
      violations,
      flags
    };
  }

  static detectProhibitedPatterns(text: string): string[] {
    const prohibitedPatterns = [
      /dm\s+me\s+(and|for|to)/i,
      /buy\s+this\s+(and|to)\s+get/i,
      /special\s+(attention|treatment|access)\s+for/i,
      /(support|purchase)\s+and\s+(receive|get)/i,
      /private\s+(chat|session|time)\s+if/i
    ];

    const matches: string[] = [];
    for (const pattern of prohibitedPatterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    return matches;
  }

  static calculateViolationScore(violations: SponsorshipSafetyViolation[]): number {
    let score = 0;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'critical': score += 10; break;
        case 'high': score += 5; break;
        case 'medium': score += 2; break;
        case 'low': score += 1; break;
      }
    }
    return score;
  }

  static determineEscalationLevel(violationScore: number): number {
    if (violationScore >= 10) return 3;
    if (violationScore >= 5) return 2;
    if (violationScore >= 2) return 1;
    return 0;
  }

  static generateSafetyReport(violations: SponsorshipSafetyViolation[]): {
    passed: boolean;
    score: number;
    escalationLevel: number;
    summary: string;
    recommendations: string[];
  } {
    const score = this.calculateViolationScore(violations);
    const escalationLevel = this.determineEscalationLevel(score);
    const passed = score === 0;

    const violationTypes = new Set(violations.map(v => v.type));
    const recommendations: string[] = [];

    if (violationTypes.has('romantic')) {
      recommendations.push('Remove all references to dating, romance, or emotional services');
    }
    if (violationTypes.has('nsfw')) {
      recommendations.push('Remove all adult, explicit, or NSFW content');
    }
    if (violationTypes.has('external_links')) {
      recommendations.push('Remove references to external payment platforms');
    }
    if (violationTypes.has('attention_funnel')) {
      recommendations.push('Remove manipulative attention-for-purchase patterns');
    }
    if (violationTypes.has('seductive')) {
      recommendations.push('Ensure professional, non-seductive product presentation');
    }

    const summary = passed 
      ? 'Content passed all safety checks'
      : `Content flagged with ${violations.length} violation(s). Score: ${score}/10`;

    return {
      passed,
      score,
      escalationLevel,
      summary,
      recommendations
    };
  }

  static isContentAppropriateForSponsorship(content: {
    caption?: string;
    description?: string;
    tags?: string[];
  }): boolean {
    const allText = [
      content.caption,
      content.description,
      ...(content.tags || [])
    ].filter(Boolean).join(' ');

    const result = this.checkCaption(allText);
    return result.passed;
  }

  static sanitizeCaption(caption: string): string {
    let sanitized = caption;

    for (const keyword of [...ROMANTIC_KEYWORDS, ...NSFW_KEYWORDS, ...EXTERNAL_PAYMENT_KEYWORDS]) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '[REDACTED]');
    }

    return sanitized;
  }
}

export interface SponsorshipSafetyCheck {
  contentId: string;
  contentType: 'offer' | 'deliverable' | 'caption';
  passed: boolean;
  violations: SponsorshipSafetyViolation[];
  flags: {
    hasRomanticContent: boolean;
    hasNSFWContent: boolean;
    hasExternalLinks: boolean;
    hasSeductivePosing: boolean;
  };
  score: number;
  escalationLevel: number;
  checkedAt: Date;
}

export function createSafetyCheck(
  contentId: string,
  contentType: 'offer' | 'deliverable' | 'caption',
  content: { caption?: string; description?: string }
): SponsorshipSafetyCheck {
  const validation = SponsorshipSafetyGuard.validateDeliverableContent(content);
  const report = SponsorshipSafetyGuard.generateSafetyReport(validation.violations);

  return {
    contentId,
    contentType,
    passed: validation.passed,
    violations: validation.violations,
    flags: validation.flags,
    score: report.score,
    escalationLevel: report.escalationLevel,
    checkedAt: new Date()
  };
}