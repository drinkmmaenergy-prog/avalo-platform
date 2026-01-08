/**
 * PACK 449 - Emergency Access Controller
 * 
 * Manages emergency access and lockdown modes:
 * - Immediate Revocation of Privileges
 * - Account Freeze
 * - Restricted Access by Region
 * - Integration with PACK 448 Playbooks
 * 
 * Dependencies:
 * - PACK 365: Launch & Kill-Switch Framework
 * - PACK 448: Incident Response, Crisis Management & Regulatory Playbooks
 * - PACK 449: Zero-Trust Access Manager
 */

export interface EmergencyMode {
  id: string;
  type: EmergencyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  activatedBy: string;
  activatedAt: Date;
  deactivatedAt?: Date;
  deactivatedBy?: string;
  status: 'active' | 'deactivated';
  affectedUsers: string[];
  restrictions: EmergencyRestriction[];
  playbook?: string; // PACK 448 playbook ID
}

export type EmergencyType =
  | 'security_breach'
  | 'insider_threat'
  | 'data_leak'
  | 'regulatory_violation'
  | 'system_compromise'
  | 'compliance_incident'
  | 'suspicious_activity'
  | 'unauthorized_access';

export interface EmergencyRestriction {
  type: RestrictionType;
  scope: 'all' | 'department' | 'role' | 'user';
  target?: string; // Department, role, or user ID
  description: string;
}

export type RestrictionType =
  | 'revoke_all_access'
  | 'freeze_accounts'
  | 'block_region'
  | 'block_ip_range'
  | 'require_2fa'
  | 'require_approval'
  | 'read_only_mode'
  | 'block_downloads'
  | 'block_uploads'
  | 'block_modifications';

export interface LockdownConfig {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
  restrictions: EmergencyRestriction[];
  allowedRoles: string[];
  allowedRegions?: string[];
  requiresExecutiveApproval: boolean;
}

// Lockdown levels (escalating severity)
const LOCKDOWN_LEVELS: Record<number, LockdownConfig> = {
  1: {
    level: 1,
    description: 'Monitor - Enhanced logging, no restrictions',
    restrictions: [],
    allowedRoles: ['*'],
    requiresExecutiveApproval: false
  },
  2: {
    level: 2,
    description: 'Caution - Require 2FA, enhanced monitoring',
    restrictions: [
      {
        type: 'require_2fa',
        scope: 'all',
        description: 'Require 2FA for all access'
      }
    ],
    allowedRoles: ['*'],
    requiresExecutiveApproval: false
  },
  3: {
    level: 3,
    description: 'Restricted - Read-only mode for non-critical roles',
    restrictions: [
      {
        type: 'require_2fa',
        scope: 'all',
        description: 'Require 2FA for all access'
      },
      {
        type: 'read_only_mode',
        scope: 'all',
        description: 'Read-only mode except security and executive'
      },
      {
        type: 'require_approval',
        scope: 'all',
        description: 'All privileged actions require approval'
      }
    ],
    allowedRoles: ['security_analyst', 'executive_cto', 'executive_ceo'],
    requiresExecutiveApproval: true
  },
  4: {
    level: 4,
    description: 'Lockdown - Only security team has access',
    restrictions: [
      {
        type: 'revoke_all_access',
        scope: 'all',
        description: 'Revoke all non-security access'
      },
      {
        type: 'require_2fa',
        scope: 'all',
        description: 'Require 2FA for all access'
      },
      {
        type: 'block_downloads',
        scope: 'all',
        description: 'Block all data downloads'
      }
    ],
    allowedRoles: ['security_analyst', 'executive_cto', 'executive_ceo'],
    requiresExecutiveApproval: true
  },
  5: {
    level: 5,
    description: 'Full Lockdown - System frozen, executive access only',
    restrictions: [
      {
        type: 'revoke_all_access',
        scope: 'all',
        description: 'Revoke all access'
      },
      {
        type: 'freeze_accounts',
        scope: 'all',
        description: 'Freeze all accounts'
      }
    ],
    allowedRoles: ['executive_cto', 'executive_ceo'],
    requiresExecutiveApproval: true
  }
};

export interface AccountFreeze {
  userId: string;
  reason: string;
  frozenBy: string;
  frozenAt: Date;
  unfrozenAt?: Date;
  unfrozenBy?: string;
  status: 'frozen' | 'unfrozen';
}

export interface RegionBlock {
  id: string;
  region: string;
  ipRanges: string[];
  reason: string;
  blockedBy: string;
  blockedAt: Date;
  unblockedAt?: Date;
  status: 'active' | 'inactive';
}

export class EmergencyAccessController {
  private currentLockdownLevel: number = 1;
  private activeEmergencies: Map<string, EmergencyMode> = new Map();
  private frozenAccounts: Map<string, AccountFreeze> = new Map();
  private blockedRegions: Map<string, RegionBlock> = new Map();
  
  /**
   * Activate emergency mode
   */
  async activateEmergency(
    type: EmergencyType,
    description: string,
    activatedBy: string,
    restrictions: EmergencyRestriction[],
    playbookId?: string
  ): Promise<EmergencyMode> {
    const emergency: EmergencyMode = {
      id: `emergency_${Date.now()}`,
      type,
      severity: this.getSeverityForType(type),
      description,
      activatedBy,
      activatedAt: new Date(),
      status: 'active',
      affectedUsers: [],
      restrictions,
      playbook: playbookId
    };
    
    this.activeEmergencies.set(emergency.id, emergency);
    
    // Apply restrictions
    await this.applyRestrictions(restrictions);
    
    // Log activation (PACK 296)
    await this.auditLog('emergency_activated', {
      emergencyId: emergency.id,
      type,
      severity: emergency.severity,
      activatedBy,
      restrictions: restrictions.length
    });
    
    // Trigger incident response playbook (PACK 448)
    if (playbookId) {
      await this.triggerPlaybook(playbookId, emergency);
    }
    
    // Alert (PACK 364)
    await this.sendAlert({
      level: 'critical',
      message: `Emergency mode activated: ${type}`,
      emergency
    });
    
    return emergency;
  }
  
  /**
   * Deactivate emergency mode
   */
  async deactivateEmergency(
    emergencyId: string,
    deactivatedBy: string
  ): Promise<void> {
    const emergency = this.activeEmergencies.get(emergencyId);
    
    if (!emergency) {
      throw new Error('Emergency not found');
    }
    
    if (emergency.status !== 'active') {
      throw new Error('Emergency is not active');
    }
    
    emergency.status = 'deactivated';
    emergency.deactivatedAt = new Date();
    emergency.deactivatedBy = deactivatedBy;
    
    // Revert restrictions
    await this.revertRestrictions(emergency.restrictions);
    
    this.activeEmergencies.delete(emergencyId);
    
    // Log deactivation
    await this.auditLog('emergency_deactivated', {
      emergencyId,
      type: emergency.type,
      deactivatedBy,
      duration: emergency.deactivatedAt.getTime() - emergency.activatedAt.getTime()
    });
  }
  
  /**
   * Set lockdown level
   */
  async setLockdownLevel(
    level: 1 | 2 | 3 | 4 | 5,
    activatedBy: string,
    reason: string
  ): Promise<void> {
    const config = LOCKDOWN_LEVELS[level];
    
    if (!config) {
      throw new Error('Invalid lockdown level');
    }
    
    // Check if executive approval required
    if (config.requiresExecutiveApproval) {
      const isExecutive = await this.isExecutive(activatedBy);
      if (!isExecutive) {
        throw new Error('Executive approval required for this lockdown level');
      }
    }
    
    this.currentLockdownLevel = level;
    
    // Apply lockdown restrictions
    await this.applyRestrictions(config.restrictions);
    
    // Log lockdown
    await this.auditLog('lockdown_activated', {
      level,
      description: config.description,
      activatedBy,
      reason,
      restrictions: config.restrictions.length
    });
    
    // Alert
    await this.sendAlert({
      level: level >= 4 ? 'critical' : 'high',
      message: `Lockdown Level ${level} activated: ${config.description}`,
      reason
    });
  }
  
  /**
   * Freeze user account
   */
  async freezeAccount(
    userId: string,
    reason: string,
    frozenBy: string
  ): Promise<AccountFreeze> {
    const freeze: AccountFreeze = {
      userId,
      reason,
      frozenBy,
      frozenAt: new Date(),
      status: 'frozen'
    };
    
    this.frozenAccounts.set(userId, freeze);
    
    // Revoke all active access grants
    await this.revokeAllUserAccess(userId, frozenBy, reason);
    
    // Log freeze
    await this.auditLog('account_frozen', {
      userId,
      reason,
      frozenBy
    });
    
    return freeze;
  }
  
  /**
   * Unfreeze user account
   */
  async unfreezeAccount(
    userId: string,
    unfrozenBy: string
  ): Promise<void> {
    const freeze = this.frozenAccounts.get(userId);
    
    if (!freeze) {
      throw new Error('Account is not frozen');
    }
    
    freeze.status = 'unfrozen';
    freeze.unfrozenAt = new Date();
    freeze.unfrozenBy = unfrozenBy;
    
    this.frozenAccounts.delete(userId);
    
    // Log unfreeze
    await this.auditLog('account_unfrozen', {
      userId,
      unfrozenBy,
      frozenDuration: freeze.unfrozenAt.getTime() - freeze.frozenAt.getTime()
    });
  }
  
  /**
   * Block access from region
   */
  async blockRegion(
    region: string,
    ipRanges: string[],
    reason: string,
    blockedBy: string
  ): Promise<RegionBlock> {
    const block: RegionBlock = {
      id: `region_block_${Date.now()}`,
      region,
      ipRanges,
      reason,
      blockedBy,
      blockedAt: new Date(),
      status: 'active'
    };
    
    this.blockedRegions.set(region, block);
    
    // Log block
    await this.auditLog('region_blocked', {
      region,
      ipRanges,
      reason,
      blockedBy
    });
    
    return block;
  }
  
  /**
   * Unblock region
   */
  async unblockRegion(region: string): Promise<void> {
    const block = this.blockedRegions.get(region);
    
    if (!block) {
      throw new Error('Region is not blocked');
    }
    
    block.status = 'inactive';
    block.unblockedAt = new Date();
    
    this.blockedRegions.delete(region);
    
    // Log unblock
    await this.auditLog('region_unblocked', {
      region,
      blockedDuration: block.unblockedAt.getTime() - block.blockedAt.getTime()
    });
  }
  
  /**
   * Revoke all access for user
   */
  async revokeAllUserAccess(
    userId: string,
    revokedBy: string,
    reason: string
  ): Promise<number> {
    // Would integrate with ZeroTrustAccessManager
    const revokedCount = 0; // Mock
    
    await this.auditLog('all_access_revoked', {
      userId,
      revokedBy,
      reason,
      grantsRevoked: revokedCount
    });
    
    return revokedCount;
  }
  
  /**
   * Check if access is allowed in current emergency state
   */
  async isAccessAllowed(
    userId: string,
    userRole: string,
    action: string
  ): Promise<{allowed: boolean; reason?: string}> {
    // Check if account is frozen
    if (this.frozenAccounts.has(userId)) {
      return {
        allowed: false,
        reason: 'Account is frozen'
      };
    }
    
    // Check lockdown level
    const lockdown = LOCKDOWN_LEVELS[this.currentLockdownLevel];
    
    if (!lockdown.allowedRoles.includes('*') && !lockdown.allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        reason: `Lockdown level ${this.currentLockdownLevel}: Only ${lockdown.allowedRoles.join(', ')} allowed`
      };
    }
    
    // Check active emergencies
    for (const emergency of this.activeEmergencies.values()) {
      if (emergency.affectedUsers.includes(userId)) {
        return {
          allowed: false,
          reason: `Affected by emergency: ${emergency.type}`
        };
      }
    }
    
    return { allowed: true };
  }
  
  /**
   * Get current emergency status
   */
  getEmergencyStatus(): {
    lockdownLevel: number;
    activeEmergencies: number;
    frozenAccounts: number;
    blockedRegions: number;
  } {
    return {
      lockdownLevel: this.currentLockdownLevel,
      activeEmergencies: this.activeEmergencies.size,
      frozenAccounts: this.frozenAccounts.size,
      blockedRegions: this.blockedRegions.size
    };
  }
  
  /**
   * Get severity for emergency type
   */
  private getSeverityForType(type: EmergencyType): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<EmergencyType, 'low' | 'medium' | 'high' | 'critical'> = {
      security_breach: 'critical',
      insider_threat: 'critical',
      data_leak: 'critical',
      regulatory_violation: 'high',
      system_compromise: 'critical',
      compliance_incident: 'high',
      suspicious_activity: 'medium',
      unauthorized_access: 'high'
    };
    
    return severityMap[type] || 'medium';
  }
  
  /**
   * Apply restrictions
   */
  private async applyRestrictions(restrictions: EmergencyRestriction[]): Promise<void> {
    for (const restriction of restrictions) {
      console.log('Applying restriction:', restriction);
      // Would integrate with access control systems
    }
  }
  
  /**
   * Revert restrictions
   */
  private async revertRestrictions(restrictions: EmergencyRestriction[]): Promise<void> {
    for (const restriction of restrictions) {
      console.log('Reverting restriction:', restriction);
      // Would integrate with access control systems
    }
  }
  
  /**
   * Check if user is executive
   */
  private async isExecutive(userId: string): Promise<boolean> {
    // Would check user role
    return false;
  }
  
  /**
   * Trigger incident response playbook (PACK 448)
   */
  private async triggerPlaybook(playbookId: string, emergency: EmergencyMode): Promise<void> {
    console.log('Triggering playbook:', playbookId, emergency);
    // Would integrate with PACK 448
  }
  
  /**
   * Send alert (PACK 364)
   */
  private async sendAlert(alert: any): Promise<void> {
    console.log('Alert:', alert);
    // Would integrate with PACK 364 observability
  }
  
  /**
   * Audit log (PACK 296)
   */
  private async auditLog(event: string, data: any): Promise<void> {
    console.log('Audit Log:', event, data);
    // Would write to Firestore audit_logs collection
  }
}

export const emergencyAccessController = new EmergencyAccessController();
