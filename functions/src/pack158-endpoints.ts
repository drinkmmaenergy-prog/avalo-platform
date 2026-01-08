/**
 * PACK 158 — Legal Evidence Vault Endpoints
 * 
 * Cloud Functions for vault operations, export requests, and legal holds
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import {
  createLegalVault,
  storeEvidence,
  captureMessageEvidence,
  requestExport,
  approveExportRequest,
  rejectExportRequest,
  deliverExport,
  cleanupExpiredVaults,
  createLegalHoldCase,
  closeLegalHoldCase,
} from './pack158-legal-vault';
import {
  ExportRequestType,
  LegalEvidenceCategory,
  LegalViolationSeverity,
} from './types/pack158-legal-evidence.types';

export const pack158_captureMessageEvidence = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    messageId,
    conversationId,
    senderId,
    recipientId,
    content,
    timestamp,
    caseId,
  } = request.data;

  if (!messageId || !conversationId || !senderId || !recipientId || !content || !caseId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const result = await captureMessageEvidence({
      messageId,
      conversationId,
      senderId,
      recipientId,
      content,
      timestamp: timestamp || Timestamp.now(),
      reporterId: userId,
      caseId,
    });

    if (!result) {
      return {
        success: false,
        stored: false,
        message: 'Evidence not stored - content does not meet legal violation criteria',
      };
    }

    return {
      success: true,
      stored: true,
      vaultId: result.vaultId,
      evidenceId: result.evidenceId,
    };
  } catch (error: any) {
    console.error('[Pack 158] Error capturing message evidence:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_requestExport = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    vaultId,
    requestType,
    courtOrderId,
    lawEnforcementAgency,
    badgeNumber,
    caseNumber,
    recipient,
  } = request.data;

  if (!vaultId || !requestType || !recipient) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  if (!Object.values(ExportRequestType).includes(requestType)) {
    throw new HttpsError('invalid-argument', 'Invalid request type');
  }

  try {
    const result = await requestExport({
      vaultId,
      requestedBy: userId,
      requestType,
      courtOrderId,
      lawEnforcementAgency,
      badgeNumber,
      caseNumber,
      recipient,
    });

    return {
      success: true,
      requestId: result.requestId,
      validation: result.validation,
      message: 'Export request submitted for review',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error requesting export:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_admin_approveExport = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { requestId, deliveryMethod } = request.data;

  if (!requestId || !deliveryMethod) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    await approveExportRequest({
      requestId,
      approvedBy: userId,
      deliveryMethod,
    });

    return {
      success: true,
      message: 'Export request approved',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error approving export:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_admin_rejectExport = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { requestId, reason } = request.data;

  if (!requestId || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    await rejectExportRequest({
      requestId,
      rejectedBy: userId,
      reason,
    });

    return {
      success: true,
      message: 'Export request rejected',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error rejecting export:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_admin_deliverExport = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { requestId, vaultId } = request.data;

  if (!requestId || !vaultId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const result = await deliverExport({
      requestId,
      vaultId,
      accessorId: userId,
    });

    return {
      success: true,
      evidence: result.evidence,
      metadata: result.metadata,
      message: 'Export package prepared',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error delivering export:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_admin_createLegalHold = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const {
    caseId,
    caseType,
    caseName,
    jurisdictions,
    involvedUserIds,
    vaultIds,
    legalCounsel,
    retentionReason,
  } = request.data;

  if (!caseId || !caseType || !caseName || !jurisdictions || !retentionReason) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const holdCaseId = await createLegalHoldCase({
      caseId,
      caseType,
      caseName,
      jurisdictions,
      involvedUserIds: involvedUserIds || [],
      vaultIds: vaultIds || [],
      legalCounsel: legalCounsel || [],
      retentionReason,
    });

    return {
      success: true,
      caseId: holdCaseId,
      message: 'Legal hold case created',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error creating legal hold:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_admin_closeLegalHold = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { caseId } = request.data;

  if (!caseId) {
    throw new HttpsError('invalid-argument', 'Missing caseId');
  }

  try {
    await closeLegalHoldCase({
      caseId,
      closedBy: userId,
    });

    return {
      success: true,
      message: 'Legal hold case closed',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error closing legal hold:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_getUserOwnEvidence = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { vaultId } = request.data;

  if (!vaultId) {
    throw new HttpsError('invalid-argument', 'Missing vaultId');
  }

  try {
    const requestId = `user_req_${Date.now()}`;
    
    await requestExport({
      vaultId,
      requestedBy: userId,
      requestType: ExportRequestType.USER_OWN_REQUEST,
      recipient: userId,
    });

    return {
      success: true,
      requestId,
      message: 'Your evidence export is being prepared',
    };
  } catch (error: any) {
    console.error('[Pack 158] Error requesting user evidence:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const pack158_cleanupExpiredVaults = onSchedule({
  schedule: '0 4 * * *',
  timeZone: 'UTC',
}, async (event) => {
  try {
    const deletedCount = await cleanupExpiredVaults();
    console.log(`[Pack 158] Cleaned up ${deletedCount} expired legal evidence vaults`);
  } catch (error) {
    console.error('[Pack 158] Error in cleanup job:', error);
  }
});