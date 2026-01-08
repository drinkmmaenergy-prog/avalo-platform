/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Module: Compliance Escalation Orchestrator
 * 
 * Manages automated escalations to compliance/legal/finance teams:
 * - Auto-escalation triggers
 * - Case creation and SLA management
 * - Department routing
 * - Full audit trail
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type Firestore = admin.firestore.Firestore;

export type EscalationType = 'PAYOUT_FREEZE' | 'HIGH_RISK_SCORE' | 'CHARGEBACK_SPIKE' | 'AML_FLAG';
export type EscalationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EscalationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type Department = 'LEGAL' | 'FINANCE' | 'COMPLIANCE' | 'FRAUD';

export interface ComplianceEscalation {
  caseId: string;
  creatorId: string;
  type: EscalationType;
  severity: EscalationSeverity;
  status: EscalationStatus;
  assignedTo?: string;
  department: Department;
  details: {
    description: string;
    affectedPayouts: string[];
    affectedAmount: number;
    riskFactors: string[];
  };
  timeline: {
    createdAt: Timestamp;
    firstReviewedAt?: Timestamp;
    resolvedAt?: Timestamp;
    slaDeadline: Timestamp;
  };
  actions: Array<{
    timestamp: Timestamp;
    actor: string;
    action: string;
    notes: string;
  }>;
  resolution?: {
    decision: string;
    reasoning: string;
    implementedBy: string;
    implementedAt: Timestamp;
  };
  auditLog: Array<{
    timestamp: Timestamp;
    event: string;
    data: any;
  }>;
}

export interface CreateEscalationRequest {
  creatorId: string;
  type: EscalationType;
  severity: EscalationSeverity;
  description: string;
  affectedPayouts?: string[];
  affectedAmount?: number;
  riskFactors?: string[];
}

export class ComplianceEscalationOrchestrator {
  private db: Firestore;
  
  // SLA deadlines (in hours)
  private readonly SLA_DEADLINES = {
    CRITICAL: 4,
    HIGH: 24,
    MEDIUM: 72,
    LOW: 168
  };
  
  constructor(db: Firestore) {
    this.db = db;
  }
  
  /**
   * Create escalation case
   */
  async createEscalation(request: CreateEscalationRequest): Promise<ComplianceEscalation> {
    const caseId =this.generateCaseId();
    const now = Timestamp.now();
    const department = this.determineDepartment(request.type);
    const slaHours = this.SLA_DEADLINES[request.severity];
    
    const escalation: ComplianceEscalation = {
      caseId,
      creatorId: request.creatorId,
      type: request.type,
      severity: request.severity,
      status: 'OPEN',
      department,
      details: {
        description: request.description,
        affectedPayouts: request.affectedPayouts || [],
        affectedAmount: request.affectedAmount || 0,
        riskFactors: request.riskFactors || []
      },
      timeline: {
        createdAt: now,
        slaDeadline: Timestamp.fromMillis(now.toMillis() + slaHours * 60 * 60 * 1000)
      },
      actions: [],
      auditLog: [{
        timestamp: now,
        event: 'CASE_CREATED',
        data: { request }
      }]
    };
    
    // Save to Firestore
    await this.db.collection('compliance_escalations').doc(caseId).set(escalation);
    
    // Auto-assign if CRITICAL
    if (request.severity === 'CRITICAL') {
      await this.autoAssign(escalation);
    }
    
    // Send notifications
    await this.sendNotifications(escalation);
    
    // Log audit event
    await this.logAuditEvent(escalation, 'ESCALATION_CREATED');
    
    return escalation;
  }
  
  /**
   * Update case status
   */
  async updateCaseStatus(
    caseId: string,
    status: EscalationStatus,
    actor: string,
    notes: string
  ): Promise<void> {
    const caseRef = this.db.collection('compliance_escalations').doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new Error(`Case ${caseId} not found`);
    }
    
    const updates: any = {
      status,
      'timeline.lastUpdatedAt': Timestamp.now(),
      actions: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        actor,
        action: `STATUS_CHANGED_TO_${status}`,
        notes
      }),
      auditLog: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        event: 'STATUS_UPDATED',
        data: { status, actor, notes }
      })
    };
    
    if (status === 'IN_REVIEW' && !caseDoc.data()?.timeline?.firstReviewedAt) {
      updates['timeline.firstReviewedAt'] = Timestamp.now();
    }
    
    if (status === 'RESOLVED') {
      updates['timeline.resolvedAt'] = Timestamp.now();
    }
    
    await caseRef.update(updates);
    
    const escalation = caseDoc.data() as ComplianceEscalation;
    await this.logAuditEvent(escalation, 'STATUS_UPDATED', { status, actor, notes });
  }
  
  /**
   * Assign case to team member
   */
  async assignCase(caseId: string, assignedTo: string, assignedBy: string): Promise<void> {
    const caseRef = this.db.collection('compliance_escalations').doc(caseId);
    
    await caseRef.update({
      assignedTo,
      status: 'IN_REVIEW',
      'timeline.firstReviewedAt': Timestamp.now(),
      actions: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        actor: assignedBy,
        action: 'CASE_ASSIGNED',
        notes: `Assigned to ${assignedTo}`
      }),
      auditLog: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        event: 'CASE_ASSIGNED',
        data: { assignedTo, assignedBy }
      })
    });
  }
  
  /**
   * Resolve case
   */
  async resolveCase(
    caseId: string,
    decision: string,
    reasoning: string,
    implementedBy: string
  ): Promise<void> {
    const caseRef = this.db.collection('compliance_escalations').doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new Error(`Case ${caseId} not found`);
    }
    
    await caseRef.update({
      status: 'RESOLVED',
      'timeline.resolvedAt': Timestamp.now(),
      resolution: {
        decision,
        reasoning,
        implementedBy,
        implementedAt: Timestamp.now()
      },
      actions: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        actor: implementedBy,
        action: 'CASE_RESOLVED',
        notes: `Decision: ${decision}\nReasoning: ${reasoning}`
      }),
      auditLog: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        event: 'CASE_RESOLVED',
        data: { decision, reasoning, implementedBy }
      })
    });
    
    const escalation = caseDoc.data() as ComplianceEscalation;
    await this.logAuditEvent(escalation, 'CASE_RESOLVED', { decision, reasoning });
  }
  
  /**
   * Add action to case
   */
  async addAction(
    caseId: string,
    actor: string,
    action: string,
    notes: string
  ): Promise<void> {
    const caseRef = this.db.collection('compliance_escalations').doc(caseId);
    
    await caseRef.update({
      actions: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        actor,
        action,
        notes
      }),
      auditLog: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        event: 'ACTION_ADDED',
        data: { actor, action, notes }
      })
    });
  }
  
  /**
   * Get case by ID
   */
  async getCase(caseId: string): Promise<ComplianceEscalation | null> {
    const doc = await this.db.collection('compliance_escalations').doc(caseId).get();
    return doc.exists ? (doc.data() as ComplianceEscalation) : null;
  }
  
  /**
   * Get cases for a creator
   */
  async getCreatorCases(creatorId: string): Promise<ComplianceEscalation[]> {
    const snapshot = await this.db
      .collection('compliance_escalations')
      .where('creatorId', '==', creatorId)
      .orderBy('timeline.createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as ComplianceEscalation);
  }
  
  /**
   * Get open cases for a department
   */
  async getDepartmentCases(
    department: Department,
    status: EscalationStatus = 'OPEN'
  ): Promise<ComplianceEscalation[]> {
    const snapshot = await this.db
      .collection('compliance_escalations')
      .where('department', '==', department)
      .where('status', '==', status)
      .orderBy('timeline.slaDeadline', 'asc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as ComplianceEscalation);
  }
  
  /**
   * Get overdue cases
   */
  async getOverdueCases(): Promise<ComplianceEscalation[]> {
    const now = Timestamp.now();
    
    const snapshot = await this.db
      .collection('compliance_escalations')
      .where('status', 'in', ['OPEN', 'IN_REVIEW'])
      .where('timeline.slaDeadline', '<', now)
      .orderBy('timeline.slaDeadline', 'asc')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as ComplianceEscalation);
  }
  
  /**
   * Auto-assign case to available team member
   */
  private async autoAssign(escalation: ComplianceEscalation): Promise<void> {
    // Get team members from department
    const teamSnapshot = await this.db
      .collection('staff')
      .where('department', '==', escalation.department)
      .where('available', '==', true)
      .limit(1)
      .get();
    
    if (!teamSnapshot.empty) {
      const teamMember = teamSnapshot.docs[0];
      await this.assignCase(escalation.caseId, teamMember.id, 'AUTO_ASSIGN');
    }
  }
  
  /**
   * Send notifications to relevant teams
   */
  private async sendNotifications(escalation: ComplianceEscalation): Promise<void> {
    // Integration with notification system (PACK 169)
    await this.db.collection('notifications').add({
      type: 'COMPLIANCE_ESCALATION',
      severity: escalation.severity,
      department: escalation.department,
      caseId: escalation.caseId,
      title: `New ${escalation.severity} ${escalation.type} case`,
      body: escalation.details.description,
      createdAt: Timestamp.now(),
      read: false
    });
  }
  
  /**
   * Determine department based on escalation type
   */
  private determineDepartment(type: EscalationType): Department {
    switch (type) {
      case 'PAYOUT_FREEZE':
        return 'COMPLIANCE';
      case 'HIGH_RISK_SCORE':
        return 'FRAUD';
      case 'CHARGEBACK_SPIKE':
        return 'FINANCE';
      case 'AML_FLAG':
        return 'LEGAL';
      default:
        return 'COMPLIANCE';
    }
  }
  
  /**
   * Generate unique case ID
   */
  private generateCaseId(): string {
    return `case_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  /**
   * Log audit event
   */
  private async logAuditEvent(
    escalation: ComplianceEscalation,
    event: string,
    additionalData?: any
  ): Promise<void> {
    await this.db.collection('audit_logs_pack440').add({
      type: 'COMPLIANCE_ESCALATION',
      event,
      caseId: escalation.caseId,
      creatorId: escalation.creatorId,
      timestamp: Timestamp.now(),
      ...additionalData
    });
  }
}
