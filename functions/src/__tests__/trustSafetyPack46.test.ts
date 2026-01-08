/**
 * Tests for PACK 46 — Trust Engine & Blocklist Safety Mesh
 * 
 * Verifies trust score computation, risk flag assignment, and earn mode eligibility.
 * All logic is deterministic and should produce consistent results.
 */

import { computeTrustState, TrustCounters } from '../trustSafetyPack46';

describe('Trust Safety Pack 46', () => {
  describe('computeTrustState', () => {
    it('should start with base score of 80 for clean user', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(80);
      expect(result.riskFlags).toEqual([]);
      expect(result.earnModeAllowed).toBe(true);
    });

    it('should apply penalties correctly - reports', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 5,  // -15 penalty
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(65); // 80 - (5 * 3)
      expect(result.riskFlags).toContain('SCAM_SUSPECT'); // >= 3 reports
    });

    it('should apply penalties correctly - blocks', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 6,  // -30 penalty
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(50); // 80 - (6 * 5)
      expect(result.riskFlags).toContain('HARASSMENT'); // >= 5 blocks
    });

    it('should apply penalties correctly - ghosting', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 7,  // -28 penalty
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(52); // 80 - (7 * 4)
      expect(result.riskFlags).toContain('GHOSTING_EARNER'); // >= 5 ghosting
      expect(result.earnModeAllowed).toBe(false); // GHOSTING_EARNER disables earn
    });

    it('should apply penalties correctly - spam', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 15  // -30 penalty
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(50); // 80 - (15 * 2)
      expect(result.riskFlags).toContain('SPAMMER'); // >= 10 spam
    });

    it('should combine multiple penalties', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 4,   // -12
        totalBlocksReceived: 6,    // -30
        ghostingEarnSessions: 2,   // -8
        spamMessageCount: 5        // -10
      };

      const result = computeTrustState(counters);

      // 80 - 12 - 30 - 8 - 10 = 20
      expect(result.trustScore).toBe(20);
      expect(result.riskFlags).toContain('SCAM_SUSPECT'); // 4 reports
      expect(result.riskFlags).toContain('HARASSMENT'); // 6 blocks
      expect(result.earnModeAllowed).toBe(false); // score < 40
    });

    it('should clamp trust score to minimum 0', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 50,  // Would be -150
        totalBlocksReceived: 20,   // Additional -100
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(0); // Clamped to 0
      expect(result.trustScore).toBeGreaterThanOrEqual(0);
    });

    it('should clamp trust score to maximum 100', () => {
      // This would require implementing trust boosts, but for now we start at 80
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBeLessThanOrEqual(100);
    });

    it('should disable earn mode when score < 40', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 14,  // -42, score = 38
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(38);
      expect(result.earnModeAllowed).toBe(false);
    });

    it('should disable earn mode when GHOSTING_EARNER flag present', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 5,  // Triggers GHOSTING_EARNER
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(60); // 80 - 20, still > 40
      expect(result.riskFlags).toContain('GHOSTING_EARNER');
      expect(result.earnModeAllowed).toBe(false); // Disabled by flag
    });

    it('should allow earn mode when score >= 40 and no GHOSTING_EARNER', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 2,   // -6
        totalBlocksReceived: 3,    // -15
        ghostingEarnSessions: 0,   // No ghosting
        spamMessageCount: 5        // -10
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(49); // 80 - 31 = 49
      expect(result.earnModeAllowed).toBe(true); // >= 40 and no GHOSTING_EARNER
    });

    it('should add SCAM_SUSPECT flag at threshold', () => {
      const testCases = [
        { reports: 2, shouldHaveFlag: false },
        { reports: 3, shouldHaveFlag: true },
        { reports: 4, shouldHaveFlag: true }
      ];

      testCases.forEach(({ reports, shouldHaveFlag }) => {
        const counters: TrustCounters = {
          totalReportsReceived: reports,
          totalBlocksReceived: 0,
          ghostingEarnSessions: 0,
          spamMessageCount: 0
        };

        const result = computeTrustState(counters);

        if (shouldHaveFlag) {
          expect(result.riskFlags).toContain('SCAM_SUSPECT');
        } else {
          expect(result.riskFlags).not.toContain('SCAM_SUSPECT');
        }
      });
    });

    it('should add HARASSMENT flag at threshold', () => {
      const testCases = [
        { blocks: 4, shouldHaveFlag: false },
        { blocks: 5, shouldHaveFlag: true },
        { blocks: 6, shouldHaveFlag: true }
      ];

      testCases.forEach(({ blocks, shouldHaveFlag }) => {
        const counters: TrustCounters = {
          totalReportsReceived: 0,
          totalBlocksReceived: blocks,
          ghostingEarnSessions: 0,
          spamMessageCount: 0
        };

        const result = computeTrustState(counters);

        if (shouldHaveFlag) {
          expect(result.riskFlags).toContain('HARASSMENT');
        } else {
          expect(result.riskFlags).not.toContain('HARASSMENT');
        }
      });
    });

    it('should add SPAMMER flag at threshold', () => {
      const testCases = [
        { spam: 9, shouldHaveFlag: false },
        { spam: 10, shouldHaveFlag: true },
        { spam: 15, shouldHaveFlag: true }
      ];

      testCases.forEach(({ spam, shouldHaveFlag }) => {
        const counters: TrustCounters = {
          totalReportsReceived: 0,
          totalBlocksReceived: 0,
          ghostingEarnSessions: 0,
          spamMessageCount: spam
        };

        const result = computeTrustState(counters);

        if (shouldHaveFlag) {
          expect(result.riskFlags).toContain('SPAMMER');
        } else {
          expect(result.riskFlags).not.toContain('SPAMMER');
        }
      });
    });

    it('should add GHOSTING_EARNER flag at threshold', () => {
      const testCases = [
        { ghosting: 4, shouldHaveFlag: false },
        { ghosting: 5, shouldHaveFlag: true },
        { ghosting: 10, shouldHaveFlag: true }
      ];

      testCases.forEach(({ ghosting, shouldHaveFlag }) => {
        const counters: TrustCounters = {
          totalReportsReceived: 0,
          totalBlocksReceived: 0,
          ghostingEarnSessions: ghosting,
          spamMessageCount: 0
        };

        const result = computeTrustState(counters);

        if (shouldHaveFlag) {
          expect(result.riskFlags).toContain('GHOSTING_EARNER');
        } else {
          expect(result.riskFlags).not.toContain('GHOSTING_EARNER');
        }
      });
    });

    it('should be deterministic - same inputs produce same outputs', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 3,
        totalBlocksReceived: 5,
        ghostingEarnSessions: 2,
        spamMessageCount: 7
      };

      const result1 = computeTrustState(counters);
      const result2 = computeTrustState(counters);
      const result3 = computeTrustState(counters);

      expect(result1.trustScore).toBe(result2.trustScore);
      expect(result2.trustScore).toBe(result3.trustScore);
      expect(result1.riskFlags.sort()).toEqual(result2.riskFlags.sort());
      expect(result2.riskFlags.sort()).toEqual(result3.riskFlags.sort());
      expect(result1.earnModeAllowed).toBe(result2.earnModeAllowed);
      expect(result2.earnModeAllowed).toBe(result3.earnModeAllowed);
    });

    it('should handle edge case - all zeros', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(80);
      expect(result.riskFlags).toEqual([]);
      expect(result.earnModeAllowed).toBe(true);
    });

    it('should handle edge case - all at threshold', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 3,
        totalBlocksReceived: 5,
        ghostingEarnSessions: 5,
        spamMessageCount: 10
      };

      const result = computeTrustState(counters);

      // 80 - (3*3) - (5*5) - (5*4) - (10*2) = 80 - 9 - 25 - 20 - 20 = 6
      expect(result.trustScore).toBe(6);
      expect(result.riskFlags).toContain('SCAM_SUSPECT');
      expect(result.riskFlags).toContain('HARASSMENT');
      expect(result.riskFlags).toContain('GHOSTING_EARNER');
      expect(result.riskFlags).toContain('SPAMMER');
      expect(result.riskFlags.length).toBe(4);
      expect(result.earnModeAllowed).toBe(false); // Both low score AND ghosting flag
    });

    it('should return correct counter values in result', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 7,
        totalBlocksReceived: 3,
        ghostingEarnSessions: 2,
        spamMessageCount: 8
      };

      const result = computeTrustState(counters);

      expect(result.totalReportsReceived).toBe(7);
      expect(result.totalBlocksReceived).toBe(3);
      expect(result.ghostingEarnSessions).toBe(2);
      expect(result.spamMessageCount).toBe(8);
    });
  });

  describe('Trust Score Calculation Precision', () => {
    it('should calculate exactly as specified - Example 1', () => {
      // User with 1 report, 2 blocks, 1 ghosting, 0 spam
      const counters: TrustCounters = {
        totalReportsReceived: 1,
        totalBlocksReceived: 2,
        ghostingEarnSessions: 1,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      // 80 - (1*3) - (2*5) - (1*4) - (0*2) = 80 - 3 - 10 - 4 = 63
      expect(result.trustScore).toBe(63);
      expect(result.earnModeAllowed).toBe(true); // > 40 and no GHOSTING_EARNER
    });

    it('should calculate exactly as specified - Example 2', () => {
      // User right at earn mode threshold
      const counters: TrustCounters = {
        totalReportsReceived: 13,  // -39
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      // 80 - (13*3) = 80 - 39 = 41
      expect(result.trustScore).toBe(41);
      expect(result.earnModeAllowed).toBe(true); // Exactly >= 40
    });

    it('should calculate exactly as specified - Example 3', () => {
      // User just below earn mode threshold
      const counters: TrustCounters = {
        totalReportsReceived: 14,  // -42
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      // 80 - (14*3) = 80 - 42 = 38
      expect(result.trustScore).toBe(38);
      expect(result.earnModeAllowed).toBe(false); // < 40
    });
  });

  describe('Risk Flag Logic', () => {
    it('should add multiple flags when multiple thresholds met', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 3,   // SCAM_SUSPECT
        totalBlocksReceived: 5,    // HARASSMENT
        ghostingEarnSessions: 0,
        spamMessageCount: 10       // SPAMMER
      };

      const result = computeTrustState(counters);

      expect(result.riskFlags).toHaveLength(3);
      expect(result.riskFlags).toContain('SCAM_SUSPECT');
      expect(result.riskFlags).toContain('HARASSMENT');
      expect(result.riskFlags).toContain('SPAMMER');
    });

    it('should not add flags below thresholds', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 2,   // Below 3
        totalBlocksReceived: 4,    // Below 5
        ghostingEarnSessions: 4,   // Below 5
        spamMessageCount: 9        // Below 10
      };

      const result = computeTrustState(counters);

      expect(result.riskFlags).toEqual([]);
    });
  });

  describe('Earn Mode Eligibility', () => {
    it('should allow earn mode with good score and no ghosting', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 1,
        totalBlocksReceived: 1,
        ghostingEarnSessions: 0,  // No ghosting
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(72); // 80 - 3 - 5
      expect(result.earnModeAllowed).toBe(true);
    });

    it('should disallow earn mode with low score', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 15, // -45, score = 35
        totalBlocksReceived: 0,
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(35);
      expect(result.earnModeAllowed).toBe(false);
    });

    it('should disallow earn mode with GHOSTING_EARNER flag even if score is good', () => {
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 0,
        ghostingEarnSessions: 5,  // Score = 60, but has GHOSTING_EARNER
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(60); // Good score
      expect(result.riskFlags).toContain('GHOSTING_EARNER');
      expect(result.earnModeAllowed).toBe(false); // Disabled by flag
    });

    it('should allow earn mode at exactly score 40 with no ghosting', () => {
      // Find combination that gives exactly 40
      const counters: TrustCounters = {
        totalReportsReceived: 0,
        totalBlocksReceived: 8,  // -40
        ghostingEarnSessions: 0,
        spamMessageCount: 0
      };

      const result = computeTrustState(counters);

      expect(result.trustScore).toBe(40); // Exactly 40
      expect(result.earnModeAllowed).toBe(true); // >= 40
    });
  });
});