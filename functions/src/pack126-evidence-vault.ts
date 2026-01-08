/**
 * PACK 126 — Evidence-Based Moderation Vault
 *
 * Secure, encrypted evidence storage for moderation cases
 * Privacy-first with granular access control
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import {
  EvidenceVault,
  SealedEvidence,
  VaultAccessRequest,
  VaultAccessGrant,
  SafetyAuditLog,
} from './types/pack126-types';

const VAULT_COLLECTION = 'evidence_vaults';
const SAFETY_AUDIT_COLLECTION = 'safety_audit_logs';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// ============================================================================
// VAULT CREATION
// ============================================================================

/**
 * Create evidence vault for a moderation case
 */
export async function createEvidenceVault(
  caseId: string,
  reporterId: string,
  reportedUserId: string,
  messages: any[],
  media: any[],
  metadata: any[]
): Promise<string> {
  console.log(`[Evidence Vault] Creating vault for case ${caseId}`);
  
  // Generate master encryption key
  const masterKey = generateEncryptionKey();
  
  // Seal all evidence
  const sealedMessages = await sealMessages(messages, masterKey);
  const sealedMedia = await sealMediaItems(media, masterKey);
  const sealedMetadata = await sealMetadataItems(metadata, masterKey);
  
  const vault: EvidenceVault = {
    vaultId: `vault_${caseId}`,
    caseId,
    reporterId,
    reportedUserId,
    sealedMessages,
    sealedMedia,
    sealedMetadata,
    accessRequests: [],
    accessGranted: [],
    createdAt: Timestamp.now(),
    sealedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  };
  
  // Store vault
  await db.collection(VAULT_COLLECTION).doc(vault.vaultId).set(vault);
  
  // Store encryption key separately (admin-only access)
  await storeEncryptionKey(vault.vaultId, masterKey);
  
  // Log vault creation
  await logVaultEvent('EVIDENCE_VAULT_CREATED', reporterId, reportedUserId, {
    vaultId: vault.vaultId,
    caseId,
    messageCount: sealedMessages.length,
    mediaCount: sealedMedia.length,
  });
  
  return vault.vaultId;
}

// ============================================================================
// EVIDENCE SEALING (Encryption)
// ============================================================================

/**
 * Seal messages with encryption
 */
async function sealMessages(
  messages: any[],
  masterKey: string
): Promise<SealedEvidence[]> {
  return messages.map((msg, index) => ({
    evidenceId: `msg_${index}`,
    evidenceType: 'MESSAGE' as const,
    encryptedData: encryptData(JSON.stringify(msg), masterKey),
    encryptionKey: '', // Stored separately
    timestamp: msg.timestamp || Timestamp.now(),
    relevanceScore: calculateRelevance(msg),
  }));
}

/**
 * Seal media items with encryption
 */
async function sealMediaItems(
  media: any[],
  masterKey: string
): Promise<SealedEvidence[]> {
  return media.map((item, index) => ({
    evidenceId: `media_${index}`,
    evidenceType: 'MEDIA' as const,
    encryptedData: encryptData(JSON.stringify(item), masterKey),
    encryptionKey: '', // Stored separately
    timestamp: item.timestamp || Timestamp.now(),
    relevanceScore: 1.0, // Media always highly relevant
  }));
}

/**
 * Seal metadata with encryption
 */
async function sealMetadataItems(
  metadata: any[],
  masterKey: string
): Promise<SealedEvidence[]> {
  return metadata.map((item, index) => ({
    evidenceId: `meta_${index}`,
    evidenceType: 'METADATA' as const,
    encryptedData: encryptData(JSON.stringify(item), masterKey),
    encryptionKey: '', // Stored separately
    timestamp: item.timestamp || Timestamp.now(),
    relevanceScore: 0.5, // Metadata less relevant
  }));
}

/**
 * Calculate relevance score for evidence
 */
function calculateRelevance(message: any): number {
  // Simple heuristic - can be improved with ML
  let score = 0.5;
  
  // Boost for report-related keywords
  const reportKeywords = ['harassment', 'abuse', 'threat', 'scam', 'fraud'];
  const text = (message.text || '').toLowerCase();
  
  for (const keyword of reportKeywords) {
    if (text.includes(keyword)) {
      score += 0.1;
    }
  }
  
  return Math.min(score, 1.0);
}

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Request access to evidence vault
 */
export async function requestVaultAccess(
  vaultId: string,
  moderatorId: string,
  reason: string,
  scope: 'MESSAGES_ONLY' | 'MEDIA_ONLY' | 'FULL_CONTEXT'
): Promise<string> {
  const request: VaultAccessRequest = {
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    moderatorId,
    requestedAt: Timestamp.now(),
    reason,
    scopeRequested: scope,
  };
  
  // Add request to vault
  await db.collection(VAULT_COLLECTION).doc(vaultId).update({
    accessRequests: FieldValue.arrayUnion(request),
  });
  
  return request.requestId;
}

/**
 * Approve vault access (admin only)
 */
export async function approveVaultAccess(
  vaultId: string,
  requestId: string,
  approvedBy: string,
  durationHours: number = 24
): Promise<void> {
  const grant: VaultAccessGrant = {
    grantId: `grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    moderatorId: '', // Will be filled from request
    grantedBy: approvedBy,
    grantedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + durationHours * 60 * 60 * 1000),
    scope: 'FULL_CONTEXT', // Will be filled from request
    accessed: false,
  };
  
  // Get vault
  const vaultDoc = await db.collection(VAULT_COLLECTION).doc(vaultId).get();
  const vault = vaultDoc.data() as EvidenceVault;
  
  // Find request
  const request = vault.accessRequests.find(r => r.requestId === requestId);
  
  if (!request) {
    throw new Error('Access request not found');
  }
  
  // Update grant with request details
  grant.moderatorId = request.moderatorId;
  grant.scope = request.scopeRequested;
  
  // Update request as approved
  const updatedRequests = vault.accessRequests.map(r => 
    r.requestId === requestId ? { ...r, approvedBy, approvedAt: Timestamp.now() } : r
  );
  
  // Add grant
  await db.collection(VAULT_COLLECTION).doc(vaultId).update({
    accessRequests: updatedRequests,
    accessGranted: FieldValue.arrayUnion(grant),
  });
  
  // Log access grant
  await logVaultEvent('EVIDENCE_ACCESSED', approvedBy, vault.reportedUserId, {
    vaultId,
    moderatorId: grant.moderatorId,
    scope: grant.scope,
  });
}

/**
 * Access evidence from vault (moderator with valid grant)
 */
export async function accessVaultEvidence(
  vaultId: string,
  moderatorId: string
): Promise<{
  messages: any[];
  media: any[];
  metadata: any[];
}> {
  // Get vault
  const vaultDoc = await db.collection(VAULT_COLLECTION).doc(vaultId).get();
  
  if (!vaultDoc.exists) {
    throw new Error('Vault not found');
  }
  
  const vault = vaultDoc.data() as EvidenceVault;
  
  // Check access grant
  const grant = vault.accessGranted.find(
    g => g.moderatorId === moderatorId && !g.accessed && g.expiresAt.toMillis() > Date.now()
  );
  
  if (!grant) {
    throw new Error('No valid access grant found');
  }
  
  // Get encryption key
  const masterKey = await getEncryptionKey(vaultId);
  
  // Decrypt evidence based on scope
  let messages: any[] = [];
  let media: any[] = [];
  let metadata: any[] = [];
  
  if (grant.scope === 'MESSAGES_ONLY' || grant.scope === 'FULL_CONTEXT') {
    messages = vault.sealedMessages.map(sealed => 
      JSON.parse(decryptData(sealed.encryptedData, masterKey))
    );
  }
  
  if (grant.scope === 'MEDIA_ONLY' || grant.scope === 'FULL_CONTEXT') {
    media = vault.sealedMedia.map(sealed => 
      JSON.parse(decryptData(sealed.encryptedData, masterKey))
    );
  }
  
  if (grant.scope === 'FULL_CONTEXT') {
    metadata = vault.sealedMetadata.map(sealed => 
      JSON.parse(decryptData(sealed.encryptedData, masterKey))
    );
  }
  
  // Mark grant as accessed
  const updatedGrants = vault.accessGranted.map(g =>
    g.grantId === grant.grantId ? { ...g, accessed: true, accessedAt: Timestamp.now() } : g
  );
  
  await db.collection(VAULT_COLLECTION).doc(vaultId).update({
    accessGranted: updatedGrants,
  });
  
  return { messages, media, metadata };
}

// ============================================================================
// ENCRYPTION UTILITIES
// ============================================================================

/**
 * Generate secure encryption key
 */
function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt data with AES-256-GCM
 */
function encryptData(data: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(key, 'hex'),
    iv
  );
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    iv: iv.toString('hex'),
    encrypted,
    authTag: authTag.toString('hex'),
  });
}

/**
 * Decrypt data with AES-256-GCM
 */
function decryptData(encryptedData: string, key: string): string {
  const { iv, encrypted, authTag } = JSON.parse(encryptedData);
  
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Store encryption key separately (admin-only collection)
 */
async function storeEncryptionKey(vaultId: string, key: string): Promise<void> {
  await db.collection('vault_keys').doc(vaultId).set({
    key,
    createdAt: Timestamp.now(),
  });
}

/**
 * Get encryption key (admin-only)
 */
async function getEncryptionKey(vaultId: string): Promise<string> {
  const keyDoc = await db.collection('vault_keys').doc(vaultId).get();
  
  if (!keyDoc.exists) {
    throw new Error('Encryption key not found');
  }
  
  return keyDoc.data()?.key;
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Delete expired vaults (automated cleanup)
 */
export async function cleanupExpiredVaults(): Promise<number> {
  const now = Timestamp.now();
  
  const expiredVaults = await db.collection(VAULT_COLLECTION)
    .where('expiresAt', '<', now)
    .get();
  
  let deletedCount = 0;
  
  for (const vaultDoc of expiredVaults.docs) {
    const vaultId = vaultDoc.id;
    
    // Delete encryption key
    await db.collection('vault_keys').doc(vaultId).delete();
    
    // Delete vault
    await db.collection(VAULT_COLLECTION).doc(vaultId).delete();
    
    deletedCount++;
  }
  
  console.log(`[Evidence Vault] Cleaned up ${deletedCount} expired vaults`);
  
  return deletedCount;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log vault event
 */
async function logVaultEvent(
  eventType: SafetyAuditLog['eventType'],
  userId: string,
  affectedUserId: string,
  details: Record<string, any>
): Promise<void> {
  const log: SafetyAuditLog = {
    logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    userId,
    affectedUserId,
    details,
    timestamp: Timestamp.now(),
    gdprCompliant: true,
    retentionPeriod: 90,
  };
  
  await db.collection(SAFETY_AUDIT_COLLECTION).add(log);
}