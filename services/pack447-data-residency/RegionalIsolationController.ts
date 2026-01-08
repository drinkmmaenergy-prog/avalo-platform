/**
 * PACK 447 — Global Data Residency & Sovereignty Control
 * RegionalIsolationController
 * 
 * Manages regional isolation mode:
 * - Full region separation
 * - No cross-region fallback
 * - Activated by compliance decision, legal event, or political risk
 */

import { ComplianceRegion } from './DataResidencyPolicyEngine';
import { SovereigntyAuditLogger } from './SovereigntyAuditLogger';
import { firestore } from '../firebase-admin';

export interface RegionalIsolationConfig {
  region: ComplianceRegion;
  isolationId: string;
  
  status: 'ACTIVE' | 'INACTIVE';
  level: 'FULL' | 'PARTIAL' | 'NONE';
  
  restrictions: {
    blockInboundTransfers: boolean;
    blockOutboundTransfers: boolean;
    blockCrossBorderAccess: boolean;
    blockReplication: boolean;
    blockBackups: boolean;
    allowLocalAccessOnly: boolean;
  };
  
  trigger: {
    type: 'COMPLIANCE' | 'LEGAL' | 'POLITICAL' | 'SECURITY' | 'MANUAL';
    reason: string;
    triggeredBy: string;
    triggeredAt: Date;
    expectedDuration?: string;
    autoRevert?: boolean;
    revertAt?: Date;
  };
  
  impact: {
    affectedUsers: number;
    affectedDataCenters: string[];
    degradedServices: string[];
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IsolationEvent {
  eventId: string;
  region: ComplianceRegion;
  action: 'ACTIVATED' | 'DEACTIVATED' | 'MODIFIED';
  level: 'FULL' | 'PARTIAL' | 'NONE';
  reason: string;
  performedBy: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class RegionalIsolationController {
  private static instance: RegionalIsolationController;
  private auditLogger: SovereigntyAuditLogger;
  
  private activeIsolations: Map<ComplianceRegion, RegionalIsolationConfig> = new Map();
  private checkTimer?: NodeJS.Timeout;

  private constructor() {
    this.auditLogger = SovereigntyAuditLogger.getInstance();
    this.loadActiveIsolations();
    this.startAutoRevertChecks();
  }

  public static getInstance(): RegionalIsolationController {
    if (!RegionalIsolationController.instance) {
      RegionalIsolationController.instance = new RegionalIsolationController();
    }
    return RegionalIsolationController.instance;
  }

  /**
   * Load active isolations from database
   */
  private async loadActiveIsolations(): Promise<void> {
    try {
      const snapshot = await firestore
        .collection('regionalIsolations')
        .where('status', '==', 'ACTIVE')
        .get();

      snapshot.docs.forEach(doc => {
        const config = doc.data() as RegionalIsolationConfig;
        this.activeIsolations.set(config.region, config);
      });

      console.log(`[RegionalIsolationController] Loaded ${this.activeIsolations.size} active isolations`);
    } catch (error) {
      console.error('[RegionalIsolationController] Failed to load isolations:', error);
    }
  }

  /**
   * Activate regional isolation mode
   */
  public async activateIsolation(params: {
    region: ComplianceRegion;
    level: 'FULL' | 'PARTIAL';
    triggerType: 'COMPLIANCE' | 'LEGAL' | 'POLITICAL' | 'SECURITY' | 'MANUAL';
    reason: string;
    triggeredBy: string;
    expectedDuration?: string;
    autoRevert?: boolean;
    revertAt?: Date;
    customRestrictions?: Partial<RegionalIsolationConfig['restrictions']>;
  }): Promise<RegionalIsolationConfig> {
    const isolationId = `isolation_${params.region}_${Date.now()}`;

    // Define restrictions based on level
    let restrictions: RegionalIsolationConfig['restrictions'];
    
    if (params.level === 'FULL') {
      restrictions = {
        blockInboundTransfers: true,
        blockOutboundTransfers: true,
        blockCrossBorderAccess: true,
        blockReplication: true,
        blockBackups: true,
        allowLocalAccessOnly: true
      };
    } else {
      // PARTIAL - more flexible
      restrictions = {
        blockInboundTransfers: true,
        blockOutboundTransfers: false,
        blockCrossBorderAccess: true,
        blockReplication: true,
        blockBackups: false,
        allowLocalAccessOnly: false
      };
    }

    // Apply custom restrictions if provided
    if (params.customRestrictions) {
      restrictions = { ...restrictions, ...params.customRestrictions };
    }

    const config: RegionalIsolationConfig = {
      region: params.region,
      isolationId,
      status: 'ACTIVE',
      level: params.level,
      restrictions,
      trigger: {
        type: params.triggerType,
        reason: params.reason,
        triggeredBy: params.triggeredBy,
        triggeredAt: new Date(),
        expectedDuration: params.expectedDuration,
        autoRevert: params.autoRevert,
        revertAt: params.revertAt
      },
      impact: {
        affectedUsers: 0, // Will be calculated
        affectedDataCenters: [],
        degradedServices: []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Calculate impact
    config.impact = await this.calculateImpact(config);

    // Store in database
    await firestore
      .collection('regionalIsolations')
      .doc(isolationId)
      .set(config);

    // Cache locally
    this.activeIsolations.set(params.region, config);

    // Log event
    await this.auditLogger.logIsolationModeChange({
      region: params.region,
      activated: true,
      reason: params.reason,
      triggeredBy: params.triggeredBy
    });

    // Log isolation event
    await this.logIsolationEvent({
      eventId: `event_${isolationId}`,
      region: params.region,
      action: 'ACTIVATED',
      level: params.level,
      reason: params.reason,
      performedBy: params.triggeredBy,
      timestamp: new Date(),
      metadata: { config }
    });

    // Alert operations team
    await this.alertOperationsTeam(config, 'ACTIVATED');

    console.log(`[RegionalIsolationController] Activated ${params.level} isolation for ${params.region}`);

    return config;
  }

  /**
   * Deactivate regional isolation mode
   */
  public async deactivateIsolation(params: {
    region: ComplianceRegion;
    deactivatedBy: string;
    reason: string;
  }): Promise<void> {
    const config = this.activeIsolations.get(params.region);

    if (!config) {
      throw new Error(`No active isolation found for region ${params.region}`);
    }

    // Update status
    await firestore
      .collection('regionalIsolations')
      .doc(config.isolationId)
      .update({
        status: 'INACTIVE',
        updatedAt: new Date(),
        'trigger.deactivatedBy': params.deactivatedBy,
        'trigger.deactivatedAt': new Date(),
        'trigger.deactivationReason': params.reason
      });

    // Remove from cache
    this.activeIsolations.delete(params.region);

    // Log event
    await this.auditLogger.logIsolationModeChange({
      region: params.region,
      activated: false,
      reason: params.reason,
      triggeredBy: params.deactivatedBy
    });

    // Log isolation event
    await this.logIsolationEvent({
      eventId: `event_${config.isolationId}_deactivate`,
      region: params.region,
      action: 'DEACTIVATED',
      level: config.level,
      reason: params.reason,
      performedBy: params.deactivatedBy,
      timestamp: new Date()
    });

    // Alert operations team
    await this.alertOperationsTeam(config, 'DEACTIVATED');

    console.log(`[RegionalIsolationController] Deactivated isolation for ${params.region}`);
  }

  /**
   * Check if a region is in isolation mode
   */
  public isRegionIsolated(region: ComplianceRegion): boolean {
    return this.activeIsolations.has(region);
  }

  /**
   * Get isolation config for a region
   */
  public getIsolationConfig(region: ComplianceRegion): RegionalIsolationConfig | null {
    return this.activeIsolations.get(region) || null;
  }

  /**
   * Check if an operation is allowed under isolation
   */
  public isOperationAllowed(params: {
    region: ComplianceRegion;
    operation: 'INBOUND_TRANSFER' | 'OUTBOUND_TRANSFER' | 'CROSS_BORDER_ACCESS' | 'REPLICATION' | 'BACKUP' | 'REMOTE_ACCESS';
    sourceRegion?: ComplianceRegion;
    targetRegion?: ComplianceRegion;
  }): { allowed: boolean; reason?: string } {
    const config = this.activeIsolations.get(params.region);

    if (!config) {
      return { allowed: true }; // No isolation active
    }

    const { restrictions } = config;

    switch (params.operation) {
      case 'INBOUND_TRANSFER':
        if (restrictions.blockInboundTransfers) {
          return {
            allowed: false,
            reason: `Inbound transfers to ${params.region} are blocked due to ${config.level} isolation mode`
          };
        }
        break;

      case 'OUTBOUND_TRANSFER':
        if (restrictions.blockOutboundTransfers) {
          return {
            allowed: false,
            reason: `Outbound transfers from ${params.region} are blocked due to ${config.level} isolation mode`
          };
        }
        break;

      case 'CROSS_BORDER_ACCESS':
        if (restrictions.blockCrossBorderAccess) {
          return {
            allowed: false,
            reason: `Cross-border access to ${params.region} is blocked due to ${config.level} isolation mode`
          };
        }
        break;

      case 'REPLICATION':
        if (restrictions.blockReplication) {
          return {
            allowed: false,
            reason: `Data replication from ${params.region} is blocked due to ${config.level} isolation mode`
          };
        }
        break;

      case 'BACKUP':
        if (restrictions.blockBackups) {
          return {
            allowed: false,
            reason: `Cross-region backups from ${params.region} are blocked due to ${config.level} isolation mode`
          };
        }
        break;

      case 'REMOTE_ACCESS':
        if (restrictions.allowLocalAccessOnly) {
          return {
            allowed: false,
            reason: `Only local access to ${params.region} is allowed due to ${config.level} isolation mode`
          };
        }
        break;
    }

    return { allowed: true };
  }

  /**
   * Modify isolation restrictions
   */
  public async modifyIsolation(params: {
    region: ComplianceRegion;
    level?: 'FULL' | 'PARTIAL' | 'NONE';
    restrictions?: Partial<RegionalIsolationConfig['restrictions']>;
    modifiedBy: string;
    reason: string;
  }): Promise<void> {
    const config = this.activeIsolations.get(params.region);

    if (!config) {
      throw new Error(`No active isolation found for region ${params.region}`);
    }

    const updates: any = {
      updatedAt: new Date()
    };

    if (params.level) {
      updates.level = params.level;
    }

    if (params.restrictions) {
      updates.restrictions = { ...config.restrictions, ...params.restrictions };
    }

    await firestore
      .collection('regionalIsolations')
      .doc(config.isolationId)
      .update(updates);

    // Update cache
    Object.assign(config, updates);

    // Log event
    await this.logIsolationEvent({
      eventId: `event_${config.isolationId}_modify`,
      region: params.region,
      action: 'MODIFIED',
      level: params.level || config.level,
      reason: params.reason,
      performedBy: params.modifiedBy,
      timestamp: new Date(),
      metadata: { updates }
    });

    console.log(`[RegionalIsolationController] Modified isolation for ${params.region}`);
  }

  /**
   * Calculate impact of isolation
   */
  private async calculateImpact(config: RegionalIsolationConfig): Promise<RegionalIsolationConfig['impact']> {
    // Count affected users (users with data in this region)
    const usersSnapshot = await firestore
      .collection('dataResidencyDecisions')
      .where('storage.primaryRegion', '==', config.region)
      .count()
      .get();

    const affectedUsers = usersSnapshot.data().count;

    // Data centers in this region
    const datacentersSnapshot = await firestore
      .collection('storageBackends')
      .where('region', '==', config.region)
      .get();

    const affectedDataCenters = datacentersSnapshot.docs.map(doc => 
      doc.data().dataCenter
    );

    // Determine degraded services based on restrictions
    const degradedServices: string[] = [];
    if (config.restrictions.blockInboundTransfers) {
      degradedServices.push('Inbound Data Transfers');
    }
    if (config.restrictions.blockOutboundTransfers) {
      degradedServices.push('Outbound Data Transfers');
    }
    if (config.restrictions.blockCrossBorderAccess) {
      degradedServices.push('Cross-Border Data Access');
    }
    if (config.restrictions.blockReplication) {
      degradedServices.push('Data Replication');
    }
    if (config.restrictions.blockBackups) {
      degradedServices.push('Cross-Region Backups');
    }

    return {
      affectedUsers,
      affectedDataCenters,
      degradedServices
    };
  }

  /**
   * Start automatic revert checks
   */
  private startAutoRevertChecks(): void {
    this.checkTimer = setInterval(() => {
      this.checkAutoReverts();
    }, 60000); // Check every minute

    // Initial check
    this.checkAutoReverts();
  }

  /**
   * Check and execute auto-reverts
   */
  private async checkAutoReverts(): Promise<void> {
    const now = new Date();

    for (const [region, config] of this.activeIsolations.entries()) {
      if (config.trigger.autoRevert && config.trigger.revertAt) {
        if (now >= config.trigger.revertAt) {
          console.log(`[RegionalIsolation Controller] Auto-reverting isolation for ${region}`);
          
          await this.deactivateIsolation({
            region,
            deactivatedBy: 'SYSTEM_AUTO_REVERT',
            reason: 'Automatic revert triggered at scheduled time'
          });
        }
      }
    }
  }

  /**
   * Log isolation event
   */
  private async logIsolationEvent(event: IsolationEvent): Promise<void> {
    await firestore
      .collection('isolationEvents')
      .doc(event.eventId)
      .set(event);
  }

  /**
   * Alert operations team
   */
  private async alertOperationsTeam(
    config: RegionalIsolationConfig,
    action: 'ACTIVATED' | 'DEACTIVATED'
  ): Promise<void> {
    await firestore
      .collection('operationalAlerts')
      .add({
        type: 'REGIONAL_ISOLATION',
        severity: 'CRITICAL',
        region: config.region,
        action,
        config,
        timestamp: new Date(),
        status: 'OPEN'
      });

    // In production, would also send:
    // - Email to ops team
    // - Slack/Teams notification
    // - PagerDuty alert
    console.warn(
      `[RegionalIsolationController] ALERT: Regional isolation ${action} for ${config.region}. ` +
      `Level: ${config.level}, Reason: ${config.trigger.reason}`
    );
  }

  /**
   * Get all active isolations
   */
  public getActiveIsolations(): RegionalIsolationConfig[] {
    return Array.from(this.activeIsolations.values());
  }

  /**
   * Get isolation history for a region
   */
  public async getIsolationHistory(
    region: ComplianceRegion,
    limit: number = 50
  ): Promise<IsolationEvent[]> {
    const snapshot = await firestore
      .collection('isolationEvents')
      .where('region', '==', region)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as IsolationEvent);
  }

  /**
   * Generate isolation status report
   */
  public async generateStatusReport(): Promise<{
    activeIsolations: number;
    byRegion: Record<string, RegionalIsolationConfig>;
    totalAffectedUsers: number;
    degradedRegions: string[];
  }> {
    const report = {
      activeIsolations: this.activeIsolations.size,
      byRegion: {} as Record<string, RegionalIsolationConfig>,
      totalAffectedUsers: 0,
      degradedRegions: [] as string[]
    };

    for (const [region, config] of this.activeIsolations.entries()) {
      report.byRegion[region] = config;
      report.totalAffectedUsers += config.impact.affectedUsers;
      report.degradedRegions.push(region);
    }

    return report;
  }

  /**
   * Cleanup on shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
  }
}
