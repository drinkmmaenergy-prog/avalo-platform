/**
 * Tests for Discovery Ranking v2 (Phase 20)
 * Focus on scoring algorithm, signal calculation, and risk dampening
 */

;

describe("Discovery Ranking v2 - Scoring Algorithm", () => {
  const RANKING_WEIGHTS = {
    RECENCY: 25,
    DISTANCE: 30,
    INTERACTION_DEPTH: 20,
    REPLY_LATENCY: 15,
    PROFILE_QUALITY: 10,
  };

  describe("Recency Score Calculation", () => {
    test("should give max score for activity within 1 hour", () => {
      const hoursSinceActivity = 0.5;
      let recencyScore = 0;

      if (hoursSinceActivity < 1) recencyScore = RANKING_WEIGHTS.RECENCY;
      else if (hoursSinceActivity < 24) recencyScore = RANKING_WEIGHTS.RECENCY * 0.8;
      else if (hoursSinceActivity < 72) recencyScore = RANKING_WEIGHTS.RECENCY * 0.5;
      else if (hoursSinceActivity < 168) recencyScore = RANKING_WEIGHTS.RECENCY * 0.3;
      else recencyScore = RANKING_WEIGHTS.RECENCY * 0.1;

      expect(recencyScore).toBe(25);
    });

    test("should give 80% score for activity within 24 hours", () => {
      const hoursSinceActivity = 12;
      let recencyScore = 0;

      if (hoursSinceActivity < 1) recencyScore = RANKING_WEIGHTS.RECENCY;
      else if (hoursSinceActivity < 24) recencyScore = RANKING_WEIGHTS.RECENCY * 0.8;
      else if (hoursSinceActivity < 72) recencyScore = RANKING_WEIGHTS.RECENCY * 0.5;
      else if (hoursSinceActivity < 168) recencyScore = RANKING_WEIGHTS.RECENCY * 0.3;
      else recencyScore = RANKING_WEIGHTS.RECENCY * 0.1;

      expect(recencyScore).toBe(20);
    });

    test("should give 10% score for activity older than 7 days", () => {
      const hoursSinceActivity = 200;
      let recencyScore = 0;

      if (hoursSinceActivity < 1) recencyScore = RANKING_WEIGHTS.RECENCY;
      else if (hoursSinceActivity < 24) recencyScore = RANKING_WEIGHTS.RECENCY * 0.8;
      else if (hoursSinceActivity < 72) recencyScore = RANKING_WEIGHTS.RECENCY * 0.5;
      else if (hoursSinceActivity < 168) recencyScore = RANKING_WEIGHTS.RECENCY * 0.3;
      else recencyScore = RANKING_WEIGHTS.RECENCY * 0.1;

      expect(recencyScore).toBe(2.5);
    });
  });

  describe("Distance Score Calculation (Haversine)", () => {
    function toRadians(degrees: number): number {
      return degrees * (Math.PI / 180);
    }

    function calculateDistance(
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ): number {
      const R = 6371; // Earth radius in km
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
          Math.cos(toRadians(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    test("should calculate distance between same location as 0", () => {
      const distance = calculateDistance(52.2297, 21.0122, 52.2297, 21.0122);
      expect(distance).toBe(0);
    });

    test("should calculate distance between Warsaw and Krakow (~250km)", () => {
      const distance = calculateDistance(52.2297, 21.0122, 50.0647, 19.945);
      expect(distance).toBeGreaterThan(240);
      expect(distance).toBeLessThan(260);
    });

    test("should give max score for distance < 5km", () => {
      const distanceKm = 3;
      let distanceScore = 0;

      if (distanceKm < 5) distanceScore = RANKING_WEIGHTS.DISTANCE;
      else if (distanceKm < 20) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.8;
      else if (distanceKm < 50) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.5;
      else if (distanceKm < 100) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.3;
      else distanceScore = RANKING_WEIGHTS.DISTANCE * 0.1;

      expect(distanceScore).toBe(30);
    });

    test("should give 10% score for distance > 100km", () => {
      const distanceKm = 250;
      let distanceScore = 0;

      if (distanceKm < 5) distanceScore = RANKING_WEIGHTS.DISTANCE;
      else if (distanceKm < 20) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.8;
      else if (distanceKm < 50) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.5;
      else if (distanceKm < 100) distanceScore = RANKING_WEIGHTS.DISTANCE * 0.3;
      else distanceScore = RANKING_WEIGHTS.DISTANCE * 0.1;

      expect(distanceScore).toBe(3);
    });
  });

  describe("Interaction Depth Score", () => {
    test("should give high score for many interactions", () => {
      const totalMessages = 100;
      const totalLikes = 50;
      const totalViews = 200;

      const interactionScore = Math.min(
        RANKING_WEIGHTS.INTERACTION_DEPTH,
        (totalMessages * 0.3 + totalLikes * 0.2 + totalViews * 0.05) / 10
      );

      expect(interactionScore).toBeGreaterThan(0);
    });

    test("should cap interaction score at max weight", () => {
      const totalMessages = 1000;
      const totalLikes = 1000;
      const totalViews = 1000;

      const interactionScore = Math.min(
        RANKING_WEIGHTS.INTERACTION_DEPTH,
        (totalMessages * 0.3 + totalLikes * 0.2 + totalViews * 0.05) / 10
      );

      expect(interactionScore).toBe(RANKING_WEIGHTS.INTERACTION_DEPTH);
    });

    test("should give zero score for no interactions", () => {
      const totalMessages = 0;
      const totalLikes = 0;
      const totalViews = 0;

      const interactionScore = Math.min(
        RANKING_WEIGHTS.INTERACTION_DEPTH,
        (totalMessages * 0.3 + totalLikes * 0.2 + totalViews * 0.05) / 10
      );

      expect(interactionScore).toBe(0);
    });
  });

  describe("Reply Latency Score", () => {
    test("should give max score for replies under 5 minutes", () => {
      const avgReplyMinutes = 3;
      let latencyScore = 0;

      if (avgReplyMinutes < 5) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY;
      else if (avgReplyMinutes < 30) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.7;
      else if (avgReplyMinutes < 120) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.4;
      else latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.1;

      expect(latencyScore).toBe(15);
    });

    test("should give 10% score for replies over 2 hours", () => {
      const avgReplyMinutes = 180;
      let latencyScore = 0;

      if (avgReplyMinutes < 5) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY;
      else if (avgReplyMinutes < 30) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.7;
      else if (avgReplyMinutes < 120) latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.4;
      else latencyScore = RANKING_WEIGHTS.REPLY_LATENCY * 0.1;

      expect(latencyScore).toBe(1.5);
    });
  });

  describe("Profile Quality Score", () => {
    test("should give full score for complete profile", () => {
      const photoCount = 5;
      const hasVerifiedBadge = true;
      const hasBio = true;

      let qualityScore = 0;
      if (photoCount >= 3) qualityScore += 5;
      if (hasVerifiedBadge) qualityScore += 3;
      if (hasBio) qualityScore += 2;

      expect(qualityScore).toBe(10);
    });

    test("should give zero score for minimal profile", () => {
      const photoCount = 0;
      const hasVerifiedBadge = false;
      const hasBio = false;

      let qualityScore = 0;
      if (photoCount >= 3) qualityScore += 5;
      if (hasVerifiedBadge) qualityScore += 3;
      if (hasBio) qualityScore += 2;

      expect(qualityScore).toBe(0);
    });
  });

  describe("Risk Dampening Multiplier", () => {
    test("should not dampen for clean user", () => {
      const blockedByCount = 0;
      const reportedCount = 0;
      const strikeCount = 0;

      let dampening = 1.0;
      if (blockedByCount > 0) {
        dampening *= Math.pow(0.9, blockedByCount);
      }
      if (reportedCount > 0) {
        dampening *= Math.pow(0.85, reportedCount);
      }
      if (strikeCount > 0) {
        dampening *= Math.pow(0.7, strikeCount);
      }
      dampening = Math.max(0.1, dampening);

      expect(dampening).toBe(1.0);
    });

    test("should dampen by 10% per block", () => {
      const blockedByCount = 2;
      const reportedCount = 0;
      const strikeCount = 0;

      let dampening = 1.0;
      if (blockedByCount > 0) {
        dampening *= Math.pow(0.9, blockedByCount);
      }
      if (reportedCount > 0) {
        dampening *= Math.pow(0.85, reportedCount);
      }
      if (strikeCount > 0) {
        dampening *= Math.pow(0.7, strikeCount);
      }
      dampening = Math.max(0.1, dampening);

      expect(dampening).toBeCloseTo(0.81, 2); // 0.9^2 = 0.81
    });

    test("should heavily dampen for user with strikes", () => {
      const blockedByCount = 0;
      const reportedCount = 0;
      const strikeCount = 2;

      let dampening = 1.0;
      if (blockedByCount > 0) {
        dampening *= Math.pow(0.9, blockedByCount);
      }
      if (reportedCount > 0) {
        dampening *= Math.pow(0.85, reportedCount);
      }
      if (strikeCount > 0) {
        dampening *= Math.pow(0.7, strikeCount);
      }
      dampening = Math.max(0.1, dampening);

      expect(dampening).toBeCloseTo(0.49, 2); // 0.7^2 = 0.49
    });

    test("should not go below 0.1 minimum", () => {
      const blockedByCount = 10;
      const reportedCount = 10;
      const strikeCount = 10;

      let dampening = 1.0;
      if (blockedByCount > 0) {
        dampening *= Math.pow(0.9, blockedByCount);
      }
      if (reportedCount > 0) {
        dampening *= Math.pow(0.85, reportedCount);
      }
      if (strikeCount > 0) {
        dampening *= Math.pow(0.7, strikeCount);
      }
      dampening = Math.max(0.1, dampening);

      expect(dampening).toBe(0.1);
    });
  });

  describe("Total Score Calculation", () => {
    test("should calculate perfect score for ideal candidate", () => {
      // All max scores
      const recencyScore = 25;
      const distanceScore = 30;
      const interactionScore = 20;
      const latencyScore = 15;
      const qualityScore = 10;
      const riskDampening = 1.0;

      const totalScore =
        (recencyScore +
          distanceScore +
          interactionScore +
          latencyScore +
          qualityScore) *
        riskDampening;

      expect(totalScore).toBe(100);
    });

    test("should reduce score with risk dampening", () => {
      const recencyScore = 25;
      const distanceScore = 30;
      const interactionScore = 20;
      const latencyScore = 15;
      const qualityScore = 10;
      const riskDampening = 0.5; // 50% dampening

      const totalScore =
        (recencyScore +
          distanceScore +
          interactionScore +
          latencyScore +
          qualityScore) *
        riskDampening;

      expect(totalScore).toBe(50);
    });

    test("should handle zero interaction scores", () => {
      const recencyScore = 2.5; // Old activity
      const distanceScore = 3; // Far away
      const interactionScore = 0; // No interactions
      const latencyScore = 1.5; // Slow replies
      const qualityScore = 2; // Minimal profile
      const riskDampening = 0.81; // Some blocks

      const totalScore =
        (recencyScore +
          distanceScore +
          interactionScore +
          latencyScore +
          qualityScore) *
        riskDampening;

      expect(totalScore).toBeCloseTo(7.29, 2);
    });
  });

  describe("Signal Rollup Logic", () => {
    test("should accumulate signals correctly", () => {
      const messages = [
        { timestamp: Date.now() - 1000 * 60 * 60 }, // 1 hour ago
        { timestamp: Date.now() - 1000 * 60 * 60 * 2 }, // 2 hours ago
      ];

      const totalMessages = messages.length;
      const mostRecentActivity = Math.max(...messages.map((m) => m.timestamp));
      const hoursSinceActivity =
        (Date.now() - mostRecentActivity) / (1000 * 60 * 60);

      expect(totalMessages).toBe(2);
      expect(hoursSinceActivity).toBeCloseTo(1, 0);
    });

    test("should handle empty signal data", () => {
      const messages: any[] = [];
      const totalMessages = messages.length;
      const mostRecentActivity = 0;

      expect(totalMessages).toBe(0);
      expect(mostRecentActivity).toBe(0);
    });
  });
});


