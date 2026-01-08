/**
 * PACK 158 — Evidence Encryption Utilities
 * 
 * AES-256-GCM encryption for legal evidence vault
 * Chain of custody tracking with cryptographic hashing
 */

import * as crypto from 'crypto';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { SealedLegalEvidence } from './types/pack158-legal-evidence.types';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export async function encryptEvidence(
  data: string | Buffer,
  evidenceId: string
): Promise<{
  encryptedPayload: string;
  encryptionIV: string;
  authTag: string;
  encryptionKeyId: string;
  hashChecksum: string;
}> {
  const masterKey = await getOrCreateMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const dataString = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
  const dataBuffer = Buffer.from(dataString, 'utf-8');
  
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(masterKey, 'hex'),
    iv
  );
  
  let encrypted = cipher.update(dataBuffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  const hashChecksum = crypto
    .createHash('sha256')
    .update(dataBuffer)
    .digest('hex');
  
  return {
    encryptedPayload: encrypted.toString('base64'),
    encryptionIV: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encryptionKeyId: 'master_key_v1',
    hashChecksum,
  };
}

export async function decryptEvidence(
  encryptedPayload: string,
  encryptionIV: string,
  authTag: string,
  encryptionKeyId: string
): Promise<string> {
  const masterKey = await getMasterKey(encryptionKeyId);
  
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(masterKey, 'hex'),
    Buffer.from(encryptionIV, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(Buffer.from(encryptedPayload, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf-8');
}

export function verifyEvidenceIntegrity(
  decryptedData: string,
  originalHash: string
): boolean {
  const currentHash = crypto
    .createHash('sha256')
    .update(Buffer.from(decryptedData, 'utf-8'))
    .digest('hex');
  
  return currentHash === originalHash;
}

export async function sealEvidenceItem(
  evidenceId: string,
  data: string | Buffer,
  metadata: {
    evidenceType: SealedLegalEvidence['evidenceType'];
    timestamp: Timestamp;
    sourceType: SealedLegalEvidence['sourceType'];
    sourceId: string;
    legalRelevanceScore: number;
    violatesLaw: string[];
    capturedBy: string;
  }
): Promise<SealedLegalEvidence> {
  const encryption = await encryptEvidence(data, evidenceId);
  
  return {
    evidenceId,
    evidenceType: metadata.evidenceType,
    encryptedPayload: encryption.encryptedPayload,
    encryptionIV: encryption.encryptionIV,
    authTag: encryption.authTag,
    timestamp: metadata.timestamp,
    sourceType: metadata.sourceType,
    sourceId: metadata.sourceId,
    legalRelevanceScore: metadata.legalRelevanceScore,
    violatesLaw: metadata.violatesLaw,
    capturedBy: metadata.capturedBy,
    capturedAt: Timestamp.now(),
    hashChecksum: encryption.hashChecksum,
  };
}

export async function unsealEvidenceItem(
  sealed: SealedLegalEvidence
): Promise<string> {
  const decrypted = await decryptEvidence(
    sealed.encryptedPayload,
    sealed.encryptionIV,
    sealed.authTag,
    'master_key_v1'
  );
  
  const isValid = verifyEvidenceIntegrity(decrypted, sealed.hashChecksum);
  
  if (!isValid) {
    throw new Error('Evidence integrity check failed - potential tampering detected');
  }
  
  return decrypted;
}

async function getOrCreateMasterKey(): Promise<string> {
  const keyId = 'master_key_v1';
  const keyRef = db.collection('_vault_encryption_keys').doc(keyId);
  
  const keyDoc = await keyRef.get();
  
  if (keyDoc.exists) {
    return keyDoc.data()?.key;
  }
  
  const newKey = crypto.randomBytes(KEY_LENGTH).toString('hex');
  
  await keyRef.set({
    key: newKey,
    createdAt: Timestamp.now(),
    algorithm: ENCRYPTION_ALGORITHM,
    keyLength: KEY_LENGTH * 8,
    version: 1,
    rotationScheduled: false,
  });
  
  console.log('[Evidence Encryption] Created new master encryption key');
  
  return newKey;
}

async function getMasterKey(keyId: string): Promise<string> {
  const keyRef = db.collection('_vault_encryption_keys').doc(keyId);
  const keyDoc = await keyRef.get();
  
  if (!keyDoc.exists) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }
  
  return keyDoc.data()?.key;
}

export async function rotateEncryptionKey(): Promise<void> {
  console.log('[Evidence Encryption] Starting key rotation...');
  
  const oldKeyId = 'master_key_v1';
  const newKeyId = 'master_key_v2';
  
  const newKey = crypto.randomBytes(KEY_LENGTH).toString('hex');
  
  await db.collection('_vault_encryption_keys').doc(newKeyId).set({
    key: newKey,
    createdAt: Timestamp.now(),
    algorithm: ENCRYPTION_ALGORITHM,
    keyLength: KEY_LENGTH * 8,
    version: 2,
    rotationScheduled: false,
  });
  
  await db.collection('_vault_encryption_keys').doc(oldKeyId).update({
    rotationScheduled: true,
    rotatedAt: Timestamp.now(),
    replacedBy: newKeyId,
  });
  
  console.log('[Evidence Encryption] Key rotation complete - re-encryption required for active vaults');
}

export function generateAccessSignature(
  accessorId: string,
  vaultId: string,
  timestamp: Timestamp
): string {
  const data = `${accessorId}:${vaultId}:${timestamp.toMillis()}`;
  
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

export function verifyAccessSignature(
  signature: string,
  accessorId: string,
  vaultId: string,
  timestamp: Timestamp
): boolean {
  const expectedSignature = generateAccessSignature(accessorId, vaultId, timestamp);
  return signature === expectedSignature;
}

export function generateVaultId(
  caseId: string,
  reportedUserId: string
): string {
  const data = `${caseId}:${reportedUserId}:${Date.now()}`;
  
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 32);
}

export function obfuscateUserData(data: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
  
  return `redacted_${hash.substring(0, 8)}`;
}