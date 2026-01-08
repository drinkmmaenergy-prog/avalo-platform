/**
 * PACK 431: Store Media Automation (Screenshots & Video)
 * 
 * Dynamic screenshot and video preview generation per country
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ScreenshotTemplate {
  type: "dating" | "chat_monetization" | "calendar" | "events" | "ai_companions";
  priority: number;
  title: string;
  subtitle: string;
  features: string[];
  legalClaims?: string[];
}

export interface ScreenshotConfig {
  country: string;
  language: string;
  currency: string;
  safeMode: boolean;
  platform: "ios" | "android";
  device: "phone" | "tablet";
}

export interface ScreenshotOutput {
  id: string;
  url: string;
  type: string;
  platform: string;
  device: string;
  size: string;
  country: string;
  language: string;
  generatedAt: Date;
}

export interface VideoPreviewConfig {
  country: string;
  language: string;
  duration: number; // seconds
  format: "mp4" | "mov";
  features: string[];
  safeMode: boolean;
}

// ============================================================================
// SCREENSHOT TEMPLATES
// ============================================================================

export const SCREENSHOT_TEMPLATES: Record<string, ScreenshotTemplate> = {
  dating: {
    type: "dating",
    priority: 1,
    title: "Find Your Match",
    subtitle: "Smart matching algorithm",
    features: [
      "Intelligent matching",
      "Nearby singles",
      "Verified profiles",
      "Safe messaging"
    ],
    legalClaims: [
      "18+ only",
      "Identity verification required"
    ]
  },
  
  chat_monetization: {
    type: "chat_monetization",
    priority: 2,
    title: "Premium Chat",
    subtitle: "Connect with premium members",
    features: [
      "Exclusive chat access",
      "Priority messaging",
      "Video chat",
      "Voice messages"
    ],
    legalClaims: [
      "Subscription required",
      "In-app purchases"
    ]
  },
  
  calendar: {
    type: "calendar",
    priority: 3,
    title: "Never Miss a Date",
    subtitle: "Integrated calendar",
    features: [
      "Automatic scheduling",
      "Reminder notifications",
      "Sync with calendar apps",
      "Event planning"
    ]
  },
  
  events: {
    type: "events",
    priority: 4,
    title: "Real-World Meetups",
    subtitle: "Create and join events",
    features: [
      "Local events",
      "Group activities",
      "Party invites",
      "Social meetups"
    ],
    legalClaims: [
      "Age restrictions may apply",
      "Event organizer responsibility"
    ]
  },
  
  ai_companions: {
    type: "ai_companions",
    priority: 5,
    title: "AI Chat Companions",
    subtitle: "Intelligent conversations",
    features: [
      "24/7 availability",
      "Personality customization",
      "Learning conversations",
      "Entertainment"
    ],
    legalClaims: [
      "AI-generated content",
      "For entertainment purposes"
    ]
  }
};

// ============================================================================
// DEVICE SPECIFICATIONS
// ============================================================================

export const DEVICE_SPECS = {
  ios: {
    phone: {
      "6.5": { width: 1242, height: 2688, name: "iPhone 14 Pro Max" },
      "5.5": { width: 1242, height: 2208, name: "iPhone 8 Plus" }
    },
    tablet: {
      "12.9": { width: 2048, height: 2732, name: "iPad Pro 12.9\"" }
    }
  },
  android: {
    phone: {
      standard: { width: 1080, height: 1920, name: "Standard Phone" },
      large: { width: 1440, height: 2960, name: "Large Phone" }
    },
    tablet: {
      standard: { width: 1600, height: 2560, name: "Standard Tablet" }
    }
  }
};

// ============================================================================
// CURRENCY MAPPING
// ============================================================================

export const CURRENCY_PER_COUNTRY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  EU: "EUR",
  PL: "PLN",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  PT: "EUR",
  RO: "RON",
  BG: "BGN",
  CZ: "CZK",
  SK: "EUR",
  HR: "EUR",
  SL: "EUR",
  LT: "EUR",
  LV: "EUR",
  ET: "EUR",
  UA: "UAH",
  SR: "RSD",
  EL: "EUR"
};

// ============================================================================
// STORE MEDIA ENGINE
// ============================================================================

export class StoreMediaEngine {
  private db: FirebaseFirestore.Firestore;
  private storage: admin.storage.Storage;

  constructor(db: FirebaseFirestore.Firestore, storage: admin.storage.Storage) {
    this.db = db;
    this.storage = storage;
  }

  /**
   * Generate all screenshots for a specific configuration
   */
  async generateScreenshots(config: ScreenshotConfig): Promise<ScreenshotOutput[]> {
    const outputs: ScreenshotOutput[] = [];
    
    // Get appropriate templates based on safe mode
    const templates = this.getTemplatesForConfig(config);
    
    for (const template of templates) {
      // Generate for each device size
      const specs = config.platform === "ios" 
        ? DEVICE_SPECS.ios[config.device]
        : DEVICE_SPECS.android[config.device];
      
      for (const [size, dimensions] of Object.entries(specs)) {
        const screenshot = await this.generateScreenshot(
          template,
          config,
          size,
          dimensions
        );
        
        outputs.push(screenshot);
      }
    }
    
    // Save to database
    await this.saveScreenshots(outputs);
    
    logger.info("Generated screenshots", {
      country: config.country,
      platform: config.platform,
      count: outputs.length
    });
    
    return outputs;
  }

  /**
   * Get templates appropriate for configuration
   */
  private getTemplatesForConfig(config: ScreenshotConfig): ScreenshotTemplate[] {
    let templates = Object.values(SCREENSHOT_TEMPLATES);
    
    // Filter out AI companions in safe mode
    if (config.safeMode) {
      templates = templates.filter(t => t.type !== "ai_companions");
    }
    
    // Sort by priority
    templates.sort((a, b) => a.priority - b.priority);
    
    // Limit to 5-6 screenshots per platform requirements
    return templates.slice(0, config.platform === "ios" ? 10 : 8);
  }

  /**
   * Generate a single screenshot
   */
  private async generateScreenshot(
    template: ScreenshotTemplate,
    config: ScreenshotConfig,
    size: string,
    dimensions: any
  ): Promise<ScreenshotOutput> {
    // In a real implementation, this would:
    // 1. Load the app UI template
    // 2. Populate with localized text
    // 3. Add currency-specific pricing
    // 4. Render at specified dimensions
    // 5. Upload to storage
    
    const screenshotId = `${config.country}_${config.language}_${template.type}_${size}`;
    const currency = CURRENCY_PER_COUNTRY[config.country] || "USD";
    
    // Simulate screenshot generation metadata
    const screenshot: ScreenshotOutput = {
      id: screenshotId,
      url: `gs://avalo-store-screenshots/${screenshotId}.png`,
      type: template.type,
      platform: config.platform,
      device: config.device,
      size,
      country: config.country,
      language: config.language,
      generatedAt: new Date()
    };
    
    // In production: actual image generation would happen here
    logger.info("Generated screenshot", {
      id: screenshotId,
      type: template.type,
      size,
      currency
    });
    
    return screenshot;
  }

  /**
   * Generate video preview
   */
  async generateVideoPreview(config: VideoPreviewConfig): Promise<string> {
    // In a real implementation, this would:
    // 1. Create video storyboard based on features
    // 2. Record app interactions
    // 3. Add voiceover/subtitles in language
    // 4. Export in required format
    // 5. Upload to storage
    
    const videoId = `${config.country}_${config.language}_preview`;
    const videoUrl = `gs://avalo-store-videos/${videoId}.${config.format}`;
    
    // Save video metadata
    await this.db.collection("store_videos_pack431").doc(videoId).set({
      id: videoId,
      url: videoUrl,
      country: config.country,
      language: config.language,
      duration: config.duration,
      format: config.format,
      features: config.features,
      safeMode: config.safeMode,
      generatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info("Generated video preview", {
      id: videoId,
      duration: config.duration,
      features: config.features.length
    });
    
    return videoUrl;
  }

  /**
   * Generate localized text for screenshot
   */
  private getLocalizedText(
    key: string,
    language: string,
    currency: string
  ): string {
    // Integration with pack431-store-i18n would happen here
    const translations: Record<string, Record<string, string>> = {
      EN: {
        "premium_price": `${currency} 9.99/month`,
        "chat_unlock": "Unlock Chat",
        "event_create": "Create Event",
        "ai_chat": "Chat with AI"
      },
      PL: {
        "premium_price": `${currency} 9.99/miesiąc`,
        "chat_unlock": "Odblokuj Chat",
        "event_create": "Utwórz Wydarzenie",
        "ai_chat": "Rozmawiaj z AI"
      },
      DE: {
        "premium_price": `${currency} 9,99/Monat`,
        "chat_unlock": "Chat freischalten",
        "event_create": "Event erstellen",
        "ai_chat": "Mit KI chatten"
      }
    };
    
    return translations[language]?.[key] || translations.EN[key] || key;
  }

  /**
   * Add legal claims to screenshot
   */
  private addLegalClaims(
    screenshot: any,
    template: ScreenshotTemplate,
    config: ScreenshotConfig
  ): void {
    if (!template.legalClaims || config.safeMode) return;
    
    // Add required disclaimers based on country regulations
    const countrySpecificClaims = this.getCountryLegalClaims(config.country);
    screenshot.legalClaims = [
      ...template.legalClaims,
      ...countrySpecificClaims
    ];
  }

  /**
   * Get country-specific legal claims
   */
  private getCountryLegalClaims(country: string): string[] {
    const claims: Record<string, string[]> = {
      US: ["California residents: See privacy notice"],
      EU: ["GDPR compliant"],
      PL: ["Przestrzegamy RODO"],
      DE: ["DSGVO-konform"]
    };
    
    return claims[country] || [];
  }

  /**
   * Save screenshots to database
   */
  private async saveScreenshots(screenshots: ScreenshotOutput[]): Promise<void> {
    const batch = this.db.batch();
    
    for (const screenshot of screenshots) {
      const ref = this.db.collection("store_screenshots_pack431").doc(screenshot.id);
      batch.set(ref, {
        ...screenshot,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    logger.info("Saved screenshots to database", { count: screenshots.length });
  }

  /**
   * Regenerate screenshots for all countries
   */
  async regenerateAllScreenshots(platform: "ios" | "android"): Promise<void> {
    const countries = ["US", "PL", "DE", "ES", "IT", "FR", "GB"];
    const devices: ("phone" | "tablet")[] = ["phone", "tablet"];
    
    for (const country of countries) {
      const language = this.detectLanguageFromCountry(country);
      const currency = CURRENCY_PER_COUNTRY[country];
      
      for (const device of devices) {
        await this.generateScreenshots({
          country,
          language,
          currency,
          safeMode: false,
          platform,
          device
        });
      }
    }
    
    logger.info("Regenerated all screenshots", { platform });
  }

  /**
   * A/B test screenshot variants
   */
  async createScreenshotVariants(
    config: ScreenshotConfig,
    variants: number
  ): Promise<ScreenshotOutput[][]> {
    const allVariants: ScreenshotOutput[][] = [];
    
    for (let i = 0; i < variants; i++) {
      // Modify config slightly for each variant
      const variantConfig = {
        ...config,
        // Could vary: color scheme, layout, featured content, etc.
      };
      
      const screenshots = await this.generateScreenshots(variantConfig);
      allVariants.push(screenshots);
    }
    
    logger.info("Created screenshot variants", {
      variants,
      totalScreenshots: allVariants.flat().length
    });
    
    return allVariants;
  }

  /**
   * Delete old screenshots
   */
  async cleanupOldScreenshots(olderThanDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const oldScreenshots = await this.db
      .collection("store_screenshots_pack431")
      .where("generatedAt", "<", cutoffDate)
      .get();
    
    const batch = this.db.batch();
    oldScreenshots.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info("Cleaned up old screenshots", {
      count: oldScreenshots.size,
      olderThanDays
    });
  }

  /**
   * Detect language from country
   */
  private detectLanguageFromCountry(country: string): string {
    const mapping: Record<string, string> = {
      US: "EN",
      GB: "EN",
      PL: "PL",
      DE: "DE",
      FR: "FR",
      IT: "IT",
      ES: "ES",
      PT: "PT"
    };
    
    return mapping[country] || "EN";
  }
}

// ============================================================================
// SCREENSHOT A/B TESTING
// ============================================================================

export class ScreenshotABTestEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Create A/B test for screenshot sets
   */
  async createABTest(
    name: string,
    variantA: string[],
    variantB: string[],
    countries: string[]
  ): Promise<string> {
    const testId = `screenshot_ab_${Date.now()}`;
    
    await this.db.collection("screenshot_ab_tests_pack431").doc(testId).set({
      name,
      variantA,
      variantB,
      countries,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
      metrics: {
        variantA: { impressions: 0, installs: 0 },
        variantB: { impressions: 0, installs: 0 }
      }
    });
    
    logger.info("Created screenshot A/B test", {
      testId,
      name,
      countries
    });
    
    return testId;
  }

  /**
   * Record impression for A/B test
   */
  async recordImpression(testId: string, variant: "A" | "B"): Promise<void> {
    const variantField = variant === "A" ? "variantA" : "variantB";
    
    await this.db.collection("screenshot_ab_tests_pack431").doc(testId).update({
      [`metrics.${variantField}.impressions`]: admin.firestore.FieldValue.increment(1)
    });
  }

  /**
   * Record install for A/B test
   */
  async recordInstall(testId: string, variant: "A" | "B"): Promise<void> {
    const variantField = variant === "A" ? "variantA" : "variantB";
    
    await this.db.collection("screenshot_ab_tests_pack431").doc(testId).update({
      [`metrics.${variantField}.installs`]: admin.firestore.FieldValue.increment(1)
    });
  }

  /**
   * Get A/B test results
   */
  async getTestResults(testId: string): Promise<any> {
    const doc = await this.db
      .collection("screenshot_ab_tests_pack431")
      .doc(testId)
      .get();
    
    if (!doc.exists) {
      throw new Error(`Test ${testId} not found`);
    }
    
    const data = doc.data()!;
    const metrics = data.metrics;
    
    return {
      testId,
      name: data.name,
      variantA: {
        ...metrics.variantA,
        conversionRate: metrics.variantA.impressions > 0
          ? metrics.variantA.installs / metrics.variantA.impressions
          : 0
      },
      variantB: {
        ...metrics.variantB,
        conversionRate: metrics.variantB.impressions > 0
          ? metrics.variantB.installs / metrics.variantB.impressions
          : 0
      },
      winner: this.determineWinner(metrics.variantA, metrics.variantB)
    };
  }

  /**
   * Determine A/B test winner
   */
  private determineWinner(variantA: any, variantB: any): "A" | "B" | "inconclusive" {
    const conversionA = variantA.impressions > 0
      ? variantA.installs / variantA.impressions
      : 0;
    const conversionB = variantB.impressions > 0
      ? variantB.installs / variantB.impressions
      : 0;
    
    // Need sufficient sample size
    if (variantA.impressions < 1000 || variantB.impressions < 1000) {
      return "inconclusive";
    }
    
    const improvement = Math.abs(conversionA - conversionB) / Math.max(conversionA, conversionB);
    
    // Require at least 10% improvement to declare winner
    if (improvement < 0.1) {
      return "inconclusive";
    }
    
    return conversionA > conversionB ? "A" : "B";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createStoreMediaEngine = (
  db: FirebaseFirestore.Firestore,
  storage: admin.storage.Storage
) => {
  return new StoreMediaEngine(db, storage);
};

export const createScreenshotABTestEngine = (db: FirebaseFirestore.Firestore) => {
  return new ScreenshotABTestEngine(db);
};
