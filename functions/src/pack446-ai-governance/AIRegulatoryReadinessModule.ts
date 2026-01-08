/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Module: AI Regulatory Readiness
 * 
 * Prepares AI systems for regulatory inspection and compliance.
 * Covers EU AI Act, GDPR Article 22, and platform policies.
 */

import { logger } from 'firebase-functions';
import { ModelMetadata } from './AIModelRegistry';

export enum RegulatoryFramework {
  EU_AI_ACT = 'EU_AI_ACT',
  GDPR = 'GDPR',
  CCPA = 'CCPA',
  PLATFORM_POLICY = 'PLATFORM_POLICY',
  ISO_IEC_42001 = 'ISO_IEC_42001',
  NIST_AI_RMF = 'NIST_AI_RMF'
}

export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  PARTIAL = 'PARTIAL',
  NON_COMPLIANT = 'NON_COMPLIANT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  NOT_ASSESSED = 'NOT_ASSESSED'
}

export interface ComplianceRequirement {
  id: string;
  framework: RegulatoryFramework;
  category: string;
  requirement: string;
  description: string;
  mandatory: boolean;
  evidenceRequired: string[];
}

export interface ComplianceEvidence {
  requirementId: string;
  evidenceType: string;
  description: string;
  documentUrl?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  validUntil?: Date;
}

export interface ComplianceAssessment {
  modelId: string;
  framework: RegulatoryFramework;
  status: ComplianceStatus;
  score: number;              // 0-100
  requirements: ComplianceRequirementStatus[];
  gaps: ComplianceGap[];
  recommendations: string[];
  assessedAt: Date;
  assessedBy: string;
  nextReviewDue: Date;
}

export interface ComplianceRequirementStatus {
  requirementId: string;
  requirement: string;
  status: ComplianceStatus;
  evidence: ComplianceEvidence[];
  notes?: string;
}

export interface ComplianceGap {
  requirementId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  remediation: string;
  deadline?: Date;
}

export interface RegulatoryInspectionPackage {
  modelId: string;
  modelVersion: string;
  generatedAt: Date;
  generatedBy: string;
  
  // Model Overview (IP-safe)
  overview: {
    name: string;
    purpose: string;
    decisionScope: string;
    impactAssessment: string;
    riskClassification: string;
  };
  
  // Compliance Status
  compliance: {
    frameworks: ComplianceAssessment[];
    overallStatus: ComplianceStatus;
  };
  
  // Documentation
  documentation: {
    modelCard: string;
    dataCard: string;
    ethicsReview: string;
    testResults: string;
  };
  
  // Governance
  governance: {
    owner: string;
    reviewCycle: string;
    changeLog: string[];
    incidentHistory: string[];
  };
  
  // Performance & Monitoring
  monitoring: {
    performanceMetrics: Record<string, number>;
    biasMetrics: Record<string, number>;
    driftMetrics: Record<string, number>;
    recentAlerts: string[];
  };
  
  // Human Oversight
  humanOversight: {
    reviewProcess: string;
    escalationProcedure: string;
    contestMechanism: string;
  };
}

export class AIRegulatoryReadinessModule {
  private db: FirebaseFirestore.Firestore;
  private readonly ASSESSMENTS_COLLECTION = 'ai_compliance_assessments';
  private readonly EVIDENCE_COLLECTION = 'ai_compliance_evidence';
  private readonly REQUIREMENTS_COLLECTION = 'ai_compliance_requirements';

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
    this.initializeRequirements();
  }

  /**
   * Initialize standard compliance requirements
   */
  private async initializeRequirements(): Promise<void> {
    // This would load standard requirements from config
    // For brevity, we'll skip the full initialization
  }

  /**
   * Assess model compliance with a regulatory framework
   */
  async assessCompliance(
    modelId: string,
    framework: RegulatoryFramework,
    assessedBy: string
  ): Promise<ComplianceAssessment> {
    try {
      logger.info(`[AIRegulatory] Assessing ${modelId} for ${framework}`);

      // Get model metadata
      const model = await this.getModelMetadata(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      // Get requirements for this framework
      const requirements = await this.getRequirements(framework);

      // Assess each requirement
      const requirementStatuses: ComplianceRequirementStatus[] = [];
      const gaps: ComplianceGap[] = [];

      for (const req of requirements) {
        const status = await this.assessRequirement(modelId, req);
        requirementStatuses.push(status);

        if (status.status !== ComplianceStatus.COMPLIANT) {
          gaps.push(this.identifyGap(req, status));
        }
      }

      // Calculate overall score
      const score = this.calculateComplianceScore(requirementStatuses);
      const overallStatus = this.determineOverallStatus(requirementStatuses);

      // Generate recommendations
      const recommendations = this.generateComplianceRecommendations(gaps, framework);

      const assessment: ComplianceAssessment = {
        modelId,
        framework,
        status: overallStatus,
        score,
        requirements: requirementStatuses,
        gaps,
        recommendations,
        assessedAt: new Date(),
        assessedBy,
        nextReviewDue: this.calculateNextReviewDate(framework)
      };

      // Store assessment
      await this.storeAssessment(assessment);

      logger.info(`[AIRegulatory] Compliance assessment complete: ${score}/100 (${overallStatus})`);

      return assessment;
    } catch (error) {
      logger.error('[AIRegulatory] Compliance assessment failed:', error);
      throw error;
    }
  }

  /**
   * Generate regulatory inspection package
   */
  async generateInspectionPackage(
    modelId: string,
    generatedBy: string
  ): Promise<RegulatoryInspectionPackage> {
    try {
      logger.info(`[AIRegulatory] Generating inspection package for ${modelId}`);

      const model = await this.getModelMetadata(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      // Gather all compliance assessments
      const assessments = await this.getAllAssessments(modelId);

      // Generate package sections
      const overview = this.generateOverview(model);
      const compliance = this.generateComplianceSection(assessments);
      const documentation = await this.generateDocumentation(model);
      const governance = await this.generateGovernanceSection(model);
      const monitoring = await this.generateMonitoringSection(modelId);
      const humanOversight = this.generateOversightSection(model);

      const inspectionPackage: RegulatoryInspectionPackage = {
        modelId,
        modelVersion: model.version,
        generatedAt: new Date(),
        generatedBy,
        overview,
        compliance,
        documentation,
        governance,
        monitoring,
        humanOversight
      };

      // Store package
      await this.db.collection('ai_inspection_packages').add({
        ...inspectionPackage,
        pack: 'PACK_446'
      });

      logger.info(`[AIRegulatory] Inspection package generated for ${modelId}`);

      return inspectionPackage;
    } catch (error) {
      logger.error('[AIRegulatory] Generate inspection package failed:', error);
      throw error;
    }
  }

  /**
   * Submit compliance evidence
   */
  async submitEvidence(
    modelId: string,
    requirementId: string,
    evidence: Omit<ComplianceEvidence, 'requirementId'>
  ): Promise<void> {
    try {
      const fullEvidence: ComplianceEvidence = {
        requirementId,
        ...evidence
      };

      await this.db.collection(this.EVIDENCE_COLLECTION).add({
        modelId,
        ...fullEvidence,
        submittedAt: new Date()
      });

      logger.info(`[AIRegulatory] Evidence submitted for ${modelId} / ${requirementId}`);
    } catch (error) {
      logger.error('[AIRegulatory] Submit evidence failed:', error);
      throw error;
    }
  }

  /**
   * Get compliance status for a model
   */
  async getComplianceStatus(modelId: string): Promise<{
    overall: ComplianceStatus;
    frameworks: Map<RegulatoryFramework, ComplianceStatus>;
    score: number;
  }> {
    try {
      const assessments = await this.getAllAssessments(modelId);

      if (assessments.length === 0) {
        return {
          overall: ComplianceStatus.NOT_ASSESSED,
          frameworks: new Map(),
          score: 0
        };
      }

      const frameworks = new Map<RegulatoryFramework, ComplianceStatus>();
      let totalScore = 0;

      assessments.forEach(assessment => {
        frameworks.set(assessment.framework, assessment.status);
        totalScore += assessment.score;
      });

      const avgScore = totalScore / assessments.length;
      const overall = this.determineOverallStatus(
        assessments.flatMap(a => a.requirements)
      );

      return { overall, frameworks, score: avgScore };
    } catch (error) {
      logger.error('[AIRegulatory] Get compliance status failed:', error);
      throw error;
    }
  }

  // Helper methods

  private async getModelMetadata(modelId: string): Promise<ModelMetadata | null> {
    const doc = await this.db.collection('ai_model_registry').doc(modelId).get();
    return doc.exists ? doc.data() as ModelMetadata : null;
  }

  private async getRequirements(framework: RegulatoryFramework): Promise<ComplianceRequirement[]> {
    // In production, would load from database
    // For now, return core requirements for each framework
    return this.getCoreRequirements(framework);
  }

  private getCoreRequirements(framework: RegulatoryFramework): ComplianceRequirement[] {
    const requirements: Record<RegulatoryFramework, ComplianceRequirement[]> = {
      [RegulatoryFramework.EU_AI_ACT]: [
        {
          id: 'EUAI-001',
          framework: RegulatoryFramework.EU_AI_ACT,
          category: 'Risk Assessment',
          requirement: 'AI system risk classification',
          description: 'System must be classified according to EU AI Act risk categories',
          mandatory: true,
          evidenceRequired: ['Risk Assessment Document']
        },
        {
          id: 'EUAI-002',
          framework: RegulatoryFramework.EU_AI_ACT,
          category: 'Documentation',
          requirement: 'Technical documentation',
          description: 'Comprehensive technical documentation must be maintained',
          mandatory: true,
          evidenceRequired: ['Technical Documentation', 'Model Card']
        },
        {
          id: 'EUAI-003',
          framework: RegulatoryFramework.EU_AI_ACT,
          category: 'Human Oversight',
          requirement: 'Human oversight mechanisms',
          description: 'Appropriate human oversight must be in place for high-risk systems',
          mandatory: true,
          evidenceRequired: ['Oversight Procedures', 'Escalation Process']
        }
      ],
      [RegulatoryFramework.GDPR]: [
        {
          id: 'GDPR-001',
          framework: RegulatoryFramework.GDPR,
          category: 'Automated Decision Making',
          requirement: 'Article 22 compliance',
          description: 'Right to explanation and human review for automated decisions',
          mandatory: true,
          evidenceRequired: ['Explainability System', 'Review Process']
        },
        {
          id: 'GDPR-002',
          framework: RegulatoryFramework.GDPR,
          category: 'Data Protection',
          requirement: 'Privacy by design',
          description: 'Data protection integrated into processing activities',
          mandatory: true,
          evidenceRequired: ['Privacy Impact Assessment', 'Data Minimization Policy']
        }
      ],
      [RegulatoryFramework.CCPA]: [],
      [RegulatoryFramework.PLATFORM_POLICY]: [],
      [RegulatoryFramework.ISO_IEC_42001]: [],
      [RegulatoryFramework.NIST_AI_RMF]: []
    };

    return requirements[framework] || [];
  }

  private async assessRequirement(
    modelId: string,
    requirement: ComplianceRequirement
  ): Promise<ComplianceRequirementStatus> {
    // Get evidence for this requirement
    const evidenceSnapshot = await this.db.collection(this.EVIDENCE_COLLECTION)
      .where('modelId', '==', modelId)
      .where('requirementId', '==', requirement.id)
      .get();

    const evidence = evidenceSnapshot.docs.map(doc => doc.data() as ComplianceEvidence);

    // Determine status based on evidence
    let status: ComplianceStatus;
    if (evidence.length === 0) {
      status = ComplianceStatus.NOT_ASSESSED;
    } else if (evidence.length >= requirement.evidenceRequired.length) {
      const verified = evidence.every(e => e.verifiedBy);
      status = verified ? ComplianceStatus.COMPLIANT : ComplianceStatus.PENDING_REVIEW;
    } else {
      status = ComplianceStatus.PARTIAL;
    }

    return {
      requirementId: requirement.id,
      requirement: requirement.requirement,
      status,
      evidence,
      notes: `${evidence.length}/${requirement.evidenceRequired.length} evidence items submitted`
    };
  }

  private identifyGap(
    requirement: ComplianceRequirement,
    status: ComplianceRequirementStatus
  ): ComplianceGap {
    const severity = requirement.mandatory ? 'CRITICAL' : 'MEDIUM';
    
    let description: string;
    if (status.status === ComplianceStatus.NOT_ASSESSED) {
      description = `No evidence provided for: ${requirement.requirement}`;
    } else if (status.status === ComplianceStatus.PARTIAL) {
      description = `Incomplete evidence for: ${requirement.requirement}`;
    } else {
      description = `Under review: ${requirement.requirement}`;
    }

    const remediation = requirement.evidenceRequired
      .map(e => `Submit ${e}`)
      .join('; ');

    return {
      requirementId: requirement.id,
      severity,
      description,
      remediation,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }

  private calculateComplianceScore(statuses: ComplianceRequirementStatus[]): number {
    if (statuses.length === 0) return 0;

    const points = statuses.reduce((sum, status) => {
      switch (status.status) {
        case ComplianceStatus.COMPLIANT: return sum + 100;
        case ComplianceStatus.PARTIAL: return sum + 50;
        case ComplianceStatus.PENDING_REVIEW: return sum + 75;
        default: return sum;
      }
    }, 0);

    return Math.round(points / statuses.length);
  }

  private determineOverallStatus(statuses: ComplianceRequirementStatus[]): ComplianceStatus {
    if (statuses.length === 0) return ComplianceStatus.NOT_ASSESSED;
    
    const hasNonCompliant = statuses.some(s => s.status === ComplianceStatus.NON_COMPLIANT);
    if (hasNonCompliant) return ComplianceStatus.NON_COMPLIANT;

    const hasNotAssessed = statuses.some(s => s.status === ComplianceStatus.NOT_ASSESSED);
    if (hasNotAssessed) return ComplianceStatus.PARTIAL;

    const hasPartial = statuses.some(s => s.status === ComplianceStatus.PARTIAL);
    if (hasPartial) return ComplianceStatus.PARTIAL;

    const hasPending = statuses.some(s => s.status === ComplianceStatus.PENDING_REVIEW);
    if (hasPending) return ComplianceStatus.PENDING_REVIEW;

    return ComplianceStatus.COMPLIANT;
  }

  private generateComplianceRecommendations(
    gaps: ComplianceGap[],
    framework: RegulatoryFramework
  ): string[] {
    const recommendations: string[] = [];

    const criticalGaps = gaps.filter(g => g.severity === 'CRITICAL');
    if (criticalGaps.length > 0) {
      recommendations.push(`URGENT: Address ${criticalGaps.length} critical compliance gaps`);
      criticalGaps.forEach(gap => {
        recommendations.push(`  - ${gap.description}: ${gap.remediation}`);
      });
    }

    const highGaps = gaps.filter(g => g.severity === 'HIGH');
    if (highGaps.length > 0) {
      recommendations.push(`High priority: Resolve ${highGaps.length} high-severity gaps`);
    }

    if (gaps.length === 0) {
      recommendations.push(`Model is compliant with ${framework} requirements`);
      recommendations.push('Maintain regular compliance reviews');
    }

    return recommendations;
  }

  private calculateNextReviewDate(framework: RegulatoryFramework): Date {
    // Different frameworks have different review cycles
    const reviewCycles: Record<RegulatoryFramework, number> = {
      [RegulatoryFramework.EU_AI_ACT]: 180,      // 6 months
      [RegulatoryFramework.GDPR]: 365,           // 1 year
      [RegulatoryFramework.CCPA]: 365,
      [RegulatoryFramework.PLATFORM_POLICY]: 90, // 3 months
      [RegulatoryFramework.ISO_IEC_42001]: 365,
      [RegulatoryFramework.NIST_AI_RMF]: 180
    };

    const days = reviewCycles[framework] || 365;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async getAllAssessments(modelId: string): Promise<ComplianceAssessment[]> {
    const snapshot = await this.db.collection(this.ASSESSMENTS_COLLECTION)
      .where('modelId', '==', modelId)
      .orderBy('assessedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as ComplianceAssessment);
  }

  private async storeAssessment(assessment: ComplianceAssessment): Promise<void> {
    await this.db.collection(this.ASSESSMENTS_COLLECTION).add({
      ...assessment,
      pack: 'PACK_446'
    });
  }

  // Inspection package generation helpers

  private generateOverview(model: ModelMetadata): any {
    return {
      name: model.name,
      purpose: model.description,
      decisionScope: model.decisionScope.domain,
      impactAssessment: `Impact Level: ${model.decisionScope.impactLevel}`,
      riskClassification: model.euAiActCategory || 'Not classified'
    };
  }

  private generateComplianceSection(assessments: ComplianceAssessment[]): any {
    const overallStatus = assessments.length > 0 
      ? this.determineOverallStatus(assessments.flatMap(a => a.requirements))
      : ComplianceStatus.NOT_ASSESSED;

    return {
      frameworks: assessments,
      overallStatus
    };
  }

  private async generateDocumentation(model: ModelMetadata): Promise<any> {
    return {
      modelCard: 'Model card describing capabilities, limitations, and performance',
      dataCard: 'Data card describing training data characteristics',
      ethicsReview: 'Ethics review documentation',
      testResults: 'Testing and validation results'
    };
  }

  private async generateGovernanceSection(model: ModelMetadata): Promise<any> {
    return {
      owner: model.owner,
      reviewCycle: 'Quarterly reviews',
      changeLog: model.deploymentHistory.map(d => 
        `v${d.version} deployed on ${d.deployedAt}`
      ),
      incidentHistory: []
    };
  }

  private async generateMonitoringSection(modelId: string): Promise<any> {
    // Would integrate with actual monitoring data
    return {
      performanceMetrics: {
        accuracy: 0.94,
        latency: 150,
        availability: 99.95
      },
      biasMetrics: {
        biasScore: 12,
        disparateImpact: 0.92
      },
      driftMetrics: {
        dataDrift: 15,
        conceptDrift: 8
      },
      recentAlerts: []
    };
  }

  private generateOversightSection(model: ModelMetadata): any {
    return {
      reviewProcess: model.decisionScope.humanInLoop 
        ? 'Human review for all decisions'
        : 'Human review for flagged decisions',
      escalationProcedure: 'Automated escalation to human operators',
      contestMechanism: 'Users can contest decisions via support'
    };
  }
}
