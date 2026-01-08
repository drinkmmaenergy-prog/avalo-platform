/**
 * PACK 357 — ASO Variants Management
 * 
 * Manages App Store Optimization variants across platforms
 * Tests different combinations of titles, descriptions, screenshots
 * 
 * Dependencies: PACK 352 (KPI Engine), PACK 356 (Paid Acquisition)
 */

import { Timestamp, FieldValue, Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";

export type ASOPlatform = "IOS" | "ANDROID";

export type ASOVariantStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

export interface ASOVariant {
  variantId: string;
  platform: ASOPlatform;
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  screenshotsSetId: string;
  videoPreviewId?: string;
  status: ASOVariantStatus;
  
  // Targeting
  targetCountries?: string[]; // ISO country codes
  targetLanguages?: string[]; // ISO language codes
  trafficSource?: "ORGANIC" | "ADS" | "ALL";
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  
  // Testing configuration
  testStartDate?: Timestamp;
  testEndDate?: Timestamp;
  trafficAllocation?: number; // 0-100, percentage of traffic
}

export interface ASOScreenshotSet {
  setId: string;
  platform: ASOPlatform;
  screenshots: {
    url: string;
    order: number;
    caption?: string;
    locale?: string;
  }[];
  createdAt: Timestamp;
  updatedBy: string;
}

export interface ASOVideoPreview {
  previewId: string;
  platform: ASOPlatform;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  locale?: string;
  createdAt: Timestamp;
}

/**
 * Create a new ASO variant
 */
export async function createASOVariant(
  variant: Omit<ASOVariant, "variantId" | "createdAt" | "updatedAt">
): Promise<string> {
  const variantId = db.collection("aso_variants").doc().id;
  const now = Timestamp.now();
  
  const newVariant: ASOVariant = {
    ...variant,
    variantId,
    createdAt: now,
    updatedAt: now,
  };
  
  // Validate variant
  validateASOVariant(newVariant);
  
  await db.collection("aso_variants").doc(variantId).set(newVariant);
  
  logger.info(`Created ASO variant: ${variantId}`, {
    platform: variant.platform,
    title: variant.title,
    status: variant.status,
  });
  
  return variantId;
}

/**
 * Update an existing ASO variant
 */
export async function updateASOVariant(
  variantId: string,
  updates: Partial<Omit<ASOVariant, "variantId" | "createdAt" | "createdBy">>
): Promise<void> {
  const variantRef = db.collection("aso_variants").doc(variantId);
  const variantDoc = await variantRef.get();
  
  if (!variantDoc.exists) {
    throw new Error(`ASO variant not found: ${variantId}`);
  }
  
  const updateData = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  
  await variantRef.update(updateData);
  
  logger.info(`Updated ASO variant: ${variantId}`, updates);
}

/**
 * Get active ASO variant for a user
 * Uses traffic allocation and targeting rules
 */
export async function getActiveVariantForUser(
  platform: ASOPlatform,
  country: string,
  language: string,
  trafficSource: "ORGANIC" | "ADS",
  userId?: string
): Promise<ASOVariant | null> {
  // Query active variants for platform
  const variantsSnapshot = await db
    .collection("aso_variants")
    .where("platform", "==", platform)
    .where("status", "==", "ACTIVE")
    .get();
  
  if (variantsSnapshot.empty) {
    return null;
  }
  
  // Filter by targeting criteria
  const eligibleVariants = variantsSnapshot.docs
    .map(doc => doc.data() as ASOVariant)
    .filter(variant => {
      // Check country targeting
      if (variant.targetCountries && variant.targetCountries.length > 0) {
        if (!variant.targetCountries.includes(country)) {
          return false;
        }
      }
      
      // Check language targeting
      if (variant.targetLanguages && variant.targetLanguages.length > 0) {
        if (!variant.targetLanguages.includes(language)) {
          return false;
        }
      }
      
      // Check traffic source targeting
      if (variant.trafficSource && variant.trafficSource !== "ALL") {
        if (variant.trafficSource !== trafficSource) {
          return false;
        }
      }
      
      // Check test date range
      const now = Date.now();
      if (variant.testStartDate && variant.testStartDate.toMillis() > now) {
        return false;
      }
      if (variant.testEndDate && variant.testEndDate.toMillis() < now) {
        return false;
      }
      
      return true;
    });
  
  if (eligibleVariants.length === 0) {
    return null;
  }
  
  // Use deterministic selection based on userId (if provided) or random
  if (userId) {
    // Hash user ID to get consistent variant assignment
    const hash = simpleHash(userId);
    const index = hash % eligibleVariants.length;
    return eligibleVariants[index];
  }
  
  // Random selection weighted by traffic allocation
  const totalAllocation = eligibleVariants.reduce(
    (sum, v) => sum + (v.trafficAllocation || 100),
    0
  );
  
  let random = Math.random() * totalAllocation;
  for (const variant of eligibleVariants) {
    random -= variant.trafficAllocation || 100;
    if (random <= 0) {
      return variant;
    }
  }
  
  return eligibleVariants[0];
}

/**
 * Get ASO variant by ID
 */
export async function getASOVariant(variantId: string): Promise<ASOVariant | null> {
  const variantDoc = await db.collection("aso_variants").doc(variantId).get();
  
  if (!variantDoc.exists) {
    return null;
  }
  
  return variantDoc.data() as ASOVariant;
}

/**
 * List all ASO variants with optional filters
 */
export async function listASOVariants(filters?: {
  platform?: ASOPlatform;
  status?: ASOVariantStatus;
  country?: string;
  limit?: number;
}): Promise<ASOVariant[]> {
  let query = db.collection("aso_variants") as Query;
  
  if (filters?.platform) {
    query = query.where("platform", "==", filters.platform);
  }
  
  if (filters?.status) {
    query = query.where("status", "==", filters.status);
  }
  
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  
  const snapshot = await query.get();
  
  let variants = snapshot.docs.map(doc => doc.data() as ASOVariant);
  
  // Filter by country if specified (not a DB field, so filter in memory)
  if (filters?.country) {
    variants = variants.filter(v =>
      !v.targetCountries ||
      v.targetCountries.length === 0 ||
      v.targetCountries.includes(filters.country!)
    );
  }
  
  return variants;
}

/**
 * Archive an ASO variant
 */
export async function archiveASOVariant(variantId: string): Promise<void> {
  await updateASOVariant(variantId, {
    status: "ARCHIVED",
  });
  
  logger.info(`Archived ASO variant: ${variantId}`);
}

/**
 * Clone an ASO variant for testing
 */
export async function cloneASOVariant(
  sourceVariantId: string,
  overrides?: Partial<Omit<ASOVariant, "variantId" | "createdAt" | "updatedAt">>
): Promise<string> {
  const sourceVariant = await getASOVariant(sourceVariantId);
  
  if (!sourceVariant) {
    throw new Error(`Source variant not found: ${sourceVariantId}`);
  }
  
  const { variantId, createdAt, updatedAt, ...clonableData } = sourceVariant;
  
  const newVariantData = {
    ...clonableData,
    ...overrides,
    status: "PAUSED" as ASOVariantStatus, // Always start clones as paused
  };
  
  const newVariantId = await createASOVariant(newVariantData);
  
  logger.info(`Cloned ASO variant ${sourceVariantId} -> ${newVariantId}`);
  
  return newVariantId;
}

/**
 * Create screenshot set
 */
export async function createScreenshotSet(
  set: Omit<ASOScreenshotSet, "setId" | "createdAt">
): Promise<string> {
  const setId = db.collection("aso_screenshot_sets").doc().id;
  const now = Timestamp.now();
  
  const newSet: ASOScreenshotSet = {
    ...set,
    setId,
    createdAt: now,
  };
  
  await db.collection("aso_screenshot_sets").doc(setId).set(newSet);
  
  logger.info(`Created screenshot set: ${setId}`, {
    platform: set.platform,
    count: set.screenshots.length,
  });
  
  return setId;
}

/**
 * Create video preview
 */
export async function createVideoPreview(
  preview: Omit<ASOVideoPreview, "previewId" | "createdAt">
): Promise<string> {
  const previewId = db.collection("aso_video_previews").doc().id;
  const now = Timestamp.now();
  
  const newPreview: ASOVideoPreview = {
    ...preview,
    previewId,
    createdAt: now,
  };
  
  await db.collection("aso_video_previews").doc(previewId).set(newPreview);
  
  logger.info(`Created video preview: ${previewId}`, {
    platform: preview.platform,
    duration: preview.durationSeconds,
  });
  
  return previewId;
}

/**
 * Validate ASO variant data
 */
function validateASOVariant(variant: ASOVariant): void {
  // Title length limits (Apple App Store and Google Play)
  const maxTitleLength = variant.platform === "IOS" ? 30 : 50;
  if (variant.title.length > maxTitleLength) {
    throw new Error(
      `Title too long for ${variant.platform}: ${variant.title.length} > ${maxTitleLength}`
    );
  }
  
  // Subtitle length (iOS only)
  if (variant.platform === "IOS" && variant.subtitle.length > 30) {
    throw new Error(`Subtitle too long: ${variant.subtitle.length} > 30`);
  }
  
  // Description length
  const maxDescLength = variant.platform === "IOS" ? 4000 : 4000;
  if (variant.description.length > maxDescLength) {
    throw new Error(
      `Description too long: ${variant.description.length} > ${maxDescLength}`
    );
  }
  
  // Keywords
  if (variant.platform === "IOS") {
    const keywordsString = variant.keywords.join(",");
    if (keywordsString.length > 100) {
      throw new Error(`Keywords too long: ${keywordsString.length} > 100`);
    }
  }
  
  // Traffic allocation
  if (variant.trafficAllocation !== undefined) {
    if (variant.trafficAllocation < 0 || variant.trafficAllocation > 100) {
      throw new Error(
        `Invalid traffic allocation: ${variant.trafficAllocation}`
      );
    }
  }
}

/**
 * Simple hash function for consistent user assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get screenshot set by ID
 */
export async function getScreenshotSet(setId: string): Promise<ASOScreenshotSet | null> {
  const setDoc = await db.collection("aso_screenshot_sets").doc(setId).get();
  
  if (!setDoc.exists) {
    return null;
  }
  
  return setDoc.data() as ASOScreenshotSet;
}

/**
 * Get video preview by ID
 */
export async function getVideoPreview(previewId: string): Promise<ASOVideoPreview | null> {
  const previewDoc = await db.collection("aso_video_previews").doc(previewId).get();
  
  if (!previewDoc.exists) {
    return null;
  }
  
  return previewDoc.data() as ASOVideoPreview;
}
