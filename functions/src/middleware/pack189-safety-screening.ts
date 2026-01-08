import {
  FORBIDDEN_SEED_PATTERNS,
  ALLOWED_SEED_ARCHETYPES,
  SafetyScreeningResult,
  AiSeed,
  AiSeedMarketplaceListing,
} from '../types/pack189-ai-federation.types';

export class AiSeedSafetyScreening {
  private static forbiddenPatterns = new RegExp(
    FORBIDDEN_SEED_PATTERNS.join('|'),
    'gi'
  );

  static async screenSeedContent(seed: Partial<AiSeed>): Promise<SafetyScreeningResult> {
    const flags: string[] = [];
    let severity: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    const details: string[] = [];

    const textToScreen = [
      seed.name || '',
      seed.description || '',
      seed.lore?.backstory || '',
      seed.lore?.worldBuilding || '',
      seed.lore?.themes?.join(' ') || '',
      seed.personality?.archetype || '',
    ].join(' ').toLowerCase();

    if (this.checkForbiddenPatterns(textToScreen)) {
      flags.push('forbidden_content');
      severity = 'critical';
      details.push('Contains forbidden patterns related to NSFW, minors, or impersonation');
    }

    if (seed.personality?.archetype && !ALLOWED_SEED_ARCHETYPES.includes(seed.personality.archetype)) {
      if (!this.isCustomArchetypeSafe(seed.personality.archetype)) {
        flags.push('unsafe_archetype');
        severity = this.upgradeSeverity(severity, 'high');
        details.push('Archetype not in allowed list and contains unsafe elements');
      }
    }

    if (seed.lore?.themes) {
      const unsafeThemes = this.checkUnsafeThemes(seed.lore.themes);
      if (unsafeThemes.length > 0) {
        flags.push('unsafe_themes');
        severity = this.upgradeSeverity(severity, 'high');
        details.push(`Unsafe themes detected: ${unsafeThemes.join(', ')}`);
      }
    }

    if (seed.avatar) {
      const avatarCheck = await this.checkAvatarSafety(seed.avatar);
      if (!avatarCheck.passed) {
        flags.push(...avatarCheck.flags);
        severity = this.upgradeSeverity(severity, avatarCheck.severity);
        details.push(...avatarCheck.details);
      }
    }

    if (seed.communicationStyle?.preferredTopics) {
      const topicCheck = this.checkUnsafeTopics(seed.communicationStyle.preferredTopics);
      if (topicCheck.length > 0) {
        flags.push('unsafe_topics');
        severity = this.upgradeSeverity(severity, 'medium');
        details.push(`Unsafe topics detected: ${topicCheck.join(', ')}`);
      }
    }

    const passed = flags.length === 0;
    const aiConfidence = this.calculateConfidence(flags.length, severity);

    return {
      passed,
      flags,
      severity,
      details,
      aiConfidence,
    };
  }

  static async screenMarketplaceListing(listing: Partial<AiSeedMarketplaceListing>): Promise<SafetyScreeningResult> {
    const flags: string[] = [];
    let severity: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    const details: string[] = [];

    const textToScreen = [
      listing.title || '',
      listing.description || '',
      listing.tags?.join(' ') || '',
    ].join(' ').toLowerCase();

    if (this.checkForbiddenPatterns(textToScreen)) {
      flags.push('forbidden_marketplace_content');
      severity = 'critical';
      details.push('Marketplace listing contains forbidden patterns');
    }

    if (listing.tags) {
      const unsafeTags = this.checkUnsafeTags(listing.tags);
      if (unsafeTags.length > 0) {
        flags.push('unsafe_tags');
        severity = this.upgradeSeverity(severity, 'high');
        details.push(`Unsafe tags detected: ${unsafeTags.join(', ')}`);
      }
    }

    if (listing.type === 'subscription' && textToScreen.includes('romantic')) {
      flags.push('romantic_subscription');
      severity = this.upgradeSeverity(severity, 'critical');
      details.push('Romantic subscription services are forbidden');
    }

    const passed = flags.length === 0;
    const aiConfidence = this.calculateConfidence(flags.length, severity);

    return {
      passed,
      flags,
      severity,
      details,
      aiConfidence,
    };
  }

  static checkDuplicateOrImpersonation(seed: Partial<AiSeed>, existingSeeds: AiSeed[]): boolean {
    const nameToCheck = (seed.name || '').toLowerCase();
    
    for (const existing of existingSeeds) {
      const similarity = this.calculateStringSimilarity(nameToCheck, existing.name.toLowerCase());
      if (similarity > 0.85) {
        return true;
      }
    }

    const celebrityNames = this.getCelebrityNamesList();
    for (const celebrity of celebrityNames) {
      if (nameToCheck.includes(celebrity.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  static validateIPSignature(signature: string, seedData: any, timestamp: number): boolean {
    const now = Date.now();
    const hoursSinceCreation = (now - timestamp) / (1000 * 60 * 60);
    
    if (hoursSinceCreation < 0 || hoursSinceCreation > 24) {
      return false;
    }

    const expectedSignature = this.generateIPSignature(seedData, timestamp);
    return signature === expectedSignature;
  }

  static generateIPSignature(seedData: any, timestamp: number): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify(seedData) + timestamp.toString();
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  private static checkForbiddenPatterns(text: string): boolean {
    return this.forbiddenPatterns.test(text);
  }

  private static isCustomArchetypeSafe(archetype: string): boolean {
    const archLower = archetype.toLowerCase();
    const forbiddenArchetypes = [
      'sexual', 'erotic', 'romantic', 'girlfriend', 'boyfriend',
      'escort', 'minor', 'child', 'teen', 'celebrity', 'politician'
    ];
    
    return !forbiddenArchetypes.some(forbidden => archLower.includes(forbidden));
  }

  private static checkUnsafeThemes(themes: string[]): string[] {
    const unsafeThemes = [
      'erotic', 'sexual', 'romantic exclusive', 'jealousy',
      'minor', 'youth', 'political extremism', 'violence',
      'family dynamics', 'dependency'
    ];
    
    return themes.filter(theme => 
      unsafeThemes.some(unsafe => theme.toLowerCase().includes(unsafe))
    );
  }

  private static async checkAvatarSafety(avatar: any): Promise<SafetyScreeningResult> {
    const flags: string[] = [];
    let severity: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    const details: string[] = [];

    if (!avatar.licensed) {
      flags.push('unlicensed_avatar');
      severity = 'high';
      details.push('Avatar is not properly licensed');
    }

    if (avatar.ageRating !== '18+' && avatar.ageRating !== 'adult') {
      flags.push('inappropriate_age_rating');
      severity = 'critical';
      details.push('Avatar age rating must be 18+ or adult');
    }

    const unsafeStyles = ['child', 'young', 'teen', 'minor', 'youth'];
    if (avatar.styleTag && unsafeStyles.some(style => avatar.styleTag.toLowerCase().includes(style))) {
      flags.push('youth_coded_avatar');
      severity = 'critical';
      details.push('Avatar appears to be youth-coded');
    }

    return {
      passed: flags.length === 0,
      flags,
      severity,
      details,
      aiConfidence: this.calculateConfidence(flags.length, severity),
    };
  }

  private static checkUnsafeTopics(topics: string[]): string[] {
    const unsafeTopics = [
      'sexual content', 'erotic roleplay', 'romantic relationships',
      'minors', 'children', 'political extremism', 'violence',
      'harassment', 'stalking'
    ];
    
    return topics.filter(topic => 
      unsafeTopics.some(unsafe => topic.toLowerCase().includes(unsafe))
    );
  }

  private static checkUnsafeTags(tags: string[]): string[] {
    const unsafeTags = [
      'nsfw', 'erotic', 'sexual', 'romantic', 'girlfriend', 'boyfriend',
      'minor', 'teen', 'youth', 'celebrity', 'impersonation'
    ];
    
    return tags.filter(tag => 
      unsafeTags.some(unsafe => tag.toLowerCase().includes(unsafe))
    );
  }

  private static calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private static getCelebrityNamesList(): string[] {
    return [
      'elon musk', 'jeff bezos', 'bill gates', 'taylor swift',
      'kim kardashian', 'donald trump', 'joe biden', 'barack obama',
      'beyonce', 'kanye west', 'justin bieber', 'ariana grande',
    ];
  }

  private static upgradeSeverity(
    current: 'none' | 'low' | 'medium' | 'high' | 'critical',
    new_level: 'none' | 'low' | 'medium' | 'high' | 'critical'
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    const levels = ['none', 'low', 'medium', 'high', 'critical'];
    const currentIndex = levels.indexOf(current);
    const newIndex = levels.indexOf(new_level);
    return levels[Math.max(currentIndex, newIndex)] as any;
  }

  private static calculateConfidence(flagCount: number, severity: string): number {
    if (severity === 'critical') return 0.95;
    if (severity === 'high') return 0.85;
    if (severity === 'medium') return 0.70;
    if (severity === 'low') return 0.55;
    return 0.40;
  }
}

export async function screenBeforeCreation(seedData: Partial<AiSeed>): Promise<SafetyScreeningResult> {
  return AiSeedSafetyScreening.screenSeedContent(seedData);
}

export async function screenBeforePublish(listing: Partial<AiSeedMarketplaceListing>): Promise<SafetyScreeningResult> {
  return AiSeedSafetyScreening.screenMarketplaceListing(listing);
}