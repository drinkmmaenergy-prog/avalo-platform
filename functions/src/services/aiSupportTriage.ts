/**
 * PACK 111 — AI-Powered Support Triage
 * Smart routing and categorization of support requests
 */

import { AITriageResult, SupportCategory, SupportPriority } from '../types/support.types';

/**
 * Safety red flag keywords (self-harm, threats, minors)
 */
const SAFETY_CRITICAL_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'self harm', 'self-harm',
  'hurt myself', 'die', 'death wish', 'overdose',
  'threat', 'violence', 'attack', 'assault', 'abuse',
  'stalking', 'harass', 'blackmail', 'extort',
  'underage', 'minor', 'child', 'under 18', 'teenager',
  'law enforcement', 'police', 'warrant', 'subpoena', 'court order'
];

/**
 * Financial/regulated keywords
 */
const FINANCIAL_KEYWORDS = [
  'payout', 'payment', 'money', 'earnings', 'withdraw',
  'kyc', 'verification', 'identity', 'tax', 'compliance',
  'transaction', 'refund', 'chargeback', 'fraud',
  'account frozen', 'suspended account', 'banned'
];

/**
 * Category detection patterns
 */
const CATEGORY_PATTERNS: Record<SupportCategory, string[]> = {
  TECHNICAL: ['bug', 'crash', 'error', 'not working', 'broken', 'glitch', 'freeze', 'load', 'slow'],
  BILLING: ['payment', 'charge', 'price', 'subscription', 'payout', 'earnings', 'refund', 'billing'],
  ACCOUNT: ['login', 'password', 'email', 'username', 'locked', 'access', 'forgot', 'cant sign in'],
  CONTENT: ['content', 'moderation', 'removed', 'inappropriate', 'violation', 'flagged', 'reported'],
  SAFETY: ['harass', 'abuse', 'threat', 'spam', 'fake', 'scam', 'inappropriate', 'unsafe'],
  LEGAL: ['legal', 'law', 'police', 'court', 'lawyer', 'attorney', 'dmca', 'copyright', 'subpoena'],
  FEATURE_REQUEST: ['feature', 'suggestion', 'request', 'improve', 'add', 'enhancement', 'idea'],
  OTHER: []
};

/**
 * AI Support Triage Service
 * Analyzes incoming support messages to determine routing and priority
 */
export class AISupportTriageService {
  /**
   * Perform AI triage on a support message
   */
  async triageMessage(
    message: string,
    metadata: {
      userId: string;
      platform: string;
      language: string;
      accountType?: string;
      previousCases?: number;
    }
  ): Promise<AITriageResult> {
    const normalized = message.toLowerCase();
    
    // Detect safety flags
    const safetyRisk = this.detectSafetyRisk(normalized);
    const minorRisk = this.detectMinorRisk(normalized);
    const legalRequest = this.detectLegalRequest(normalized);
    const financialRegulated = this.detectFinancialRegulated(normalized);
    const enforcementContest = this.detectEnforcementContest(normalized);

    // Determine category
    const category = this.detectCategory(normalized, {
      safetyRisk,
      legalRequest,
      financialRegulated,
      enforcementContest
    });

    // Determine priority
    const priority = this.determinePriority({
      safetyRisk,
      minorRisk,
      legalRequest,
      financialRegulated,
      enforcementContest,
      category
    });

    // Check if human review needed immediately
    const forwardToHumanImmediately = 
      safetyRisk || 
      minorRisk || 
      legalRequest || 
      priority === 'CRITICAL';

    // Calculate confidence
    const confidence = this.calculateConfidence(normalized, category);

    return {
      category,
      priority,
      needsHumanReview: true, // AI never makes final decisions
      forwardToHumanImmediately,
      detectedFlags: {
        safetyRisk,
        minorRisk,
        financialRegulated,
        enforcementContest,
        legalRequest
      },
      confidence,
      reasoningNotes: this.generateReasoningNotes({
        category,
        priority,
        safetyRisk,
        minorRisk,
        legalRequest,
        financialRegulated,
        enforcementContest
      })
    };
  }

  /**
   * Detect safety risks (self-harm, threats, violence)
   */
  private detectSafetyRisk(text: string): boolean {
    const selfHarmKeywords = [
      'suicide', 'kill myself', 'end my life', 'self harm', 'hurt myself',
      'want to die', 'death wish', 'overdose'
    ];
    
    const threatKeywords = [
      'threat', 'violence', 'attack', 'assault', 'harm',
      'hurt someone', 'kill', 'murder'
    ];

    return [...selfHarmKeywords, ...threatKeywords].some(keyword => 
      text.includes(keyword)
    );
  }

  /**
   * Detect potential minor/underage user
   */
  private detectMinorRisk(text: string): boolean {
    const minorKeywords = [
      'underage', 'minor', 'under 18', 'im 17', 'im 16', 'im 15',
      'teenager', 'high school', 'middle school'
    ];

    return minorKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Detect law enforcement or legal requests
   */
  private detectLegalRequest(text: string): boolean {
    const legalKeywords = [
      'law enforcement', 'police', 'warrant', 'subpoena', 'court order',
      'legal request', 'attorney', 'lawyer', 'judge'
    ];

    return legalKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Detect financial/regulated topics
   */
  private detectFinancialRegulated(text: string): boolean {
    return FINANCIAL_KEYWORDS.some(keyword => text.includes(keyword));
  }

  /**
   * Detect enforcement appeal/contest
   */
  private detectEnforcementContest(text: string): boolean {
    const contestKeywords = [
      'suspended', 'banned', 'account closed', 'terminated',
      'appeal', 'unfair', 'wrongly', 'mistake', 'reinstate'
    ];

    return contestKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Detect most likely category
   */
  private detectCategory(
    text: string,
    flags: {
      safetyRisk: boolean;
      legalRequest: boolean;
      financialRegulated: boolean;
      enforcementContest: boolean;
    }
  ): SupportCategory {
    // Priority overrides based on flags
    if (flags.legalRequest) return 'LEGAL';
    if (flags.safetyRisk) return 'SAFETY';
    if (flags.financialRegulated) return 'BILLING';
    if (flags.enforcementContest) return 'CONTENT';

    // Pattern matching for categories
    let bestMatch: SupportCategory = 'OTHER';
    let maxScore = 0;

    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      const score = patterns.filter(pattern => text.includes(pattern)).length;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = category as SupportCategory;
      }
    }

    return bestMatch;
  }

  /**
   * Determine priority level
   */
  private determinePriority(flags: {
    safetyRisk: boolean;
    minorRisk: boolean;
    legalRequest: boolean;
    financialRegulated: boolean;
    enforcementContest: boolean;
    category: SupportCategory;
  }): SupportPriority {
    // CRITICAL: Immediate safety concerns
    if (flags.safetyRisk || flags.minorRisk || flags.legalRequest) {
      return 'CRITICAL';
    }

    // HIGH: Financial/compliance issues
    if (flags.financialRegulated || flags.enforcementContest) {
      return 'HIGH';
    }

    // HIGH: Critical categories
    if (flags.category === 'BILLING' || flags.category === 'ACCOUNT') {
      return 'HIGH';
    }

    // NORMAL: Everything else
    return 'NORMAL';
  }

  /**
   * Calculate confidence score (0-1)
   */
  private calculateConfidence(text: string, category: SupportCategory): number {
    if (category === 'OTHER') return 0.3;

    const patterns = CATEGORY_PATTERNS[category] || [];
    const matchCount = patterns.filter(pattern => text.includes(pattern)).length;
    
    // Base confidence on number of matching patterns
    const baseConfidence = Math.min(0.5 + (matchCount * 0.15), 0.95);
    
    return baseConfidence;
  }

  /**
   * Generate reasoning notes for transparency
   */
  private generateReasoningNotes(params: {
    category: SupportCategory;
    priority: SupportPriority;
    safetyRisk: boolean;
    minorRisk: boolean;
    legalRequest: boolean;
    financialRegulated: boolean;
    enforcementContest: boolean;
  }): string {
    const notes: string[] = [];

    notes.push(`Detected category: ${params.category}`);
    notes.push(`Assigned priority: ${params.priority}`);

    if (params.safetyRisk) {
      notes.push('⚠️ Safety risk detected - requires immediate human review');
    }
    if (params.minorRisk) {
      notes.push('⚠️ Possible minor/underage user - urgent verification needed');
    }
    if (params.legalRequest) {
      notes.push('⚠️ Legal/law enforcement request - escalate to legal team');
    }
    if (params.financialRegulated) {
      notes.push('💰 Financial/compliance topic - requires specialized handling');
    }
    if (params.enforcementContest) {
      notes.push('📋 Enforcement appeal - refer to moderation team');
    }

    return notes.join('\n');
  }

  /**
   * Get crisis resources for region
   */
  getCrisisResources(countryCode: string): {
    hotline: string;
    website: string;
    message: string;
  } | null {
    const resources: Record<string, { hotline: string; website: string; message: string }> = {
      US: {
        hotline: '988',
        website: 'https://988lifeline.org',
        message: 'If you are experiencing a mental health crisis, please contact the 988 Suicide & Crisis Lifeline immediately.'
      },
      UK: {
        hotline: '116 123',
        website: 'https://www.samaritans.org',
        message: 'If you need someone to talk to, Samaritans are available 24/7 at 116 123.'
      },
      PL: {
        hotline: '116 123',
        website: 'https://www.telefonzaufania.org',
        message: 'Jeśli potrzebujesz pomocy, zadzwoń na Telefon Zaufania: 116 123.'
      },
      DEFAULT: {
        hotline: 'Local emergency services',
        website: 'https://findahelpline.com',
        message: 'If you are in crisis, please contact local emergency services or visit findahelpline.com for resources in your area.'
      }
    };

    return resources[countryCode] || resources.DEFAULT;
  }
}

export const aiSupportTriage = new AISupportTriageService();