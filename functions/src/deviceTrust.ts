/**
 * PHASE 21 - Device Trust & Fingerprinting
 *
 * Device identification and trust scoring:
 * - Device fingerprinting (browser/device ID)
 * - Multi-account detection
 * - Suspicious device patterns
 * - IP reputation scoring
 *
 * Feature flag: device_trust_scoring
 * Region: europe-west3
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;

const db = getFirestore();

/**
 * Device trust levels
 */
export enum DeviceTrustLevel {
  TRUSTED = "trusted",
  NEUTRAL = "neutral",
  SUSPICIOUS = "suspicious",
  BLOCKED = "blocked",
}

/**
 * Device trust data
 */
interface DeviceTrust {
  deviceId: string; // Hash of device fingerprint
  userId: string;

  // Device info
  userAgent: string;
  platform: string; // iOS, Android, Web
  browserName?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceModel?: string;

  // Network info
  ipAddress: string;
  ipCountry?: string;
  ipCity?: string;
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;

  // Trust metrics
  trustLevel: DeviceTrustLevel;
  trustScore: number; // 0-100
  riskFlags: string[];

  // Usage stats
  totalLogins: number;
  totalTransactions: number;
  lastUsedAt: Timestamp;
  firstSeenAt: Timestamp;

  // Multi-account detection
  associatedUserIds: string[]; // Other users from this device
  accountSwitchCount: number;

  // Fraud indicators
  flaggedForReview: boolean;
  flagReason?: string;
  blockedAt?: Timestamp;
  blockedReason?: string;
}

/**
 * Register or update device trust data
 * Called on every significant action (login, transaction, etc.)
 */
export const registerDeviceTrustV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const trustScoringEnabled = await getFeatureFlag(uid, "device_trust_scoring", true);
    if (!trustScoringEnabled) {
      return { success: true, skipped: true };
    }

    // Validate input
    const schema = z.object({
      deviceFingerprint: z.string().min(32), // Client-generated fingerprint
      userAgent: z.string(),
      platform: z.enum(["ios", "android", "web"]),
      deviceInfo: z
        .object({
          browserName: z.string().optional(),
          browserVersion: z.string().optional(),
          os: z.string().optional(),
          osVersion: z.string().optional(),
          deviceModel: z.string().optional(),
        })
        .optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { deviceFingerprint, userAgent, platform, deviceInfo } = validationResult.data;

    try {
      const ipAddress = request.rawRequest.ip || "unknown";

      // Hash device fingerprint for privacy
      const deviceId = hashDeviceFingerprint(deviceFingerprint, uid);

      // Check if device exists
      const deviceRef = db.collection("deviceTrust").doc(deviceId);
      const deviceDoc = await deviceRef.get();

      if (deviceDoc.exists) {
        // Update existing device
        const existingData = deviceDoc.data() as DeviceTrust;

        // Check for account switching
        let accountSwitchCount = existingData.accountSwitchCount || 0;
        const associatedUserIds = new Set(existingData.associatedUserIds || []);

        if (!associatedUserIds.has(uid)) {
          associatedUserIds.add(uid);
          accountSwitchCount++;

          // Flag if too many accounts from same device
          if (associatedUserIds.size > 3) {
            await flagDeviceForReview(
              deviceId,
              "multiple_accounts",
              `${associatedUserIds.size} accounts detected`
            );
          }
        }

        await deviceRef.update({
          userId: uid, // Update to current user
          userAgent,
          platform,
          ...deviceInfo,
          ipAddress,
          totalLogins: FieldValue.increment(1),
          lastUsedAt: Timestamp.now(),
          associatedUserIds: Array.from(associatedUserIds),
          accountSwitchCount,
        });

        // Recalculate trust score
        await recalculateDeviceTrustScore(deviceId);
      } else {
        // Create new device trust entry
        const ipInfo = await getIPInfo(ipAddress);

        const deviceTrust: DeviceTrust = {
          deviceId,
          userId: uid,
          userAgent,
          platform,
          ...deviceInfo,
          ipAddress,
          ipCountry: ipInfo.country,
          ipCity: ipInfo.city,
          isVPN: ipInfo.isVPN,
          isProxy: ipInfo.isProxy,
          isTor: ipInfo.isTor,
          trustLevel: DeviceTrustLevel.NEUTRAL,
          trustScore: 50, // Neutral start
          riskFlags: [],
          totalLogins: 1,
          totalTransactions: 0,
          lastUsedAt: Timestamp.now(),
          firstSeenAt: Timestamp.now(),
          associatedUserIds: [uid],
          accountSwitchCount: 0,
          flaggedForReview: false,
        };

        // Check for immediate red flags
        if (ipInfo.isVPN || ipInfo.isProxy || ipInfo.isTor) {
          deviceTrust.riskFlags.push("vpn_proxy_tor");
          deviceTrust.trustScore = 30;
          deviceTrust.trustLevel = DeviceTrustLevel.SUSPICIOUS;
        }

        await deviceRef.set(deviceTrust);
      }

      logger.info(`Device trust registered for ${uid}: ${deviceId}`);

      return {
        success: true,
        deviceId,
        trustScore: (await deviceRef.get()).data()?.trustScore || 50,
      };
    } catch (error: any) {
      logger.error("Device trust registration failed:", error);
      // Don't block user on device trust failures
      return { success: false, error: "registration_failed" };
    }
  }
);

/**
 * Get device trust status
 */
export const getDeviceTrustStatusV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { deviceId } = request.data;

    if (!deviceId) {
      throw new HttpsError("invalid-argument", "deviceId required");
    }

    const deviceDoc = await db.collection("deviceTrust").doc(deviceId).get();

    if (!deviceDoc.exists) {
      return {
        found: false,
      };
    }

    const device = deviceDoc.data() as DeviceTrust;

    // Only return if user owns this device
    if (!device.associatedUserIds.includes(uid)) {
      throw new HttpsError("permission-denied", "Unauthorized");
    }

    return {
      found: true,
      deviceId: device.deviceId,
      trustLevel: device.trustLevel,
      trustScore: device.trustScore,
      riskFlags: device.riskFlags,
      lastUsedAt: device.lastUsedAt,
      firstSeenAt: device.firstSeenAt,
      totalLogins: device.totalLogins,
    };
  }
);

/**
 * Recalculate device trust score
 * Based on usage patterns and risk indicators
 */
async function recalculateDeviceTrustScore(deviceId: string): Promise<void> {
  try {
    const deviceDoc = await db.collection("deviceTrust").doc(deviceId).get();

    if (!deviceDoc.exists) return;

    const device = deviceDoc.data() as DeviceTrust;

    let score = 50; // Start neutral
    const riskFlags: string[] = [];

    // Age factor (older devices more trusted)
    const deviceAgeHours =
      (Date.now() - device.firstSeenAt.toMillis()) / (1000 * 60 * 60);

    if (deviceAgeHours > 720) score += 15; // 30+ days
    else if (deviceAgeHours > 168) score += 10; // 7+ days
    else if (deviceAgeHours > 24) score += 5; // 1+ day
    else score -= 10; // Very new device

    // Login frequency (normal usage pattern)
    const avgLoginsPerDay = device.totalLogins / Math.max(1, deviceAgeHours / 24);

    if (avgLoginsPerDay > 20) {
      riskFlags.push("excessive_logins");
      score -= 15;
    } else if (avgLoginsPerDay > 10) {
      riskFlags.push("high_login_frequency");
      score -= 5;
    } else if (avgLoginsPerDay >= 1 && avgLoginsPerDay <= 5) {
      score += 10; // Normal usage
    }

    // Multi-account red flag
    if (device.associatedUserIds.length > 5) {
      riskFlags.push("many_accounts");
      score -= 30;
    } else if (device.associatedUserIds.length > 3) {
      riskFlags.push("multiple_accounts");
      score -= 15;
    }

    // VPN/Proxy/Tor penalty
    if (device.isVPN || device.isProxy || device.isTor) {
      riskFlags.push("vpn_proxy_tor");
      score -= 20;
    }

    // Transaction volume (if any)
    if (device.totalTransactions > 100) {
      score += 10; // Established transaction history
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Determine trust level
    let trustLevel: DeviceTrustLevel;
    if (score >= 70) trustLevel = DeviceTrustLevel.TRUSTED;
    else if (score >= 40) trustLevel = DeviceTrustLevel.NEUTRAL;
    else if (score >= 20) trustLevel = DeviceTrustLevel.SUSPICIOUS;
    else trustLevel = DeviceTrustLevel.BLOCKED;

    // Update device
    await deviceDoc.ref.update({
      trustScore: score,
      trustLevel,
      riskFlags,
    });

    logger.info(`Device trust score updated: ${deviceId} = ${score}`);
  } catch (error: any) {
    logger.error(`Trust score calculation failed for ${deviceId}:`, error);
  }
}

/**
 * Flag device for manual review
 */
async function flagDeviceForReview(
  deviceId: string,
  reason: string,
  details: string
): Promise<void> {
  await db
    .collection("deviceTrust")
    .doc(deviceId)
    .update({
      flaggedForReview: true,
      flagReason: reason,
      trustLevel: DeviceTrustLevel.SUSPICIOUS,
    });

  // Log to security operations
  const today = new Date().toISOString().split("T")[0];
  await db
    .collection("engineLogs")
    .doc("secops")
    .collection(today)
    .doc("deviceFlags")
    .set(
      {
        flags: FieldValue.arrayUnion({
          deviceId,
          reason,
          details,
          timestamp: new Date().toISOString(),
        }),
      },
      { merge: true }
    );

  logger.warn(`Device flagged for review: ${deviceId} - ${reason}`);
}

/**
 * Block device
 */
export const blockDeviceV1 = onCall({ region: "europe-west3" }, async (request) => {
  const adminUid = request.auth?.uid;
  if (!adminUid) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Check admin role
  const adminDoc = await db.collection("users").doc(adminUid).get();
  if (!adminDoc.data()?.role || !["admin", "moderator"].includes(adminDoc.data()?.role)) {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  const { deviceId, reason } = request.data;

  if (!deviceId || !reason) {
    throw new HttpsError("invalid-argument", "deviceId and reason required");
  }

  await db
    .collection("deviceTrust")
    .doc(deviceId)
    .update({
      trustLevel: DeviceTrustLevel.BLOCKED,
      trustScore: 0,
      blockedAt: Timestamp.now(),
      blockedReason: reason,
    });

  logger.info(`Device blocked by admin ${adminUid}: ${deviceId}`);

  return { success: true };
});

/**
 * Get devices for user (admin only)
 */
export const getUserDevicesV1 = onCall({ region: "europe-west3" }, async (request) => {
  const adminUid = request.auth?.uid;
  if (!adminUid) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Check admin role
  const adminDoc = await db.collection("users").doc(adminUid).get();
  if (!adminDoc.data()?.role || !["admin", "moderator"].includes(adminDoc.data()?.role)) {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError("invalid-argument", "userId required");
  }

  const devicesSnapshot = await db
    .collection("deviceTrust")
    .where("associatedUserIds", "array-contains", userId)
    .get();

  const devices = devicesSnapshot.docs.map((doc) => {
    const data = doc.data() as DeviceTrust;
    return {
      deviceId: data.deviceId,
      platform: data.platform,
      trustLevel: data.trustLevel,
      trustScore: data.trustScore,
      riskFlags: data.riskFlags,
      totalLogins: data.totalLogins,
      lastUsedAt: data.lastUsedAt,
      firstSeenAt: data.firstSeenAt,
      associatedUserCount: data.associatedUserIds.length,
    };
  });

  return { devices };
});

/**
 * Hash device fingerprint with user salt
 * Ensures same device gets different IDs for different users
 */
function hashDeviceFingerprint(fingerprint: string, userId: string): string {
  const combined = `${fingerprint}:${userId}`;
  return Buffer.from(combined).toString("base64").substring(0, 32);
}

/**
 * Get IP information
 * In production, integrate with IP geolocation/reputation service
 */
async function getIPInfo(ipAddress: string): Promise<{
  country: string;
  city: string;
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;
}> {
  // Mock implementation
  // In production, use service like IPHub, IPQualityScore, or MaxMind

  // Check for known VPN/proxy IP ranges (simplified)
  const isVPN = false; // Would check against VPN IP database
  const isProxy = false;
  const isTor = false;

  // Mock geolocation
  return {
    country: "PL",
    city: "Warsaw",
    isVPN,
    isProxy,
    isTor,
  };
}

/**
 * Check if device is trusted (helper for other modules)
 */
export async function isDeviceTrusted(deviceId: string): Promise<boolean> {
  try {
    const deviceDoc = await db.collection("deviceTrust").doc(deviceId).get();

    if (!deviceDoc.exists) {
      return false; // Unknown device = not trusted
    }

    const device = deviceDoc.data() as DeviceTrust;

    return (
      device.trustLevel === DeviceTrustLevel.TRUSTED ||
      (device.trustLevel === DeviceTrustLevel.NEUTRAL && device.trustScore >= 50)
    );
  } catch (error: any) {
    logger.error("Device trust check failed:", error);
    return true; // Fail open on errors
  }
}

/**
 * Detect multi-account abuse
 * Returns list of suspicious device patterns
 */
export async function detectMultiAccountAbuse(): Promise<any[]> {
  try {
    // Query devices with multiple accounts
    const suspiciousDevicesSnapshot = await db
      .collection("deviceTrust")
      .where("flaggedForReview", "==", true)
      .where("trustLevel", "==", DeviceTrustLevel.SUSPICIOUS)
      .limit(100)
      .get();

    return suspiciousDevicesSnapshot.docs.map((doc) => {
      const data = doc.data() as DeviceTrust;
      return {
        deviceId: data.deviceId,
        accountCount: data.associatedUserIds.length,
        userIds: data.associatedUserIds,
        riskFlags: data.riskFlags,
        flagReason: data.flagReason,
        trustScore: data.trustScore,
      };
    });
  } catch (error: any) {
    logger.error("Multi-account detection failed:", error);
    return [];
  }
}


