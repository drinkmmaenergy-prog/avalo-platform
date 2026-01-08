/**
 * PACK 174 - Fraud Mitigation
 * Apply and manage fraud mitigation actions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import { FraudMitigationAction } from './types';

/**
 * Apply fraud mitigation action
 */
export const applyFraudMitigation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (!isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only investigators can apply mitigation');
  }

  const {
    targetUserId,
    caseId,
    actionType,
    reason,
    duration,
  } = request.data;

  if (!targetUserId || !caseId || !actionType || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const actionId = generateId();
  const now = new Date();
  const expiresAt = duration ? new Date(now.getTime() + duration) : undefined;

  const action: Partial<FraudMitigationAction> = {
    id: actionId,
    userId: targetUserId,
    caseId,
    actionType,
    reason,
    duration,
    appliedAt: now,
    expiresAt,
  };

  await db.collection('fraud_mitigation_actions').doc(actionId).set(action);

  await applyUserRestrictions(targetUserId, actionType, reason, expiresAt);

  await db.collection('fraud_cases').doc(caseId).update({
    mitigation: action,
    updatedAt: serverTimestamp(),
  });

  return {
    success: true,
    actionId,
    message: `Mitigation action ${actionType} applied successfully`,
  };
});

/**
 * Reverse fraud mitigation action
 */
export const reverseFraudMitigation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isAdmin = await checkIsAdmin(userId);

  if (!isAdmin) {
    throw new HttpsError('permission-denied', 'Only admins can reverse mitigation');
  }

  const { actionId, reversalReason } = request.data;

  if (!actionId || !reversalReason) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const actionDoc = await db.collection('fraud_mitigation_actions').doc(actionId).get();
  
  if (!actionDoc.exists) {
    throw new HttpsError('not-found', 'Action not found');
  }

  const actionData = actionDoc.data();

  await db.collection('fraud_mitigation_actions').doc(actionId).update({
    reversedAt: serverTimestamp(),
    reversalReason,
  });

  await reverseUserRestrictions(actionData!.userId, actionData!.actionType);

  return {
    success: true,
    message: 'Mitigation action reversed successfully',
  };
});

/**
 * Get active mitigations for user
 */
export const getActiveMitigations = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId } = request.data;
  const checkUserId = targetUserId || userId;

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (checkUserId !== userId && !isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  const now = new Date();
  
  const activeMitigations = await db.collection('fraud_mitigation_actions')
    .where('userId', '==', checkUserId)
    .where('reversedAt', '==', null)
    .get();

  const mitigations = activeMitigations.docs
    .map(doc => doc.data())
    .filter(action => {
      if (!action.expiresAt) return true;
      return new Date(action.expiresAt) > now;
    });

  return {
    mitigations,
    count: mitigations.length,
  };
});

/**
 * Apply user restrictions based on action type
 */
async function applyUserRestrictions(
  userId: string,
  actionType: string,
  reason: string,
  expiresAt?: Date
): Promise<void> {
  const updates: any = {};

  switch (actionType) {
    case 'warning':
      updates.warningIssued = true;
      updates.warningReason = reason;
      updates.warningIssuedAt = serverTimestamp();
      break;

    case 'temp_restriction':
      updates.restricted = true;
      updates.restrictionReason = reason;
      updates.restrictedUntil = expiresAt;
      updates.restrictedAt = serverTimestamp();
      break;

    case 'payment_block':
      updates.paymentsBlocked = true;
      updates.paymentBlockReason = reason;
      updates.paymentBlockedUntil = expiresAt;
      updates.paymentBlockedAt = serverTimestamp();
      break;

    case 'account_freeze':
      updates.accountFrozen = true;
      updates.accountFrozenReason = reason;
      updates.accountFrozenUntil = expiresAt;
      updates.accountFrozenAt = serverTimestamp();
      break;

    case 'permanent_ban':
      updates.accountStatus = 'banned';
      updates.banReason = reason;
      updates.bannedAt = serverTimestamp();
      break;
  }

  if (Object.keys(updates).length > 0) {
    await db.collection('users').doc(userId).update(updates);
  }
}

/**
 * Reverse user restrictions
 */
async function reverseUserRestrictions(
  userId: string,
  actionType: string
): Promise<void> {
  const updates: any = {};

  switch (actionType) {
    case 'warning':
      updates.warningIssued = false;
      updates.warningReason = null;
      break;

    case 'temp_restriction':
      updates.restricted = false;
      updates.restrictionReason = null;
      updates.restrictedUntil = null;
      break;

    case 'payment_block':
      updates.paymentsBlocked = false;
      updates.paymentBlockReason = null;
      updates.paymentBlockedUntil = null;
      break;

    case 'account_freeze':
      updates.accountFrozen = false;
      updates.accountFrozenReason = null;
      updates.accountFrozenUntil = null;
      break;

    case 'permanent_ban':
      updates.accountStatus = 'active';
      updates.banReason = null;
      break;
  }

  if (Object.keys(updates).length > 0) {
    await db.collection('users').doc(userId).update(updates);
  }
}

/**
 * Helper: Check if user is fraud investigator
 */
async function checkIsFraudInvestigator(userId: string): Promise<boolean> {
  const investigatorDoc = await db.collection('fraud_investigators').doc(userId).get();
  return investigatorDoc.exists;
}

/**
 * Helper: Check if user is admin
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.role === 'admin';
}