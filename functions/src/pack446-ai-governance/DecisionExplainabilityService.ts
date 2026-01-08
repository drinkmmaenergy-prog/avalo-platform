/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Module: Decision Explainability Service
 * 
 * Generates human-readable explanations for AI decisions to satisfy
 * GDPR Article 22 (automated decision-making) and EU AI Act requirements.
 */

import { logger } from 'firebase-functions';

export enum ExplanationLevel {
  INTERNAL = 'INTERNAL',           // Full technical details
  COMPLIANCE = 'COMPLIANCE',       // Audit-ready, technical but sanitized
  REGULATOR = 'REGULATOR',         // High-level, IP-protected
  USER_FACING = 'USER_FACING'      // Simple, non-technical
}

export enum DecisionType {
  PRICING = 'PRICING',
  THROTTLING = 'THROTTLING',
  RECOMMENDATION = 'RECOMMENDATION',
  FRAUD_FLAG = 'FRAUD_FLAG',
  SAFETY_FLAG = 'SAFETY_FLAG',
  CONTENT_MODERATION = 'CONTENT_MODERATION',
  ACCESS_CONTROL = 'ACCESS_CONTROL',
  PRIORITIZATION = 'PRIORITIZATION'
}

export interface DecisionContext {
  modelId: string;
  modelVersion: string;
  decisionType: DecisionType;
  timestamp: Date;
  userId?: string;
  entityId?: string;
  
  // Input Features (sanitized)
  inputFeatures: Record<string, any>;
  
  // Model Output
  decision: any;
  confidence?: number;
  
  // Decision Factors
  keyFactors: DecisionFactor[];
  
  // Alternative Outcomes
  alternativeOutcomes?: AlternativeOutcome[];
}

export interface DecisionFactor {
  name: string;
  value: any;
  weight: number;         // Contribution to decision (0-1)
  direction?: 'positive' | 'negative' | 'neutral';
  description?: string;
}

export interface AlternativeOutcome {
  outcome: any;
  probability: number;
  requiredChanges: string[];
}

export interface Explanation {
  level: ExplanationLevel;
  decisionContext: DecisionContext;
  summary: string;
  details: string[];
  visualData?: any;
  contestable: boolean;         // Can user contest this decision?
  contestInstructions?: string;
  generatedAt: Date;
}

export class DecisionExplainabilityService {
  private db: FirebaseFirestore.Firestore;
  private readonly COLLECTION = 'ai_decision_explanations';

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Generate explanation for a decision
   */
  async generateExplanation(
    context: DecisionContext,
    level: ExplanationLevel
  ): Promise<Explanation> {
    try {
      // Generate explanation based on decision type and level
      const explanation = this.buildExplanation(context, level);
      
      // Store explanation for audit trail
      await this.storeExplanation(explanation);
      
      logger.info(`[DecisionExplainability] Explanation generated for ${context.modelId} at ${level} level`);
      
      return explanation;
    } catch (error) {
      logger.error('[DecisionExplainability] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Build explanation based on context and level
   */
  private buildExplanation(
    context: DecisionContext,
    level: ExplanationLevel
  ): Explanation {
    const now = new Date();
    
    switch (level) {
      case ExplanationLevel.INTERNAL:
        return this.buildInternalExplanation(context, now);
      
      case ExplanationLevel.COMPLIANCE:
        return this.buildComplianceExplanation(context, now);
      
      case ExplanationLevel.REGULATOR:
        return this.buildRegulatorExplanation(context, now);
      
      case ExplanationLevel.USER_FACING:
        return this.buildUserFacingExplanation(context, now);
      
      default:
        throw new Error(`Unknown explanation level: ${level}`);
    }
  }

  /**
   * Internal explanation - full technical details
   */
  private buildInternalExplanation(context: DecisionContext, timestamp: Date): Explanation {
    const summary = `Model ${context.modelId} (v${context.modelVersion}) made ${context.decisionType} decision`;
    
    const details: string[] = [
      `Decision: ${JSON.stringify(context.decision)}`,
      `Confidence: ${context.confidence ? (context.confidence * 100).toFixed(2) + '%' : 'N/A'}`,
      `Input Features: ${JSON.stringify(context.inputFeatures)}`,
      '',
      'Key Factors (ordered by weight):'
    ];

    // Add sorted factors
    const sortedFactors = [...context.keyFactors].sort((a, b) => b.weight - a.weight);
    sortedFactors.forEach(factor => {
      details.push(
        `  - ${factor.name}: ${factor.value} (weight: ${(factor.weight * 100).toFixed(1)}%, ${factor.direction || 'neutral'})`
      );
      if (factor.description) {
        details.push(`    ${factor.description}`);
      }
    });

    // Add alternatives if available
    if (context.alternativeOutcomes && context.alternativeOutcomes.length > 0) {
      details.push('', 'Alternative Outcomes:');
      context.alternativeOutcomes.forEach(alt => {
        details.push(`  - ${JSON.stringify(alt.outcome)} (${(alt.probability * 100).toFixed(1)}%)`);
        details.push(`    Required changes: ${alt.requiredChanges.join(', ')}`);
      });
    }

    return {
      level: ExplanationLevel.INTERNAL,
      decisionContext: context,
      summary,
      details,
      contestable: this.isContestable(context.decisionType),
      generatedAt: timestamp
    };
  }

  /**
   * Compliance explanation - audit-ready, sanitized
   */
  private buildComplianceExplanation(context: DecisionContext, timestamp: Date): Explanation {
    const summary = `Automated ${context.decisionType} decision by model ${context.modelId}`;
    
    const details: string[] = [
      `Model: ${context.modelId} (version ${context.modelVersion})`,
      `Decision Type: ${context.decisionType}`,
      `Timestamp: ${context.timestamp.toISOString()}`,
      `Confidence Level: ${context.confidence ? this.getConfidenceLabel(context.confidence) : 'Not Available'}`,
      '',
      'Primary Decision Factors:'
    ];

    // Top 5 factors only, sanitized
    const topFactors = [...context.keyFactors]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
    
    topFactors.forEach((factor, index) => {
      details.push(`${index + 1}. ${this.sanitizeFactorName(factor.name)}: ${this.sanitizeFactorValue(factor.value)}`);
      details.push(`   Impact: ${this.getImpactLabel(factor.weight)} (${factor.direction || 'neutral'})`);
    });

    details.push('', 'Compliance Notes:');
    details.push('- Decision made in accordance with documented model policy');
    details.push('- All input data processed per GDPR requirements');
    details.push('- User has right to contest this decision');

    return {
      level: ExplanationLevel.COMPLIANCE,
      decisionContext: this.sanitizeContext(context),
      summary,
      details,
      contestable: this.isContestable(context.decisionType),
      contestInstructions: 'Contact support@avalo.app to contest this decision',
      generatedAt: timestamp
    };
  }

  /**
   * Regulator explanation - high-level, IP-protected
   */
  private buildRegulatorExplanation(context: DecisionContext, timestamp: Date): Explanation {
    const summary = `Automated decision using ${this.getModelTypeDescription(context.decisionType)}`;
    
    const details: string[] = [
      `Decision Category: ${context.decisionType}`,
      `Model Type: ${this.getModelTypeDescription(context.decisionType)}`,
      `Decision Date: ${context.timestamp.toISOString()}`,
      '',
      'Decision Methodology:',
      '- Input data collected and validated per platform policy',
      '- Multi-factor analysis performed using approved algorithms',
      '- Output generated with confidence assessment',
      '- Decision applied consistent with platform terms',
      '',
      'Key Decision Dimensions:'
    ];

    // Aggregate factors into categories
    const categories = this.aggregateFactorsToCategories(context.keyFactors);
    Object.entries(categories).forEach(([category, impact]) => {
      details.push(`- ${category}: ${this.getImpactLabel(impact)}`);
    });

    details.push('', 'Compliance & Oversight:');
    details.push('- Model registered in central governance registry');
    details.push('- Regular performance monitoring and bias testing');
    details.push('- Human review available for contested decisions');
    details.push('- Audit trail maintained per regulatory requirements');

    return {
      level: ExplanationLevel.REGULATOR,
      decisionContext: this.sanitizeContextForRegulator(context),
      summary,
      details,
      contestable: this.isContestable(context.decisionType),
      generatedAt: timestamp
    };
  }

  /**
   * User-facing explanation - simple, non-technical
   */
  private buildUserFacingExplanation(context: DecisionContext, timestamp: Date): Explanation {
    const summary = this.getUserFriendlySummary(context);
    
    const details: string[] = [
      this.getUserFriendlyDetails(context),
      '',
      'Why this decision?'
    ];

    // Top 3 factors in simple language
    const topFactors = [...context.keyFactors]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    
    topFactors.forEach((factor, index) => {
      const friendly = this.makeFactorUserFriendly(factor, context.decisionType);
      details.push(`${index + 1}. ${friendly}`);
    });

    if (context.alternativeOutcomes && context.alternativeOutcomes.length > 0) {
      details.push('', 'To achieve a different outcome:');
      const mainAlternative = context.alternativeOutcomes[0];
      mainAlternative.requiredChanges.forEach(change => {
        details.push(`• ${this.makeChangeUserFriendly(change)}`);
      });
    }

    if (this.isContestable(context.decisionType)) {
      details.push('', 'You can contest this decision by contacting support.');
    }

    return {
      level: ExplanationLevel.USER_FACING,
      decisionContext: this.sanitizeContextForUser(context),
      summary,
      details,
      contestable: this.isContestable(context.decisionType),
      contestInstructions: 'Tap here to contact support about this decision',
      generatedAt: timestamp
    };
  }

  /**
   * Store explanation for audit trail
   */
  private async storeExplanation(explanation: Explanation): Promise<void> {
    try {
      await this.db.collection(this.COLLECTION).add({
        ...explanation,
        pack: 'PACK_446',
        storedAt: new Date()
      });
    } catch (error) {
      logger.error('[DecisionExplainability] Store failed:', error);
      // Don't throw - storage failure shouldn't block explanation delivery
    }
  }

  /**
   * Retrieve explanation by decision ID
   */
  async getExplanation(entityId: string, level: ExplanationLevel): Promise<Explanation | null> {
    try {
      const snapshot = await this.db.collection(this.COLLECTION)
        .where('decisionContext.entityId', '==', entityId)
        .where('level', '==', level)
        .orderBy('generatedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].data() as Explanation;
    } catch (error) {
      logger.error('[DecisionExplainability] Get explanation failed:', error);
      throw error;
    }
  }

  // Helper methods

  private isContestable(decisionType: DecisionType): boolean {
    // Decisions that significantly impact users are contestable under GDPR
    return [
      DecisionType.PRICING,
      DecisionType.FRAUD_FLAG,
      DecisionType.ACCESS_CONTROL,
      DecisionType.CONTENT_MODERATION
    ].includes(decisionType);
  }

  private getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.75) return 'High';
    if (confidence >= 0.6) return 'Medium';
    if (confidence >= 0.4) return 'Low';
    return 'Very Low';
  }

  private getImpactLabel(weight: number): string {
    if (weight >= 0.5) return 'High Impact';
    if (weight >= 0.25) return 'Medium Impact';
    return 'Low Impact';
  }

  private sanitizeFactorName(name: string): string {
    // Remove internal identifiers and technical jargon
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }

  private sanitizeFactorValue(value: any): string {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      return '[Complex Value]';
    }
    return String(value);
  }

  private sanitizeContext(context: DecisionContext): DecisionContext {
    // Remove sensitive internal data
    return {
      ...context,
      inputFeatures: this.sanitizeInputFeatures(context.inputFeatures)
    };
  }

  private sanitizeContextForRegulator(context: DecisionContext): DecisionContext {
    // Highly sanitized - no specific user data, no model internals
    return {
      modelId: context.modelId,
      modelVersion: context.modelVersion,
      decisionType: context.decisionType,
      timestamp: context.timestamp,
      decision: '[Redacted for IP protection]',
      keyFactors: context.keyFactors.map(f => ({
        name: this.sanitizeFactorName(f.name),
        value: '[Redacted]',
        weight: Math.round(f.weight * 10) / 10, // Round to 1 decimal
        direction: f.direction
      })),
      inputFeatures: {}
    };
  }

  private sanitizeContextForUser(context: DecisionContext): DecisionContext {
    // User-friendly, no technical details
    return {
      modelId: '[System]',
      modelVersion: 'Current',
      decisionType: context.decisionType,
      timestamp: context.timestamp,
      decision: context.decision,
      confidence: context.confidence,
      keyFactors: context.keyFactors,
      inputFeatures: {}
    };
  }

  private sanitizeInputFeatures(features: Record<string, any>): Record<string, any> {
    // Remove PII and internal identifiers
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(features)) {
      if (!this.isSensitiveKey(key)) {
        sanitized[key] = this.sanitizeFactorValue(value);
      }
    }
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = ['email', 'phone', 'password', 'token', 'secret', 'ssn', 'credit'];
    return sensitivePatterns.some(pattern => key.toLowerCase().includes(pattern));
  }

  private getModelTypeDescription(decisionType: DecisionType): string {
    const descriptions: Record<DecisionType, string> = {
      [DecisionType.PRICING]: 'Dynamic Pricing Algorithm',
      [DecisionType.THROTTLING]: 'Rate Limiting System',
      [DecisionType.RECOMMENDATION]: 'Content Recommendation Engine',
      [DecisionType.FRAUD_FLAG]: 'Fraud Detection System',
      [DecisionType.SAFETY_FLAG]: 'Safety Monitoring System',
      [DecisionType.CONTENT_MODERATION]: 'Content Moderation AI',
      [DecisionType.ACCESS_CONTROL]: 'Access Control System',
      [DecisionType.PRIORITIZATION]: 'Priority Ranking Algorithm'
    };
    return descriptions[decisionType] || 'Automated Decision System';
  }

  private aggregateFactorsToCategories(factors: DecisionFactor[]): Record<string, number> {
    const categories: Record<string, number> = {
      'User Behavior': 0,
      'Historical Patterns': 0,
      'Platform Metrics': 0,
      'Safety Signals': 0,
      'Other Factors': 0
    };

    factors.forEach(factor => {
      const category = this.categorizeFactor(factor.name);
      categories[category] += factor.weight;
    });

    return categories;
  }

  private categorizeFactory(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('user') || lowerName.includes('activity')) return 'User Behavior';
    if (lowerName.includes('history') || lowerName.includes('past')) return 'Historical Patterns';
    if (lowerName.includes('platform') || lowerName.includes('system')) return 'Platform Metrics';
    if (lowerName.includes('safety') || lowerName.includes('risk')) return 'Safety Signals';
    return 'Other Factors';
  }

  private getUserFriendlySummary(context: DecisionContext): string {
    const summaries: Record<DecisionType, string> = {
      [DecisionType.PRICING]: 'Your pricing was adjusted based on platform activity',
      [DecisionType.THROTTLING]: 'Your request was rate limited for platform stability',
      [DecisionType.RECOMMENDATION]: 'This content was recommended to you',
      [DecisionType.FRAUD_FLAG]: 'This activity was flagged for review',
      [DecisionType.SAFETY_FLAG]: 'This content was flagged for safety review',
      [DecisionType.CONTENT_MODERATION]: 'This content was moderated',
      [DecisionType.ACCESS_CONTROL]: 'Access was restricted',
      [DecisionType.PRIORITIZATION]: 'Your content was prioritized'
    };
    return summaries[context.decisionType] || 'A decision was made about your request';
  }

  private getUserFriendlyDetails(context: DecisionContext): string {
    return `This decision was made automatically on ${context.timestamp.toLocaleDateString()} to ensure fair and safe use of the platform.`;
  }

  private makeFactorUserFriendly(factor: DecisionFactor, decisionType: DecisionType): string {
    // Convert technical factors to user-friendly language
    // This would be expanded based on actual factor types
    const name = this.sanitizeFactorName(factor.name);
    const direction = factor.direction === 'positive' ? 'helped' : 
                      factor.direction === 'negative' ? 'limited' : 'affected';
    return `Your ${name} ${direction} this decision`;
  }

  private makeChangeUserFriendly(change: string): string {
    // Convert technical requirements to actionable user guidance
    return change
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }

  private categorizeFactor(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('user') || lowerName.includes('activity')) return 'User Behavior';
    if (lowerName.includes('history') || lowerName.includes('past')) return 'Historical Patterns';
    if (lowerName.includes('platform') || lowerName.includes('system')) return 'Platform Metrics';
    if (lowerName.includes('safety') || lowerName.includes('risk')) return 'Safety Signals';
    return 'Other Factors';
  }
}
