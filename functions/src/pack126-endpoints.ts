/**
 * PACK 126 — Safety Framework Endpoints
 * 
 * Cloud Functions exposing safety framework services
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  requestConsent,
  pauseConsent,
  revokeConsent,
  resumeConsent,
  checkConsent,
  getConsentRecord,
  getUserConsentRecordsByState,
} from './pack126-consent-protocol';
import {
  detectHarassmentFromMessage,
  activateHarassmentShield,
  getActiveShield,
  resolveHarassmentShield,
} from './pack126-harassment-shield';
import { orchestrateRiskAssessment } from './pack126-risk-orchestration';
import {
  createEvidenceVault,
  requestVaultAccess,
  approveVaultAccess,
  accessVaultEvidence,
  cleanupExpiredVaults,
} from './pack126-evidence-vault';
import { getSafetyDashboard } from './pack126-safety-dashboard';

// ============================================================================
// UNIVERSAL CONSENT PROTOCOL ENDPOINTS
// ============================================================================

export const pack126_requestConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { toUserId, requestType } = request.data;
  
  if (!toUserId || !requestType) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const result = await requestConsent({
    fromUserId: userId,
    toUserId,
    requestType,
  });
  
  return result;
});

export const pack126_pauseConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { counterpartId, reason } = request.data;
  
  if (!counterpartId) {
    throw new HttpsError('invalid-argument', 'Missing counterpartId');
  }
  
  await pauseConsent(userId, counterpartId, userId, reason);
  
  return { success: true, message: 'Consent paused' };
});

export const pack126_revokeConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { counterpartId, reason } = request.data;
  
  if (!counterpartId) {
    throw new HttpsError('invalid-argument', 'Missing counterpartId');
  }
  
  await revokeConsent(userId, counterpartId, userId, reason);
  
  return { success: true, message: 'Consent revoked' };
});

export const pack126_resumeConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { counterpartId } = request.data;
  
  if (!counterpartId) {
    throw new HttpsError('invalid-argument', 'Missing counterpartId');
  }
  
  await resumeConsent(userId, counterpartId, userId);
  
  return { success: true, message: 'Consent resumed' };
});

export const pack126_checkConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { toUserId, requestType } = request.data;
  
  if (!toUserId || !requestType) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const result = await checkConsent({
    fromUserId: userId,
    toUserId,
    requestType,
  });
  
  return result;
});

export const pack126_getConsentRecord = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { counterpartId } = request.data;
  
  if (!counterpartId) {
    throw new HttpsError('invalid-argument', 'Missing counterpartId');
  }
  
  const record = await getConsentRecord(userId, counterpartId);
  
  return { success: true, record };
});

export const pack126_getUserConsentsByState = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { state } = request.data;
  
  if (!state) {
    throw new HttpsError('invalid-argument', 'Missing state');
  }
  
  const records = await getUserConsentRecordsByState(userId, state);
  
  return { success: true, count: records.length, records };
});

// ============================================================================
// HARASSMENT SHIELD ENDPOINTS
// ============================================================================

export const pack126_reportUser = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { reportedUserId, reason, messageContent, metadata } = request.data;
  
  if (!reportedUserId || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  // Detect harassment patterns
  const signals = await detectHarassmentFromMessage(
    reportedUserId,
    userId,
    messageContent || '',
    metadata || { isReply: false, recentMessageCount: 0, messagesInLastMinute: 0 }
  );
  
  // If signals detected, activate shield
  if (signals.length > 0) {
    const shield = await activateHarassmentShield(userId, reportedUserId, signals);
    
    return {
      success: true,
      shieldActivated: true,
      level: shield.level,
      message: 'Report received and protection activated',
    };
  }
  
  // Otherwise, just log report (handled by existing report system)
  return {
    success: true,
    shieldActivated: false,
    message: 'Report received',
  };
});

export const pack126_getActiveShield = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { counterpartId } = request.data;
  
  if (!counterpartId) {
    throw new HttpsError('invalid-argument', 'Missing counterpartId');
  }
  
  const shield = await getActiveShield(userId, counterpartId);
  
  return { success: true, shield };
});

// ============================================================================
// SAFETY DASHBOARD ENDPOINT
// ============================================================================

export const pack126_getSafetyDashboard = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const dashboard = await getSafetyDashboard(userId);
  
  return { success: true, dashboard };
});

// ============================================================================
// RISK ORCHESTRATION ENDPOINT (Internal use)
// ============================================================================

export const pack126_orchestrateRisk = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { context, counterpartId } = request.data;
  
  if (!context) {
    throw new HttpsError('invalid-argument', 'Missing context');
  }
  
  const result = await orchestrateRiskAssessment({
    userId,
    context,
    counterpartId,
  });
  
  return { success: true, result };
});

// ============================================================================
// EVIDENCE VAULT ENDPOINTS (Admin only)
// ============================================================================

export const pack126_admin_requestVaultAccess = onCall(async (request) => {
  const moderatorId = request.auth?.uid;
  if (!moderatorId) {
    throw new HttpsError('unauthenticated', 'Moderator must be authenticated');
  }
  
  // Verify moderator role (integrate with existing admin check)
  // This would use your existing admin verification
  
  const { vaultId, reason, scope } = request.data;
  
  if (!vaultId || !reason || !scope) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  const requestId = await requestVaultAccess(vaultId, moderatorId, reason, scope);
  
  return { success: true, requestId };
});

export const pack126_admin_approveVaultAccess = onCall(async (request) => {
  const adminId = request.auth?.uid;
  if (!adminId) {
    throw new HttpsError('unauthenticated', 'Admin must be authenticated');
  }
  
  // Verify admin role (integrate with existing admin check)
  
  const { vaultId, requestId, durationHours } = request.data;
  
  if (!vaultId || !requestId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  await approveVaultAccess(vaultId, requestId, adminId, durationHours);
  
  return { success: true, message: 'Access granted' };
});

export const pack126_admin_accessVaultEvidence = onCall(async (request) => {
  const moderatorId = request.auth?.uid;
  if (!moderatorId) {
    throw new HttpsError('unauthenticated', 'Moderator must be authenticated');
  }
  
  const { vaultId } = request.data;
  
  if (!vaultId) {
    throw new HttpsError('invalid-argument', 'Missing vaultId');
  }
  
  const evidence = await accessVaultEvidence(vaultId, moderatorId);
  
  return { success: true, evidence };
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

export const pack126_cleanupExpiredVaults = onSchedule({
  schedule: '0 3 * * *',  // Daily at 3 AM UTC
  timeZone: 'UTC',
}, async (event) => {
  const deletedCount = await cleanupExpiredVaults();
  console.log(`[Pack 126] Cleaned up ${deletedCount} expired evidence vaults`);
});