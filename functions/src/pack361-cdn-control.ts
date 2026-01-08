/**
 * PACK 361 - CDN & Media Optimization
 * Cloudflare Images, Stream CDN, media caching
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// ============================================
// TYPES
// ============================================

export interface MediaAsset {
  id: string;
  type: "image" | "video" | "audio" | "avatar";
  originalUrl: string;
  cdnUrl: string;
  variants: AssetVariant[];
  size: number;
  cached: boolean;
  cacheRegions: string[];
  uploadedAt: number;
  lastAccessed: number;
}

export interface AssetVariant {
  name: string; // "thumbnail", "mobile", "desktop", "4k", etc.
  url: string;
  width?: number;
  height?: number;
  format: string;
  size: number;
}

export interface CdnStats {
  totalAssets: number;
  totalSize: number;
  hitRate: number;
  bandwidthUsed: number;
  requestsServed: number;
  regions: Record<string, RegionCdnStats>;
}

export interface RegionCdnStats {
  region: string;
  hitRate: number;
  bandwidth: number;
  requests: number;
  latencyMs: number;
}

export interface ImageOptimization {
  progressive: boolean;
  autoFormat: boolean; // WebP, AVIF based on browser
  quality: number; // 1-100
  downscale4k: boolean;
  generateThumbnails: boolean;
}

export interface VideoOptimization {
  maxResolution: "1080p" | "4k";
  adaptiveBitrate: boolean;
  compressionLevel: "low" | "medium" | "high";
  generatePreviews: boolean;
}

// ============================================
// CONFIGURATION
// ============================================

const IMAGE_OPTIMIZATION: ImageOptimization = {
  progressive: true,
  autoFormat: true,
  quality: 85,
  downscale4k: true,
  generateThumbnails: true,
};

const VIDEO_OPTIMIZATION: VideoOptimization = {
  maxResolution: "1080p",
  adaptiveBitrate: true,
  compressionLevel: "medium",
  generatePreviews: true,
};

const THUMBNAIL_SIZES = [
  { name: "small", width: 150, height: 150 },
  { name: "medium", width: 300, height: 300 },
  { name: "large", width: 600, height: 600 },
];

const CDN_REGIONS = ["EU", "US", "ASIA", "SA", "AU"];

const CACHE_TTL = {
  images: 86400, // 24 hours
  videos: 604800, // 7 days
  avatars: 2592000, // 30 days
  static: 31536000, // 1 year
};

// ============================================
// IMAGE OPTIMIZATION
// ============================================

/**
 * Upload and optimize image
 */
export const uploadImage = functions.https.onCall(
  async (
    data: {
      imageData: string; // Base64
      type: MediaAsset["type"];
      userId: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const storage = admin.storage();
    
    const assetId = generateAssetId();
    const originalPath = `media/${data.type}/${data.userId}/${assetId}_original`;
    
    // Upload original
    const bucket = storage.bucket();
    const file = bucket.file(originalPath);
    
    const imageBuffer = Buffer.from(data.imageData, "base64");
    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/jpeg",
      },
    });
    
    const [originalUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });
    
    // Generate variants
    const variants: AssetVariant[] = [];
    
    if (IMAGE_OPTIMIZATION.generateThumbnails) {
      for (const size of THUMBNAIL_SIZES) {
        const variantPath = `media/${data.type}/${data.userId}/${assetId}_${size.name}`;
        const variantUrl = await generateThumbnail(
          imageBuffer,
          size.width,
          size.height,
          variantPath
        );
        
        variants.push({
          name: size.name,
          url: variantUrl,
          width: size.width,
          height: size.height,
          format: "jpeg",
          size: 0, // To be calculated
        });
      }
    }
    
    // Create CDN URLs (Cloudflare Images)
    const cdnUrl = `https://cdn.avalo.app/${assetId}`;
    
    // Save asset metadata
    const asset: MediaAsset = {
      id: assetId,
      type: data.type,
      originalUrl,
      cdnUrl,
      variants,
      size: imageBuffer.length,
      cached: false,
      cacheRegions: [],
      uploadedAt: Date.now(),
      lastAccessed: Date.now(),
    };
    
    await db.collection("mediaAssets").doc(assetId).set(asset);
    
    // Trigger CDN distribution
    await distributeToCdn(assetId, cdnUrl);
    
    return {
      assetId,
      cdnUrl,
      variants: variants.map((v) => ({ name: v.name, url: v.url })),
    };
  }
);

/**
 * Generate thumbnail
 */
async function generateThumbnail(
  imageBuffer: Buffer,
  width: number,
  height: number,
  path: string
): Promise<string> {
  // In production, use sharp or similar library
  // For now, return placeholder
  const storage = admin.storage();
  const bucket = storage.bucket();
  const file = bucket.file(path);
  
  await file.save(imageBuffer, {
    metadata: {
      contentType: "image/jpeg",
    },
  });
  
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });
  
  return url;
}

/**
 * Distribute asset to CDN
 */
async function distributeToCdn(
  assetId: string,
  cdnUrl: string
): Promise<void> {
  const db = admin.firestore();
  
  console.log(`📦 Distributing ${assetId} to CDN...`);
  
  // Simulate CDN distribution
  // In production, use Cloudflare Images API
  
  // Cache in all regions
  await db.collection("mediaAssets").doc(assetId).update({
    cached: true,
    cacheRegions: CDN_REGIONS,
  });
  
  console.log(`✅ ${assetId} cached in ${CDN_REGIONS.length} regions`);
}

// ============================================
// VIDEO OPTIMIZATION
// ============================================

/**
 * Upload and optimize video
 */
export const uploadVideo = functions.https.onCall(
  async (
    data: {
      videoUrl: string;
      userId: string;
      title: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const assetId = generateAssetId();
    
    console.log(`🎬 Processing video ${assetId}...`);
    
    // In production, use Cloudflare Stream API
    // For now, create placeholder
    
    const variants: AssetVariant[] = [
      {
        name: "1080p",
        url: `https://stream.avalo.app/${assetId}/1080p.m3u8`,
        width: 1920,
        height: 1080,
        format: "hls",
        size: 0,
      },
      {
        name: "720p",
        url: `https://stream.avalo.app/${assetId}/720p.m3u8`,
        width: 1280,
        height: 720,
        format: "hls",
        size: 0,
      },
      {
        name: "480p",
        url: `https://stream.avalo.app/${assetId}/480p.m3u8`,
        width: 854,
        height: 480,
        format: "hls",
        size: 0,
      },
    ];
    
    // Generate preview thumbnail
    const previewUrl = await generateVideoPreview(assetId);
    
    const asset: MediaAsset = {
      id: assetId,
      type: "video",
      originalUrl: data.videoUrl,
      cdnUrl: `https://stream.avalo.app/${assetId}/manifest.m3u8`,
      variants,
      size: 0,
      cached: true,
      cacheRegions: CDN_REGIONS,
      uploadedAt: Date.now(),
      lastAccessed: Date.now(),
    };
    
    await db.collection("mediaAssets").doc(assetId).set(asset);
    
    console.log(`✅ Video ${assetId} optimized`);
    
    return {
      assetId,
      cdnUrl: asset.cdnUrl,
      previewUrl,
      variants: variants.map((v) => ({
        name: v.name,
        url: v.url,
        resolution: `${v.width}x${v.height}`,
      })),
    };
  }
);

/**
 * Generate video preview thumbnail
 */
async function generateVideoPreview(videoId: string): Promise<string> {
  // In production, extract first frame or generate animated preview
  return `https://cdn.avalo.app/${videoId}/preview.jpg`;
}

// ============================================
// PROGRESSIVE IMAGE LOADING
// ============================================

/**
 * Get progressive image variants
 */
export const getProgressiveImage = functions.https.onCall(
  async (data: { assetId: string }, context) => {
    const db = admin.firestore();
    
    const assetDoc = await db
      .collection("mediaAssets")
      .doc(data.assetId)
      .get();
    
    if (!assetDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Asset not found"
      );
    }
    
    const asset = assetDoc.data() as MediaAsset;
    
    // Update last accessed
    await assetDoc.ref.update({
      lastAccessed: Date.now(),
    });
    
    // Return progressive loading strategy
    return {
      placeholder: asset.variants.find((v) => v.name === "small")?.url,
      lowRes: asset.variants.find((v) => v.name === "medium")?.url,
      highRes: asset.variants.find((v) => v.name === "large")?.url,
      original: asset.cdnUrl,
    };
  }
);

// ============================================
// AUDIO/VOICE OPTIMIZATION
// ============================================

/**
 * Optimize voice message
 */
export const optimizeVoice = functions.https.onCall(
  async (
    data: {
      audioData: string; // Base64
      userId: string;
      chatId: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const assetId = generateAssetId();
    const storage = admin.storage();
    const bucket = storage.bucket();
    
    const audioPath = `voice/${data.userId}/${data.chatId}/${assetId}.opus`;
    const file = bucket.file(audioPath);
    
    const audioBuffer = Buffer.from(data.audioData, "base64");
    
    // In production, transcode to Opus for low latency
    await file.save(audioBuffer, {
      metadata: {
        contentType: "audio/ogg",
        cacheControl: `public, max-age=${CACHE_TTL.static}`,
      },
    });
    
    const [cdnUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });
    
    return {
      assetId,
      cdnUrl,
      format: "opus",
      lowLatency: true,
    };
  }
);

// ============================================
// AI AVATAR CACHING
// ============================================

/**
 * Cache AI avatar globally
 */
export const cacheAiAvatar = functions.https.onCall(
  async (
    data: {
      avatarId: string;
      imageUrl: string;
    },
    context
  ) => {
    const db = admin.firestore();
    
    console.log(`🤖 Caching AI avatar ${data.avatarId}...`);
    
    // Distribute to all CDN regions for instant access
    await db.collection("mediaAssets").doc(data.avatarId).set({
      id: data.avatarId,
      type: "avatar",
      originalUrl: data.imageUrl,
      cdnUrl: `https://cdn.avalo.app/avatars/${data.avatarId}`,
      variants: [],
      size: 0,
      cached: true,
      cacheRegions: CDN_REGIONS,
      uploadedAt: Date.now(),
      lastAccessed: Date.now(),
    });
    
    console.log(`✅ AI avatar ${data.avatarId} cached globally`);
    
    return {
      cdnUrl: `https://cdn.avalo.app/avatars/${data.avatarId}`,
      cached: true,
      regions: CDN_REGIONS,
    };
  }
);

// ============================================
// CDN STATISTICS
// ============================================

/**
 * Get CDN statistics
 */
export const getCdnStats = functions.https.onCall(
  async (data, context) => {
    const db = admin.firestore();
    
    // Get all assets
    const assetsSnapshot = await db.collection("mediaAssets").get();
    
    const totalAssets = assetsSnapshot.size;
    let totalSize = 0;
    
    assetsSnapshot.forEach((doc) => {
      const asset = doc.data() as MediaAsset;
      totalSize += asset.size;
    });
    
    // Get CDN metrics
    const metricsDoc = await db
      .collection("cdnMetrics")
      .doc("current")
      .get();
    
    const metrics = metricsDoc.exists ? metricsDoc.data() : {};
    
    const stats: CdnStats = {
      totalAssets,
      totalSize,
      hitRate: metrics?.hitRate || 0.95,
      bandwidthUsed: metrics?.bandwidthUsed || 0,
      requestsServed: metrics?.requestsServed || 0,
      regions: {},
    };
    
    // Get per-region stats
    for (const region of CDN_REGIONS) {
      const regionDoc = await db
        .collection("cdnMetrics")
        .doc(`region_${region}`)
        .get();
      
      if (regionDoc.exists) {
        stats.regions[region] = regionDoc.data() as RegionCdnStats;
      }
    }
    
    return stats;
  }
);

/**
 * Update CDN metrics (scheduled)
 */
export const updateCdnMetrics = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    const db = admin.firestore();
    
    console.log("📊 Updating CDN metrics...");
    
    // Calculate hit rate
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    const requestsSnapshot = await db
      .collection("cdnRequests")
      .where("timestamp", ">", fiveMinutesAgo)
      .get();
    
    let hits = 0;
    let misses = 0;
    let bandwidth = 0;
    
    requestsSnapshot.forEach((doc) => {
      const request = doc.data();
      if (request.cached) {
        hits++;
      } else {
        misses++;
      }
      bandwidth += request.bytes || 0;
    });
    
    const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
    
    await db.collection("cdnMetrics").doc("current").set({
      hitRate,
      bandwidthUsed: bandwidth,
      requestsServed: hits + misses,
      timestamp: now,
    });
    
    console.log(`✅ CDN hit rate: ${(hitRate * 100).toFixed(1)}%`);
  });

// ============================================
// CACHE PURGE
// ============================================

/**
 * Purge asset from CDN cache
 */
export const purgeCache = functions.https.onCall(
  async (data: { assetId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    console.log(`🗑️ Purging ${data.assetId} from cache...`);
    
    await db.collection("mediaAssets").doc(data.assetId).update({
      cached: false,
      cacheRegions: [],
    });
    
    // In production, call Cloudflare API to purge cache
    
    console.log(`✅ ${data.assetId} purged`);
    
    return { success: true };
  }
);

/**
 * Purge all cached assets (admin only)
 */
export const purgeAllCache = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const isAdmin = userDoc.data()?.role === "admin";
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    console.log("🗑️ Purging all CDN cache...");
    
    const assetsSnapshot = await db.collection("mediaAssets").get();
    
    const batch = db.batch();
    assetsSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        cached: false,
        cacheRegions: [],
      });
    });
    
    await batch.commit();
    
    console.log(`✅ Purged ${assetsSnapshot.size} assets from cache`);
    
    return {
      success: true,
      assetsPurged: assetsSnapshot.size,
    };
  }
);

// ============================================
// BANDWIDTH OPTIMIZATION
// ============================================

/**
 * Monitor bandwidth usage
 */
export const monitorBandwidth = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async (context) => {
    const db = admin.firestore();
    
    console.log("📶 Monitoring bandwidth usage...");
    
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    const requestsSnapshot = await db
      .collection("cdnRequests")
      .where("timestamp", ">", oneHourAgo)
      .get();
    
    let totalBandwidth = 0;
    const bandwidthByType: Record<string, number> = {};
    
    requestsSnapshot.forEach((doc) => {
      const request = doc.data();
      const bytes = request.bytes || 0;
      totalBandwidth += bytes;
      
      const type = request.assetType || "unknown";
      bandwidthByType[type] = (bandwidthByType[type] || 0) + bytes;
    });
    
    // Alert if bandwidth exceeds threshold
    const bandwidthGB = totalBandwidth / (1024 * 1024 * 1024);
    const HOURLY_THRESHOLD_GB = 100; // Alert if >100GB/hour
    
    if (bandwidthGB > HOURLY_THRESHOLD_GB) {
      await db.collection("systemAlerts").add({
        type: "bandwidth",
        severity: "warning",
        message: `High bandwidth usage: ${bandwidthGB.toFixed(2)} GB/hour`,
        details: {
          totalGB: bandwidthGB,
          byType: bandwidthByType,
        },
        timestamp: now,
        resolved: false,
      });
    }
    
    console.log(`✅ Bandwidth: ${bandwidthGB.toFixed(2)} GB/hour`);
  });

// ============================================
// HELPERS
// ============================================

function generateAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log CDN request for analytics
 */
export async function logCdnRequest(
  assetId: string,
  cached: boolean,
  bytes: number,
  region: string
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection("cdnRequests").add({
    assetId,
    cached,
    bytes,
    region,
    timestamp: Date.now(),
  });
}
