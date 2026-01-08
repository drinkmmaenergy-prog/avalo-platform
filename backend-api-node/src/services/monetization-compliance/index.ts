/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * Main Integration Layer
 * 
 * Orchestrates all compliance services for monetization flows
 */

import DarkPatternDetectionService, { 
  AnalysisContext, 
  FlowAnalysis 
} from './DarkPatternDetectionService';

import MonetizationTransparencyEnforcer, { 
  MonetizationContent,
  Region 
} from './MonetizationTransparencyEnforcer';

import UXRiskScoringEngine, { 
  RiskScore 
} from './UXRiskScoringEngine';

import RegulatoryReadinessController, { 
  RegulatoryMode,
  FlowActivationDecision 
} from './RegulatoryReadinessController';

import MonetizationUXAuditDashboard, {
  AuditEntry
} from './MonetizationUXAuditDashboard';

export interface MonetizationFlowSubmission {
  flowId: string;
  flowType: 'paywall' | 'offer' | 'upsell' | 'subscription' | 'checkout';
  analysisContext: AnalysisContext;
  monetizationContent: MonetizationContent;
  requestedBy: string;
  requestedByRole: 'product' | 'legal' | 'compliance' | 'executive';
}

export interface FlowEvaluationResult {
  flowId: string;
  approved: boolean;
  darkPatternAnalysis: FlowAnalysis;
  riskScore: RiskScore;
  activationDecision: FlowActivationDecision;
  violations: string[];
  warnings: string[];
  requiresApproval: boolean;
  approvalLevel: 'none' | 'product' | 'legal' | 'executive';
  blockedReasons: string[];
}

/**
 * Main service orchestrator for PACK 444
 */
class MonetizationComplianceService {
  private darkPatternService: DarkPatternDetectionService;
  private transparencyEnforcer: MonetizationTransparencyEnforcer;
  private riskScoringEngine: UXRiskScoringEngine;
  private regulatoryController: RegulatoryReadinessController;
  private auditDashboard: MonetizationUXAuditDashboard;

  private static instance: MonetizationComplianceService;

  private constructor() {
    this.darkPatternService = new DarkPatternDetectionService();
    this.transparencyEnforcer = new MonetizationTransparencyEnforcer();
    this.riskScoringEngine = new UXRiskScoringEngine();
    this.regulatoryController = new RegulatoryReadinessController();
    this.auditDashboard = new MonetizationUXAuditDashboard();

    console.log('✅ MonetizationComplianceService initialized');
  }

  public static getInstance(): MonetizationComplianceService {
    if (!MonetizationComplianceService.instance) {
      MonetizationComplianceService.instance = new MonetizationComplianceService();
    }
    return MonetizationComplianceService.instance;
  }

  /**
   * Evaluate a monetization flow for compliance
   * This is the main entry point for flow validation
   */
  async evaluateFlow(submission: MonetizationFlowSubmission): Promise<FlowEvaluationResult> {
    console.log(`🔍 Evaluating flow: ${submission.flowId}`);

    try {
      // Step 1: Dark Pattern Detection
      const darkPatternAnalysis = await this.darkPatternService.analyzeFlow(
        submission.analysisContext
      );

      // Step 2: Transparency Validation
      const transparencyValidation = this.transparencyEnforcer.validate(
        submission.monetizationContent
      );

      // Step 3: Risk Scoring
      const riskScore = await this.riskScoringEngine.calculateRiskScore(
        darkPatternAnalysis,
        submission.monetizationContent
      );

      // Step 4: Regulatory Readiness Check
      const activationDecision = this.regulatoryController.evaluateFlowActivation(
        submission.flowId,
        riskScore,
        submission.monetizationContent.region
      );

      // Compile violations and warnings
      const violations: string[] = [
        ...darkPatternAnalysis.blockingReasons,
        ...transparencyValidation.violations.map(v => v.message),
        ...activationDecision.blockedBy
      ];

      const warnings: string[] = [
        ...activationDecision.warnings,
        ...transparencyValidation.violations
          .filter(v => v.severity === 'low' || v.severity === 'medium')
          .map(v => v.message)
      ];

      // Determine approval
      const approved = 
        darkPatternAnalysis.canActivate &&
        transparencyValidation.isCompliant &&
        riskScore.canActivate &&
        activationDecision.canActivate;

      // Log to audit dashboard
      this.auditDashboard.logAudit({
        flowId: submission.flowId,
        action: approved ? 'approved' : 'blocked',
        userId: submission.requestedBy,
        userRole: submission.requestedByRole,
        riskScore,
        analysis: darkPatternAnalysis,
        approvalRequired: activationDecision.requiresApproval,
        notes: `Risk: ${riskScore.normalizedScore.toFixed(1)}, Mode: ${activationDecision.mode}`
      });

      const result: FlowEvaluationResult = {
        flowId: submission.flowId,
        approved,
        darkPatternAnalysis,
        riskScore,
        activationDecision,
        violations,
        warnings,
        requiresApproval: activationDecision.requiresApproval,
        approvalLevel: activationDecision.approvalLevel,
        blockedReasons: violations
      };

      console.log(`${approved ? '✅' : '❌'} Flow ${submission.flowId}: ${approved ? 'APPROVED' : 'BLOCKED'}`);
      
      return result;

    } catch (error) {
      console.error(`Error evaluating flow ${submission.flowId}:`, error);
      
      // Log error
      this.auditDashboard.logAudit({
        flowId: submission.flowId,
        action: 'blocked',
        userId: submission.requestedBy,
        userRole: submission.requestedByRole,
        approvalRequired: true,
        notes: `Error during evaluation: ${error.message}`
      });

      throw error;
    }
  }

  /**
   * Batch evaluate multiple flows
   */
  async evaluateFlows(submissions: MonetizationFlowSubmission[]): Promise<FlowEvaluationResult[]> {
    return Promise.all(submissions.map(s => this.evaluateFlow(s)));
  }

  /**
   * Get compliance dashboard
   */
  getDashboard(): MonetizationUXAuditDashboard {
    return this.auditDashboard;
  }

  /**
   * Get regulatory controller
   */
  getRegulatoryController(): RegulatoryReadinessController {
    return this.regulatoryController;
  }

  /**
   * Get risk scoring engine
   */
  getRiskScoringEngine(): UXRiskScoringEngine {
    return this.riskScoringEngine;
  }

  /**
   * Get dark pattern service
   */
  getDarkPatternService(): DarkPatternDetectionService {
    return this.darkPatternService;
  }

  /**
   * Get transparency enforcer
   */
  getTransparencyEnforcer(): MonetizationTransparencyEnforcer {
    return this.transparencyEnforcer;
  }

  /**
   * Quick status check
   */
  getSystemStatus(): {
    mode: RegulatoryMode;
    safeModeEnabled: boolean;
    activeFlows: number;
    blockedFlows: number;
    pendingApprovals: number;
    recentAlerts: number;
  } {
    const controllerStatus = this.regulatoryController.getStatus();
    const metrics = this.auditDashboard.getMetrics();
    const alerts = this.auditDashboard.getAlerts({ acknowledged: false });

    return {
      mode: controllerStatus.mode,
      safeModeEnabled: controllerStatus.safeModeEnabled,
      activeFlows: metrics?.activeFlows || 0,
      blockedFlows: metrics?.blockedFlows || 0,
      pendingApprovals: metrics?.pendingApproval || 0,
      recentAlerts: alerts.length
    };
  }
}

// Export singleton instance
export default MonetizationComplianceService;

// Export all types and classes
export {
  DarkPatternDetectionService,
  MonetizationTransparencyEnforcer,
  UXRiskScoringEngine,
  RegulatoryReadinessController,
  MonetizationUXAuditDashboard,
  Region,
  RegulatoryMode
};
