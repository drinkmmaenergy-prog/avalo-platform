import * as admin from 'firebase-admin';
import {
  ExtortionSeverity,
  ExtortionType,
  EnforcementAction,
  EnforcementActionRecord,
  CaseStatus
} from './types';

export class EnforcementEngine {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async applyImmediateAction(
    caseId: string,
    targetUserId: string,
    severity: ExtortionSeverity,
    type: ExtortionType
  ): Promise<void> {
    const actions = this.determineActions(severity, type);

    for (const action of actions) {
      await this.executeAction(caseId, targetUserId, action, severity);
    }

    await this.db
      .collection('extortion_cases')
      .doc(caseId)
      .update({
        status: CaseStatus.CONFIRMED,
        enforcementApplied: true,
        enforcementActions: actions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  async queueForReview(
    caseId: string,
    targetUserId: string,
    severity: ExtortionSeverity
  ): Promise<void> {
    await this.db.collection('moderation_queue').add({
      type: 'extortion_case',
      caseId,
      targetUserId,
      severity,
      priority: severity >= ExtortionSeverity.HIGH ? 'urgent' : 'high',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await this.executeAction(
      caseId,
      targetUserId,
      EnforcementAction.FREEZE_ACCOUNT,
      severity
    );
  }

  private determineActions(
    severity: ExtortionSeverity,
    type: ExtortionType
  ): EnforcementAction[] {
    const actions: EnforcementAction[] = [];

    switch (severity) {
      case ExtortionSeverity.CRITICAL:
        actions.push(
          EnforcementAction.FREEZE_ACCOUNT,
          EnforcementAction.PERMANENT_BAN,
          EnforcementAction.IP_BLOCK,
          EnforcementAction.DEVICE_BLOCK,
          EnforcementAction.WITHHOLD_PAYOUTS,
          EnforcementAction.LEGAL_ESCALATION
        );
        break;

      case ExtortionSeverity.HIGH:
        actions.push(
          EnforcementAction.SUSPEND_ACCOUNT,
          EnforcementAction.IP_BLOCK,
          EnforcementAction.WITHHOLD_PAYOUTS
        );
        break;

      case ExtortionSeverity.MEDIUM:
        actions.push(
          EnforcementAction.FREEZE_ACCOUNT,
          EnforcementAction.WITHHOLD_PAYOUTS
        );
        break;

      case ExtortionSeverity.LOW:
        actions.push(EnforcementAction.FREEZE_ACCOUNT);
        break;
    }

    if (type === ExtortionType.SEXTORTION || type === ExtortionType.REVENGE_LEAK) {
      if (!actions.includes(EnforcementAction.LEGAL_ESCALATION)) {
        actions.push(EnforcementAction.LEGAL_ESCALATION);
      }
    }

    return actions;
  }

  private async executeAction(
    caseId: string,
    targetUserId: string,
    action: EnforcementAction,
    severity: ExtortionSeverity
  ): Promise<void> {
    const actionRecord: Partial<EnforcementActionRecord> = {
      caseId,
      targetUserId,
      actionType: action,
      severity,
      reason: 'Extortion detected - automatic enforcement',
      executedBy: 'system',
      timestamp: new Date(),
      details: {
        appealable: action !== EnforcementAction.PERMANENT_BAN,
        accountFrozen: false,
        payoutsWithheld: false,
        ipBlocked: [],
        deviceBlocked: []
      },
      reversible: action !== EnforcementAction.PERMANENT_BAN
    };

    switch (action) {
      case EnforcementAction.FREEZE_ACCOUNT:
        await this.freezeAccount(targetUserId, caseId);
        actionRecord.details!.accountFrozen = true;
        break;

      case EnforcementAction.SUSPEND_ACCOUNT:
        await this.suspendAccount(targetUserId, caseId, 30);
        actionRecord.details!.durationDays = 30;
        break;

      case EnforcementAction.PERMANENT_BAN:
        await this.permanentBan(targetUserId, caseId);
        actionRecord.reversible = false;
        break;

      case EnforcementAction.IP_BLOCK:
        await this.blockIP(targetUserId, caseId);
        break;

      case EnforcementAction.DEVICE_BLOCK:
        await this.blockDevice(targetUserId, caseId);
        break;

      case EnforcementAction.WITHHOLD_PAYOUTS:
        await this.withholdPayouts(targetUserId, caseId);
        actionRecord.details!.payoutsWithheld = true;
        break;

      case EnforcementAction.LEGAL_ESCALATION:
        await this.escalateToLegal(caseId, targetUserId);
        break;

      case EnforcementAction.MULTI_ACCOUNT_SWEEP:
        await this.sweepMultiAccounts(targetUserId, caseId);
        break;
    }

    await this.db.collection('enforcement_actions').add(actionRecord);
  }

  private async freezeAccount(userId: string, caseId: string): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .update({
        accountStatus: 'frozen',
        frozenReason: 'extortion_detected',
        frozenCaseId: caseId,
        frozenAt: admin.firestore.FieldValue.serverTimestamp()
      });

    await this.db
      .collection('account_states')
      .doc(userId)
      .set({
        state: 'frozen',
        reason: 'extortion',
        caseId,
        canAppeal: true,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
  }

  private async suspendAccount(
    userId: string,
    caseId: string,
    durationDays: number
  ): Promise<void> {
    const suspendedUntil = new Date();
    suspendedUntil.setDate(suspendedUntil.getDate() + durationDays);

    await this.db
      .collection('users')
      .doc(userId)
      .update({
        accountStatus: 'suspended',
        suspendedReason: 'extortion_attempt',
        suspendedCaseId: caseId,
        suspendedUntil,
        suspendedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    await this.db
      .collection('account_states')
      .doc(userId)
      .set({
        state: 'suspended',
        reason: 'extortion',
        caseId,
        suspendedUntil,
        canAppeal: true,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
  }

  private async permanentBan(userId: string, caseId: string): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .update({
        accountStatus: 'banned',
        bannedReason: 'extortion_confirmed',
        bannedCaseId: caseId,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        permanent: true
      });

    await this.db
      .collection('account_states')
      .doc(userId)
      .set({
        state: 'banned',
        reason: 'extortion',
        caseId,
        permanent: true,
        canAppeal: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    await this.db
      .collection('banned_users')
      .doc(userId)
      .set({
        userId,
        reason: 'extortion',
        caseId,
        bannedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  private async blockIP(userId: string, caseId: string): Promise<void> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData?.lastKnownIPs) {
      for (const ip of userData.lastKnownIPs) {
        await this.db.collection('blocked_ips').doc(ip).set({
          ip,
          userId,
          caseId,
          reason: 'extortion',
          blockedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  private async blockDevice(userId: string, caseId: string): Promise<void> {
    const sessions = await this.db
      .collection('user_sessions')
      .where('userId', '==', userId)
      .get();

    const deviceIds = new Set<string>();
    sessions.docs.forEach(doc => {
      const deviceId = doc.data().deviceId;
      if (deviceId) deviceIds.add(deviceId);
    });

    for (const deviceId of Array.from(deviceIds)) {
      await this.db.collection('blocked_devices').doc(deviceId).set({
        deviceId,
        userId,
        caseId,
        reason: 'extortion',
        blockedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  private async withholdPayouts(userId: string, caseId: string): Promise<void> {
    await this.db
      .collection('creator_earnings')
      .doc(userId)
      .update({
        payoutsEnabled: false,
        payoutHoldReason: 'extortion_case',
        payoutHoldCaseId: caseId,
        payoutHoldAt: admin.firestore.FieldValue.serverTimestamp()
      });

    const pendingPayouts = await this.db
      .collection('payout_requests')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    for (const payout of pendingPayouts.docs) {
      await payout.ref.update({
        status: 'held',
        holdReason: 'extortion_investigation',
        caseId,
        heldAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  private async escalateToLegal(caseId: string, userId: string): Promise<void> {
    await this.db.collection('legal_escalations').add({
      caseId,
      userId,
      type: 'extortion',
      priority: 'high',
      status: 'pending',
      escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
      requiresLawEnforcement: true
    });

    await this.db
      .collection('extortion_cases')
      .doc(caseId)
      .update({
        escalatedToLegal: true,
        legalEscalationAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  private async sweepMultiAccounts(userId: string, caseId: string): Promise<void> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const relatedAccounts: string[] = [];

    if (userData?.email) {
      const emailMatches = await this.db
        .collection('users')
        .where('email', '==', userData.email)
        .get();
      
      emailMatches.docs.forEach(doc => {
        if (doc.id !== userId) relatedAccounts.push(doc.id);
      });
    }

    if (userData?.phoneNumber) {
      const phoneMatches = await this.db
        .collection('users')
        .where('phoneNumber', '==', userData.phoneNumber)
        .get();
      
      phoneMatches.docs.forEach(doc => {
        if (doc.id !== userId && !relatedAccounts.includes(doc.id)) {
          relatedAccounts.push(doc.id);
        }
      });
    }

    if (userData?.lastKnownIPs) {
      for (const ip of userData.lastKnownIPs) {
        const ipMatches = await this.db
          .collection('users')
          .where('lastKnownIPs', 'array-contains', ip)
          .get();
        
        ipMatches.docs.forEach(doc => {
          if (doc.id !== userId && !relatedAccounts.includes(doc.id)) {
            relatedAccounts.push(doc.id);
          }
        });
      }
    }

    for (const accountId of relatedAccounts) {
      await this.freezeAccount(accountId, caseId);
      
      await this.db.collection('multi_account_detections').add({
        primaryUserId: userId,
        relatedUserId: accountId,
        caseId,
        reason: 'extortion_ring',
        detectedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  async applyUploadBlock(userId: string, reason: string): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .update({
        uploadRestricted: true,
        uploadRestrictionReason: reason,
        uploadRestrictedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  async processAppeal(
    appealId: string,
    caseId: string,
    decision: 'approved' | 'rejected',
    reviewedBy: string,
    notes: string
  ): Promise<void> {
    await this.db
      .collection('case_appeals')
      .doc(appealId)
      .update({
        status: decision,
        reviewedBy,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewNotes: notes
      });

    if (decision === 'approved') {
      const caseDoc = await this.db
        .collection('extortion_cases')
        .doc(caseId)
        .get();
      
      const caseData = caseDoc.data();
      if (caseData?.accusedId) {
        await this.reverseEnforcement(caseId, caseData.accusedId, reviewedBy);
      }

      await this.db
        .collection('extortion_cases')
        .doc(caseId)
        .update({
          status: CaseStatus.REJECTED,
          resolution: 'Appeal approved - enforcement reversed',
          resolvedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
  }

  private async reverseEnforcement(
    caseId: string,
    userId: string,
    reversedBy: string
  ): Promise<void> {
    const actions = await this.db
      .collection('enforcement_actions')
      .where('caseId', '==', caseId)
      .where('targetUserId', '==', userId)
      .where('reversible', '==', true)
      .get();

    for (const actionDoc of actions.docs) {
      const action = actionDoc.data() as EnforcementActionRecord;

      switch (action.actionType) {
        case EnforcementAction.FREEZE_ACCOUNT:
        case EnforcementAction.SUSPEND_ACCOUNT:
          await this.db
            .collection('users')
            .doc(userId)
            .update({
              accountStatus: 'active',
              frozenReason: admin.firestore.FieldValue.delete(),
              frozenCaseId: admin.firestore.FieldValue.delete(),
              suspendedReason: admin.firestore.FieldValue.delete()
            });
          break;

        case EnforcementAction.WITHHOLD_PAYOUTS:
          await this.db
            .collection('creator_earnings')
            .doc(userId)
            .update({
              payoutsEnabled: true,
              payoutHoldReason: admin.firestore.FieldValue.delete(),
              payoutHoldCaseId: admin.firestore.FieldValue.delete()
            });
          break;
      }

      await actionDoc.ref.update({
        reversedAt: admin.firestore.FieldValue.serverTimestamp(),
        reversedBy
      });
    }
  }

  async getEnforcementHistory(userId: string): Promise<EnforcementActionRecord[]> {
    const actions = await this.db
      .collection('enforcement_actions')
      .where('targetUserId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();

    return actions.docs.map(doc => doc.data() as EnforcementActionRecord);
  }
}

export const enforcement = new EnforcementEngine();