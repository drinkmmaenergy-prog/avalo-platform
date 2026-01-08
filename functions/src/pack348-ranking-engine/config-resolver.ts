/**
 * PACK 348 — Configuration Resolver
 * 
 * Resolves ranking configuration with country overrides and A/B testing
 */

import * as admin from 'firebase-admin';
import {
  RankingEngineConfig,
  CountryRankingOverride,
  ABTestConfig,
  DEFAULT_RANKING_CONFIG,
  DEFAULT_SAFETY_PENALTIES,
  DEFAULT_TIER_ROUTING,
  SafetyPenaltyConfig,
  TierRoutingConfig,
} from './types';

export class RankingConfigResolver {
  private configCache: Map<string, { config: RankingEngineConfig; timestamp: number }> = new Map();
  private cacheLifetimeMs = 60000; // 1 minute cache

  constructor(private db: admin.firestore.Firestore) {}

  /**
   * Get ranking configuration for a specific country with caching
   */
  async getConfig(countryCode: string): Promise<RankingEngineConfig> {
    // Check cache first
    const cached = this.configCache.get(countryCode);
    if (cached && Date.now() - cached.timestamp < this.cacheLifetimeMs) {
      return cached.config;
    }

    // Load global config
    const globalConfig = await this.loadGlobalConfig();

    // Check for country override
    const countryOverride = await this.loadCountryOverride(countryCode);

    // Merge configurations
    const finalConfig = countryOverride
      ? this.mergeConfigs(globalConfig, countryOverride)
      : globalConfig;

    // Cache result
    this.configCache.set(countryCode, {
      config: finalConfig,
      timestamp: Date.now(),
    });

    return finalConfig;
  }

  /**
   * Get safety penalty configuration
   */
  async getSafetyConfig(): Promise<SafetyPenaltyConfig> {
    const doc = await this.db
      .collection('system')
      .doc('safetyPenalties')
      .get();

    if (doc.exists) {
      return doc.data() as SafetyPenaltyConfig;
    }

    return DEFAULT_SAFETY_PENALTIES;
  }

  /**
   * Get tier routing configuration
   */
  async getTierConfig(): Promise<TierRoutingConfig> {
    const doc = await this.db
      .collection('system')
      .doc('tierRouting')
      .get();

    if (doc.exists) {
      return doc.data() as TierRoutingConfig;
    }

    return DEFAULT_TIER_ROUTING;
  }

  /**
   * Load global ranking configuration
   */
  private async loadGlobalConfig(): Promise<RankingEngineConfig> {
    const doc = await this.db
      .collection('system')
      .doc('rankingEngine')
      .get();

    if (doc.exists) {
      return doc.data() as RankingEngineConfig;
    }

    // Initialize with defaults if not exists
    await this.db
      .collection('system')
      .doc('rankingEngine')
      .set(DEFAULT_RANKING_CONFIG);

    return DEFAULT_RANKING_CONFIG;
  }

  /**
   * Load country-specific override
   */
  private async loadCountryOverride(
    countryCode: string
  ): Promise<CountryRankingOverride | null> {
    const doc = await this.db
      .collection('system')
      .doc('rankingByCountry')
      .collection('countries')
      .doc(countryCode)
      .get();

    if (doc.exists) {
      const data = doc.data() as CountryRankingOverride;
      if (data.enabled) {
        return data;
      }
    }

    return null;
  }

  /**
   * Merge global config with country override
   */
  private mergeConfigs(
    global: RankingEngineConfig,
    override: CountryRankingOverride
  ): RankingEngineConfig {
    return {
      discovery: {
        ...global.discovery,
        ...(override.discovery || {}),
      },
      feed: {
        ...global.feed,
        ...(override.feed || {}),
      },
      swipe: {
        ...global.swipe,
        ...(override.swipe || {}),
      },
      ai: {
        ...global.ai,
        ...(override.ai || {}),
      },
      decay: {
        ...global.decay,
        ...(override.decay || {}),
      },
    };
  }

  /**
   * Get A/B test configuration for a user
   */
  async getABTestConfig(userId: string): Promise<{
    testId: string | null;
    config: Partial<RankingEngineConfig> | null;
  }> {
    // Get active tests
    const testsSnapshot = await this.db
      .collection('system')
      .doc('abTests')
      .collection('tests')
      .where('enabled', '==', true)
      .where('endDate', '>', Date.now())
      .get();

    if (testsSnapshot.empty) {
      return { testId: null, config: null };
    }

    // Check each test to see if user is enrolled
    for (const testDoc of testsSnapshot.docs) {
      const test = testDoc.data() as ABTestConfig;

      // Check if user is in test group
      const userHash = this.hashUserId(userId, test.testId);
      const isInTestGroup = userHash < test.testGroupPercentage;

      if (isInTestGroup) {
        return {
          testId: test.testId,
          config: test.testConfig,
        };
      }
    }

    return { testId: null, config: null };
  }

  /**
   * Apply A/B test config to base config
   */
  applyABTest(
    baseConfig: RankingEngineConfig,
    testConfig: Partial<RankingEngineConfig>
  ): RankingEngineConfig {
    return {
      discovery: {
        ...baseConfig.discovery,
        ...(testConfig.discovery || {}),
      },
      feed: {
        ...baseConfig.feed,
        ...(testConfig.feed || {}),
      },
      swipe: {
        ...baseConfig.swipe,
        ...(testConfig.swipe || {}),
      },
      ai: {
        ...baseConfig.ai,
        ...(testConfig.ai || {}),
      },
      decay: {
        ...baseConfig.decay,
        ...(testConfig.decay || {}),
      },
    };
  }

  /**
   * Hash user ID for consistent test group assignment
   */
  private hashUserId(userId: string, testId: string): number {
    let hash = 0;
    const str = userId + testId;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100; // Return 0-99
  }

  /**
   * Clear cache (useful after config updates)
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Update global ranking configuration
   */
  async updateGlobalConfig(
    config: RankingEngineConfig,
    adminId: string,
    adminEmail: string
  ): Promise<void> {
    const before = await this.loadGlobalConfig();

    await this.db
      .collection('system')
      .doc('rankingEngine')
      .set(config);

    // Log audit
    await this.logAudit({
      timestamp: Date.now(),
      adminId,
      adminEmail,
      action: 'update_global',
      before,
      after: config,
      reversible: true,
    });

    // Clear cache
    this.clearCache();
  }

  /**
   * Update country-specific override
   */
  async updateCountryConfig(
    countryCode: string,
    override: Partial<RankingEngineConfig>,
    enabled: boolean,
    adminId: string,
    adminEmail: string,
    notes?: string
  ): Promise<void> {
    const before = await this.loadCountryOverride(countryCode);

    const countryOverride: CountryRankingOverride = {
      countryCode,
      enabled,
      notes,
      createdAt: before?.createdAt || Date.now(),
      updatedAt: Date.now(),
      ...override,
    };

    await this.db
      .collection('system')
      .doc('rankingByCountry')
      .collection('countries')
      .doc(countryCode)
      .set(countryOverride);

    // Log audit
    await this.logAudit({
      timestamp: Date.now(),
      adminId,
      adminEmail,
      action: 'update_country',
      before,
      after: countryOverride,
      countryCode,
      reversible: true,
    });

    // Clear cache
    this.clearCache();
  }

  /**
   * Log audit entry
   */
  private async logAudit(log: Omit<import('./types').RankingAuditLog, 'id'>): Promise<void> {
    const auditRef = this.db
      .collection('system')
      .doc('rankingAuditLogs')
      .collection('logs')
      .doc();

    await auditRef.set({
      id: auditRef.id,
      ...log,
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(limit: number = 50): Promise<import('./types').RankingAuditLog[]> {
    const snapshot = await this.db
      .collection('system')
      .doc('rankingAuditLogs')
      .collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as import('./types').RankingAuditLog);
  }
}
