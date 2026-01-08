/**
 * PACK 111 — Support Admin/Agent Service
 * Agent console functions for managing support cases
 */

import { db, arrayUnion, increment } from '../init';
import { 
  SupportCase, 
  SupportMessage, 
  SupportStatus,
  SupportAuditLog,
  SupportAuditAction,
  CaseResolution
} from '../types/support.types';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Support Admin Service
 * Handles all support case operations for agents and admins
 */
export class SupportAdminService {
  private readonly casesCollection = db.collection('support_cases');
  private readonly auditLogCollection = db.collection('support_audit_log');
  private readonly agentsCollection = db.collection('support_agents');

  /**
   * List support cases (with filtering)
   */
  async listSupportCases(params: {
    agentId: string;
    filter?: {
      status?: SupportStatus;
      priority?: string;
      category?: string;
      assignedTo?: string;
      unassignedOnly?: boolean;
    };
    limit?: number;
    offset?: number;
  }): Promise<{ cases: SupportCase[]; total: number }> {
    // Verify agent has permission
    await this.verifyAgentPermission(params.agentId);

    let query = this.casesCollection.orderBy('priority', 'desc').orderBy('createdAt', 'desc');

    // Apply filters
    if (params.filter) {
      if (params.filter.status) {
        query = query.where('status', '==', params.filter.status);
      }
      if (params.filter.priority) {
        query = query.where('priority', '==', params.filter.priority);
      }
      if (params.filter.category) {
        query = query.where('category', '==', params.filter.category);
      }
      if (params.filter.assignedTo) {
        query = query.where('assignedTo', '==', params.filter.assignedTo);
      }
      if (params.filter.unassignedOnly) {
        query = query.where('assignedTo', '==', null);
      }
    }

    // Apply pagination
    if (params.limit) {
      query = query.limit(params.limit);
    }

    const snapshot = await query.get();
    const cases = snapshot.docs.map(doc => doc.data() as SupportCase);

    return {
      cases,
      total: snapshot.size
    };
  }

  /**
   * Get a specific support case
   */
  async getSupportCase(params: {
    agentId: string;
    caseId: string;
  }): Promise<SupportCase> {
    await this.verifyAgentPermission(params.agentId);

    const caseDoc = await this.casesCollection.doc(params.caseId).get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    return caseDoc.data() as SupportCase;
  }

  /**
   * Assign a support case to an agent
   */
  async assignSupportCase(params: {
    agentId: string;
    caseId: string;
    assignToAgentId: string;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    // Verify target agent exists and is active
    const targetAgent = await this.agentsCollection.doc(params.assignToAgentId).get();
    if (!targetAgent.exists || !targetAgent.data()?.isActive) {
      throw new Error('INVALID_AGENT');
    }

    // Check agent case load
    const agentCaseCount = await this.getAgentCaseLoad(params.assignToAgentId);
    const maxCaseLoad = targetAgent.data()?.maxCaseLoad || 50;
    
    if (agentCaseCount >= maxCaseLoad) {
      throw new Error('AGENT_AT_CAPACITY');
    }

    const now = Timestamp.now();

    // Update case
    await caseRef.update({
      assignedTo: params.assignToAgentId,
      status: 'ASSIGNED',
      updatedAt: now
    });

    // Update agent's case load
    await this.agentsCollection.doc(params.assignToAgentId).update({
      currentCaseLoad: agentCaseCount + 1,
      lastActiveAt: now
    });

    // Audit log
    await this.logAudit({
      action: supportCase.assignedTo ? 'CASE_REASSIGNED' : 'CASE_ASSIGNED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: {
        previousAgent: supportCase.assignedTo,
        newAgent: params.assignToAgentId
      }
    });

    // Notify assigned agent
    await this.notifyAgent(params.assignToAgentId, params.caseId, 'CASE_ASSIGNED');
  }

  /**
   * Send a reply from agent
   */
  async sendSupportReply(params: {
    agentId: string;
    caseId: string;
    message: string;
    isInternal?: boolean;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    // Verify case is assigned to this agent or agent has permission
    if (supportCase.assignedTo !== params.agentId) {
      const hasOverride = await this.hasOverridePermission(params.agentId);
      if (!hasOverride) {
        throw new Error('CASE_NOT_ASSIGNED_TO_AGENT');
      }
    }

    const now = Timestamp.now();
    const messageId = `${params.caseId}_msg_${supportCase.messages.length + 1}`;

    const agentMessage: SupportMessage = {
      messageId,
      fromUserId: null,
      fromAgentId: params.agentId,
      message: params.message,
      originalLanguage: supportCase.language,
      timestamp: now,
      isInternal: params.isInternal || false
    };

    // Update case
    await caseRef.update({
      messages: arrayUnion(agentMessage),
      lastAgentMessage: now,
      updatedAt: now,
      status: params.isInternal ? supportCase.status : 'WAITING_FOR_USER'
    });

    // Audit log
    await this.logAudit({
      action: 'MESSAGE_SENT',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: { messageId, isInternal: params.isInternal }
    });

    // Notify user (if not internal note)
    if (!params.isInternal) {
      await this.notifyUser(supportCase.userId, params.caseId, 'AGENT_REPLIED');
    }
  }

  /**
   * Mark case as waiting for user
   */
  async markWaitingForUser(params: {
    agentId: string;
    caseId: string;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    await caseRef.update({
      status: 'WAITING_FOR_USER',
      updatedAt: Timestamp.now()
    });

    await this.logAudit({
      action: 'STATUS_CHANGED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: { newStatus: 'WAITING_FOR_USER' }
    });
  }

  /**
   * Close/resolve a support case
   */
  async closeSupportCase(params: {
    agentId: string;
    caseId: string;
    resolutionCategory: 'FIXED' | 'EXPLAINED' | 'NO_ACTION_NEEDED' | 'ESCALATED';
    resolutionNotes: string;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;
    const now = Timestamp.now();

    const resolution: CaseResolution = {
      resolvedAt: now,
      resolvedBy: params.agentId,
      resolutionCategory: params.resolutionCategory,
      resolutionNotes: params.resolutionNotes
    };

    // Update case
    await caseRef.update({
      status: 'RESOLVED',
      resolution,
      updatedAt: now
    });

    // Update agent's case load
    if (supportCase.assignedTo) {
      await this.agentsCollection.doc(supportCase.assignedTo).update({
        currentCaseLoad: increment(-1)
      });
    }

    // Audit log
    await this.logAudit({
      action: 'CASE_RESOLVED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: {
        resolutionCategory: params.resolutionCategory,
        resolutionNotes: params.resolutionNotes
      }
    });

    // Notify user
    await this.notifyUser(supportCase.userId, params.caseId, 'CASE_RESOLVED');

    // Schedule auto-close after 7 days
    await this.scheduleAutoClose(params.caseId);
  }

  /**
   * Change case priority
   */
  async changeCasePriority(params: {
    agentId: string;
    caseId: string;
    newPriority: string;
    reason: string;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    await caseRef.update({
      priority: params.newPriority,
      updatedAt: Timestamp.now()
    });

    await this.logAudit({
      action: 'PRIORITY_CHANGED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: {
        previousPriority: supportCase.priority,
        newPriority: params.newPriority,
        reason: params.reason
      }
    });
  }

  /**
   * Change case category
   */
  async changeCaseCategory(params: {
    agentId: string;
    caseId: string;
    newCategory: string;
    reason: string;
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    await caseRef.update({
      category: params.newCategory,
      updatedAt: Timestamp.now()
    });

    await this.logAudit({
      action: 'CATEGORY_CHANGED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: {
        previousCategory: supportCase.category,
        newCategory: params.newCategory,
        reason: params.reason
      }
    });
  }

  /**
   * Add tags to case
   */
  async addCaseTags(params: {
    agentId: string;
    caseId: string;
    tags: string[];
  }): Promise<void> {
    await this.verifyAgentPermission(params.agentId);

    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    await caseRef.update({
      tags: arrayUnion(...params.tags),
      updatedAt: Timestamp.now()
    });

    await this.logAudit({
      action: 'TAG_ADDED',
      actorId: params.agentId,
      actorType: 'AGENT',
      caseId: params.caseId,
      metadata: { tags: params.tags }
    });
  }

  /**
   * Get agent case load
   */
  private async getAgentCaseLoad(agentId: string): Promise<number> {
    const snapshot = await this.casesCollection
      .where('assignedTo', '==', agentId)
      .where('status', 'in', ['OPEN', 'ASSIGNED', 'WAITING_FOR_AGENT', 'WAITING_FOR_USER'])
      .get();

    return snapshot.size;
  }

  /**
   * Verify agent has permission
   */
  private async verifyAgentPermission(agentId: string): Promise<void> {
    const agentDoc = await this.agentsCollection.doc(agentId).get();
    
    if (!agentDoc.exists) {
      throw new Error('AGENT_NOT_FOUND');
    }

    const agent = agentDoc.data();
    if (!agent?.isActive) {
      throw new Error('AGENT_NOT_ACTIVE');
    }
  }

  /**
   * Check if agent has override permission
   */
  private async hasOverridePermission(agentId: string): Promise<boolean> {
    const agentDoc = await this.agentsCollection.doc(agentId).get();
    const agent = agentDoc.data();
    return agent?.role === 'SUPERVISOR' || agent?.role === 'ADMIN';
  }

  /**
   * Schedule auto-close after 7 days
   */
  private async scheduleAutoClose(caseId: string): Promise<void> {
    // Implementation would use Cloud Tasks or Scheduled Functions
    // For now, just log the intent
    await db.collection('scheduled_tasks').add({
      type: 'AUTO_CLOSE_CASE',
      caseId,
      executeAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now()
    });
  }

  /**
   * Notify user
   */
  private async notifyUser(userId: string, caseId: string, type: string): Promise<void> {
    // Integration with push notification system
    await db.collection('notifications').add({
      userId,
      type: 'SUPPORT',
      subtype: type,
      data: { caseId },
      createdAt: Timestamp.now(),
      read: false
    });
  }

  /**
   * Notify agent
   */
  private async notifyAgent(agentId: string, caseId: string, type: string): Promise<void> {
    await db.collection('agent_notifications').add({
      agentId,
      type: 'SUPPORT',
      subtype: type,
      data: { caseId },
      createdAt: Timestamp.now(),
      read: false
    });
  }

  /**
   * Log audit entry
   */
  private async logAudit(params: {
    action: SupportAuditAction;
    actorId: string;
    actorType: 'USER' | 'AGENT' | 'SYSTEM';
    caseId: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const logEntry: SupportAuditLog = {
      logId: this.auditLogCollection.doc().id,
      action: params.action,
      actorId: params.actorId,
      actorType: params.actorType,
      caseId: params.caseId,
      timestamp: Timestamp.now(),
      metadata: params.metadata || {}
    };

    await this.auditLogCollection.add(logEntry);
  }
}

export const supportAdminService = new SupportAdminService();