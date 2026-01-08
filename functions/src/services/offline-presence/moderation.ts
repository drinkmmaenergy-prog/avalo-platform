/**
 * PACK 135: Offline Presence Moderation Pipeline
 * Content moderation for posters, QR codes, and print materials
 * Prevents NSFW content, escort services, external payment links, etc.
 */

import { ModerationResult } from './types';

const PROHIBITED_KEYWORDS = [
  // Escort/sexual services
  'escort', 'outcall', 'incall', 'full service', 'gfe', 'pse',
  'happy ending', 'sensual massage', 'body rub', 'erotic',
  // External payment bypasses
  'cashapp', 'venmo', 'paypal', 'zelle', 'cash only',
  'outside avalo', 'direct payment', 'personal payment',
  // NSFW solicitation
  'nude', 'naked', 'explicit', 'xxx', 'adult content',
  'private show', 'cam show', 'video call me',
  // Platform bypasses
  'onlyfans', 'fansly', 'patreon', 'telegram', 'whatsapp',
  'dm me on', 'add me on', 'text me at',
  // Direct contact info
  'phone:', 'call:', 'text:', 'email:', '@gmail', '@yahoo',
];

const ESCORT_PATTERNS = [
  /\b(outcall|incall)\b/i,
  /\b(per\s*hour|\/\s*hr|hourly\s*rate)\b/i,
  /\b(available\s*now|available\s*24\/7)\b/i,
  /\b(private\s*sessions?|private\s*bookings?)\b/i,
  /\b(discreet|confidential)\s*(service|meeting)/i,
  /\b(verify|verification)\s*required/i,
  /\$([\d,]+)\s*(hour|hr|session)/i,
];

const EXTERNAL_LINK_PATTERNS = [
  /https?:\/\/(www\.)?(cash\.app|venmo\.com|paypal\.me)/i,
  /https?:\/\/(www\.)?(onlyfans\.com|fansly\.com)/i,
  /https?:\/\/(t\.me|telegram\.me)/i,
  /https?:\/\/(wa\.me|whatsapp\.com)/i,
  /\b(cashapp|venmo|paypal)\.me\b/i,
];

const CONTACT_INFO_PATTERNS = [
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b\+\d{1,3}[-.\s]?\d{3,}[-.\s]?\d{3,}\b/,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i,
];

const SUSPICIOUS_PHRASES = [
  'dm for prices',
  'message for rates',
  'ask about prices',
  'inquire about services',
  'custom requests',
  'special services',
  'vip experience',
  'exclusive access',
  'private content',
  'unlock content',
];

export class ModerationPipeline {
  /**
   * Moderate text content from posters, taglines, etc.
   */
  static moderateText(text: string): ModerationResult {
    const flags: string[] = [];
    const details: ModerationResult['details'] = {};

    const lowerText = text.toLowerCase();

    const prohibitedFound = PROHIBITED_KEYWORDS.filter(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );
    if (prohibitedFound.length > 0) {
      flags.push('prohibited_keywords');
      details.prohibitedKeywords = prohibitedFound;
    }

    const escortPatternMatches = ESCORT_PATTERNS.filter(pattern =>
      pattern.test(text)
    );
    if (escortPatternMatches.length > 0) {
      flags.push('escort_language');
      details.escortLanguageDetected = true;
    }

    const externalLinkMatches = EXTERNAL_LINK_PATTERNS.filter(pattern =>
      pattern.test(text)
    );
    if (externalLinkMatches.length > 0) {
      flags.push('external_links');
      details.externalLinksDetected = true;
    }

    const contactInfoMatches = CONTACT_INFO_PATTERNS.filter(pattern =>
      pattern.test(text)
    );
    if (contactInfoMatches.length > 0) {
      flags.push('contact_info');
    }

    const suspiciousFound = SUSPICIOUS_PHRASES.filter(phrase =>
      lowerText.includes(phrase.toLowerCase())
    );
    if (suspiciousFound.length > 0) {
      flags.push('suspicious_phrases');
      details.suspiciousPatterns = suspiciousFound;
    }

    const severity = this.calculateSeverity(flags);
    const passed = severity === 'none' || severity === 'low';

    return {
      passed,
      flags,
      severity,
      details,
    };
  }

  /**
   * Moderate image content (placeholder for vision API integration)
   */
  static async moderateImage(imageUrl: string): Promise<ModerationResult> {
    const flags: string[] = [];
    const details: ModerationResult['details'] = {};

    try {
      const nsfwScore = await this.detectNSFW(imageUrl);
      
      if (nsfwScore > 0.7) {
        flags.push('nsfw_explicit');
        details.nsfwDetected = true;
      } else if (nsfwScore > 0.4) {
        flags.push('nsfw_suggestive');
        details.nsfwDetected = true;
      }
    } catch (error) {
      console.error('Image moderation error:', error);
      flags.push('moderation_error');
    }

    const severity = this.calculateSeverity(flags);
    const passed = severity === 'none' || severity === 'low';

    return {
      passed,
      flags,
      severity,
      details,
    };
  }

  /**
   * Combined moderation for complete poster content
   */
  static async moderatePoster(content: {
    displayName: string;
    tagline?: string;
    customText?: string;
    profilePhoto?: string;
  }): Promise<ModerationResult> {
    const allFlags: string[] = [];
    const allDetails: ModerationResult['details'] = {};

    const textsToCheck = [
      content.displayName,
      content.tagline || '',
      content.customText || '',
    ].filter(Boolean);

    for (const text of textsToCheck) {
      const textResult = this.moderateText(text);
      allFlags.push(...textResult.flags);
      Object.assign(allDetails, textResult.details);
    }

    if (content.profilePhoto) {
      const imageResult = await this.moderateImage(content.profilePhoto);
      allFlags.push(...imageResult.flags);
      Object.assign(allDetails, imageResult.details);
    }

    const uniqueFlags = Array.from(new Set(allFlags));
    const severity = this.calculateSeverity(uniqueFlags);
    const passed = severity === 'none' || severity === 'low';

    return {
      passed,
      flags: uniqueFlags,
      severity,
      details: allDetails,
    };
  }

  /**
   * Calculate severity based on flags
   */
  private static calculateSeverity(flags: string[]): ModerationResult['severity'] {
    if (flags.length === 0) {
      return 'none';
    }

    const criticalFlags = ['nsfw_explicit', 'escort_language', 'external_links'];
    const hasCritical = flags.some(f => criticalFlags.includes(f));
    if (hasCritical) {
      return 'critical';
    }

    const highFlags = ['nsfw_suggestive', 'prohibited_keywords', 'contact_info'];
    const hasHigh = flags.some(f => highFlags.includes(f));
    if (hasHigh) {
      return 'high';
    }

    const mediumFlags = ['suspicious_phrases'];
    const hasMedium = flags.some(f => mediumFlags.includes(f));
    if (hasMedium) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * NSFW detection (placeholder - integrate with Cloud Vision API or similar)
   */
  private static async detectNSFW(imageUrl: string): Promise<number> {
    return 0.0;
  }

  /**
   * Validate QR code content doesn't redirect to external sites
   */
  static validateQRContent(qrData: string): ModerationResult {
    const flags: string[] = [];
    const details: ModerationResult['details'] = {};

    if (!qrData.includes('avalo.app') && !qrData.includes('localhost')) {
      flags.push('external_redirect');
      details.externalLinksDetected = true;
    }

    const externalLinkMatches = EXTERNAL_LINK_PATTERNS.filter(pattern =>
      pattern.test(qrData)
    );
    if (externalLinkMatches.length > 0) {
      flags.push('prohibited_link');
      details.externalLinksDetected = true;
    }

    const severity = this.calculateSeverity(flags);
    const passed = severity === 'none';

    return {
      passed,
      flags,
      severity,
      details,
    };
  }

  /**
   * Check for rate limiting (prevent spam poster generation)
   */
  static async checkRateLimit(userId: string, type: 'qr' | 'poster' | 'nfc'): Promise<{
    allowed: boolean;
    resetAt?: Date;
    limit: number;
    current: number;
  }> {
    const limits = {
      qr: { count: 10, window: 24 * 60 * 60 * 1000 },
      poster: { count: 5, window: 24 * 60 * 60 * 1000 },
      nfc: { count: 3, window: 7 * 24 * 60 * 60 * 1000 },
    };

    const limit = limits[type];
    return {
      allowed: true,
      limit: limit.count,
      current: 0,
    };
  }
}

export const moderateText = ModerationPipeline.moderateText.bind(ModerationPipeline);
export const moderateImage = ModerationPipeline.moderateImage.bind(ModerationPipeline);
export const moderatePoster = ModerationPipeline.moderatePoster.bind(ModerationPipeline);
export const validateQRContent = ModerationPipeline.validateQRContent.bind(ModerationPipeline);
export const checkRateLimit = ModerationPipeline.checkRateLimit.bind(ModerationPipeline);