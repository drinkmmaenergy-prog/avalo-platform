/**
 * Tests for Device Trust & Fingerprinting (Phase 21)
 * Focus on trust scoring, multi-account detection, and risk flags
 */

describe("Device Trust & Fingerprinting", () => {
  enum DeviceTrustLevel {
    TRUSTED = "trusted",
    NEUTRAL = "neutral",
    SUSPICIOUS = "suspicious",
    BLOCKED = "blocked",
  }

  describe("Device Trust Score Calculation", () => {
    function calculateTrustScore(metrics: {
      deviceAgeHours: number;
      avgLoginsPerDay: number;
      associatedAccountCount: number;
      isVPN: boolean;
      totalTransactions: number;
    }): number {
      let score = 50; // Start neutral

      // Age factor
      if (metrics.deviceAgeHours > 720) score += 15; // 30+ days
      else if (metrics.deviceAgeHours > 168) score += 10; // 7+ days
      else if (metrics.deviceAgeHours > 24) score += 5; // 1+ day
      else score -= 10; // Very new device

      // Login frequency
      if (metrics.avgLoginsPerDay > 20) score -= 15;
      else if (metrics.avgLoginsPerDay > 10) score -= 5;
      else if (
        metrics.avgLoginsPerDay >= 1 &&
        metrics.avgLoginsPerDay <= 5
      )
        score += 10;

      // Multi-account penalty
      if (metrics.associatedAccountCount > 5) score -= 30;
      else if (metrics.associatedAccountCount > 3) score -= 15;

      // VPN penalty
      if (metrics.isVPN) score -= 20;

      // Transaction history bonus
      if (metrics.totalTransactions > 100) score += 10;

      // Clamp to 0-100
      return Math.max(0, Math.min(100, score));
    }

    test("should give high score for established device", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 1000, // 41+ days
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
        isVPN: false,
        totalTransactions: 150,
      });

      expect(score).toBeGreaterThanOrEqual(80);
    });

    test("should give low score for new device", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 2, // Brand new
        avgLoginsPerDay: 1,
        associatedAccountCount: 1,
        isVPN: false,
        totalTransactions: 0,
      });

      expect(score).toBeLessThan(60);
    });

    test("should penalize VPN usage", () => {
      const scoreWithVPN = calculateTrustScore({
        deviceAgeHours: 500,
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
        isVPN: true,
        totalTransactions: 50,
      });

      const scoreWithoutVPN = calculateTrustScore({
        deviceAgeHours: 500,
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
        isVPN: false,
        totalTransactions: 50,
      });

      expect(scoreWithVPN).toBe(scoreWithoutVPN - 20);
    });

    test("should heavily penalize multi-account abuse", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 500,
        avgLoginsPerDay: 3,
        associatedAccountCount: 6, // Many accounts
        isVPN: false,
        totalTransactions: 50,
      });

      expect(score).toBeLessThan(50);
    });

    test("should penalize excessive login frequency", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 500,
        avgLoginsPerDay: 25, // Very high
        associatedAccountCount: 1,
        isVPN: false,
        totalTransactions: 50,
      });

      expect(score).toBeLessThan(70);
    });

    test("should never exceed 100", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 10000,
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
        isVPN: false,
        totalTransactions: 1000,
      });

      expect(score).toBeLessThanOrEqual(100);
    });

    test("should never go below 0", () => {
      const score = calculateTrustScore({
        deviceAgeHours: 1,
        avgLoginsPerDay: 50,
        associatedAccountCount: 10,
        isVPN: true,
        totalTransactions: 0,
      });

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Trust Level Determination", () => {
    function getTrustLevel(score: number): DeviceTrustLevel {
      if (score >= 70) return DeviceTrustLevel.TRUSTED;
      if (score >= 40) return DeviceTrustLevel.NEUTRAL;
      if (score >= 20) return DeviceTrustLevel.SUSPICIOUS;
      return DeviceTrustLevel.BLOCKED;
    }

    test("should be TRUSTED for score >= 70", () => {
      expect(getTrustLevel(85)).toBe(DeviceTrustLevel.TRUSTED);
      expect(getTrustLevel(70)).toBe(DeviceTrustLevel.TRUSTED);
    });

    test("should be NEUTRAL for score 40-69", () => {
      expect(getTrustLevel(55)).toBe(DeviceTrustLevel.NEUTRAL);
      expect(getTrustLevel(40)).toBe(DeviceTrustLevel.NEUTRAL);
    });

    test("should be SUSPICIOUS for score 20-39", () => {
      expect(getTrustLevel(30)).toBe(DeviceTrustLevel.SUSPICIOUS);
      expect(getTrustLevel(20)).toBe(DeviceTrustLevel.SUSPICIOUS);
    });

    test("should be BLOCKED for score < 20", () => {
      expect(getTrustLevel(15)).toBe(DeviceTrustLevel.BLOCKED);
      expect(getTrustLevel(0)).toBe(DeviceTrustLevel.BLOCKED);
    });
  });

  describe("Multi-Account Detection", () => {
    test("should detect account switching", () => {
      const associatedUserIds = new Set(["user1", "user2"]);
      const newUserId = "user3";

      const hadUser = associatedUserIds.has(newUserId);
      if (!hadUser) {
        associatedUserIds.add(newUserId);
      }

      expect(associatedUserIds.size).toBe(3);
      expect(hadUser).toBe(false);
    });

    test("should not increment for same user", () => {
      const associatedUserIds = new Set(["user1", "user2"]);
      const existingUserId = "user1";

      const initialSize = associatedUserIds.size;
      const hadUser = associatedUserIds.has(existingUserId);

      expect(hadUser).toBe(true);
      expect(associatedUserIds.size).toBe(initialSize);
    });

    test("should flag devices with > 3 accounts", () => {
      const associatedUserIds = ["user1", "user2", "user3", "user4"];
      const THRESHOLD = 3;

      const shouldFlag = associatedUserIds.length > THRESHOLD;
      expect(shouldFlag).toBe(true);
    });

    test("should not flag devices with <= 3 accounts", () => {
      const associatedUserIds = ["user1", "user2", "user3"];
      const THRESHOLD = 3;

      const shouldFlag = associatedUserIds.length > THRESHOLD;
      expect(shouldFlag).toBe(false);
    });
  });

  describe("Device Fingerprint Hashing", () => {
    function hashDeviceFingerprint(
      fingerprint: string,
      userId: string
    ): string {
      const combined = `${fingerprint}:${userId}`;
      return Buffer.from(combined).toString("base64").substring(0, 32);
    }

    test("should generate consistent hash for same inputs", () => {
      const fingerprint = "abc123def456";
      const userId = "user123";

      const hash1 = hashDeviceFingerprint(fingerprint, userId);
      const hash2 = hashDeviceFingerprint(fingerprint, userId);

      expect(hash1).toBe(hash2);
    });

    test("should generate different hashes for different users", () => {
      const fingerprint = "abc123def456";

      const hash1 = hashDeviceFingerprint(fingerprint, "user1");
      const hash2 = hashDeviceFingerprint(fingerprint, "user2");

      expect(hash1).not.toBe(hash2);
    });

    test("should generate different hashes for different fingerprints", () => {
      const userId = "user123";

      const hash1 = hashDeviceFingerprint("fingerprint1", userId);
      const hash2 = hashDeviceFingerprint("fingerprint2", userId);

      expect(hash1).not.toBe(hash2);
    });

    test("should limit hash length to 32 characters", () => {
      const fingerprint = "a".repeat(100);
      const userId = "user123";

      const hash = hashDeviceFingerprint(fingerprint, userId);

      expect(hash.length).toBe(32);
    });
  });

  describe("Risk Flag Generation", () => {
    function generateRiskFlags(metrics: {
      isVPN: boolean;
      isProxy: boolean;
      isTor: boolean;
      avgLoginsPerDay: number;
      associatedAccountCount: number;
    }): string[] {
      const flags: string[] = [];

      if (metrics.isVPN || metrics.isProxy || metrics.isTor) {
        flags.push("vpn_proxy_tor");
      }

      if (metrics.avgLoginsPerDay > 20) {
        flags.push("excessive_logins");
      } else if (metrics.avgLoginsPerDay > 10) {
        flags.push("high_login_frequency");
      }

      if (metrics.associatedAccountCount > 5) {
        flags.push("many_accounts");
      } else if (metrics.associatedAccountCount > 3) {
        flags.push("multiple_accounts");
      }

      return flags;
    }

    test("should flag VPN usage", () => {
      const flags = generateRiskFlags({
        isVPN: true,
        isProxy: false,
        isTor: false,
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
      });

      expect(flags).toContain("vpn_proxy_tor");
    });

    test("should flag excessive logins", () => {
      const flags = generateRiskFlags({
        isVPN: false,
        isProxy: false,
        isTor: false,
        avgLoginsPerDay: 25,
        associatedAccountCount: 1,
      });

      expect(flags).toContain("excessive_logins");
    });

    test("should flag multiple accounts", () => {
      const flags = generateRiskFlags({
        isVPN: false,
        isProxy: false,
        isTor: false,
        avgLoginsPerDay: 3,
        associatedAccountCount: 4,
      });

      expect(flags).toContain("multiple_accounts");
    });

    test("should return multiple flags when applicable", () => {
      const flags = generateRiskFlags({
        isVPN: true,
        isProxy: false,
        isTor: false,
        avgLoginsPerDay: 25,
        associatedAccountCount: 6,
      });

      expect(flags.length).toBeGreaterThan(1);
      expect(flags).toContain("vpn_proxy_tor");
      expect(flags).toContain("excessive_logins");
      expect(flags).toContain("many_accounts");
    });

    test("should return empty array for clean device", () => {
      const flags = generateRiskFlags({
        isVPN: false,
        isProxy: false,
        isTor: false,
        avgLoginsPerDay: 3,
        associatedAccountCount: 1,
      });

      expect(flags.length).toBe(0);
    });
  });

  describe("Device Age Calculation", () => {
    test("should calculate device age in hours correctly", () => {
      const firstSeenAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const deviceAgeHours =
        (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);

      expect(deviceAgeHours).toBeCloseTo(24, 0);
    });

    test("should calculate device age for very new device", () => {
      const firstSeenAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const deviceAgeHours =
        (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);

      expect(deviceAgeHours).toBeCloseTo(1, 0);
    });

    test("should calculate device age for old device", () => {
      const firstSeenAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const deviceAgeHours =
        (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);

      expect(deviceAgeHours).toBeCloseTo(720, 0);
    });
  });

  describe("Average Logins Per Day", () => {
    test("should calculate average logins correctly", () => {
      const totalLogins = 30;
      const deviceAgeHours = 10 * 24; // 10 days
      const avgLoginsPerDay = totalLogins / (deviceAgeHours / 24);

      expect(avgLoginsPerDay).toBe(3);
    });

    test("should handle new device (< 1 day)", () => {
      const totalLogins = 5;
      const deviceAgeHours = 12; // 0.5 days
      const avgLoginsPerDay = totalLogins / Math.max(1, deviceAgeHours / 24);

      expect(avgLoginsPerDay).toBeGreaterThan(0);
    });

    test("should handle zero logins", () => {
      const totalLogins = 0;
      const deviceAgeHours = 100;
      const avgLoginsPerDay = totalLogins / Math.max(1, deviceAgeHours / 24);

      expect(avgLoginsPerDay).toBe(0);
    });
  });

  describe("IP Reputation Checks", () => {
    interface IPInfo {
      country: string;
      isVPN: boolean;
      isProxy: boolean;
      isTor: boolean;
    }

    test("should identify clean IP", () => {
      const ipInfo: IPInfo = {
        country: "PL",
        isVPN: false,
        isProxy: false,
        isTor: false,
      };

      const isSuspicious =
        ipInfo.isVPN || ipInfo.isProxy || ipInfo.isTor;
      expect(isSuspicious).toBe(false);
    });

    test("should flag VPN IPs", () => {
      const ipInfo: IPInfo = {
        country: "US",
        isVPN: true,
        isProxy: false,
        isTor: false,
      };

      const isSuspicious =
        ipInfo.isVPN || ipInfo.isProxy || ipInfo.isTor;
      expect(isSuspicious).toBe(true);
    });

    test("should flag Tor exit nodes", () => {
      const ipInfo: IPInfo = {
        country: "DE",
        isVPN: false,
        isProxy: false,
        isTor: true,
      };

      const isSuspicious =
        ipInfo.isVPN || ipInfo.isProxy || ipInfo.isTor;
      expect(isSuspicious).toBe(true);
    });
  });
});


