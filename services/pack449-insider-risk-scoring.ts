/**
 * PACK 449 - Insider Risk Scoring Service
 * 
 * Calculates and tracks insider risk scores for internal users based on:
 * - Permission Scope
 * - Access Frequency
 * - Unusual Activities
 * - Access Drift (role vs actual usage)
 * - Alerts on Deviations
 * 
 * Dependencies:
 * - PACK 364: Observability
 * - PACK 448: Incident Response
 */

export interface InsiderRiskProfile {
  userId: string;
  role: string;
  department: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  alerts: RiskAlert[];
  baseline: ActivityBaseline;
  recentActivity: ActivitySummary;
  lastUpdated: Date;
}

export interface RiskFactor {
  type: RiskFactorType;
  score: number; // 0-100
  weight: number; // 0-1
  description: string;
  evidence: any;
}

export type RiskFactorType =
  | 'permission_scope'
  | 'access_frequency'
  | 'unusual_hours'
  | 'unusual_location'
  | 'access_drift'
  | 'failed_attempts'
  | 'data_exfiltration'
  | 'privilege_escalation'
  | 'policy_violations'
  | 'unauthorized_access'
  | 'suspicious_queries'
  | 'mass_downloads';

export interface RiskAlert {
  id: string;
  userId: string;
  type: RiskFactorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  actionTaken?: string;
}

export interface ActivityBaseline {
  avgAccessesPerDay: number;
  avgAccessesPerHour: number;
  typicalHours: number[]; // Hours of day (0-23)
  typicalDays: number[]; // Days of week (0-6)
  typicalLocations: string[]; // IP ranges or regions
  typicalDevices: string[];
  commonActions: string[];
  permissionUsage: Record<string, number>;
}

export interface ActivitySummary {
  totalAccesses: number;
  uniqueResourcesAccessed: number;
  failedAttempts: number;
  outOfHoursAccess: number;
  newLocations: number;
  newDevices: number;
  sensitiveDataAccess: number;
  massOperations: number;
}

export interface AnomalyDetection {
  detected: boolean;
  anomalies: Anomaly[];
  recommendedAction: 'monitor' | 'alert' | 'restrict' | 'revoke';
}

export interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  deviation: number; // Standard deviations from baseline
  timestamp: Date;
}

export class InsiderRiskScoringService {
  
  /**
   * Calculate risk score for user
   */
  async calculateRiskScore(userId: string): Promise<InsiderRiskProfile> {
    // Get user role and activity
    const userRole = await this.getUserRole(userId);
    const department = await this.getUserDepartment(userId);
    const baseline = await this.getActivityBaseline(userId);
    const recentActivity = await this.getRecentActivity(userId);
    
    // Calculate individual risk factors
    const factors: RiskFactor[] = [
      await this.calculatePermissionScopeRisk(userId, userRole),
      await this.calculateAccessFrequencyRisk(userId, baseline, recentActivity),
      await this.calculateUnusualHoursRisk(userId, baseline, recentActivity),
      await this.calculateUnusualLocationRisk(userId, baseline, recentActivity),
      await this.calculateAccessDriftRisk(userId, userRole, recentActivity),
      await this.calculateFailedAttemptsRisk(userId, recentActivity),
      await this.calculateDataExfiltrationRisk(userId, recentActivity),
      await this.calculatePrivilegeEscalationRisk(userId, userRole)
    ];
    
    // Calculate weighted risk score
    const riskScore = this.calculateWeightedScore(factors);
    const riskLevel = this.getRiskLevel(riskScore);
    
    // Generate alerts
    const alerts = this.generateAlerts(userId, factors);
    
    return {
      userId,
      role: userRole,
      department,
      riskScore,
      riskLevel,
      factors,
      alerts,
      baseline,
      recentActivity,
      lastUpdated: new Date()
    };
  }
  
  /**
   * Calculate permission scope risk
   * Higher risk if user has more permissions than needed
   */
  private async calculatePermissionScopeRisk(
    userId: string,
    role: string
  ): Promise<RiskFactor> {
    // Get granted permissions
    const grantedPermissions = await this.getGrantedPermissions(userId);
    const usedPermissions = await this.getUsedPermissions(userId);
    
    // Calculate unused permission ratio
    const unusedCount = grantedPermissions.length - usedPermissions.length;
    const unusedRatio = unusedCount / grantedPermissions.length;
    
    // Higher score if many unused permissions
    const score = Math.min(100, unusedRatio * 100);
    
    return {
      type: 'permission_scope',
      score,
      weight: 0.15,
      description: `${unusedCount} unused permissions out of ${grantedPermissions.length}`,
      evidence: {
        granted: grantedPermissions,
        used: usedPermissions,
        unused: grantedPermissions.filter(p => !usedPermissions.includes(p))
      }
    };
  }
  
  /**
   * Calculate access frequency risk
   * Anomalous increase in access frequency
   */
  private async calculateAccessFrequencyRisk(
    userId: string,
    baseline: ActivityBaseline,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    const expectedAccesses = baseline.avgAccessesPerDay * 7; // Weekly
    const actualAccesses = recent.totalAccesses;
    
    const deviation = (actualAccesses - expectedAccesses) / expectedAccesses;
    
    // Score increases with positive deviation
    const score = deviation > 0 ? Math.min(100, deviation * 100) : 0;
    
    return {
      type: 'access_frequency',
      score,
      weight: 0.10,
      description: `Access frequency ${Math.round(deviation * 100)}% above baseline`,
      evidence: {
        baseline: expectedAccesses,
        actual: actualAccesses,
        deviation
      }
    };
  }
  
  /**
   * Calculate unusual hours risk
   * Access during non-typical hours
   */
  private async calculateUnusualHoursRisk(
    userId: string,
    baseline: ActivityBaseline,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    const outOfHoursRatio = recent.outOfHoursAccess / recent.totalAccesses;
    const score = Math.min(100, outOfHoursRatio * 100);
    
    return {
      type: 'unusual_hours',
      score,
      weight: 0.15,
      description: `${Math.round(outOfHoursRatio * 100)}% of access outside typical hours`,
      evidence: {
        outOfHoursCount: recent.outOfHoursAccess,
        totalCount: recent.totalAccesses,
        typicalHours: baseline.typicalHours
      }
    };
  }
  
  /**
   * Calculate unusual location risk
   * Access from new or unexpected locations
   */
  private async calculateUnusualLocationRisk(
    userId: string,
    baseline: ActivityBaseline,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    const newLocationRatio = recent.newLocations / (baseline.typicalLocations.length || 1);
    const score = Math.min(100, newLocationRatio * 50); // Max 50 for new locations
    
    return {
      type: 'unusual_location',
      score,
      weight: 0.20,
      description: `${recent.newLocations} new locations detected`,
      evidence: {
        newLocations: recent.newLocations,
        typicalLocations: baseline.typicalLocations
      }
    };
  }
  
  /**
   * Calculate access drift risk
   * User accessing resources outside their role scope
   */
  private async calculateAccessDriftRisk(
    userId: string,
    role: string,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    // Get role-expected resources vs actually accessed
    const expectedResources = await this.getExpectedResources(role);
    const accessedResources = await this.getAccessedResources(userId);
    
    const unexpectedAccess = accessedResources.filter(
      r => !expectedResources.includes(r)
    );
    
    const driftRatio = unexpectedAccess.length / accessedResources.length;
    const score = Math.min(100, driftRatio * 100);
    
    return {
      type: 'access_drift',
      score,
      weight: 0.20,
      description: `${unexpectedAccess.length} unexpected resource accesses`,
      evidence: {
        expected: expectedResources,
        unexpected: unexpectedAccess,
        driftRatio
      }
    };
  }
  
  /**
   * Calculate failed attempts risk
   * Multiple failed access attempts indicate probing
   */
  private async calculateFailedAttemptsRisk(
    userId: string,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    const failureRate = recent.failedAttempts / recent.totalAccesses;
    const score = Math.min(100, failureRate * 200); // Amplified
    
    return {
      type: 'failed_attempts',
      score,
      weight: 0.10,
      description: `${recent.failedAttempts} failed attempts (${Math.round(failureRate * 100)}% failure rate)`,
      evidence: {
        failedAttempts: recent.failedAttempts,
        totalAttempts: recent.totalAccesses,
        failureRate
      }
    };
  }
  
  /**
   * Calculate data exfiltration risk
   * Mass downloads or unusual data access patterns
   */
  private async calculateDataExfiltrationRisk(
    userId: string,
    recent: ActivitySummary
  ): Promise<RiskFactor> {
    const massOpRatio = recent.massOperations / recent.totalAccesses;
    const sensitiveRatio = recent.sensitiveDataAccess / recent.totalAccesses;
    
    const score = Math.min(100, (massOpRatio * 50 + sensitiveRatio * 50));
    
    return {
      type: 'data_exfiltration',
      score,
      weight: 0.15,
      description: `${recent.massOperations} mass operations, ${recent.sensitiveDataAccess} sensitive data accesses`,
      evidence: {
        massOperations: recent.massOperations,
        sensitiveDataAccess: recent.sensitiveDataAccess
      }
    };
  }
  
  /**
   * Calculate privilege escalation risk
   * Attempts to access higher-privilege resources
   */
  private async calculatePrivilegeEscalationRisk(
    userId: string,
    role: string
  ): Promise<RiskFactor> {
    const escalationAttempts = await this.getEscalationAttempts(userId);
    const score = Math.min(100, escalationAttempts * 20);
    
    return {
      type: 'privilege_escalation',
      score,
      weight: 0.15,
      description: `${escalationAttempts} privilege escalation attempts`,
      evidence: {
        attempts: escalationAttempts,
        role
      }
    };
  }
  
  /**
   * Calculate weighted risk score
   */
  private calculateWeightedScore(factors: RiskFactor[]): number {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const factor of factors) {
      totalScore += factor.score * factor.weight;
      totalWeight += factor.weight;
    }
    
    return Math.round(totalScore / totalWeight);
  }
  
  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }
  
  /**
   * Generate alerts based on risk factors
   */
  private generateAlerts(userId: string, factors: RiskFactor[]): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    
    for (const factor of factors) {
      if (factor.score >= 75) {
        alerts.push({
          id: `alert_${Date.now()}_${userId}_${factor.type}`,
          userId,
          type: factor.type,
          severity: 'critical',
          message: `CRITICAL: ${factor.description}`,
          timestamp: new Date(),
          acknowledged: false
        });
      } else if (factor.score >= 50) {
        alerts.push({
          id: `alert_${Date.now()}_${userId}_${factor.type}`,
          userId,
          type: factor.type,
          severity: 'high',
          message: `HIGH: ${factor.description}`,
          timestamp: new Date(),
          acknowledged: false
        });
      }
    }
    
    return alerts;
  }
  
  /**
   * Detect anomalies
   */
  async detectAnomalies(userId: string): Promise<AnomalyDetection> {
    const profile = await this.calculateRiskScore(userId);
    const anomalies: Anomaly[] = [];
    
    // Check each high-risk factor
    for (const factor of profile.factors) {
      if (factor.score >= 50) {
        anomalies.push({
          type: factor.type,
          severity: factor.score >= 75 ? 'critical' : 'high',
          description: factor.description,
          deviation: factor.score / 10, // Convert to std devs
          timestamp: new Date()
        });
      }
    }
    
    // Determine recommended action
    let recommendedAction: 'monitor' | 'alert' | 'restrict' | 'revoke' = 'monitor';
    
    if (profile.riskScore >= 75) {
      recommendedAction = 'revoke';
    } else if (profile.riskScore >= 50) {
      recommendedAction = 'restrict';
    } else if (profile.riskScore >= 25) {
      recommendedAction = 'alert';
    }
    
    return {
      detected: anomalies.length > 0,
      anomalies,
      recommendedAction
    };
  }
  
  // Helper methods (would integrate with real data sources)
  
  private async getUserRole(userId: string): Promise<string> {
    // Mock implementation
    return 'engineer_backend';
  }
  
  private async getUserDepartment(userId: string): Promise<string> {
    return 'engineering';
  }
  
  private async getActivityBaseline(userId: string): Promise<ActivityBaseline> {
    return {
      avgAccessesPerDay: 50,
      avgAccessesPerHour: 5,
      typicalHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
      typicalDays: [1, 2, 3, 4, 5],
      typicalLocations: ['192.168.1.0/24'],
      typicalDevices: ['device_123'],
      commonActions: ['code.read', 'logs.read'],
      permissionUsage: {
        'code.read': 30,
        'code.write': 20,
        'logs.read': 10
      }
    };
  }
  
  private async getRecentActivity(userId: string): Promise<ActivitySummary> {
    return {
      totalAccesses: 350,
      uniqueResourcesAccessed: 50,
      failedAttempts: 5,
      outOfHoursAccess: 10,
      newLocations: 1,
      newDevices: 0,
      sensitiveDataAccess: 2,
      massOperations: 0
    };
  }
  
  private async getGrantedPermissions(userId: string): Promise<string[]> {
    return ['code.read', 'code.write', 'logs.read', 'metrics.read'];
  }
  
  private async getUsedPermissions(userId: string): Promise<string[]> {
    return ['code.read', 'code.write', 'logs.read'];
  }
  
  private async getExpectedResources(role: string): Promise<string[]> {
    return ['/api/code', '/api/logs', '/api/metrics'];
  }
  
  private async getAccessedResources(userId: string): Promise<string[]> {
    return ['/api/code', '/api/logs', '/api/metrics'];
  }
  
  private async getEscalationAttempts(userId: string): Promise<number> {
    return 0;
  }
}

export const insiderRiskScoringService = new InsiderRiskScoringService();
