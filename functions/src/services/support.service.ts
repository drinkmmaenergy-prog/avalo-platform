/**
 * PACK 111 — Support Service
 * User-facing support case management
 */

import { db, arrayUnion } from '../init';
import {
  SupportCase,
  SupportMessage,
  SupportCategory,
  SupportStatus,
  SupportSource,
  SupportPlatform,
  SupportPriority,
  SupportAuditLog,
  SupportAuditAction
} from '../types/support.types';
import { aiSupportTriage } from './aiSupportTriage';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Support Service
 * Handles all support case operations for users
 */
export class SupportService {
  private readonly casesCollection = db.collection('support_cases');
  private readonly auditLogCollection = db.collection('support_audit_log');
  private readonly configCollection = db.collection('support_config');

  /**
   * Open a new support case
   */
  async openSupportCase(params: {
    userId: string;
    subject: string;
    message: string;
    category?: SupportCategory;
    source: SupportSource;
    language: string;
    platform: SupportPlatform;
    metadata?: {
      deviceInfo?: string;
      appVersion?: string;
      accountType?: string;
      userEmail?: string;
      userName?: string;
    };
  }): Promise<{ caseId: string; triageResult: any }> {
    // Rate limiting check
    await this.checkRateLimits(params.userId);

    // AI triage analysis
    const triageResult = await aiSupportTriage.triageMessage(
      params.message,
      {
        userId: params.userId,
        platform: params.platform,
        language: params.language,
        accountType: params.metadata?.accountType
      }
    );

    const caseId = db.collection('support_cases').doc().id;
    const now = Timestamp.now();

    const initialMessage: SupportMessage = {
      messageId: `${caseId}_msg_1`,
      fromUserId: params.userId,
      fromAgentId: null,
      message: params.message,
      originalLanguage: params.language,
      timestamp: now
    };

    const supportCase: SupportCase = {
      caseId,
      userId: params.userId,
      category: params.category || triageResult.category,
      status: 'OPEN',
      source: params.source,
      language: params.language,
      platform: params.platform,
      priority: triageResult.priority,
      assignedTo: null,
      subject: params.subject,
      messages: [initialMessage],
      createdAt: now,
      updatedAt: now,
      lastUserMessage: now,
      lastAgentMessage: null,
      resolution: null,
      metadata: {
        ...params.metadata,
        aiTriageFlags: Object.entries(triageResult.detectedFlags)
          .filter(([_, value]) => value === true)
          .map(([key]) => key)
      },
      tags: []
    };

    // Safety escalation if critical
    if (triageResult.forwardToHumanImmediately) {
      await this.escalateCriticalCase(supportCase, triageResult);
    }

    // Save case
    await this.casesCollection.doc(caseId).set(supportCase);

    // Audit log
    await this.logAudit({
      action: 'CASE_CREATED',
      actorId: params.userId,
      actorType: 'USER',
      caseId,
      metadata: {
        category: supportCase.category,
        priority: supportCase.priority,
        triageFlags: supportCase.metadata.aiTriageFlags
      }
    });

    // Notify support team
    await this.notifySupportTeam(supportCase, triageResult);

    return { caseId, triageResult };
  }

  /**
   * Send a message in an existing support case
   */
  async sendSupportMessage(params: {
    userId: string;
    caseId: string;
    message: string;
    attachments?: string[];
  }): Promise<void> {
    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    // Verify user owns the case
    if (supportCase.userId !== params.userId) {
      throw new Error('UNAUTHORIZED');
    }

    // Cannot send messages to closed cases
    if (supportCase.status === 'CLOSED') {
      throw new Error('CASE_CLOSED');
    }

    const now = Timestamp.now();
    const messageId = `${params.caseId}_msg_${supportCase.messages.length + 1}`;

    const newMessage: SupportMessage = {
      messageId,
      fromUserId: params.userId,
      fromAgentId: null,
      message: params.message,
      originalLanguage: supportCase.language,
      timestamp: now,
      attachments: params.attachments
    };

    // Update case
    await caseRef.update({
      messages: arrayUnion(newMessage),
      lastUserMessage: now,
      updatedAt: now,
      status: 'WAITING_FOR_AGENT'
    });

    // Audit log
    await this.logAudit({
      action: 'MESSAGE_SENT',
      actorId: params.userId,
      actorType: 'USER',
      caseId: params.caseId,
      metadata: { messageId }
    });

    // Notify assigned agent
    if (supportCase.assignedTo) {
      await this.notifyAgent(supportCase.assignedTo, params.caseId, 'USER_REPLIED');
    }
  }

  /**
   * Get user's support cases
   */
  async listUserSupportCases(params: {
    userId: string;
    status?: SupportStatus;
    limit?: number;
  }): Promise<SupportCase[]> {
    let query = this.casesCollection
      .where('userId', '==', params.userId)
      .orderBy('updatedAt', 'desc');

    if (params.status) {
      query = query.where('status', '==', params.status);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as SupportCase);
  }

  /**
   * Get a specific support case
   */
  async getSupportCase(params: {
    userId: string;
    caseId: string;
  }): Promise<SupportCase> {
    const caseDoc = await this.casesCollection.doc(params.caseId).get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    // Verify user owns the case
    if (supportCase.userId !== params.userId) {
      throw new Error('UNAUTHORIZED');
    }

    return supportCase;
  }

  /**
   * Reopen a resolved case (within 7 days)
   */
  async reopenSupportCase(params: {
    userId: string;
    caseId: string;
    message: string;
  }): Promise<void> {
    const caseRef = this.casesCollection.doc(params.caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      throw new Error('CASE_NOT_FOUND');
    }

    const supportCase = caseDoc.data() as SupportCase;

    // Verify user owns the case
    if (supportCase.userId !== params.userId) {
      throw new Error('UNAUTHORIZED');
    }

    // Must be resolved to reopen
    if (supportCase.status !== 'RESOLVED') {
      throw new Error('CASE_NOT_RESOLVED');
    }

    // Check 7-day limit
    if (!supportCase.resolution) {
      throw new Error('INVALID_CASE_STATE');
    }

    const daysSinceResolution = (Date.now() - supportCase.resolution.resolvedAt.toMillis()) / (1000 * 60 * 60 * 24);
    if (daysSinceResolution > 7) {
      throw new Error('REOPEN_WINDOW_EXPIRED');
    }

    const now = Timestamp.now();
    const messageId = `${params.caseId}_msg_${supportCase.messages.length + 1}`;

    const reopenMessage: SupportMessage = {
      messageId,
      fromUserId: params.userId,
      fromAgentId: null,
      message: params.message,
      originalLanguage: supportCase.language,
      timestamp: now
    };

    // Update case
    await caseRef.update({
      status: 'OPEN',
      messages: arrayUnion(reopenMessage),
      lastUserMessage: now,
      updatedAt: now,
      resolution: null
    });

    // Audit log
    await this.logAudit({
      action: 'CASE_REOPENED',
      actorId: params.userId,
      actorType: 'USER',
      caseId: params.caseId,
      metadata: { reason: 'User reopened case within 7 days' }
    });

    // Notify support team
    if (supportCase.assignedTo) {
      await this.notifyAgent(supportCase.assignedTo, params.caseId, 'CASE_REOPENED');
    }
  }

  /**
   * Rate limiting: max 10 cases per user per day
   */
  private async checkRateLimits(userId: string): Promise<void> {
    const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentCases = await this.casesCollection
      .where('userId', '==', userId)
      .where('createdAt', '>', oneDayAgo)
      .get();

    if (recentCases.size >= 10) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
  }

  /**
   * Escalate critical cases to safety team
   */
  private async escalateCriticalCase(
    supportCase: SupportCase,
    triageResult: any
  ): Promise<void> {
    // If safety risk detected, alert safety team (PACK 87)
    if (triageResult.detectedFlags.safetyRisk) {
      await this.alertSafetyTeam({
        caseId: supportCase.caseId,
        userId: supportCase.userId,
        reason: 'SAFETY_RISK_DETECTED',
        message: supportCase.messages[0].message,
        priority: 'CRITICAL'
      });

      // Provide crisis resources if applicable
      const resources = aiSupportTriage.getCrisisResources('US'); // TODO: detect user's country
      if (resources) {
        // Auto-send crisis resources message
        await this.sendSystemMessage(supportCase.caseId, resources.message);
      }
    }

    // If minor risk, alert compliance team
    if (triageResult.detectedFlags.minorRisk) {
      await this.alertComplianceTeam({
        caseId: supportCase.caseId,
        userId: supportCase.userId,
        reason: 'POSSIBLE_MINOR_USER',
        priority: 'CRITICAL'
      });
    }

    // If legal request, alert legal team
    if (triageResult.detectedFlags.legalRequest) {
      await this.alertLegalTeam({
        caseId: supportCase.caseId,
        userId: supportCase.userId,
        reason: 'LAW_ENFORCEMENT_REQUEST',
        priority: 'CRITICAL'
      });
    }
  }

  /**
   * Send system message to case
   */
  private async sendSystemMessage(caseId: string, message: string): Promise<void> {
    const caseRef = this.casesCollection.doc(caseId);
    const now = Timestamp.now();

    const systemMessage: SupportMessage = {
      messageId: `${caseId}_sys_${Date.now()}`,
      fromUserId: null,
      fromAgentId: null,
      message,
      originalLanguage: 'en',
      timestamp: now,
      isInternal: false
    };

    await caseRef.update({
      messages: arrayUnion(systemMessage),
      updatedAt: now
    });
  }

  /**
   * Alert safety team
   */
  private async alertSafetyTeam(alert: any): Promise<void> {
    // Integration with PACK 87 safety system
    await db.collection('safety_alerts').add({
      ...alert,
      source: 'SUPPORT_SYSTEM',
      createdAt: Timestamp.now()
    });
  }

  /**
   * Alert compliance team
   */
  private async alertComplianceTeam(alert: any): Promise<void> {
    await db.collection('compliance_alerts').add({
      ...alert,
      source: 'SUPPORT_SYSTEM',
      createdAt: Timestamp.now()
    });
  }

  /**
   * Alert legal team
   */
  private async alertLegalTeam(alert: any): Promise<void> {
    await db.collection('legal_alerts').add({
      ...alert,
      source: 'SUPPORT_SYSTEM',
      createdAt: Timestamp.now()
    });
  }

  /**
   * Notify support team of new case
   */
  private async notifySupportTeam(supportCase: SupportCase, triageResult: any): Promise<void> {
    // Find available agents for this category and language
    const agentsSnapshot = await db.collection('support_agents')
      .where('isActive', '==', true)
      .where('languages', 'array-contains', supportCase.language || 'en')
      .where('specializations', 'array-contains', supportCase.category)
      .get();

    // Notify all qualified agents
    for (const agentDoc of agentsSnapshot.docs) {
      await this.notifyAgent(agentDoc.id, supportCase.caseId, 'NEW_CASE');
    }
  }

  /**
   * Notify specific agent
   */
  private async notifyAgent(agentId: string, caseId: string, type: string): Promise<void> {
    // Send push notification to agent's device
    const agentDoc = await db.collection('support_agents').doc(agentId).get();
    if (agentDoc.exists) {
      const agent = agentDoc.data();
      // Agent notification logic here
    }
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

export const supportService = new SupportService();