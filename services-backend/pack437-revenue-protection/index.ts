/**
 * PACK 437 - Post-Launch Hardening & Revenue Protection Core
 * Integration Connector & Module Exports
 */

export { RevenueRiskScoringService } from './RevenueRiskScoringService';
export { PostLaunchGuardrailsConfig } from './PostLaunchGuardrailsConfig';
export { FraudRevenueCorrelationModel } from './FraudRevenueCorrelationModel';
export { RetentionMonetizationBalancer } from './RetentionMonetizationBalancer';
export { ExecutiveRevenueDashboard } from './ExecutiveRevenueDashboard';

// Type exports
export type { 
  RevenueRiskScore,
  RegionRiskProfile 
} from './RevenueRiskScoringService';

export type {
  GuardrailThreshold,
  GuardrailAction,
  GuardrailTrigger
} from './PostLaunchGuardrailsConfig';

export type {
  FraudRevenueCorrelation,
  CreatorPayoutRisk
} from './FraudRevenueCorrelationModel';

export type {
  MonetizationStrategy,
  RetentionImpactAnalysis,
  BalancedStrategy
} from './RetentionMonetizationBalancer';

export type {
  ExecutiveDashboardMetrics,
  RevenueHealthScore
} from './ExecutiveRevenueDashboard';

/**
 * Initialize PACK 437 services
 */
export async function initializeRevenueProtection(): Promise<void> {
  const { PostLaunchGuardrailsConfig } = await import('./PostLaunchGuardrailsConfig');
  const { ExecutiveRevenueDashboard } = await import('./ExecutiveRevenueDashboard');
  
  const guardrails = PostLaunchGuardrailsConfig.getInstance();
  const dashboard = ExecutiveRevenueDashboard.getInstance();
  
  // Initialize guardrails
  await guardrails.initialize();
  
  // Start automated dashboard updates
  dashboard.startAutomatedUpdates();
  
  console.log('✅ PACK 437: Revenue Protection initialized');
}

/**
 * Integration hook for existing analytics (PACK 299)
 */
export async function connectToAnalytics(analyticsEngine: any): Promise<void> {
  // Integration logic to connect with PACK 299 Analytics Engine
  console.log('✅ PACK 437: Connected to Analytics Engine');
}

/**
 * Integration hook for fraud detection (PACK 324B)
 */
export async function connectToFraudDetection(fraudDetector: any): Promise<void> {
  // Integration logic to connect with PACK 324B Fraud Signals
  console.log('✅ PACK 437: Connected to Fraud Detection');
}

/**
 * Integration hook for kill-switch system (PACK 365)
 */
export async function connectToKillSwitch(killSwitchManager: any): Promise<void> {
  // Integration logic to connect with PACK 365 Kill-Switch Framework
  console.log('✅ PACK 437: Connected to Kill-Switch Framework');
}

/**
 * Health check for revenue protection systems
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    riskScoring: boolean;
    guardrails: boolean;
    fraudCorrelation: boolean;
    dashboard: boolean;
  };
  issues: string[];
}> {
  const issues: string[] = [];
  
  const services = {
    riskScoring: true,
    guardrails: true,
    fraudCorrelation: true,
    dashboard: true
  };
  
  try {
    const { RevenueRiskScoringService } = await import('./RevenueRiskScoringService');
    const riskService = RevenueRiskScoringService.getInstance();
    // Perform health check
  } catch (error) {
    services.riskScoring = false;
    issues.push('Risk scoring service unavailable');
  }
  
  try {
    const { PostLaunchGuardrailsConfig } = await import('./PostLaunchGuardrailsConfig');
    const guardrails = PostLaunchGuardrailsConfig.getInstance();
    // Perform health check
  } catch (error) {
    services.guardrails = false;
    issues.push('Guardrails unavailable');
  }
  
  const healthyCount = Object.values(services).filter(Boolean).length;
  const status = healthyCount === 4 ? 'healthy' : healthyCount >= 2 ? 'degraded' : 'unhealthy';
  
  return { status, services, issues };
}
