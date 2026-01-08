/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * MonetizationTransparencyEnforcer - Enforce transparency rules
 * 
 * Ensures:
 * - Clear pricing display
 * - Clear subscription terms
 * - Simple cancel flows
 * - Region-aware compliance
 */

export enum Region {
  EU = 'EU',
  US = 'US',
  UK = 'UK',
  LATAM = 'LATAM',
  APAC = 'APAC',
  GLOBAL = 'GLOBAL'
}

export interface TransparencyRule {
  id: string;
  name: string;
  description: string;
  regions: Region[];
  required: boolean;
  validator: (data: any) => TransparencyViolation | null;
}

export interface TransparencyViolation {
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  field: string;
  suggestedFix: string;
  regulatoryReference?: string;
}

export interface PricingDisplay {
  amount: number;
  currency: string;
  displayText: string;
  recurring: boolean;
  recurringPeriod?: 'day' | 'week' | 'month' | 'year';
  trialPeriod?: number;
  trialPeriodUnit?: 'day' | 'week' | 'month';
  originalPrice?: number;
  discountPercentage?: number;
  taxes?: {
    included: boolean;
    amount?: number;
    description: string;
  };
  additionalFees?: Array<{
    name: string;
    amount: number;
    description: string;
  }>;
}

export interface SubscriptionTerms {
  duration?: string;
  autoRenewal: boolean;
  renewalNotice: boolean;
  renewalNoticeDays?: number;
  cancellationPolicy: string;
  refundPolicy: string;
  termsUrl: string;
  privacyUrl: string;
}

export interface CancelFlow {
  maxSteps: number;
  requiresLogin: boolean;
  requiresReason: boolean;
  requiresConfirmation: boolean;
  allowsImmediate: boolean;
  processTimeDescription: string;
  contactMethods: string[];
}

export interface MonetizationContent {
  pricing: PricingDisplay;
  terms: SubscriptionTerms;
  cancelFlow: CancelFlow;
  region: Region;
  language: string;
}

class MonetizationTransparencyEnforcer {
  private rules: Map<string, TransparencyRule>;

  constructor() {
    this.rules = this.initializeRules();
  }

  /**
   * Validate monetization content for transparency compliance
   */
  validate(content: MonetizationContent): {
    isCompliant: boolean;
    violations: TransparencyViolation[];
    region: Region;
  } {
    const violations: TransparencyViolation[] = [];

    // Get applicable rules for region
    const applicableRules = Array.from(this.rules.values()).filter(rule =>
      rule.regions.includes(content.region) || rule.regions.includes(Region.GLOBAL)
    );

    // Run all applicable rules
    for (const rule of applicableRules) {
      const violation = rule.validator(content);
      if (violation) {
        violations.push(violation);
      }
    }

    // Determine compliance - no critical or high violations for required rules
    const criticalViolations = violations.filter(v => 
      v.severity === 'critical' || v.severity === 'high'
    );

    return {
      isCompliant: criticalViolations.length === 0,
      violations,
      region: content.region
    };
  }

  /**
   * Initialize transparency rules
   */
  private initializeRules(): Map<string, TransparencyRule> {
    const rules = new Map<string, TransparencyRule>();

    // Rule: Clear Currency Display
    rules.set('clear_currency', {
      id: 'clear_currency',
      name: 'Clear Currency Display',
      description: 'Currency must be clearly displayed with amount',
      regions: [Region.GLOBAL],
      required: true,
      validator: (content: MonetizationContent) => {
        const { pricing } = content;
        if (!pricing.displayText.includes(pricing.currency)) {
          return {
            ruleId: 'clear_currency',
            severity: 'high',
            message: 'Currency not clearly displayed',
            field: 'pricing.displayText',
            suggestedFix: `Include ${pricing.currency} in the display text`
          };
        }
        return null;
      }
    });

    // Rule: Recurring Charges Disclosure (EU/UK Strict)
    rules.set('recurring_disclosure_eu', {
      id: 'recurring_disclosure_eu',
      name: 'Recurring Charges Disclosure (EU/UK)',
      description: 'Recurring charges must be explicitly disclosed upfront',
      regions: [Region.EU, Region.UK],
      required: true,
      validator: (content: MonetizationContent) => {
        const { pricing, terms } = content;
        if (pricing.recurring) {
          if (!pricing.recurringPeriod || !terms.autoRenewal) {
            return {
              ruleId: 'recurring_disclosure_eu',
              severity: 'critical',
              message: 'Recurring subscription terms not fully disclosed',
              field: 'pricing.recurringPeriod',
              suggestedFix: 'Clearly state the recurring period and auto-renewal terms',
              regulatoryReference: 'EU Consumer Rights Directive 2011/83/EU'
            };
          }
        }
        return null;
      }
    });

    // Rule: Trial Period Clarity
    rules.set('trial_clarity', {
      id: 'trial_clarity',
      name: 'Trial Period Clarity',
      description: 'Trial periods must clearly state when charges begin',
      regions: [Region.GLOBAL],
      required: true,
      validator: (content: MonetizationContent) => {
        const { pricing } = content;
        if (pricing.trialPeriod && pricing.trialPeriod > 0) {
          if (!pricing.trialPeriodUnit) {
            return {
              ruleId: 'trial_clarity',
              severity: 'high',
              message: 'Trial period unit not specified',
              field: 'pricing.trialPeriodUnit',
              suggestedFix: 'Specify if trial is in days, weeks, or months'
            };
          }
        }
        return null;
      }
    });

    // Rule: Tax Transparency (EU)
    rules.set('tax_transparency_eu', {
      id: 'tax_transparency_eu',
      name: 'Tax Transparency (EU)',
      description: 'Must disclose if taxes are included in price',
      regions: [Region.EU],
      required: true,
      validator: (content: MonetizationContent) => {
        const { pricing } = content;
        if (!pricing.taxes) {
          return {
            ruleId: 'tax_transparency_eu',
            severity: 'medium',
            message: 'Tax disclosure missing',
            field: 'pricing.taxes',
            suggestedFix: 'Add taxes field indicating if included in price',
            regulatoryReference: 'EU Price Indication Directive'
          };
        }
        return null;
      }
    });

    // Rule: Additional Fees Disclosure
    rules.set('fees_disclosure', {
      id: 'fees_disclosure',
      name: 'Additional Fees Disclosure',
      description: 'All additional fees must be disclosed upfront',
      regions: [Region.GLOBAL],
      required: true,
      validator: (content: MonetizationContent) => {
        const { pricing } = content;
        // Assuming we have a way to detect if there are hidden fees
        // This is a placeholder - actual implementation would check against billing system
        if (pricing.additionalFees && pricing.additionalFees.length > 0) {
          const undiscribedFees = pricing.additionalFees.filter(f => !f.description);
          if (undiscribedFees.length > 0) {
            return {
              ruleId: 'fees_disclosure',
              severity: 'high',
              message: 'Some additional fees lack descriptions',
              field: 'pricing.additionalFees',
              suggestedFix: 'Provide clear descriptions for all fees'
            };
          }
        }
        return null;
      }
    });

    // Rule: Cancellation Simplicity (EU)
    rules.set('cancel_simplicity_eu', {
      id: 'cancel_simplicity_eu',
      name: 'Cancellation Simplicity (EU)',
      description: 'Cancellation must be as easy as subscription',
      regions: [Region.EU, Region.UK],
      required: true,
      validator: (content: MonetizationContent) => {
        const { cancelFlow } = content;
        if (cancelFlow.maxSteps > 3) {
          return {
            ruleId: 'cancel_simplicity_eu',
            severity: 'critical',
            message: 'Cancellation process too complex',
            field: 'cancelFlow.maxSteps',
            suggestedFix: 'Reduce cancellation to maximum 3 steps',
            regulatoryReference: 'Digital Services Act (DSA)'
          };
        }
        return null;
      }
    });

    // Rule: Cancellation Contact Methods (US FTC)
    rules.set('cancel_contact_us', {
      id: 'cancel_contact_us',
      name: 'Cancellation Contact Methods (US)',
      description: 'Must provide multiple cancellation contact methods',
      regions: [Region.US],
      required: true,
      validator: (content: MonetizationContent) => {
        const { cancelFlow } = content;
        if (!cancelFlow.contactMethods || cancelFlow.contactMethods.length < 2) {
          return {
            ruleId: 'cancel_contact_us',
            severity: 'medium',
            message: 'Insufficient cancellation contact methods',
            field: 'cancelFlow.contactMethods',
            suggestedFix: 'Provide at least email and phone/chat for cancellations',
            regulatoryReference: 'FTC Negative Option Rule'
          };
        }
        return null;
      }
    });

    // Rule: Auto-Renewal Notice (US)
    rules.set('renewal_notice_us', {
      id: 'renewal_notice_us',
      name: 'Auto-Renewal Notice (US)',
      description: 'Must notify before auto-renewal',
      regions: [Region.US],
      required: true,
      validator: (content: MonetizationContent) => {
        const { terms } = content;
        if (terms.autoRenewal && !terms.renewalNotice) {
          return {
            ruleId: 'renewal_notice_us',
            severity: 'high',
            message: 'Auto-renewal without notification plan',
            field: 'terms.renewalNotice',
            suggestedFix: 'Implement renewal notification system',
            regulatoryReference: 'State Auto-Renewal Laws (CA, NY, etc.)'
          };
        }
        if (terms.renewalNotice && (!terms.renewalNoticeDays || terms.renewalNoticeDays < 3)) {
          return {
            ruleId: 'renewal_notice_us',
            severity: 'medium',
            message: 'Insufficient renewal notice period',
            field: 'terms.renewalNoticeDays',
            suggestedFix: 'Provide at least 3-7 days notice before renewal'
          };
        }
        return null;
      }
    });

    // Rule: Terms & Privacy URLs
    rules.set('legal_urls', {
      id: 'legal_urls',
      name: 'Terms & Privacy URLs',
      description: 'Must provide accessible terms and privacy policy',
      regions: [Region.GLOBAL],
      required: true,
      validator: (content: MonetizationContent) => {
        const { terms } = content;
        if (!terms.termsUrl || !terms.privacyUrl) {
          return {
            ruleId: 'legal_urls',
            severity: 'critical',
            message: 'Missing required legal document URLs',
            field: 'terms',
            suggestedFix: 'Provide URLs to terms of service and privacy policy'
          };
        }
        // Basic URL validation
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(terms.termsUrl) || !urlPattern.test(terms.privacyUrl)) {
          return {
            ruleId: 'legal_urls',
            severity: 'high',
            message: 'Invalid legal document URLs',
            field: 'terms',
            suggestedFix: 'Provide valid HTTPS URLs'
          };
        }
        return null;
      }
    });

    // Rule: Refund Policy Clarity
    rules.set('refund_clarity', {
      id: 'refund_clarity',
      name: 'Refund Policy Clarity',
      description: 'Refund policy must be clear and accessible',
      regions: [Region.GLOBAL],
      required: true,
      validator: (content: MonetizationContent) => {
        const { terms } = content;
        if (!terms.refundPolicy || terms.refundPolicy.length < 10) {
          return {
            ruleId: 'refund_clarity',
            severity: 'medium',
            message: 'Refund policy missing or too vague',
            field: 'terms.refundPolicy',
            suggestedFix: 'Provide clear refund policy with timeframes'
          };
        }
        return null;
      }
    });

    // Rule: Immediate Cancellation (EU Right)
    rules.set('immediate_cancel_eu', {
      id: 'immediate_cancel_eu',
      name: 'Immediate Cancellation Right (EU)',
      description: 'Users must be able to cancel immediately',
      regions: [Region.EU, Region.UK],
      required: true,
      validator: (content: MonetizationContent) => {
        const { cancelFlow } = content;
        if (!cancelFlow.allowsImmediate) {
          return {
            ruleId: 'immediate_cancel_eu',
            severity: 'high',
            message: 'Immediate cancellation not available',
            field: 'cancelFlow.allowsImmediate',
            suggestedFix: 'Allow users to cancel subscription immediately',
            regulatoryReference: 'EU Consumer Rights Directive'
          };
        }
        return null;
      }
    });

    return rules;
  }

  /**
   * Get all rules for a specific region
   */
  getRulesForRegion(region: Region): TransparencyRule[] {
    return Array.from(this.rules.values()).filter(rule =>
      rule.regions.includes(region) || rule.regions.includes(Region.GLOBAL)
    );
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): TransparencyRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(content: MonetizationContent): {
    compliant: boolean;
    region: Region;
    violations: TransparencyViolation[];
    passedRules: string[];
    summary: string;
  } {
    const validation = this.validate(content);
    const applicableRules = this.getRulesForRegion(content.region);
    const violatedRules = new Set(validation.violations.map(v => v.ruleId));
    const passedRules = applicableRules
      .filter(r => !violatedRules.has(r.id))
      .map(r => r.id);

    const summary = validation.isCompliant
      ? `✅ Fully compliant for ${content.region}`
      : `❌ ${validation.violations.length} violation(s) found for ${content.region}`;

    return {
      compliant: validation.isCompliant,
      region: content.region,
      violations: validation.violations,
      passedRules,
      summary
    };
  }
}

export default MonetizationTransparencyEnforcer;
