/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * RegulatoryReadinessController - Safe mode and regulatory adaptation
 * 
 * Features:
 * - Safe Mode activation
 * - Automatic exclusion of risky flows
 * - Quick adjustment for DSA/DMA/App Store Review
 * - Manual or alert-based activation
 */

import { RiskScore } from './UXRiskScoringEngine';

export enum RegulatoryMode {
  NORMAL = 'normal',
  SAFE = 'safe',
  AUDIT = 'audit',
  LOCKDOWN = 'lockdown'
}

export enum RegulatoryFramework {
  DSA = 'dsa',                    // EU Digital Services Act
  DMA = 'dma',                    // EU Digital Markets Act
  GDPR = 'gdpr',                  // EU General Data Protection Regulation
  APP_STORE = 'app_store',        // Apple App Store Guidelines
  PLAY_STORE = 'play_store',      // Google Play Store Policies
  FTC = 'ftc',                    // US Federal Trade Commission
  CCPA = 'ccpa',                  // California Consumer Privacy Act
  UK_ONLINE_SAFETY = 'uk_online_safety'  // UK Online Safety Act
}

export interface SafeModeConfig {
  enabled: boolean;
  maxRiskScore: number;
  blockedPatterns: string[];
  allowedRegions: string[];
  requiresManualApproval: boolean;
  notificationRecipients: string[];
  activatedBy?: string;
  activatedAt?: Date;
  reason?: string;
}

export interface RegulatoryAdjustment {
  framework: RegulatoryFramework;
  active: boolean;
  strictnessLevel: 'normal' | 'elevated' | 'maximum';
  specificRules: string[];
  expiresAt?: Date;
  reason: string;
}

export interface FlowActivationDecision {
  flowId: string;
  canActivate: boolean;
  mode: RegulatoryMode;
  blockedBy: string[];
  warnings: string[];
  requiresApproval: boolean;
  approvalLevel: 'none' | 'product' | 'legal' | 'executive';
}

class RegulatoryReadinessController {
  private currentMode: RegulatoryMode;
  private safeModeConfig: SafeModeConfig;
  private activeAdjustments: Map<RegulatoryFramework, RegulatoryAdjustment>;
  private activationHistory: Array<{
    timestamp: Date;
    mode: RegulatoryMode;
    trigger: string;
    userId?: string;
  }>;

  constructor() {
    this.currentMode = RegulatoryMode.NORMAL;
    this.safeModeConfig = this.getDefaultSafeModeConfig();
    this.activeAdjustments = new Map();
    this.activationHistory = [];
  }

  /**
   * Activate Safe Mode
   */
  activateSafeMode(
    triggeredBy: 'manual' | 'alert' | 'audit' | 'system',
    reason: string,
    userId?: string
  ): void {
    console.log(`🛡️ SAFE MODE ACTIVATED: ${reason}`);
    console.log(`Triggered by: ${triggeredBy}${userId ? ` (${userId})` : ''}`);

    this.currentMode = RegulatoryMode.SAFE;
    this.safeModeConfig.enabled = true;
    this.safeModeConfig.activatedBy = userId || triggeredBy;
    this.safeModeConfig.activatedAt = new Date();
    this.safeModeConfig.reason = reason;

    // Record in history
    this.activationHistory.push({
      timestamp: new Date(),
      mode: RegulatoryMode.SAFE,
      trigger: `${triggeredBy}: ${reason}`,
      userId
    });

    // Notify stakeholders
    this.notifyStakeholders('safe_mode_activated', {
      reason,
      triggeredBy,
      userId
    });
  }

  /**
   * Deactivate Safe Mode
   */
  deactivateSafeMode(userId: string, reason: string): void {
    console.log(`✅ Safe Mode deactivated by ${userId}: ${reason}`);

    this.currentMode = RegulatoryMode.NORMAL;
    this.safeModeConfig.enabled = false;

    this.activationHistory.push({
      timestamp: new Date(),
      mode: RegulatoryMode.NORMAL,
      trigger: `deactivation: ${reason}`,
      userId
    });

    this.notifyStakeholders('safe_mode_deactivated', {
      reason,
      userId
    });
  }

  /**
   * Activate Audit Mode (extra logging, no automatic blocking)
   */
  activateAuditMode(userId: string, reason: string): void {
    console.log(`📋 AUDIT MODE ACTIVATED by ${userId}: ${reason}`);
    
    this.currentMode = RegulatoryMode.AUDIT;
    
    this.activationHistory.push({
      timestamp: new Date(),
      mode: RegulatoryMode.AUDIT,
      trigger: reason,
      userId
    });
  }

  /**
   * Activate Lockdown Mode (all monetization paused)
   */
  activateLockdownMode(userId: string, reason: string): void {
    console.log(`🚨 LOCKDOWN MODE ACTIVATED by ${userId}: ${reason}`);
    
    this.currentMode = RegulatoryMode.LOCKDOWN;
    
    this.activationHistory.push({
      timestamp: new Date(),
      mode: RegulatoryMode.LOCKDOWN,
      trigger: reason,
      userId
    });

    // Immediately notify all stakeholders
    this.notifyStakeholders('lockdown_activated', {
      reason,
      userId,
      severity: 'CRITICAL'
    });
  }

  /**
   * Add regulatory framework adjustment
   */
  addRegulatoryAdjustment(adjustment: RegulatoryAdjustment): void {
    console.log(`⚖️ Regulatory adjustment added: ${adjustment.framework}`);
    console.log(`Strictness: ${adjustment.strictnessLevel}`);
    
    this.activeAdjustments.set(adjustment.framework, adjustment);

    // If DSA or DMA, consider auto-activating safe mode
    if ((adjustment.framework === RegulatoryFramework.DSA || 
         adjustment.framework === RegulatoryFramework.DMA) &&
        adjustment.strictnessLevel === 'maximum') {
      this.activateSafeMode('system', `${adjustment.framework.toUpperCase()} maximum strictness required`);
    }
  }

  /**
   * Remove regulatory framework adjustment
   */
  removeRegulatoryAdjustment(framework: RegulatoryFramework): void {
    this.activeAdjustments.delete(framework);
    console.log(`Regulatory adjustment removed: ${framework}`);
  }

  /**
   * Evaluate if a flow can be activated
   */
  evaluateFlowActivation(
    flowId: string,
    riskScore: RiskScore,
    region: string
  ): FlowActivationDecision {
    const blockedBy: string[] = [];
    const warnings: string[] = [];
    let requiresApproval = false;
    let approvalLevel: FlowActivationDecision['approvalLevel'] = 'none';

    // Check current mode
    switch (this.currentMode) {
      case RegulatoryMode.LOCKDOWN:
        blockedBy.push('System in LOCKDOWN mode');
        return {
          flowId,
          canActivate: false,
          mode: this.currentMode,
          blockedBy,
          warnings,
          requiresApproval: false,
          approvalLevel: 'executive'
        };

      case RegulatoryMode.SAFE:
        if (riskScore.normalizedScore > this.safeModeConfig.maxRiskScore) {
          blockedBy.push('Risk score exceeds Safe Mode threshold');
        }
        if (this.safeModeConfig.requiresManualApproval) {
          requiresApproval = true;
          approvalLevel = 'legal';
        }
        break;

      case RegulatoryMode.AUDIT:
        warnings.push('Flow activation will be logged for audit');
        if (riskScore.normalizedScore > 70) {
          requiresApproval = true;
          approvalLevel = 'product';
        }
        break;
    }

    // Check Safe Mode config
    if (this.safeModeConfig.enabled) {
      if (!riskScore.canActivate) {
        blockedBy.push('Flow blocked by risk scoring system');
      }

      if (this.safeModeConfig.allowedRegions.length > 0 &&
          !this.safeModeConfig.allowedRegions.includes(region)) {
        blockedBy.push(`Region ${region} not in allowed list during Safe Mode`);
      }
    }

    // Check active regulatory adjustments
    for (const [framework, adjustment] of this.activeAdjustments.entries()) {
      if (!adjustment.active) continue;

      // Apply framework-specific rules
      const frameworkCheck = this.checkFrameworkCompliance(
        framework,
        adjustment,
        riskScore,
        region
      );

      if (!frameworkCheck.compliant) {
        blockedBy.push(`${framework.toUpperCase()}: ${frameworkCheck.reason}`);
      }
      warnings.push(...frameworkCheck.warnings);

      // Elevate approval requirements
      if (adjustment.strictnessLevel === 'maximum' && !requiresApproval) {
        requiresApproval = true;
        approvalLevel = 'legal';
      }
    }

    const canActivate = blockedBy.length === 0;

    return {
      flowId,
      canActivate,
      mode: this.currentMode,
      blockedBy,
      warnings,
      requiresApproval: requiresApproval || !canActivate,
      approvalLevel: canActivate ? approvalLevel : 'legal'
    };
  }

  /**
   * Check framework-specific compliance
   */
  private checkFrameworkCompliance(
    framework: RegulatoryFramework,
    adjustment: RegulatoryAdjustment,
    riskScore: RiskScore,
    region: string
  ): { compliant: boolean; reason?: string; warnings: string[] } {
    const warnings: string[] = [];

    switch (framework) {
      case RegulatoryFramework.DSA:
        // EU Digital Services Act - very strict
        if (region.startsWith('EU') && riskScore.normalizedScore > 35) {
          return {
            compliant: false,
            reason: 'Risk score too high for DSA compliance',
            warnings
          };
        }
        if (riskScore.breakdown.darkPatterns > 15) {
          warnings.push('Dark patterns detected - DSA scrutiny risk');
        }
        break;

      case RegulatoryFramework.DMA:
        // EU Digital Markets Act - gatekeepers
        if (riskScore.breakdown.transparencyViolations > 0) {
          return {
            compliant: false,
            reason: 'DMA requires perfect transparency',
            warnings
          };
        }
        break;

      case RegulatoryFramework.APP_STORE:
        // Apple App Store Guidelines 3.1.1
        if (riskScore.breakdown.darkPatterns > 20) {
          return {
            compliant: false,
            reason: 'Dark patterns may violate App Store guidelines',
            warnings
          };
        }
        warnings.push('Under App Store review guidelines');
        break;

      case RegulatoryFramework.PLAY_STORE:
        // Google Play Store Policies
        if (riskScore.breakdown.darkPatterns > 25) {
          return {
            compliant: false,
            reason: 'Deceptive behavior prohibited by Play Store',
            warnings
          };
        }
        break;

      case RegulatoryFramework.FTC:
        // US Federal Trade Commission
        if (region === 'US' && riskScore.breakdown.transparencyViolations > 10) {
          warnings.push('FTC requires clear disclosures');
        }
        break;

      case RegulatoryFramework.UK_ONLINE_SAFETY:
        // UK Online Safety Act
        if ((region === 'UK' || region.startsWith('GB')) && 
            riskScore.normalizedScore > 40) {
          return {
            compliant: false,
            reason: 'Risk score exceeds UK Online Safety limits',
            warnings
          };
        }
        break;
    }

    return { compliant: true, warnings };
  }

  /**
   * Get default Safe Mode configuration
   */
  private getDefaultSafeModeConfig(): SafeModeConfig {
    return {
      enabled: false,
      maxRiskScore: 30, // Very conservative
      blockedPatterns: [
        'FORCED_PURCHASE',
        'HIDDEN_COSTS',
        'DIFFICULT_CANCELLATION'
      ],
      allowedRegions: [], // Empty = all regions allowed
      requiresManualApproval: true,
      notificationRecipients: [
        'legal@avalo.app',
        'compliance@avalo.app',
        'cto@avalo.app'
      ]
    };
  }

  /**
   * Notify stakeholders of important events
   */
  private notifyStakeholders(event: string, data: any): void {
    // In production, this would send actual notifications
    console.log(`📧 Notification: ${event}`);
    console.log('Recipients:', this.safeModeConfig.notificationRecipients);
    console.log('Data:', data);
  }

  /**
   * Get current status
   */
  getStatus(): {
    mode: RegulatoryMode;
    safeModeEnabled: boolean;
    activeAdjustments: RegulatoryAdjustment[];
    recentHistory: typeof this.activationHistory;
  } {
    return {
      mode: this.currentMode,
      safeModeEnabled: this.safeModeConfig.enabled,
      activeAdjustments: Array.from(this.activeAdjustments.values()),
      recentHistory: this.activationHistory.slice(-10)
    };
  }

  /**
   * Update Safe Mode configuration
   */
  updateSafeModeConfig(updates: Partial<SafeModeConfig>, userId: string): void {
    console.log(`Safe Mode config updated by ${userId}`);
    Object.assign(this.safeModeConfig, updates);
  }

  /**
   * Quick regulatory response presets
   */
  applyQuickResponse(preset: 'app_store_review' | 'eu_audit' | 'ftc_inquiry'): void {
    switch (preset) {
      case 'app_store_review':
        this.activateSafeMode('manual', 'App Store review in progress');
        this.addRegulatoryAdjustment({
          framework: RegulatoryFramework.APP_STORE,
          active: true,
          strictnessLevel: 'maximum',
          specificRules: ['3.1.1', '5.1.1'],
          reason: 'App Store review'
        });
        break;

      case 'eu_audit':
        this.activateSafeMode('manual', 'EU regulatory audit');
        this.addRegulatoryAdjustment({
          framework: RegulatoryFramework.DSA,
          active: true,
          strictnessLevel: 'maximum',
          specificRules: [],
          reason: 'EU audit'
        });
        this.addRegulatoryAdjustment({
          framework: RegulatoryFramework.GDPR,
          active: true,
          strictnessLevel: 'maximum',
          specificRules: [],
          reason: 'EU audit'
        });
        break;

      case 'ftc_inquiry':
        this.activateSafeMode('manual', 'FTC inquiry received');
        this.addRegulatoryAdjustment({
          framework: RegulatoryFramework.FTC,
          active: true,
          strictnessLevel: 'maximum',
          specificRules: [],
          reason: 'FTC inquiry'
        });
        break;
    }
  }
}

export default RegulatoryReadinessController;
