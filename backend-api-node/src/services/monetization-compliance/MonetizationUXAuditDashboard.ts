/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * MonetizationUXAuditDashboard - Audit and monitoring dashboard
 * 
 * Provides visibility for:
 * - Legal team
 * - Compliance team
 * - Product leadership
 * - Change history + risk tracking
 */

import { FlowAnalysis } from './DarkPatternDetectionService';
import { RiskScore } from './UXRiskScoringEngine';
import { RegulatoryMode } from './RegulatoryReadinessController';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  flowId: string;
  action: 'created' | 'updated' | 'activated' | 'deactivated' | 'blocked' | 'approved';
  userId: string;
  userRole: 'product' | 'legal' | 'compliance' | 'executive' | 'system';
  before?: any;
  after?: any;
  riskScore?: RiskScore;
  analysis?: FlowAnalysis;
  approvalRequired: boolean;
  approvedBy?: string;
  approvalTimestamp?: Date;
  notes?: string;
}

export interface DashboardMetrics {
  period: { start: Date; end: Date };
  totalFlows: number;
  activeFlows: number;
  blockedFlows: number;
  pendingApproval: number;
  averageRiskScore: number;
  riskDistribution: {
    none: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  darkPatternsByType: Record<string, number>;
  transparencyViolationsByType: Record<string, number>;
  regionalBreakdown: Record<string, {
    flows: number;
    blocked: number;
    averageRisk: number;
  }>;
  regulatoryIncidents: number;
  safeModeActivations: number;
}

export interface ComplianceAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: 'dark_pattern' | 'transparency' | 'regulatory' | 'threshold' | 'system';
  flowId?: string;
  region?: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolution?: string;
}

export interface DashboardFilters {
  dateRange?: { start: Date; end: Date };
  regions?: string[];
  riskLevels?: string[];
  flowTypes?: string[];
  userRoles?: string[];
  actions?: string[];
  showBlocked?: boolean;
  showPending?: boolean;
}

class MonetizationUXAuditDashboard {
  private auditLog: AuditEntry[] = [];
  private alerts: ComplianceAlert[] = [];
  private metrics: DashboardMetrics | null = null;

  constructor() {
    // In production, these would be loaded from database
  }

  /**
   * Log an audit entry
   */
  logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const auditEntry: AuditEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date()
    };

    this.auditLog.push(auditEntry);

    // Check if this should trigger an alert
    this.checkForAlert(auditEntry);

    console.log(`📝 Audit logged: ${entry.action} on flow ${entry.flowId} by ${entry.userId}`);
  }

  /**
   * Create a compliance alert
   */
  createAlert(alert: Omit<ComplianceAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const complianceAlert: ComplianceAlert = {
      ...alert,
      id: this.generateId(),
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.push(complianceAlert);

    console.log(`🚨 Alert created: [${alert.severity.toUpperCase()}] ${alert.message}`);

    // Notify if critical
    if (alert.severity === 'critical') {
      this.notifyCriticalAlert(complianceAlert);
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId: string, resolution?: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    alert.resolution = resolution;

    console.log(`✅ Alert ${alertId} acknowledged by ${userId}`);
  }

  /**
   * Get audit log with filters
   */
  getAuditLog(filters?: DashboardFilters): AuditEntry[] {
    let filtered = [...this.auditLog];

    if (!filters) return filtered;

    if (filters.dateRange) {
      filtered = filtered.filter(e => 
        e.timestamp >= filters.dateRange!.start &&
        e.timestamp <= filters.dateRange!.end
      );
    }

    if (filters.regions && filters.regions.length > 0) {
      filtered = filtered.filter(e => {
        const region = e.riskScore?.breakdownregion || e.analysis?.flowType;
        return filters.regions!.some(r => region?.includes(r));
      });
    }

    if (filters.userRoles && filters.userRoles.length > 0) {
      filtered = filtered.filter(e => 
        filters.userRoles!.includes(e.userRole)
      );
    }

    if (filters.actions && filters.actions.length > 0) {
      filtered = filtered.filter(e => 
        filters.actions!.includes(e.action)
      );
    }

    if (filters.showBlocked !== undefined) {
      filtered = filtered.filter(e => 
        (e.action === 'blocked') === filters.showBlocked
      );
    }

    if (filters.showPending !== undefined) {
      filtered = filtered.filter(e => 
        (e.approvalRequired && !e.approvedBy) === filters.showPending
      );
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get active alerts
   */
  getAlerts(filters?: { 
    severity?: string[];
    acknowledged?: boolean;
    type?: string[];
  }): ComplianceAlert[] {
    let filtered = [...this.alerts];

    if (!filters) return filtered;

    if (filters.severity && filters.severity.length > 0) {
      filtered = filtered.filter(a => 
        filters.severity!.includes(a.severity)
      );
    }

    if (filters.acknowledged !== undefined) {
      filtered = filtered.filter(a => 
        a.acknowledged === filters.acknowledged
      );
    }

    if (filters.type && filters.type.length > 0) {
      filtered = filtered.filter(a => 
        filters.type!.includes(a.type)
      );
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Calculate and cache dashboard metrics
   */
  async calculateMetrics(period: { start: Date; end: Date }): Promise<DashboardMetrics> {
    const relevantEntries = this.auditLog.filter(e => 
      e.timestamp >= period.start && e.timestamp <= period.end
    );

    const uniqueFlows = new Set(relevantEntries.map(e => e.flowId));
    const totalFlows = uniqueFlows.size;

    const activeFlows = relevantEntries.filter(e => 
      e.action === 'activated'
    ).length;

    const blockedFlows = relevantEntries.filter(e => 
      e.action === 'blocked'
    ).length;

    const pendingApproval = relevantEntries.filter(e => 
      e.approvalRequired && !e.approvedBy
    ).length;

    // Calculate average risk score
    const scoresEntries = relevantEntries.filter(e => e.riskScore);
    const averageRiskScore = scoresEntries.length > 0
      ? scoresEntries.reduce((sum, e) => sum + (e.riskScore?.normalizedScore || 0), 0) / scoresEntries.length
      : 0;

    // Risk distribution
    const riskDistribution = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    scoresEntries.forEach(e => {
      if (!e.riskScore) return;
      const score = e.riskScore.normalizedScore;
      if (score >= 80) riskDistribution.critical++;
      else if (score >= 60) riskDistribution.high++;
      else if (score >= 40) riskDistribution.medium++;
      else if (score >= 20) riskDistribution.low++;
      else riskDistribution.none++;
    });

    // Dark patterns by type
    const darkPatternsByType: Record<string, number> = {};
    relevantEntries.forEach(e => {
      if (!e.analysis) return;
      e.analysis.patternsDetected.forEach(p => {
        darkPatternsByType[p.type] = (darkPatternsByType[p.type] || 0) + 1;
      });
    });

    // Transparency violations - simplified
    const transparencyViolationsByType: Record<string, number> = {};

    // Regional breakdown - simplified
    const regionalBreakdown: Record<string, any> = {};

    // Count regulatory incidents
    const regulatoryIncidents = this.alerts.filter(a => 
      a.type === 'regulatory' &&
      a.timestamp >= period.start &&
      a.timestamp <= period.end
    ).length;

    // Count safe mode activations
    const safeModeActivations = relevantEntries.filter(e =>
      e.notes?.includes('SAFE MODE') || e.notes?.includes('Safe Mode')
    ).length;

    this.metrics = {
      period,
      totalFlows,
      activeFlows,
      blockedFlows,
      pendingApproval,
      averageRiskScore,
      riskDistribution,
      darkPatternsByType,
      transparencyViolationsByType,
      regionalBreakdown,
      regulatoryIncidents,
      safeModeActivations
    };

    return this.metrics;
  }

  /**
   * Get current metrics (cached)
   */
  getMetrics(): DashboardMetrics | null {
    return this.metrics;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(period: { start: Date; end: Date }): {
    summary: string;
    metrics: DashboardMetrics;
    criticalIssues: ComplianceAlert[];
    recommendations: string[];
    auditTrail: AuditEntry[];
  } {
    const metrics = this.metrics || {
      period,
      totalFlows: 0,
      activeFlows: 0,
      blockedFlows: 0,
      pendingApproval: 0,
      averageRiskScore: 0,
      riskDistribution: { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
      darkPatternsByType: {},
      transparencyViolationsByType: {},
      regionalBreakdown: {},
      regulatoryIncidents: 0,
      safeModeActivations: 0
    };

    const criticalIssues = this.getAlerts({ 
      severity: ['critical', 'error'],
      acknowledged: false 
    });

    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (metrics.averageRiskScore > 50) {
      recommendations.push('⚠️ Average risk score is elevated. Review and optimize monetization flows.');
    }

    if (metrics.blockedFlows > metrics.activeFlows * 0.3) {
      recommendations.push('⚠️ High block rate detected. Consider adjusting flows or thresholds.');
    }

    if (metrics.riskDistribution.critical > 0) {
      recommendations.push('🚨 Critical risk flows detected. Immediate review required.');
    }

    if (metrics.pendingApproval > 5) {
      recommendations.push('📋 Multiple flows pending approval. Expedite review process.');
    }

    if (metrics.regulatoryIncidents > 0) {
      recommendations.push('⚖️ Regulatory incidents detected. Review compliance procedures.');
    }

    if (criticalIssues.length > 0) {
      recommendations.push(`🚨 ${criticalIssues.length} critical alerts need immediate attention.`);
    }

    const auditTrail = this.getAuditLog({ dateRange: period });

    const summary = this.generateSummaryText(metrics, criticalIssues.length);

    return {
      summary,
      metrics,
      criticalIssues,
      recommendations,
      auditTrail
    };
  }

  /**
   * Generate summary text
   */
  private generateSummaryText(metrics: DashboardMetrics, criticalCount: number): string {
    const lines: string[] = [];
    
    lines.push('📊 Monetization UX Compliance Report');
    lines.push('═'.repeat(50));
    lines.push('');
    lines.push(`Period: ${metrics.period.start.toLocaleDateString()} - ${metrics.period.end.toLocaleDateString()}`);
    lines.push('');
    lines.push('Overview:');
    lines.push(`  • Total Flows: ${metrics.totalFlows}`);
    lines.push(`  • Active Flows: ${metrics.activeFlows}`);
    lines.push(`  • Blocked Flows: ${metrics.blockedFlows}`);
    lines.push(`  • Pending Approval: ${metrics.pendingApproval}`);
    lines.push('');
    lines.push('Risk Profile:');
    lines.push(`  • Average Risk Score: ${metrics.averageRiskScore.toFixed(1)}/100`);
    lines.push(`  • Critical: ${metrics.riskDistribution.critical}`);
    lines.push(`  • High: ${metrics.riskDistribution.high}`);
    lines.push(`  • Medium: ${metrics.riskDistribution.medium}`);
    lines.push('');
    lines.push('Regulatory:');
    lines.push(`  • Incidents: ${metrics.regulatoryIncidents}`);
    lines.push(`  • Safe Mode Activations: ${metrics.safeModeActivations}`);
    lines.push(`  • Critical Alerts: ${criticalCount}`);

    return lines.join('\n');

    return lines.join('\n');
  }

  /**
   * Check if audit entry should trigger an alert
   */
  private checkForAlert(entry: AuditEntry): void {
    // Block action always creates alert
    if (entry.action === 'blocked') {
      this.createAlert({
        severity: 'warning',
        type: 'threshold',
        flowId: entry.flowId,
        message: `Flow ${entry.flowId} was blocked due to risk threshold`
      });
    }

    // Critical risk score
    if (entry.riskScore && entry.riskScore.normalizedScore >= 80) {
      this.createAlert({
        severity: 'critical',
        type: 'threshold',
        flowId: entry.flowId,
        message: `Critical risk score (${entry.riskScore.normalizedScore}) detected in flow ${entry.flowId}`
      });
    }

    // Dark patterns detected
    if (entry.analysis && entry.analysis.patternsDetected.length > 0) {
      const criticalPatterns = entry.analysis.patternsDetected.filter(p => p.severity >= 3);
      if (criticalPatterns.length > 0) {
        this.createAlert({
          severity: 'error',
          type: 'dark_pattern',
          flowId: entry.flowId,
          message: `${criticalPatterns.length} critical dark pattern(s) detected in flow ${entry.flowId}`
        });
      }
    }
  }

  /**
   * Notify critical alert
   */
  private notifyCriticalAlert(alert: ComplianceAlert): void {
    // In production, send to monitoring systems, Slack, email, etc.
    console.log('🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨');
    console.log(alert);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export audit log to CSV
   */
  exportAuditLogCSV(filters?: DashboardFilters): string {
    const entries = this.getAuditLog(filters);
    const headers = ['Timestamp', 'Flow ID', 'Action', 'User', 'Role', 'Risk Score', 'Approved By', 'Notes'];
    
    const rows = entries.map(e => [
      e.timestamp.toISOString(),
      e.flowId,
      e.action,
      e.userId,
      e.userRole,
      e.riskScore?.normalizedScore.toFixed(1) || 'N/A',
      e.approvedBy || 'N/A',
      e.notes || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }
}

export default MonetizationUXAuditDashboard;
