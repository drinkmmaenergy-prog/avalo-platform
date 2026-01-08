/**
 * PACK 160 - Encryption Integration Layer
 * Integration with messaging, media, purchases, and calls for encrypted storage
 */

import { db, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { generateLocalEncryptionKeys, destroyLocalEncryptionKeys } from './pack160-encryption-keys';
import { logSecurityEvent } from './pack160-device-security';
import * as crypto from 'crypto';

export interface EncryptedMessage {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedContent: string;
  encryptedAttachments?: EncryptedAttachment[];
  iv: string;
  authTag: string;
  keyId: string;
  timestamp: Timestamp;
  containerType: 'chat';
}

export interface EncryptedAttachment {
  id: string;
  encryptedData: string;
  mimeType: string;
  size: number;
  iv: string;
  authTag: string;
}

export interface EncryptedMedia {
  id: string;
  userId: string;
  encryptedData: string;
  encryptedThumbnail?: string;
  mimeType: string;
  size: number;
  iv: string;
  authTag: string;
  keyId: string;
  watermark?: string;
  isPaid: boolean;
  containerType: 'media';
  timestamp: Timestamp;
}

export interface EncryptedPurchase {
  id: string;
  userId: string;
  encryptedDetails: string;
  encryptedReceipt?: string;
  iv: string;
  authTag: string;
  keyId: string;
  containerType: 'purchases';
  timestamp: Timestamp;
}

export interface EncryptedCallData {
  id: string;
  userId: string;
  encryptedBuffer?: string;
  encryptedMetadata: string;
  iv: string;
  authTag: string;
  keyId: string;
  containerType: 'voice';
  timestamp: Timestamp;
  isLegal: boolean;
}

/**
 * Encrypt message content for secure storage
 */
export async function encryptMessage(
  senderId: string,
  recipientId: string,
  content: string,
  attachments?: Array<{ data: Buffer; mimeType: string }>
): Promise<EncryptedMessage> {
  const keyResult = await generateLocalEncryptionKeys(senderId, 'chat');
  
  const key = Buffer.from(keyResult.encryptedMasterKey, 'base64').slice(16, 48);
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encryptedContent = cipher.update(content, 'utf8', 'base64');
  encryptedContent += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  let encryptedAttachments: EncryptedAttachment[] | undefined;
  
  if (attachments && attachments.length > 0) {
    encryptedAttachments = [];
    for (const attachment of attachments) {
      const attachmentIv = crypto.randomBytes(12);
      const attachmentCipher = crypto.createCipheriv('aes-256-gcm', key, attachmentIv);
      
      let encryptedData = attachmentCipher.update(attachment.data);
      encryptedData = Buffer.concat([encryptedData, attachmentCipher.final()]);
      const attachmentAuthTag = attachmentCipher.getAuthTag();
      
      encryptedAttachments.push({
        id: crypto.randomBytes(16).toString('hex'),
        encryptedData: encryptedData.toString('base64'),
        mimeType: attachment.mimeType,
        size: attachment.data.length,
        iv: attachmentIv.toString('base64'),
        authTag: attachmentAuthTag.toString('base64')
      });
    }
  }
  
  const messageId = crypto.randomBytes(16).toString('hex');
  
  const encryptedMessage: EncryptedMessage = {
    id: messageId,
    senderId,
    recipientId,
    encryptedContent,
    encryptedAttachments,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: keyResult.keyId,
    timestamp: Timestamp.now(),
    containerType: 'chat'
  };
  
  await db.collection('encrypted_messages').doc(messageId).set(encryptedMessage);
  
  await logSecurityEvent(senderId, 'key_generated', 'low', {
    messageId,
    hasAttachments: !!encryptedAttachments
  }, 'messaging_encryption');
  
  return encryptedMessage;
}

/**
 * Decrypt message content
 */
export async function decryptMessage(
  messageId: string,
  userId: string,
  encryptionKey: string
): Promise<{ content: string; attachments?: Array<{ data: Buffer; mimeType: string }> }> {
  const messageDoc = await db.collection('encrypted_messages').doc(messageId).get();
  
  if (!messageDoc.exists) {
    throw new Error('Message not found');
  }
  
  const message = messageDoc.data() as EncryptedMessage;
  
  if (message.senderId !== userId && message.recipientId !== userId) {
    throw new Error('Unauthorized message access');
  }
  
  const key = Buffer.from(encryptionKey, 'base64').slice(16, 48);
  const iv = Buffer.from(message.iv, 'base64');
  const authTag = Buffer.from(message.authTag, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let content = decipher.update(message.encryptedContent, 'base64', 'utf8');
  content += decipher.final('utf8');
  
  let attachments: Array<{ data: Buffer; mimeType: string }> | undefined;
  
  if (message.encryptedAttachments) {
    attachments = [];
    for (const attachment of message.encryptedAttachments) {
      const attachmentIv = Buffer.from(attachment.iv, 'base64');
      const attachmentAuthTag = Buffer.from(attachment.authTag, 'base64');
      const attachmentDecipher = crypto.createDecipheriv('aes-256-gcm', key, attachmentIv);
      attachmentDecipher.setAuthTag(attachmentAuthTag);
      
      const encryptedData = Buffer.from(attachment.encryptedData, 'base64');
      let data = attachmentDecipher.update(encryptedData);
      data = Buffer.concat([data, attachmentDecipher.final()]);
      
      attachments.push({
        data,
        mimeType: attachment.mimeType
      });
    }
  }
  
  return { content, attachments };
}

/**
 * Encrypt media for secure storage with optional watermarking
 */
export async function encryptMedia(
  userId: string,
  mediaData: Buffer,
  mimeType: string,
  isPaid: boolean = false,
  watermarkText?: string
): Promise<EncryptedMedia> {
  const keyResult = await generateLocalEncryptionKeys(userId, 'media');
  
  const key = Buffer.from(keyResult.encryptedMasterKey, 'base64').slice(16, 48);
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encryptedData = cipher.update(mediaData);
  encryptedData = Buffer.concat([encryptedData, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const mediaId = crypto.randomBytes(16).toString('hex');
  
  const encryptedMedia: EncryptedMedia = {
    id: mediaId,
    userId,
    encryptedData: encryptedData.toString('base64'),
    mimeType,
    size: mediaData.length,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: keyResult.keyId,
    watermark: watermarkText,
    isPaid,
    containerType: 'media',
    timestamp: Timestamp.now()
  };
  
  await db.collection('encrypted_media').doc(mediaId).set(encryptedMedia);
  
  await logSecurityEvent(userId, 'key_generated', 'low', {
    mediaId,
    isPaid,
    hasWatermark: !!watermarkText
  }, 'media_encryption');
  
  return encryptedMedia;
}

/**
 * Decrypt media content
 */
export async function decryptMedia(
  mediaId: string,
  userId: string,
  encryptionKey: string
): Promise<Buffer> {
  const mediaDoc = await db.collection('encrypted_media').doc(mediaId).get();
  
  if (!mediaDoc.exists) {
    throw new Error('Media not found');
  }
  
  const media = mediaDoc.data() as EncryptedMedia;
  
  if (media.userId !== userId) {
    throw new Error('Unauthorized media access');
  }
  
  const key = Buffer.from(encryptionKey, 'base64').slice(16, 48);
  const iv = Buffer.from(media.iv, 'base64');
  const authTag = Buffer.from(media.authTag, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  const encryptedData = Buffer.from(media.encryptedData, 'base64');
  let data = decipher.update(encryptedData);
  data = Buffer.concat([data, decipher.final()]);
  
  return data;
}

/**
 * Encrypt purchase details
 */
export async function encryptPurchase(
  userId: string,
  purchaseDetails: Record<string, any>,
  receiptData?: string
): Promise<EncryptedPurchase> {
  const keyResult = await generateLocalEncryptionKeys(userId, 'purchases');
  
  const key = Buffer.from(keyResult.encryptedMasterKey, 'base64').slice(16, 48);
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const detailsJson = JSON.stringify(purchaseDetails);
  let encryptedDetails = cipher.update(detailsJson, 'utf8', 'base64');
  encryptedDetails += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  let encryptedReceipt: string | undefined;
  if (receiptData) {
    const receiptCipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    encryptedReceipt = receiptCipher.update(receiptData, 'utf8', 'base64');
    encryptedReceipt += receiptCipher.final('base64');
  }
  
  const purchaseId = crypto.randomBytes(16).toString('hex');
  
  const encryptedPurchase: EncryptedPurchase = {
    id: purchaseId,
    userId,
    encryptedDetails,
    encryptedReceipt,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: keyResult.keyId,
    containerType: 'purchases',
    timestamp: Timestamp.now()
  };
  
  await db.collection('encrypted_purchases').doc(purchaseId).set(encryptedPurchase);
  
  await logSecurityEvent(userId, 'key_generated', 'low', {
    purchaseId
  }, 'purchase_encryption');
  
  return encryptedPurchase;
}

/**
 * Decrypt purchase details
 */
export async function decryptPurchase(
  purchaseId: string,
  userId: string,
  encryptionKey: string
): Promise<{ details: Record<string, any>; receipt?: string }> {
  const purchaseDoc = await db.collection('encrypted_purchases').doc(purchaseId).get();
  
  if (!purchaseDoc.exists) {
    throw new Error('Purchase not found');
  }
  
  const purchase = purchaseDoc.data() as EncryptedPurchase;
  
  if (purchase.userId !== userId) {
    throw new Error('Unauthorized purchase access');
  }
  
  const key = Buffer.from(encryptionKey, 'base64').slice(16, 48);
  const iv = Buffer.from(purchase.iv, 'base64');
  const authTag = Buffer.from(purchase.authTag, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let detailsJson = decipher.update(purchase.encryptedDetails, 'base64', 'utf8');
  detailsJson += decipher.final('utf8');
  const details = JSON.parse(detailsJson);
  
  let receipt: string | undefined;
  if (purchase.encryptedReceipt) {
    const receiptDecipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    receiptDecipher.setAuthTag(authTag);
    receipt = receiptDecipher.update(purchase.encryptedReceipt, 'base64', 'utf8');
    receipt += receiptDecipher.final('utf8');
  }
  
  return { details, receipt };
}

/**
 * Encrypt call/voice data (where legally permitted)
 */
export async function encryptCallData(
  userId: string,
  metadata: Record<string, any>,
  bufferData?: Buffer,
  isLegal: boolean = true
): Promise<EncryptedCallData> {
  if (!isLegal) {
    throw new Error('Call recording not permitted in this jurisdiction');
  }
  
  const keyResult = await generateLocalEncryptionKeys(userId, 'voice');
  
  const key = Buffer.from(keyResult.encryptedMasterKey, 'base64').slice(16, 48);
  const iv = crypto.randomBytes(12);
  
  const metadataCipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const metadataJson = JSON.stringify(metadata);
  let encryptedMetadata = metadataCipher.update(metadataJson, 'utf8', 'base64');
  encryptedMetadata += metadataCipher.final('base64');
  const authTag = metadataCipher.getAuthTag();
  
  let encryptedBuffer: string | undefined;
  if (bufferData) {
    const bufferCipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = bufferCipher.update(bufferData);
    encrypted = Buffer.concat([encrypted, bufferCipher.final()]);
    encryptedBuffer = encrypted.toString('base64');
  }
  
  const callId = crypto.randomBytes(16).toString('hex');
  
  const encryptedCall: EncryptedCallData = {
    id: callId,
    userId,
    encryptedBuffer,
    encryptedMetadata,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: keyResult.keyId,
    containerType: 'voice',
    timestamp: Timestamp.now(),
    isLegal
  };
  
  await db.collection('encrypted_calls').doc(callId).set(encryptedCall);
  
  await logSecurityEvent(userId, 'key_generated', 'low', {
    callId,
    hasBuffer: !!bufferData
  }, 'call_encryption');
  
  return encryptedCall;
}

/**
 * Decrypt call data
 */
export async function decryptCallData(
  callId: string,
  userId: string,
  encryptionKey: string
): Promise<{ metadata: Record<string, any>; buffer?: Buffer }> {
  const callDoc = await db.collection('encrypted_calls').doc(callId).get();
  
  if (!callDoc.exists) {
    throw new Error('Call data not found');
  }
  
  const call = callDoc.data() as EncryptedCallData;
  
  if (call.userId !== userId) {
    throw new Error('Unauthorized call data access');
  }
  
  const key = Buffer.from(encryptionKey, 'base64').slice(16, 48);
  const iv = Buffer.from(call.iv, 'base64');
  const authTag = Buffer.from(call.authTag, 'base64');
  
  const metadataDecipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  metadataDecipher.setAuthTag(authTag);
  
  let metadataJson = metadataDecipher.update(call.encryptedMetadata, 'base64', 'utf8');
  metadataJson += metadataDecipher.final('utf8');
  const metadata = JSON.parse(metadataJson);
  
  let buffer: Buffer | undefined;
  if (call.encryptedBuffer) {
    const bufferDecipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    bufferDecipher.setAuthTag(authTag);
    const encryptedData = Buffer.from(call.encryptedBuffer, 'base64');
    let data = bufferDecipher.update(encryptedData);
    data = Buffer.concat([data, bufferDecipher.final()]);
    buffer = data;
  }
  
  return { metadata, buffer };
}

/**
 * Delete all encrypted data for a user (account deletion)
 */
export async function deleteAllEncryptedData(userId: string): Promise<void> {
  const batch = db.batch();
  
  const collections = [
    'encrypted_messages',
    'encrypted_media',
    'encrypted_purchases',
    'encrypted_calls'
  ];
  
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName)
      .where('userId', '==', userId)
      .limit(500)
      .get();
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
  }
  
  await batch.commit();
  
  await destroyLocalEncryptionKeys(userId, 'deletion');
  
  await logSecurityEvent(userId, 'keys_destroyed', 'medium', {
    reason: 'account_deletion',
    timestamp: Date.now()
  }, 'encryption_cleanup');
}

/**
 * Wipe encrypted data on logout
 */
export async function wipeEncryptedDataOnLogout(
  userId: string,
  deviceFingerprint: string
): Promise<void> {
  await destroyLocalEncryptionKeys(userId, 'logout');
  
  await logSecurityEvent(userId, 'keys_destroyed', 'low', {
    reason: 'logout',
    deviceFingerprint,
    timestamp: Date.now()
  }, 'logout_cleanup');
}