/**
 * PACK 135: Offline Presence Types
 * Type definitions for QR codes, NFC cards, and print materials
 */

export type PosterFormat = 'square' | 'vertical' | 'horizontal' | 'business-card' | 'sticker' | 'badge';
export type PosterStatus = 'pending' | 'approved' | 'rejected' | 'unverified';
export type AssetType = 'qr' | 'poster' | 'nfc';

export interface QRProfileData {
  userId: string;
  username: string;
  displayName: string;
  profilePhoto?: string;
  tagline?: string;
  dynamicLink: string;
  staticQrUrl: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface PosterTemplate {
  format: PosterFormat;
  width: number;
  height: number;
  dpi: number;
  elements: PosterElement[];
}

export interface PosterElement {
  type: 'text' | 'image' | 'qr';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  imageUrl?: string;
  qrData?: string;
}

export interface OfflineAsset {
  id: string;
  userId: string;
  type: AssetType;
  format?: PosterFormat;
  status: PosterStatus;
  content: {
    displayName: string;
    tagline?: string;
    profilePhoto?: string;
    qrCode: string;
    customText?: string;
  };
  urls: {
    preview?: string;
    downloadPng?: string;
    downloadPdf?: string;
    printReady?: string;
  };
  moderation?: {
    submittedAt: Date;
    reviewedAt?: Date;
    reviewerId?: string;
    rejectionReason?: string;
    flags: string[];
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: number;
  };
}

export interface QRScanLog {
  id: string;
  profileUserId: string;
  scannedAt: Date;
  scanLocation?: {
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  deviceInfo?: {
    type?: 'mobile' | 'desktop' | 'tablet';
    os?: string;
    browser?: string;
  };
  assetId?: string;
  anonymous: true;
}

export interface ScanAnalytics {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  date: string;
  totalScans: number;
  uniqueDevices: number;
  topCities: Array<{ city: string; count: number }>;
  deviceBreakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
}

export interface ModerationResult {
  passed: boolean;
  flags: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  details: {
    nsfwDetected?: boolean;
    escortLanguageDetected?: boolean;
    externalLinksDetected?: boolean;
    prohibitedKeywords?: string[];
    suspiciousPatterns?: string[];
  };
}

export interface NFCCardData {
  userId: string;
  cardId: string;
  profileUrl: string;
  activatedAt: Date;
  lastUsed?: Date;
  isActive: boolean;
}

export interface EventPosterBundle {
  eventId: string;
  eventName: string;
  organizer: string;
  creators: Array<{
    userId: string;
    displayName: string;
    profilePhoto?: string;
    tagline?: string;
  }>;
  posters: OfflineAsset[];
  createdAt: Date;
}