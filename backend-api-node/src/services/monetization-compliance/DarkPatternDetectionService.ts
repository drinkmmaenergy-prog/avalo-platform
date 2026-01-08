/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * DarkPatternDetectionService - Automatic UX analysis for dark patterns
 * 
 * Detects:
 * - Hidden costs
 * - Confusing copy
 * - Forced purchase paths
 * - Regulatory risk patterns
 */

import { Logger } from '../../utils/logger';
import { MetricsService } from '../monitoring/MetricsService';

export enum DarkPatternType {
  HIDDEN_COSTS = 'hidden_costs',
  CONFUSING_COPY = 'confusing_copy',
  FORCED_PURCHASE = 'forced_purchase',
  BAIT_AND_SWITCH = 'bait_and_switch',
  CONFIRMSHAMING = 'confirmshaming',
  FORCED_CONTINUITY = 'forced_continuity',
  DIFFICULT_CANCELLATION = 'difficult_cancellation',
  HIDDEN_INFORMATION = 'hidden_information',
  SNEAKING = 'sneaking',
  URGENCY_MANIPULATION = 'urgency_manipulation',
  SOCIAL_PROOF_MANIPULATION = 'social_proof_manipulation',
  OBSTRUCTION = 'obstruction'
}

export enum RiskLevel {
  NONE = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface DarkPatternDetection {
  type: DarkPatternType;
  severity: RiskLevel;
  description: string;
  location: string;
  suggestedFix?: string;
  regulatoryRisk: {
    eu?: boolean;
    us?: boolean;
    uk?: boolean;
    global?: boolean;
  };
}

export interface FlowAnalysis {
  flowId: string;
  flowType: 'paywall' | 'offer' | 'upsell' | 'subscription' | 'checkout';
  patternsDetected: DarkPatternDetection[];
  overallRisk: RiskLevel;
  timestamp: Date;
  canActivate: boolean;
  blockingReasons: string[];
}

export interface AnalysisContext {
  flowId: string;
  flowType: string;
  content: {
    primaryCopy?: string;
    secondaryCopy?: string;
    buttonLabels?: string[];
    disclaimers?: string[];
    pricing?: {
      display: string;
      original?: number;
      discounted?: number;
      currency: string;
      recurring?: boolean;
      recurringPeriod?: string;
    };
    cancelFlow?: {
      stepsRequired: number;
      requiresReason: boolean;
      requiresConfirmation: boolean;
      difficultToFind: boolean;
    };
  };
  userRegion?: string;
  metadata?: Record<string, any>;
}

class DarkPatternDetectionService {
  private logger: Logger;
  private metrics: MetricsService;
  private detectionRules: Map<DarkPatternType, (context: AnalysisContext) => DarkPatternDetection | null>;

  constructor() {
    this.logger = new Logger('DarkPatternDetectionService');
    this.metrics = MetricsService.getInstance();
    this.detectionRules = this.initializeDetectionRules();
  }

  /**
   * Analyze a monetization flow for dark patterns
   */
  async analyzeFlow(context: AnalysisContext): Promise<FlowAnalysis> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Analyzing flow ${context.flowId} for dark patterns`);

      const patternsDetected: DarkPatternDetection[] = [];

      // Run all detection rules
      for (const [type, rule] of this.detectionRules.entries()) {
        try {
          const detection = rule(context);
          if (detection) {
            patternsDetected.push(detection);
            this.logger.warn(`Dark pattern detected: ${type} in flow ${context.flowId}`);
          }
        } catch (error) {
          this.logger.error(`Error in detection rule ${type}:`, error);
        }
      }

      // Calculate overall risk
      const overallRisk = this.calculateOverallRisk(patternsDetected);

      // Determine if flow can be activated
      const { canActivate, blockingReasons } = this.evaluateActivation(
        patternsDetected,
        overallRisk,
        context.userRegion
      );

      const analysis: FlowAnalysis = {
        flowId: context.flowId,
        flowType: context.flowType as any,
        patternsDetected,
        overallRisk,
        timestamp: new Date(),
        canActivate,
        blockingReasons
      };

      // Record metrics
      this.metrics.recordMetric('dark_pattern_analysis', {
        flowId: context.flowId,
        patternsCount: patternsDetected.length,
        risk: RiskLevel[overallRisk],
        duration: Date.now() - startTime,
        blocked: !canActivate
      });

      return analysis;

    } catch (error) {
      this.logger.error(`Failed to analyze flow ${context.flowId}:`, error);
      throw error;
    }
  }

  /**
   * Batch analyze multiple flows
   */
  async analyzeFlows(contexts: AnalysisContext[]): Promise<FlowAnalysis[]> {
    return Promise.all(contexts.map(ctx => this.analyzeFlow(ctx)));
  }

  /**
   * Initialize detection rules for each dark pattern type
   */
  private initializeDetectionRules(): Map<DarkPatternType, (context: AnalysisContext) => DarkPatternDetection | null> {
    const rules = new Map();

    // Hidden Costs Detection
    rules.set(DarkPatternType.HIDDEN_COSTS, (ctx: AnalysisContext) => {
      const pricing = ctx.content.pricing;
      if (!pricing) return null;

      const hasHiddenCosts = 
        (pricing.recurring && !pricing.recurringPeriod) ||
        (!ctx.content.disclaimers || ctx.content.disclaimers.length === 0) ||
        (pricing.display && !pricing.display.toLowerCase().includes(pricing.currency.toLowerCase()));

      if (hasHiddenCosts) {
        return {
          type: DarkPatternType.HIDDEN_COSTS,
          severity: RiskLevel.HIGH,
          description: 'Pricing information is incomplete or unclear',
          location: `${ctx.flowId}/pricing`,
          suggestedFix: 'Display all costs upfront including currency, recurring charges, and any additional fees',
          regulatoryRisk: { eu: true, us: true, uk: true, global: true }
        };
      }
      return null;
    });

    // Confusing Copy Detection
    rules.set(DarkPatternType.CONFUSING_COPY, (ctx: AnalysisContext) => {
      const allCopy = [
        ctx.content.primaryCopy,
        ctx.content.secondaryCopy,
        ...(ctx.content.disclaimers || [])
      ].filter(Boolean).join(' ');

      const confusingPhrases = [
        /free\s+trial.*(?!no\s+charge)/i,
        /cancel\s+anytime(?!.*easy)/i,
        /limited\s+time(?!.*specific\s+date)/i,
        /only\s+\$.*(?!total|per|\/)/i,
        /act\s+now.*(?!expire)/i
      ];

      for (const phrase of confusingPhrases) {
        if (phrase.test(allCopy)) {
          return {
            type: DarkPatternType.CONFUSING_COPY,
            severity: RiskLevel.MEDIUM,
            description: 'Copy contains potentially confusing or misleading language',
            location: `${ctx.flowId}/copy`,
            suggestedFix: 'Use clear, unambiguous language that fully explains terms and conditions',
            regulatoryRisk: { eu: true, us: true, uk: true }
          };
        }
      }
      return null;
    });

    // Forced Purchase Path Detection
    rules.set(DarkPatternType.FORCED_PURCHASE, (ctx: AnalysisContext) => {
      const buttons = ctx.content.buttonLabels || [];
      const hasClearExit = buttons.some(label => 
        /cancel|no\s+thanks|skip|maybe\s+later|back/i.test(label)
      );

      if (!hasClearExit && buttons.length > 0) {
        return {
          type: DarkPatternType.FORCED_PURCHASE,
          severity: RiskLevel.CRITICAL,
          description: 'No clear way to decline or exit the purchase flow',
          location: `${ctx.flowId}/navigation`,
          suggestedFix: 'Add clear, equally prominent decline/exit options',
          regulatoryRisk: { eu: true, us: true, uk: true, global: true }
        };
      }
      return null;
    });

    // Difficult Cancellation Detection
    rules.set(DarkPatternType.DIFFICULT_CANCELLATION, (ctx: AnalysisContext) => {
      const cancelFlow = ctx.content.cancelFlow;
      if (!cancelFlow) return null;

      const isDifficult = 
        cancelFlow.stepsRequired > 3 ||
        cancelFlow.difficultToFind ||
        (cancelFlow.requiresReason && cancelFlow.requiresConfirmation);

      if (isDifficult) {
        return {
          type: DarkPatternType.DIFFICULT_CANCELLATION,
          severity: RiskLevel.HIGH,
          description: 'Cancellation process is unnecessarily complex',
          location: `${ctx.flowId}/cancellation`,
          suggestedFix: 'Simplify cancellation to 2-3 steps maximum, make it easy to find',
          regulatoryRisk: { eu: true, us: true, uk: true }
        };
      }
      return null;
    });

    // Confirmshaming Detection
    rules.set(DarkPatternType.CONFIRMSHAMING, (ctx: AnalysisContext) => {
      const buttons = ctx.content.buttonLabels || [];
      const shamingPhrases = [
        /no.*i.*don't.*want/i,
        /no.*i.*prefer.*less/i,
        /i.*don't.*care/i,
        /i.*hate.*saving/i
      ];

      for (const button of buttons) {
        for (const phrase of shamingPhrases) {
          if (phrase.test(button)) {
            return {
              type: DarkPatternType.CONFIRMSHAMING,
              severity: RiskLevel.MEDIUM,
              description: 'Decline option uses shame or guilt language',
              location: `${ctx.flowId}/buttons`,
              suggestedFix: 'Use neutral language for decline options',
              regulatoryRisk: { eu: true, us: false }
            };
          }
        }
      }
      return null;
    });

    // Urgency Manipulation Detection
    rules.set(DarkPatternType.URGENCY_MANIPULATION, (ctx: AnalysisContext) => {
      const allText = [
        ctx.content.primaryCopy,
        ctx.content.secondaryCopy
      ].filter(Boolean).join(' ');

      const urgencyPatterns = [
        /only\s+\d+\s+(left|remaining)/i,
        /\d+\s+people.*watching/i,
        /ends?\s+in\s+\d+\s+(hour|min)/i,
        /expires?\s+soon/i
      ];

      for (const pattern of urgencyPatterns) {
        if (pattern.test(allText)) {
          // Check if there's verifiable proof
          const hasProof = ctx.metadata?.urgencyProofSource;
          if (!hasProof) {
            return {
              type: DarkPatternType.URGENCY_MANIPULATION,
              severity: RiskLevel.MEDIUM,
              description: 'Urgency claims without verifiable proof',
              location: `${ctx.flowId}/urgency`,
              suggestedFix: 'Only use urgency if verifiable, or remove urgency language',
              regulatoryRisk: { eu: true, us: false }
            };
          }
        }
      }
      return null;
    });

    // Sneaking Detection
    rules.set(DarkPatternType.SNEAKING, (ctx: AnalysisContext) => {
      const disclaimers = ctx.content.disclaimers || [];
      const hasSmallPrint = disclaimers.some(d => d.length > 200);
      const pricing = ctx.content.pricing;

      if (hasSmallPrint && pricing?.recurring) {
        return {
          type: DarkPatternType.SNEAKING,
          severity: RiskLevel.HIGH,
          description: 'Important information hidden in long disclaimers',
          location: `${ctx.flowId}/disclaimers`,
          suggestedFix: 'Display critical information prominently, keep disclaimers concise',
          regulatoryRisk: { eu: true, us: true, uk: true }
        };
      }
      return null;
    });

    // Obstruction Detection
    rules.set(DarkPatternType.OBSTRUCTION, (ctx: AnalysisContext) => {
      const buttons = ctx.content.buttonLabels || [];
      const hasUnequalButtons = buttons.length > 1 && 
        buttons.some(b => b.length > 50);

      if (hasUnequalButtons) {
        return {
          type: DarkPatternType.OBSTRUCTION,
          severity: RiskLevel.MEDIUM,
          description: 'Unequal emphasis on action buttons',
          location: `${ctx.flowId}/buttons`,
          suggestedFix: 'Give equal visual weight to accept and decline options',
          regulatoryRisk: { eu: true }
        };
      }
      return null;
    });

    return rules;
  }

  /**
   * Calculate overall risk level from detected patterns
   */
  private calculateOverallRisk(patterns: DarkPatternDetection[]): RiskLevel {
    if (patterns.length === 0) return RiskLevel.NONE;

    const maxSeverity = Math.max(...patterns.map(p => p.severity));
    const criticalCount = patterns.filter(p => p.severity === RiskLevel.CRITICAL).length;
    const highCount = patterns.filter(p => p.severity === RiskLevel.HIGH).length;

    if (criticalCount > 0) return RiskLevel.CRITICAL;
    if (highCount >= 2) return RiskLevel.CRITICAL;
    if (highCount === 1) return RiskLevel.HIGH;
    
    return maxSeverity as RiskLevel;
  }

  /**
   * Evaluate if flow can be activated based on risk
   */
  private evaluateActivation(
    patterns: DarkPatternDetection[],
    overallRisk: RiskLevel,
    region?: string
  ): { canActivate: boolean; blockingReasons: string[] } {
    const blockingReasons: string[] = [];

    // Critical risk always blocks
    if (overallRisk === RiskLevel.CRITICAL) {
      blockingReasons.push('Critical risk level detected');
    }

    // Region-specific blocking
    if (region) {
      const regionKey = this.getRegionKey(region);
      const regionPatterns = patterns.filter(p => p.regulatoryRisk[regionKey]);
      
      if (regionPatterns.length > 0 && overallRisk >= RiskLevel.HIGH) {
        blockingReasons.push(`High risk patterns detected for region: ${region}`);
      }
    }

    // EU-specific stricter rules
    if (region?.startsWith('EU') || region?.startsWith('GB')) {
      const euPatterns = patterns.filter(p => p.regulatoryRisk.eu || p.regulatoryRisk.uk);
      if (euPatterns.length >= 2) {
        blockingReasons.push('Multiple EU/UK regulatory violations detected');
      }
    }

    return {
      canActivate: blockingReasons.length === 0,
      blockingReasons
    };
  }

  /**
   * Get region key for regulatory risk mapping
   */
  private getRegionKey(region: string): 'eu' | 'us' | 'uk' | 'global' {
    if (region.startsWith('EU')) return 'eu';
    if (region.startsWith('GB') || region === 'UK') return 'uk';
    if (region === 'US') return 'us';
    return 'global';
  }

  /**
   * Get detection statistics
   */
  async getStatistics(timeframe?: { start: Date; end: Date }) {
    return {
      totalAnalyses: await this.metrics.getMetricCount('dark_pattern_analysis', timeframe),
      blockedFlows: await this.metrics.getMetricCount('dark_pattern_analysis', {
        ...timeframe,
        filter: { blocked: true }
      }),
      patternsByType: await this.metrics.aggregateMetric('dark_pattern_analysis', 'type'),
      riskDistribution: await this.metrics.aggregateMetric('dark_pattern_analysis', 'risk')
    };
  }
}

export default DarkPatternDetectionService;
