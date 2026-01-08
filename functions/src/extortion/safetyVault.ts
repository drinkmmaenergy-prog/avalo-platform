import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { SafetyVaultRecord } from './types';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class SafetyVault {
  private db: admin.firestore.Firestore;
  private storage: admin.storage.Storage;

  constructor() {
    this.db = admin.firestore();
    this.storage = admin.storage();
  }

  private generateEncryptionKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  private encrypt(data: string, key: Buffer): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  private decrypt(
    encrypted: string,
    key: Buffer,
    iv: string,
    authTag: string
  ): string {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async storeEvidence(
    victimId: string,
    caseId: string,
    recordType: 'message' | 'screenshot' | 'voice' | 'video' | 'document',
    content: string | Buffer,
    metadata: {
      source: string;
      originalFilename?: string;
      mimeType?: string;
    }
  ): Promise<string> {
    const key = this.generateEncryptionKey();
    
    const contentString = Buffer.isBuffer(content) 
      ? content.toString('base64')
      : content;

    const { encrypted, iv, authTag } = this.encrypt(contentString, key);

    const encryptedContent = JSON.stringify({
      data: encrypted,
      iv,
      authTag
    });

    const verificationHash = crypto
      .createHash('sha256')
      .update(contentString)
      .digest('hex');

    const recordId = this.db.collection('safety_vault_records').doc().id;

    await this.storeEncryptionKey(victimId, recordId, key);

    const record: Partial<SafetyVaultRecord> = {
      victimId,
      caseId,
      recordType,
      encryptedContent,
      encryptionKey: recordId,
      fileSize: Buffer.byteLength(encryptedContent, 'utf8'),
      mimeType: metadata.mimeType || 'text/plain',
      originalFilename: metadata.originalFilename,
      metadata: {
        uploadedAt: new Date(),
        source: metadata.source,
        verificationHash
      },
      accessLog: [],
      moderatorAccessGranted: false,
      legalExportRequested: false,
      createdAt: new Date()
    };

    await this.db
      .collection('safety_vault_records')
      .doc(recordId)
      .set(record);

    return recordId;
  }

  private async storeEncryptionKey(
    userId: string,
    recordId: string,
    key: Buffer
  ): Promise<void> {
    const keyDoc = await this.db
      .collection('users')
      .doc(userId)
      .collection('vault_keys')
      .doc(recordId)
      .get();

    const masterKey = await this.getMasterKey(userId);
    const { encrypted, iv, authTag } = this.encrypt(
      key.toString('hex'),
      masterKey
    );

    await this.db
      .collection('safety_vault_keys')
      .doc(recordId)
      .set({
        userId,
        encryptedKey: JSON.stringify({ encrypted, iv, authTag }),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  private async getMasterKey(userId: string): Promise<Buffer> {
    const userKeyDoc = await this.db
      .collection('users')
      .doc(userId)
      .collection('private')
      .doc('master_key')
      .get();

    if (!userKeyDoc.exists) {
      const newKey = this.generateEncryptionKey();
      await this.db
        .collection('users')
        .doc(userId)
        .collection('private')
        .doc('master_key')
        .set({
          key: newKey.toString('hex'),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      return newKey;
    }

    return Buffer.from(userKeyDoc.data()!.key, 'hex');
  }

  async retrieveEvidence(
    recordId: string,
    userId: string,
    action: 'view' | 'export' | 'share'
  ): Promise<{
    content: string;
    metadata: any;
  }> {
    const recordDoc = await this.db
      .collection('safety_vault_records')
      .doc(recordId)
      .get();

    if (!recordDoc.exists) {
      throw new Error('Record not found');
    }

    const record = recordDoc.data() as SafetyVaultRecord;

    if (record.victimId !== userId) {
      throw new Error('Unauthorized access attempt');
    }

    await this.logAccess(recordId, userId, action);

    const keyDoc = await this.db
      .collection('safety_vault_keys')
      .doc(recordId)
      .get();

    if (!keyDoc.exists) {
      throw new Error('Encryption key not found');
    }

    const masterKey = await this.getMasterKey(userId);
    const encryptedKeyData = JSON.parse(keyDoc.data()!.encryptedKey);
    
    const keyHex = this.decrypt(
      encryptedKeyData.encrypted,
      masterKey,
      encryptedKeyData.iv,
      encryptedKeyData.authTag
    );

    const key = Buffer.from(keyHex, 'hex');

    const encryptedData = JSON.parse(record.encryptedContent);
    const content = this.decrypt(
      encryptedData.data,
      key,
      encryptedData.iv,
      encryptedData.authTag
    );

    return {
      content,
      metadata: record.metadata
    };
  }

  private async logAccess(
    recordId: string,
    userId: string,
    action: 'view' | 'export' | 'share'
  ): Promise<void> {
    await this.db
      .collection('safety_vault_records')
      .doc(recordId)
      .update({
        accessLog: admin.firestore.FieldValue.arrayUnion({
          userId,
          timestamp: new Date(),
          action,
          ipAddress: null
        })
      });

    await this.db.collection('vault_access_logs').add({
      recordId,
      userId,
      action,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: null
    });
  }

  async grantModeratorAccess(
    recordId: string,
    moderatorId: string,
    reason: string
  ): Promise<void> {
    const recordRef = this.db
      .collection('safety_vault_records')
      .doc(recordId);

    await recordRef.update({
      moderatorAccessGranted: true,
      moderatorAccess: {
        grantedBy: 'system',
        grantedTo: moderatorId,
        reason,
        grantedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    await this.db.collection('audit_logs').add({
      type: 'moderator_vault_access',
      recordId,
      moderatorId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async revokeModeratorAccess(recordId: string): Promise<void> {
    await this.db
      .collection('safety_vault_records')
      .doc(recordId)
      .update({
        moderatorAccessGranted: false,
        moderatorAccess: admin.firestore.FieldValue.delete()
      });
  }

  async exportForLegal(
    caseId: string,
    requestedBy: string,
    jurisdiction: string
  ): Promise<{
    exportId: string;
    downloadUrl: string;
    expiresAt: Date;
  }> {
    const records = await this.db
      .collection('safety_vault_records')
      .where('caseId', '==', caseId)
      .get();

    const exportData: any[] = [];

    for (const doc of records.docs) {
      const record = doc.data() as SafetyVaultRecord;
      
      const keyDoc = await this.db
        .collection('safety_vault_keys')
        .doc(doc.id)
        .get();

      if (keyDoc.exists) {
        const masterKey = await this.getMasterKey(record.victimId);
        const encryptedKeyData = JSON.parse(keyDoc.data()!.encryptedKey);
        
        const keyHex = this.decrypt(
          encryptedKeyData.encrypted,
          masterKey,
          encryptedKeyData.iv,
          encryptedKeyData.authTag
        );

        const key = Buffer.from(keyHex, 'hex');
        const encryptedData = JSON.parse(record.encryptedContent);
        const content = this.decrypt(
          encryptedData.data,
          key,
          encryptedData.iv,
          encryptedData.authTag
        );

        exportData.push({
          recordId: doc.id,
          type: record.recordType,
          content,
          metadata: record.metadata,
          verificationHash: record.metadata.verificationHash
        });
      }
    }

    const exportJson = JSON.stringify(exportData, null, 2);
    const exportId = this.db.collection('legal_export_requests').doc().id;
    
    const bucket = this.storage.bucket();
    const file = bucket.file(`legal-exports/${exportId}.json`);
    
    await file.save(exportJson, {
      metadata: {
        contentType: 'application/json',
        metadata: {
          caseId,
          requestedBy,
          jurisdiction,
          exportedAt: new Date().toISOString()
        }
      }
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db
      .collection('legal_export_requests')
      .doc(exportId)
      .set({
        caseId,
        requestedBy,
        jurisdiction,
        status: 'completed',
        exportFormat: 'json',
        downloadUrl: url,
        expiresAt,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    await this.db.collection('audit_logs').add({
      type: 'legal_export',
      caseId,
      exportId,
      requestedBy,
      jurisdiction,
      recordCount: exportData.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { exportId, downloadUrl: url, expiresAt };
  }

  async deleteVaultRecords(caseId: string, reason: string): Promise<number> {
    const records = await this.db
      .collection('safety_vault_records')
      .where('caseId', '==', caseId)
      .get();

    let deletedCount = 0;

    for (const doc of records.docs) {
      await this.db
        .collection('safety_vault_keys')
        .doc(doc.id)
        .delete();

      await doc.ref.delete();
      deletedCount++;
    }

    await this.db.collection('audit_logs').add({
      type: 'vault_deletion',
      caseId,
      reason,
      recordCount: deletedCount,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return deletedCount;
  }

  async getVaultStatistics(victimId: string): Promise<{
    totalRecords: number;
    recordsByType: Record<string, number>;
    oldestRecord?: Date;
    newestRecord?: Date;
    totalSize: number;
  }> {
    const records = await this.db
      .collection('safety_vault_records')
      .where('victimId', '==', victimId)
      .get();

    const stats = {
      totalRecords: records.size,
      recordsByType: {} as Record<string, number>,
      oldestRecord: undefined as Date | undefined,
      newestRecord: undefined as Date | undefined,
      totalSize: 0
    };

    records.docs.forEach((doc) => {
      const data = doc.data() as SafetyVaultRecord;
      
      stats.recordsByType[data.recordType] = 
        (stats.recordsByType[data.recordType] || 0) + 1;
      
      stats.totalSize += data.fileSize;

      if (!stats.oldestRecord || data.createdAt < stats.oldestRecord) {
        stats.oldestRecord = data.createdAt;
      }
      if (!stats.newestRecord || data.createdAt > stats.newestRecord) {
        stats.newestRecord = data.createdAt;
      }
    });

    return stats;
  }
}

export const safetyVault = new SafetyVault();