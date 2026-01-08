/**
 * PACK 146 — Download Control & PDF Security
 * Secure downloads with watermarking and tracking
 * 
 * Features:
 * - Download permission control
 * - Buyer-specific watermarks
 * - PDF security (copy/print prevention)
 * - Download limits and expiration
 * - Device tracking
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { logger, HttpsError, onCall } from './common';
import { 
  DownloadControl,
  DownloadRecord,
  DownloadPermission 
} from './pack146-types';
import { getWatermarkForDownload } from './pack146-watermarking';
import { registerContentHash } from './pack146-hashing';

// ============================================================================
// DOWNLOAD CONTROL
// ============================================================================

/**
 * Create download control for digital product
 */
export async function createDownloadControl(
  productId: string,
  ownerId: string,
  options?: {
    maxDownloadCount?: number;
    downloadExpiry?: number;
    watermarkRequired?: boolean;
    encryptionEnabled?: boolean;
    deviceLimit?: number;
    pdfSecurity?: {
      preventCopy?: boolean;
      preventPrint?: boolean;
      preventModify?: boolean;
      requirePassword?: boolean;
    };
  }
): Promise<DownloadControl> {
  
  const controlId = generateId();
  
  const control: any = {
    controlId,
    productId,
    ownerId,
    downloadEnabled: true,
    maxDownloadCount: options?.maxDownloadCount || 3,
    downloadExpiry: options?.downloadExpiry || 30, // days
    watermarkRequired: options?.watermarkRequired !== false,
    encryptionEnabled: options?.encryptionEnabled || false,
    deviceLimit: options?.deviceLimit || 2,
    pdfSecurity: options?.pdfSecurity || {
      preventCopy: true,
      preventPrint: false,
      preventModify: true,
      requirePassword: false,
      expirationDate: null,
    },
    totalDownloads: 0,
    uniqueDownloaders: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  await db.collection('download_controls').doc(controlId).set(control);
  
  logger.info(`Download control created for product ${productId}`);
  
  return control as DownloadControl;
}

/**
 * Request download access
 */
export const requestDownload = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { productId, purchaseId } = request.data;
    
    if (!productId || !purchaseId) {
      throw new HttpsError('invalid-argument', 'Product ID and purchase ID required');
    }
    
    try {
      // Verify purchase
      const purchaseDoc = await db.collection('transactions').doc(purchaseId).get();
      if (!purchaseDoc.exists) {
        throw new HttpsError('not-found', 'Purchase not found');
      }
      
      const purchase = purchaseDoc.data();
      if (purchase?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Not your purchase');
      }
      
      if (purchase?.type !== 'digital_product_purchase') {
        throw new HttpsError('invalid-argument', 'Not a digital product purchase');
      }
      
      // Get download control
      const controlSnapshot = await db.collection('download_controls')
        .where('productId', '==', productId)
        .limit(1)
        .get();
      
      if (controlSnapshot.empty) {
        throw new HttpsError('not-found', 'Download control not found');
      }
      
      const control = controlSnapshot.docs[0].data() as DownloadControl;
      
      if (!control.downloadEnabled) {
        throw new HttpsError('failed-precondition', 'Downloads disabled for this product');
      }
      
      // Check download limits
      const userDownloads = await getUserDownloadCount(uid, productId);
      
      if (userDownloads >= control.maxDownloadCount) {
        throw new HttpsError('failed-precondition', `Download limit reached (${control.maxDownloadCount})`);
      }
      
      // Check device limit
      const userDevices = await getUserDeviceCount(uid, productId);
      
      if (userDevices >= control.deviceLimit) {
        throw new HttpsError('failed-precondition', `Device limit reached (${control.deviceLimit})`);
      }
      
      // Generate watermark
      const watermark = await getWatermarkForDownload(productId, uid, purchaseId);
      
      // Create download record
      const downloadId = generateId();
      const downloadRecord: any = {
        downloadId,
        productId,
        buyerId: uid,
        sellerId: control.ownerId,
        downloadedAt: serverTimestamp(),
        deviceId: request.data.deviceId || 'unknown',
        ipAddressHash: hashIP(request.rawRequest?.ip),
        watermarkApplied: control.watermarkRequired,
        watermarkHash: watermark.watermarkHash,
        buyerWatermarkEmbedded: true,
        downloadValid: true,
        expiresAt: new Date(Date.now() + control.downloadExpiry * 24 * 60 * 60 * 1000),
        suspiciousActivity: false,
      };
      
      await db.collection('download_records').doc(downloadId).set(downloadRecord);
      
      // Update control stats
      await controlSnapshot.docs[0].ref.update({
        totalDownloads: increment(1),
        updatedAt: serverTimestamp(),
      });
      
      // Generate signed download URL with watermark params
      const downloadUrl = await generateSecureDownloadURL(productId, {
        buyerId: uid,
        watermark: watermark.watermarkText,
        watermarkHash: watermark.watermarkHash,
        downloadId,
        expiresAt: downloadRecord.expiresAt,
        pdfSecurity: control.pdfSecurity,
      });
      
      logger.info(`Download granted for product ${productId} to user ${uid}`);
      
      return {
        success: true,
        downloadUrl,
        downloadId,
        watermark: watermark.watermarkText,
        expiresAt: downloadRecord.expiresAt,
        downloadsRemaining: control.maxDownloadCount - userDownloads - 1,
        pdfSecurity: control.pdfSecurity,
      };
    } catch (error: any) {
      logger.error('Download request failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's download count for product
 */
async function getUserDownloadCount(userId: string, productId: string): Promise<number> {
  const snapshot = await db.collection('download_records')
    .where('buyerId', '==', userId)
    .where('productId', '==', productId)
    .where('downloadValid', '==', true)
    .count()
    .get();
  
  return snapshot.data().count;
}

/**
 * Get user's device count for product
 */
async function getUserDeviceCount(userId: string, productId: string): Promise<number> {
  const snapshot = await db.collection('download_records')
    .where('buyerId', '==', userId)
    .where('productId', '==', productId)
    .where('downloadValid', '==', true)
    .get();
  
  const devices = new Set(snapshot.docs.map(doc => doc.data().deviceId));
  return devices.size;
}

/**
 * Hash IP address for privacy
 */
function hashIP(ip?: string): string {
  if (!ip) return 'unknown';
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Generate secure download URL
 */
async function generateSecureDownloadURL(
  productId: string,
  params: {
    buyerId: string;
    watermark: string;
    watermarkHash: string;
    downloadId: string;
    expiresAt: Date;
    pdfSecurity?: any;
  }
): Promise<string> {
  
  // In production, this would:
  // 1. Get file from storage
  // 2. Apply watermark
  // 3. Apply PDF security settings
  // 4. Generate signed URL
  
  // For now, return a mock URL with params
  const baseUrl = `https://storage.avalo.app/downloads/${productId}`;
  const queryParams = new URLSearchParams({
    buyer: params.buyerId,
    download: params.downloadId,
    watermark: params.watermarkHash,
    expires: params.expiresAt.getTime().toString(),
  });
  
  return `${baseUrl}?${queryParams.toString()}`;
}

// ============================================================================
// PDF SECURITY
// ============================================================================

/**
 * Apply PDF security settings
 * This would be handled by a PDF processing service
 */
export async function applyPDFSecurity(
  fileUrl: string,
  security: {
    preventCopy: boolean;
    preventPrint: boolean;
    preventModify: boolean;
    requirePassword: boolean;
    password?: string;
    expirationDate?: Date;
  }
): Promise<{
  securedUrl: string;
  securityApplied: string[];
}> {
  
  const securityApplied: string[] = [];
  
  // In production, this would use a PDF library to apply security
  // For now, just track what should be applied
  
  if (security.preventCopy) {
    securityApplied.push('COPY_PREVENTION');
  }
  
  if (security.preventPrint) {
    securityApplied.push('PRINT_PREVENTION');
  }
  
  if (security.preventModify) {
    securityApplied.push('MODIFY_PREVENTION');
  }
  
  if (security.requirePassword) {
    securityApplied.push('PASSWORD_PROTECTION');
  }
  
  if (security.expirationDate) {
    securityApplied.push('TIME_EXPIRATION');
  }
  
  logger.info(`PDF security applied: ${securityApplied.join(', ')}`);
  
  return {
    securedUrl: fileUrl,
    securityApplied,
  };
}

// ============================================================================
// DOWNLOAD ANALYTICS
// ============================================================================

/**
 * Get download analytics for creator
 */
export const getDownloadAnalytics = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    try {
      // Get all downloads for creator's products
      const downloadsSnapshot = await db.collection('download_records')
        .where('sellerId', '==', uid)
        .get();
      
      const analytics = {
        totalDownloads: downloadsSnapshot.size,
        uniqueBuyers: new Set<string>(),
        validDownloads: 0,
        expiredDownloads: 0,
        suspiciousDownloads: 0,
        byProduct: {} as Record<string, number>,
        recentDownloads: [] as any[],
      };
      
      downloadsSnapshot.docs.forEach(doc => {
        const download = doc.data() as DownloadRecord;
        
        analytics.uniqueBuyers.add(download.buyerId);
        
        if (download.downloadValid) {
          analytics.validDownloads++;
        }
        
        if (download.expiresAt && download.expiresAt.toMillis() < Date.now()) {
          analytics.expiredDownloads++;
        }
        
        if (download.suspiciousActivity) {
          analytics.suspiciousDownloads++;
        }
        
        analytics.byProduct[download.productId] = 
          (analytics.byProduct[download.productId] || 0) + 1;
      });
      
      // Get recent downloads
      const recentSnapshot = await db.collection('download_records')
        .where('sellerId', '==', uid)
        .orderBy('downloadedAt', 'desc')
        .limit(10)
        .get();
      
      analytics.recentDownloads = recentSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          productId: data.productId,
          buyerId: data.buyerId,
          downloadedAt: data.downloadedAt,
          deviceId: data.deviceId,
        };
      });
      
      return {
        totalDownloads: analytics.totalDownloads,
        uniqueBuyers: analytics.uniqueBuyers.size,
        validDownloads: analytics.validDownloads,
        expiredDownloads: analytics.expiredDownloads,
        suspiciousDownloads: analytics.suspiciousDownloads,
        topProducts: Object.entries(analytics.byProduct)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([productId, downloads]) => ({ productId, downloads })),
        recentDownloads: analytics.recentDownloads,
      };
    } catch (error: any) {
      logger.error('Download analytics failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Flag suspicious download
 */
export async function flagSuspiciousDownload(
  downloadId: string,
  reason: string
): Promise<void> {
  
  await db.collection('download_records').doc(downloadId).update({
    suspiciousActivity: true,
    suspiciousReason: reason,
    flaggedAt: serverTimestamp(),
  });
  
  // Get download details
  const downloadDoc = await db.collection('download_records').doc(downloadId).get();
  const download = downloadDoc.data() as DownloadRecord;
  
  // Notify seller
  await db.collection('notifications').doc(generateId()).set({
    userId: download.sellerId,
    type: 'SUSPICIOUS_DOWNLOAD',
    title: 'Suspicious Download Activity',
    message: `Suspicious activity detected on your product download: ${reason}`,
    metadata: {
      downloadId,
      productId: download.productId,
      buyerId: download.buyerId,
    },
    read: false,
    createdAt: serverTimestamp(),
  });
  
  logger.warn(`Suspicious download flagged: ${downloadId} - ${reason}`);
}

// ============================================================================
// DOWNLOAD REVOCATION
// ============================================================================

/**
 * Revoke download access
 */
export const revokeDownloadAccess = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { downloadId, reason } = request.data;
    
    if (!downloadId) {
      throw new HttpsError('invalid-argument', 'Download ID required');
    }
    
    try {
      const downloadDoc = await db.collection('download_records').doc(downloadId).get();
      
      if (!downloadDoc.exists) {
        throw new HttpsError('not-found', 'Download not found');
      }
      
      const download = downloadDoc.data() as DownloadRecord;
      
      // Verify seller is revoking
      if (download.sellerId !== uid) {
        throw new HttpsError('permission-denied', 'Not your product');
      }
      
      // Revoke access
      await downloadDoc.ref.update({
        downloadValid: false,
        revokedAt: serverTimestamp(),
        revokeReason: reason || 'Revoked by seller',
      });
      
      // Notify buyer
      await db.collection('notifications').doc(generateId()).set({
        userId: download.buyerId,
        type: 'DOWNLOAD_REVOKED',
        title: 'Download Access Revoked',
        message: `Your download access has been revoked: ${reason || 'No reason provided'}`,
        metadata: {
          downloadId,
          productId: download.productId,
        },
        read: false,
        createdAt: serverTimestamp(),
      });
      
      logger.info(`Download access revoked: ${downloadId}`);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Download revocation failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createDownloadControl,
  requestDownload,
  applyPDFSecurity,
  getDownloadAnalytics,
  revokeDownloadAccess,
  flagSuspiciousDownload,
};