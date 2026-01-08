/**
 * PACK 158 — Legal Evidence Vault Operations
 * 
 * Core vault management for legal evidence storage
 * Strict access control and chain of custody tracking
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  LegalEvidenceVault,
  SealedLegalEvidence,
  LegalEvidenceCategory,
  LegalViolationSeverity,
  VaultAccessLog,
  ExportRequest,
  ExportRequestType,
  ExportRequestValidation,
  ForbiddenExportRequest,
  LegalHoldCase,
  DEFAULT_EVIDENCE_TRIGGERS,
} from './types/pack158-legal-evidence.types';
import { classifyEvidence } from './pack158-evidence-classifier';
import {
  sealEvidenceItem,
  unsealEvidenceItem,
  generateVaultId,
  generateAccessSignature,
} from './pack158-evidence-encryption';

const VAULT_COLLECTION = 'legal_evidence_vaults';
const EXPORT_REQUESTS_COLLECTION = 'legal_export_requests';
const LEGAL_HOLD_CASES_COLLECTION = 'legal_hold_cases';
const ACCESS_LOG_COLLECTION = 'vault_access_logs';

export async function createLegalVault(params: {
  caseId: string;
  reporterId: string;
  reportedUserId: string;
  category: LegalEvidenceCategory;
  severity: LegalViolationSeverity;
  jurisdictions: string[];
}): Promise<string> {
  const vaultId = generateVaultId(params.caseId, params.reportedUserId);
  
  const retentionDays = DEFAULT_EVIDENCE_TRIGGERS[params.category]?.retentionDays || 365;
  const retentionUntil = Timestamp.fromMillis(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000
  );
  const autoDeleteAt = Timestamp.fromMillis(
    Date.now() + (retentionDays + 30) * 24 * 60 * 60 * 1000
  );
  
  const vault: LegalEvidenceVault = {
    vaultId,
    caseId: params.caseId,
    reporterId: params.reporterId,
    reportedUserId: params.reportedUserId,
    category: params.category,
    severity: params.severity,
    sealedEvidence: [],
    accessLog: [],
    exportRequests: [],
    createdAt: Timestamp.now(),
    retentionUntil,
    autoDeleteAt,
    gdprCompliant: true,
    jurisdictions: params.jurisdictions,
  };
  
  await db.collection(VAULT_COLLECTION).doc(vaultId).set(vault);
  
  console.log(`[Legal Vault] Created vault ${vaultId} for case ${params.caseId}`);
  
  return vaultId;
}

export async function storeEvidence(params: {
  vaultId: string;
  evidenceType: SealedLegalEvidence['evidenceType'];
  content: string | Buffer;
  sourceType: SealedLegalEvidence['sourceType'];
  sourceId: string;
  capturedBy: string;
  legalRelevanceScore: number;
  violatesLaw: string[];
}): Promise<string> {
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const sealed = await sealEvidenceItem(evidenceId, params.content, {
    evidenceType: params.evidenceType,
    timestamp: Timestamp.now(),
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    legalRelevanceScore: params.legalRelevanceScore,
    violatesLaw: params.violatesLaw,
    capturedBy: params.capturedBy,
  });
  
  await db.collection(VAULT_COLLECTION).doc(params.vaultId).update({
    sealedEvidence: FieldValue.arrayUnion(sealed),
  });
  
  console.log(`[Legal Vault] Stored evidence ${evidenceId} in vault ${params.vaultId}`);
  
  return evidenceId;
}

export async function captureMessageEvidence(params: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Timestamp;
  reporterId: string;
  caseId: string;
}): Promise<{ vaultId: string; evidenceId: string } | null> {
  const classification = await classifyEvidence({
    contentType: 'TEXT',
    content: params.content,
    context: {
      senderId: params.senderId,
      recipientId: params.recipientId,
      conversationId: params.conversationId,
      timestamp: params.timestamp,
      metadata: {},
    },
  });
  
  if (!classification.shouldStore) {
    console.log(`[Legal Vault] Message ${params.messageId} not stored - ${classification.reasoning}`);
    return null;
  }
  
  if (classification.isProtectedPrivacy) {
    console.log(`[Legal Vault] Message ${params.messageId} protected - ${classification.reasoning}`);
    return null;
  }
  
  let vaultId: string;
  const existingVault = await findVaultForCase(params.caseId);
  
  if (existingVault) {
    vaultId = existingVault;
  } else {
    vaultId = await createLegalVault({
      caseId: params.caseId,
      reporterId: params.reporterId,
      reportedUserId: params.senderId,
      category: classification.category!,
      severity: classification.severity!,
      jurisdictions: ['US'],
    });
  }
  
  const evidenceId = await storeEvidence({
    vaultId,
    evidenceType: 'MESSAGE',
    content: params.content,
    sourceType: 'CHAT',
    sourceId: params.messageId,
    capturedBy: 'SYSTEM',
    legalRelevanceScore: classification.confidence,
    violatesLaw: classification.triggeredLaws,
  });
  
  return { vaultId, evidenceId };
}

export async function requestExport(params: {
  vaultId: string;
  requestedBy: string;
  requestType: ExportRequestType;
  courtOrderId?: string;
  lawEnforcementAgency?: string;
  badgeNumber?: string;
  caseNumber?: string;
  recipient: string;
}): Promise<{ requestId: string; validation: ExportRequestValidation }> {
  const validation = validateExportRequest(params);
  
  if (!validation.valid) {
    throw new Error(`Invalid export request: ${validation.errors.join(', ')}`);
  }
  
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const exportRequest: ExportRequest = {
    requestId,
    vaultId: params.vaultId,
    requestType: params.requestType,
    requestedBy: params.requestedBy,
    requestedAt: Timestamp.now(),
    courtOrderId: params.courtOrderId,
    lawEnforcementAgency: params.lawEnforcementAgency,
    badgeNumber: params.badgeNumber,
    caseNumber: params.caseNumber,
    status: 'PENDING',
    recipient: params.recipient,
    accessLog: [{
      logId: `log_${Date.now()}`,
      exportRequestId: requestId,
      event: 'REQUESTED',
      performedBy: params.requestedBy,
      timestamp: Timestamp.now(),
    }],
  };
  
  await db.collection(EXPORT_REQUESTS_COLLECTION).doc(requestId).set(exportRequest);
  
  await db.collection(VAULT_COLLECTION).doc(params.vaultId).update({
    exportRequests: FieldValue.arrayUnion({
      requestId,
      requestType: params.requestType,
      requestedBy: params.requestedBy,
      requestedAt: Timestamp.now(),
      status: 'PENDING',
    }),
  });
  
  console.log(`[Legal Vault] Export requested: ${requestId} for vault ${params.vaultId}`);
  
  return { requestId, validation };
}

function validateExportRequest(params: {
  requestedBy: string;
  requestType: ExportRequestType;
  courtOrderId?: string;
  lawEnforcementAgency?: string;
}): ExportRequestValidation {
  const errors: string[] = [];
  
  switch (params.requestType) {
    case ExportRequestType.COURT_SUBPOENA:
      if (!params.courtOrderId) {
        errors.push('Court order ID required for subpoena requests');
      }
      break;
    
    case ExportRequestType.LAW_ENFORCEMENT_ORDER:
      if (!params.lawEnforcementAgency) {
        errors.push('Law enforcement agency required');
      }
      break;
    
    case ExportRequestType.USER_OWN_REQUEST:
      break;
    
    default:
      errors.push('Invalid request type');
  }
  
  return {
    valid: errors.length === 0,
    allowedToRequest: true,
    requiresCourtOrder: params.requestType !== ExportRequestType.USER_OWN_REQUEST,
    errors,
  };
}

export async function approveExportRequest(params: {
  requestId: string;
  approvedBy: string;
  deliveryMethod: 'SECURE_DOWNLOAD' | 'ENCRYPTED_EMAIL' | 'PHYSICAL_MEDIA';
}): Promise<void> {
  const requestRef = db.collection(EXPORT_REQUESTS_COLLECTION).doc(params.requestId);
  const requestDoc = await requestRef.get();
  
  if (!requestDoc.exists) {
    throw new Error('Export request not found');
  }
  
  await requestRef.update({
    status: 'APPROVED',
    approvedBy: params.approvedBy,
    approvedAt: Timestamp.now(),
    deliveryMethod: params.deliveryMethod,
    accessLog: FieldValue.arrayUnion({
      logId: `log_${Date.now()}`,
      exportRequestId: params.requestId,
      event: 'APPROVED',
      performedBy: params.approvedBy,
      timestamp: Timestamp.now(),
    }),
  });
  
  console.log(`[Legal Vault] Export request ${params.requestId} approved by ${params.approvedBy}`);
}

export async function rejectExportRequest(params: {
  requestId: string;
  rejectedBy: string;
  reason: string;
}): Promise<void> {
  const requestRef = db.collection(EXPORT_REQUESTS_COLLECTION).doc(params.requestId);
  
  await requestRef.update({
    status: 'REJECTED',
    rejectionReason: params.reason,
    accessLog: FieldValue.arrayUnion({
      logId: `log_${Date.now()}`,
      exportRequestId: params.requestId,
      event: 'REJECTED',
      performedBy: params.rejectedBy,
      timestamp: Timestamp.now(),
      notes: params.reason,
    }),
  });
  
  console.log(`[Legal Vault] Export request ${params.requestId} rejected: ${params.reason}`);
}

export async function deliverExport(params: {
  requestId: string;
  vaultId: string;
  accessorId: string;
}): Promise<{ evidence: any[]; metadata: any }> {
  const requestRef = db.collection(EXPORT_REQUESTS_COLLECTION).doc(params.requestId);
  const requestDoc = await requestRef.get();
  
  if (!requestDoc.exists) {
    throw new Error('Export request not found');
  }
  
  const request = requestDoc.data() as ExportRequest;
  
  if (request.status !== 'APPROVED') {
    throw new Error('Export request not approved');
  }
  
  const vaultRef = db.collection(VAULT_COLLECTION).doc(params.vaultId);
  const vaultDoc = await vaultRef.get();
  
  if (!vaultDoc.exists) {
    throw new Error('Vault not found');
  }
  
  const vault = vaultDoc.data() as LegalEvidenceVault;
  
  const evidence = [];
  for (const sealed of vault.sealedEvidence) {
    try {
      const decrypted = await unsealEvidenceItem(sealed);
      evidence.push({
        evidenceId: sealed.evidenceId,
        evidenceType: sealed.evidenceType,
        content: decrypted,
        timestamp: sealed.timestamp,
        sourceType: sealed.sourceType,
        sourceId: sealed.sourceId,
        legalRelevanceScore: sealed.legalRelevanceScore,
        violatesLaw: sealed.violatesLaw,
        capturedAt: sealed.capturedAt,
      });
    } catch (error) {
      console.error(`[Legal Vault] Failed to decrypt evidence ${sealed.evidenceId}:`, error);
    }
  }
  
  const accessLog: VaultAccessLog = {
    accessId: `access_${Date.now()}`,
    vaultId: params.vaultId,
    accessorId: params.accessorId,
    accessorType: request.requestType === ExportRequestType.LAW_ENFORCEMENT_ORDER 
      ? 'LAW_ENFORCEMENT' 
      : 'LEGAL_TEAM',
    evidenceIdsViewed: vault.sealedEvidence.map(e => e.evidenceId),
    actionTaken: 'EXPORT',
    accessedAt: Timestamp.now(),
    reason: `Export request ${params.requestId}`,
    legalBasis: request.courtOrderId || request.lawEnforcementAgency || 'User request',
    ipAddress: 'redacted',
    userAgent: 'redacted',
    signature: generateAccessSignature(params.accessorId, params.vaultId, Timestamp.now()),
  };
  
  await db.collection(ACCESS_LOG_COLLECTION).add(accessLog);
  
  await vaultRef.update({
    accessLog: FieldValue.arrayUnion(accessLog),
  });
  
  await requestRef.update({
    status: 'DELIVERED',
    deliveredAt: Timestamp.now(),
    accessLog: FieldValue.arrayUnion({
      logId: `log_${Date.now()}`,
      exportRequestId: params.requestId,
      event: 'DOWNLOADED',
      performedBy: params.accessorId,
      timestamp: Timestamp.now(),
    }),
  });
  
  console.log(`[Legal Vault] Export delivered for request ${params.requestId}`);
  
  return {
    evidence,
    metadata: {
      vaultId: params.vaultId,
      caseId: vault.caseId,
      category: vault.category,
      severity: vault.severity,
      createdAt: vault.createdAt,
      evidenceCount: evidence.length,
    },
  };
}

export async function cleanupExpiredVaults(): Promise<number> {
  const now = Timestamp.now();
  
  const expiredVaults = await db.collection(VAULT_COLLECTION)
    .where('autoDeleteAt', '<', now)
    .get();
  
  let deletedCount = 0;
  
  for (const vaultDoc of expiredVaults.docs) {
    const vault = vaultDoc.data() as LegalEvidenceVault;
    
    const hasActiveLegalHold = await checkLegalHold(vault.caseId);
    if (hasActiveLegalHold) {
      console.log(`[Legal Vault] Skipping deletion of ${vault.vaultId} - active legal hold`);
      continue;
    }
    
    await db.collection(VAULT_COLLECTION).doc(vault.vaultId).delete();
    deletedCount++;
    
    console.log(`[Legal Vault] Deleted expired vault ${vault.vaultId}`);
  }
  
  console.log(`[Legal Vault] Cleaned up ${deletedCount} expired vaults`);
  
  return deletedCount;
}

async function findVaultForCase(caseId: string): Promise<string | null> {
  const vaults = await db.collection(VAULT_COLLECTION)
    .where('caseId', '==', caseId)
    .limit(1)
    .get();
  
  if (vaults.empty) {
    return null;
  }
  
  return vaults.docs[0].id;
}

async function checkLegalHold(caseId: string): Promise<boolean> {
  const holds = await db.collection(LEGAL_HOLD_CASES_COLLECTION)
    .where('caseId', '==', caseId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();
  
  return !holds.empty;
}

export async function createLegalHoldCase(params: {
  caseId: string;
  caseType: LegalHoldCase['caseType'];
  caseName: string;
  jurisdictions: string[];
  involvedUserIds: string[];
  vaultIds: string[];
  legalCounsel: string[];
  retentionReason: string;
}): Promise<string> {
  const holdCase: LegalHoldCase = {
    caseId: params.caseId,
    caseType: params.caseType,
    caseName: params.caseName,
    jurisdictions: params.jurisdictions,
    involvedUserIds: params.involvedUserIds,
    vaultIds: params.vaultIds,
    legalCounsel: params.legalCounsel,
    status: 'ACTIVE',
    openedAt: Timestamp.now(),
    retentionOverride: true,
    retentionReason: params.retentionReason,
  };
  
  await db.collection(LEGAL_HOLD_CASES_COLLECTION).doc(params.caseId).set(holdCase);
  
  console.log(`[Legal Vault] Created legal hold case ${params.caseId}`);
  
  return params.caseId;
}

export async function closeLegalHoldCase(params: {
  caseId: string;
  closedBy: string;
}): Promise<void> {
  await db.collection(LEGAL_HOLD_CASES_COLLECTION).doc(params.caseId).update({
    status: 'CLOSED',
    closedAt: Timestamp.now(),
  });
  
  console.log(`[Legal Vault] Closed legal hold case ${params.caseId}`);
}