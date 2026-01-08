/**
 * PACK 143 - Safety Validation Middleware
 * Enforces ethical guidelines for CRM Business Suite
 * 
 * Blocks: romantic content, NSFW, emotional manipulation, external payments
 */

import {
  SafetyValidationResult,
  FORBIDDEN_LABEL_PATTERNS,
  FORBIDDEN_CONTENT_PATTERNS,
  ALLOWED_PRODUCT_TYPES,
} from './pack143-types';

export class CRMSafetyValidator {
  static validateLabel(labelName: string): SafetyValidationResult {
    const violations: string[] = [];
    const normalizedLabel = labelName.toLowerCase().trim();

    for (const pattern of FORBIDDEN_LABEL_PATTERNS) {
      if (pattern.test(normalizedLabel)) {
        violations.push(`Label contains forbidden pattern: ${pattern.source}`);
      }
    }

    if (normalizedLabel.length < 2) {
      violations.push('Label must be at least 2 characters');
    }

    if (normalizedLabel.length > 50) {
      violations.push('Label must be 50 characters or less');
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 0 ? 'high' : 'low',
    };
  }

  static validateBroadcastContent(content: string, subject?: string): SafetyValidationResult {
    const violations: string[] = [];
    const fullText = `${subject || ''} ${content}`.toLowerCase();

    for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
      if (pattern.test(fullText)) {
        violations.push(`Content contains forbidden pattern: ${pattern.source}`);
      }
    }

    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = fullText.match(urlRegex) || [];
    
    for (const url of urls) {
      if (this.isExternalMonetizationLink(url)) {
        violations.push(`External monetization link detected: ${url}`);
      }
    }

    if (this.containsEmotionalManipulation(fullText)) {
      violations.push('Content contains emotional manipulation patterns');
    }

    if (this.containsRomanticLanguage(fullText)) {
      violations.push('Content contains romantic or flirtatious language');
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 2 ? 'critical' : violations.length > 0 ? 'high' : 'low',
    };
  }

  static validateFunnelStep(messageTemplate: string): SafetyValidationResult {
    const violations: string[] = [];
    const normalized = messageTemplate.toLowerCase();

    if (normalized.includes('pay') && (normalized.includes('attention') || normalized.includes('notice me'))) {
      violations.push('Funnel step contains "pay for attention" pattern');
    }

    if (this.containsEmotionalManipulation(normalized)) {
      violations.push('Funnel step contains emotional manipulation');
    }

    if (this.containsRomanticLanguage(normalized)) {
      violations.push('Funnel step contains romantic language');
    }

    for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
      if (pattern.test(normalized)) {
        violations.push(`Funnel step contains forbidden pattern: ${pattern.source}`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 0 ? 'critical' : 'low',
    };
  }

  static validateProductType(productType: string): SafetyValidationResult {
    const violations: string[] = [];

    if (!ALLOWED_PRODUCT_TYPES.includes(productType)) {
      violations.push(`Product type "${productType}" is not allowed`);
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 0 ? 'high' : 'low',
    };
  }

  static validateSegmentFilters(filters: any): SafetyValidationResult {
    const violations: string[] = [];

    if (filters.personalAttributes) {
      violations.push('Cannot filter by personal attributes');
    }

    if (filters.location) {
      violations.push('Cannot filter by location');
    }

    if (filters.wealthIndicators) {
      violations.push('Cannot filter by wealth indicators');
    }

    if (filters.vulnerabilityScore) {
      violations.push('Cannot target vulnerable users');
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 0 ? 'critical' : 'low',
    };
  }

  private static isExternalMonetizationLink(url: string): boolean {
    const normalized = url.toLowerCase();
    const blockedDomains = [
      'paypal.com',
      'venmo.com',
      'cashapp.com',
      'stripe.com',
      'onlyfans.com',
      'patreon.com',
      't.me',
      'telegram.me',
      'wa.me',
      'whatsapp.com',
      'opensea.io',
      'rarible.com',
    ];

    return blockedDomains.some(domain => normalized.includes(domain));
  }

  private static containsEmotionalManipulation(text: string): boolean {
    const manipulationPatterns = [
      /only you can help/i,
      /no one else understands/i,
      /you're special to me/i,
      /i need you/i,
      /thinking about you/i,
      /can't stop thinking/i,
      /exclusive just for you/i,
      /vip access for you/i,
    ];

    return manipulationPatterns.some(pattern => pattern.test(text));
  }

  private static containsRomanticLanguage(text: string): boolean {
    const romanticPatterns = [
      /\blove\b.*\byou\b/i,
      /\bmiss\b.*\byou\b/i,
      /\badore\b.*\byou\b/i,
      /flirt|dating|romantic|relationship/i,
      /meet me offline|meet in person/i,
      /sugar daddy|sugar baby/i,
      /intimate|sensual|seductive/i,
    ];

    return romanticPatterns.some(pattern => pattern.test(text));
  }

  static validateFunnel(funnel: any): SafetyValidationResult {
    const violations: string[] = [];

    if (!funnel.name || funnel.name.trim().length < 2) {
      violations.push('Funnel name is required and must be at least 2 characters');
    }

    if (funnel.steps && funnel.steps.length > 10) {
      violations.push('Funnel cannot have more than 10 steps');
    }

    if (funnel.steps) {
      for (const step of funnel.steps) {
        if (step.action?.messageTemplate) {
          const stepValidation = this.validateFunnelStep(step.action.messageTemplate);
          if (!stepValidation.isValid) {
            violations.push(...stepValidation.violations);
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 2 ? 'critical' : violations.length > 0 ? 'high' : 'low',
    };
  }

  static validateBroadcast(broadcast: any): SafetyValidationResult {
    const violations: string[] = [];

    if (broadcast.targetCount > 10000) {
      violations.push('Broadcast cannot target more than 10,000 contacts');
    }

    const contentValidation = this.validateBroadcastContent(
      broadcast.content,
      broadcast.subject
    );

    if (!contentValidation.isValid) {
      violations.push(...contentValidation.violations);
    }

    return {
      isValid: violations.length === 0,
      violations,
      severity: violations.length > 2 ? 'critical' : violations.length > 0 ? 'high' : 'low',
    };
  }
}