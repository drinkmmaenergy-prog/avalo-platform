/**
 * PACK 135: QR Code Generator
 * Generates secure, dynamic QR codes for Avalo profiles
 */

import { QRProfileData } from './types';
import { db, generateId } from '../../init';
import { validateQRContent } from './moderation';

export class QRGenerator {
  private static readonly BASE_URL = process.env.AVALO_BASE_URL || 'https://avalo.app';
  private static readonly QR_API_URL = 'https://api.qrserver.com/v1/create-qr-code/';

  /**
   * Generate QR profile data for a user
   */
  static async generateQRProfile(userId: string): Promise<QRProfileData> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data()!;
    const username = userData.username || userId;
    const displayName = userData.displayName || username;
    const profilePhoto = userData.profilePhoto;
    const tagline = userData.tagline;

    const dynamicLink = `${this.BASE_URL}/u/${username}`;

    const qrValidation = validateQRContent(dynamicLink);
    if (!qrValidation.passed) {
      throw new Error(`QR content validation failed: ${qrValidation.flags.join(', ')}`);
    }

    const qrId = generateId();
    const staticQrUrl = this.generateQRImageUrl(dynamicLink, {
      size: 300,
      format: 'png',
    });

    const qrData: QRProfileData = {
      userId,
      username,
      displayName,
      profilePhoto,
      tagline,
      dynamicLink,
      staticQrUrl,
      createdAt: new Date(),
    };

    await db.collection('offline_qr_profiles').doc(qrId).set({
      ...qrData,
      createdAt: new Date(),
    });

    return qrData;
  }

  /**
   * Generate QR code image URL
   */
  static generateQRImageUrl(data: string, options: {
    size?: number;
    format?: 'png' | 'svg';
    errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  } = {}): string {
    const {
      size = 300,
      format = 'png',
      errorCorrection = 'M',
    } = options;

    const params = new URLSearchParams({
      data: encodeURIComponent(data),
      size: `${size}x${size}`,
      format,
      ecc: errorCorrection,
    });

    return `${this.QR_API_URL}?${params.toString()}`;
  }

  /**
   * Generate multiple QR variations for different use cases
   */
  static async generateQRVariations(userId: string): Promise<{
    small: string;
    medium: string;
    large: string;
    printReady: string;
    svg: string;
  }> {
    const qrData = await this.generateQRProfile(userId);
    const { dynamicLink } = qrData;

    return {
      small: this.generateQRImageUrl(dynamicLink, { size: 150 }),
      medium: this.generateQRImageUrl(dynamicLink, { size: 300 }),
      large: this.generateQRImageUrl(dynamicLink, { size: 500 }),
      printReady: this.generateQRImageUrl(dynamicLink, { 
        size: 1000, 
        errorCorrection: 'H' 
      }),
      svg: this.generateQRImageUrl(dynamicLink, { 
        size: 300, 
        format: 'svg' 
      }),
    };
  }

  /**
   * Get or create QR profile for user
   */
  static async getOrCreateQRProfile(userId: string): Promise<QRProfileData> {
    const existingQR = await db
      .collection('offline_qr_profiles')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!existingQR.empty) {
      const qrDoc = existingQR.docs[0];
      return qrDoc.data() as QRProfileData;
    }

    return this.generateQRProfile(userId);
  }

  /**
   * Regenerate QR profile (e.g., after username change)
   */
  static async regenerateQRProfile(userId: string): Promise<QRProfileData> {
    const existingQRs = await db
      .collection('offline_qr_profiles')
      .where('userId', '==', userId)
      .get();

    const batch = db.batch();
    existingQRs.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return this.generateQRProfile(userId);
  }

  /**
   * Validate QR redirect URL
   */
  static validateQRUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const allowedDomains = ['avalo.app', 'www.avalo.app', 'localhost'];
      return allowedDomains.some(domain => parsedUrl.hostname === domain);
    } catch {
      return false;
    }
  }
}

export const generateQRProfile = QRGenerator.generateQRProfile.bind(QRGenerator);
export const generateQRVariations = QRGenerator.generateQRVariations.bind(QRGenerator);
export const getOrCreateQRProfile = QRGenerator.getOrCreateQRProfile.bind(QRGenerator);
export const regenerateQRProfile = QRGenerator.regenerateQRProfile.bind(QRGenerator);
export const generateQRImageUrl = QRGenerator.generateQRImageUrl.bind(QRGenerator);