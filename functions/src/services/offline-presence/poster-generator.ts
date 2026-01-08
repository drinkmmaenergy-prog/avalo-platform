/**
 * PACK 135: Poster Generator
 * Creates print-ready posters, business cards, stickers, and event materials
 */

import { OfflineAsset, PosterFormat, PosterTemplate, PosterElement } from './types';
import { db, generateId, serverTimestamp } from '../../init';
import { moderatePoster, checkRateLimit } from './moderation';
import { generateQRImageUrl } from './qr-generator';

export class PosterGenerator {
  private static readonly BASE_URL = process.env.AVALO_BASE_URL || 'https://avalo.app';

  /**
   * Poster format templates
   */
  private static readonly TEMPLATES: Record<PosterFormat, PosterTemplate> = {
    'square': {
      format: 'square',
      width: 1080,
      height: 1080,
      dpi: 300,
      elements: [],
    },
    'vertical': {
      format: 'vertical',
      width: 1080,
      height: 1920,
      dpi: 300,
      elements: [],
    },
    'horizontal': {
      format: 'horizontal',
      width: 1920,
      height: 1080,
      dpi: 300,
      elements: [],
    },
    'business-card': {
      format: 'business-card',
      width: 1050,
      height: 600,
      dpi: 300,
      elements: [],
    },
    'sticker': {
      format: 'sticker',
      width: 800,
      height: 800,
      dpi: 300,
      elements: [],
    },
    'badge': {
      format: 'badge',
      width: 900,
      height: 1200,
      dpi: 300,
      elements: [],
    },
  };

  /**
   * Generate poster for user profile
   */
  static async generatePoster(
    userId: string,
    format: PosterFormat,
    content: {
      displayName: string;
      tagline?: string;
      profilePhoto?: string;
      customText?: string;
    }
  ): Promise<OfflineAsset> {
    const rateLimitCheck = await checkRateLimit(userId, 'poster');
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded. Reset at: ${rateLimitCheck.resetAt}`);
    }

    const moderationResult = await moderatePoster(content);

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data()!;
    const username = userData.username || userId;
    const profileUrl = `${this.BASE_URL}/u/${username}`;
    const qrCodeUrl = generateQRImageUrl(profileUrl, { size: 500 });

    const template = this.TEMPLATES[format];
    const posterElements = this.buildPosterElements(
      template,
      content,
      qrCodeUrl
    );

    const assetId = generateId();
    const asset: OfflineAsset = {
      id: assetId,
      userId,
      type: 'poster',
      format,
      status: moderationResult.passed ? 'approved' : 'pending',
      content: {
        displayName: content.displayName,
        tagline: content.tagline,
        profilePhoto: content.profilePhoto,
        qrCode: qrCodeUrl,
        customText: content.customText,
      },
      urls: {
        preview: `${this.BASE_URL}/api/posters/${assetId}/preview`,
        downloadPng: `${this.BASE_URL}/api/posters/${assetId}/download?format=png`,
        downloadPdf: `${this.BASE_URL}/api/posters/${assetId}/download?format=pdf`,
        printReady: `${this.BASE_URL}/api/posters/${assetId}/print`,
      },
      moderation: {
        submittedAt: new Date(),
        flags: moderationResult.flags,
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
    };

    if (!moderationResult.passed) {
      asset.moderation!.rejectionReason = `Moderation flags: ${moderationResult.flags.join(', ')}`;
    }

    await db.collection('offline_assets').doc(assetId).set({
      ...asset,
      'metadata.createdAt': serverTimestamp(),
      'metadata.updatedAt': serverTimestamp(),
      'moderation.submittedAt': serverTimestamp(),
    });

    return asset;
  }

  /**
   * Build poster layout elements
   */
  private static buildPosterElements(
    template: PosterTemplate,
    content: {
      displayName: string;
      tagline?: string;
      profilePhoto?: string;
      customText?: string;
    },
    qrCodeUrl: string
  ): PosterElement[] {
    const elements: PosterElement[] = [];
    const { width, height, format } = template;

    if (format === 'business-card') {
      if (content.profilePhoto) {
        elements.push({
          type: 'image',
          x: 50,
          y: 50,
          width: 200,
          height: 200,
          imageUrl: content.profilePhoto,
        });
      }

      elements.push({
        type: 'text',
        x: 270,
        y: 100,
        width: 700,
        height: 80,
        content: content.displayName,
        fontSize: 48,
        fontFamily: 'Arial Bold',
        color: '#000000',
      });

      if (content.tagline) {
        elements.push({
          type: 'text',
          x: 270,
          y: 180,
          width: 700,
          height: 60,
          content: content.tagline,
          fontSize: 24,
          fontFamily: 'Arial',
          color: '#666666',
        });
      }

      elements.push({
        type: 'qr',
        x: width - 250,
        y: height - 250,
        width: 200,
        height: 200,
        qrData: qrCodeUrl,
      });
    } else if (format === 'badge') {
      if (content.profilePhoto) {
        elements.push({
          type: 'image',
          x: width / 2 - 150,
          y: 100,
          width: 300,
          height: 300,
          imageUrl: content.profilePhoto,
        });
      }

      elements.push({
        type: 'text',
        x: 50,
        y: 450,
        width: width - 100,
        height: 100,
        content: content.displayName,
        fontSize: 64,
        fontFamily: 'Arial Bold',
        color: '#000000',
      });

      if (content.tagline) {
        elements.push({
          type: 'text',
          x: 50,
          y: 560,
          width: width - 100,
          height: 80,
          content: content.tagline,
          fontSize: 36,
          fontFamily: 'Arial',
          color: '#666666',
        });
      }

      elements.push({
        type: 'qr',
        x: width / 2 - 200,
        y: height - 500,
        width: 400,
        height: 400,
        qrData: qrCodeUrl,
      });
    } else {
      if (content.profilePhoto) {
        elements.push({
          type: 'image',
          x: width / 2 - 200,
          y: 100,
          width: 400,
          height: 400,
          imageUrl: content.profilePhoto,
        });
      }

      elements.push({
        type: 'text',
        x: 100,
        y: 550,
        width: width - 200,
        height: 120,
        content: content.displayName,
        fontSize: 72,
        fontFamily: 'Arial Bold',
        color: '#000000',
      });

      if (content.tagline) {
        elements.push({
          type: 'text',
          x: 100,
          y: 680,
          width: width - 200,
          height: 80,
          content: content.tagline,
          fontSize: 42,
          fontFamily: 'Arial',
          color: '#666666',
        });
      }

      elements.push({
        type: 'qr',
        x: width / 2 - 250,
        y: height - 600,
        width: 500,
        height: 500,
        qrData: qrCodeUrl,
      });
    }

    return elements;
  }

  /**
   * Generate event poster bundle
   */
  static async generateEventBundle(
    eventId: string,
    eventData: {
      name: string;
      organizer: string;
      creators: Array<{
        userId: string;
        displayName: string;
        profilePhoto?: string;
        tagline?: string;
      }>;
    }
  ): Promise<string[]> {
    const posterIds: string[] = [];

    for (const creator of eventData.creators) {
      try {
        const poster = await this.generatePoster(
          creator.userId,
          'vertical',
          {
            displayName: creator.displayName,
            tagline: creator.tagline,
            profilePhoto: creator.profilePhoto,
            customText: `${eventData.name} - ${eventData.organizer}`,
          }
        );
        posterIds.push(poster.id);
      } catch (error) {
        console.error(`Failed to generate poster for ${creator.userId}:`, error);
      }
    }

    await db.collection('event_poster_bundles').add({
      eventId,
      eventName: eventData.name,
      organizer: eventData.organizer,
      posterIds,
      createdAt: serverTimestamp(),
    });

    return posterIds;
  }

  /**
   * Submit poster for moderation review
   */
  static async submitForReview(assetId: string): Promise<void> {
    const assetDoc = await db.collection('offline_assets').doc(assetId).get();
    if (!assetDoc.exists) {
      throw new Error('Asset not found');
    }

    await db.collection('offline_assets').doc(assetId).update({
      status: 'pending',
      'moderation.submittedAt': serverTimestamp(),
    });
  }

  /**
   * Approve or reject poster
   */
  static async moderatePosterAsset(
    assetId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<void> {
    const updateData: any = {
      status: decision,
      'moderation.reviewedAt': serverTimestamp(),
      'moderation.reviewerId': reviewerId,
      'metadata.updatedAt': serverTimestamp(),
    };

    if (decision === 'rejected' && rejectionReason) {
      updateData['moderation.rejectionReason'] = rejectionReason;
    }

    await db.collection('offline_assets').doc(assetId).update(updateData);
  }

  /**
   * Get user's offline assets
   */
  static async getUserAssets(userId: string): Promise<OfflineAsset[]> {
    const snapshot = await db
      .collection('offline_assets')
      .where('userId', '==', userId)
      .orderBy('metadata.createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map(doc => doc.data() as OfflineAsset);
  }
}

export const generatePoster = PosterGenerator.generatePoster.bind(PosterGenerator);
export const generateEventBundle = PosterGenerator.generateEventBundle.bind(PosterGenerator);
export const submitForReview = PosterGenerator.submitForReview.bind(PosterGenerator);
export const moderatePosterAsset = PosterGenerator.moderatePosterAsset.bind(PosterGenerator);
export const getUserAssets = PosterGenerator.getUserAssets.bind(PosterGenerator);