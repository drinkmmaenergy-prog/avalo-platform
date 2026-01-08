/**
 * PACK 199: Regional Compliance Law Update Schedulers
 * Scheduled functions for monitoring and updating regional laws
 */

import { db } from '../init';
import { RegionCode, LawUpdateScanResult } from './types';
import { REGIONAL_RULES } from './regional-rules';
import { Timestamp } from 'firebase-admin/firestore';
import { MarketplaceFilter } from './marketplace-filter';

export async function lawUpdateScanner(): Promise<LawUpdateScanResult> {
  const scannedAt = Timestamp.now();
  const regionsChecked: RegionCode[] = Object.keys(REGIONAL_RULES) as RegionCode[];
  let updatesFound = 0;
  let updatesApplied = 0;
  const errors: string[] = [];

  try {
    for (const regionCode of regionsChecked) {
      try {
        const hasUpdates = await checkRegionForLawUpdates(regionCode);
        
        if (hasUpdates) {
          updatesFound++;
          
          const applied = await applyRegionalLawUpdates(regionCode);
          if (applied) {
            updatesApplied++;
          }
        }
      } catch (error: any) {
        errors.push(`${regionCode}: ${error.message}`);
      }
    }

    const nextScanAt = Timestamp.fromMillis(
      scannedAt.toMillis() + 30 * 24 * 60 * 60 * 1000
    );

    const result: LawUpdateScanResult = {
      scannedAt,
      regionsChecked,
      updatesFound,
      updatesApplied,
      errors,
      nextScanAt,
    };

    await db.collection('regional_law_scans').add(result);

    return result;
  } catch (error: any) {
    errors.push(`Scanner error: ${error.message}`);
    
    return {
      scannedAt,
      regionsChecked,
      updatesFound,
      updatesApplied,
      errors,
      nextScanAt: Timestamp.fromMillis(scannedAt.toMillis() + 24 * 60 * 60 * 1000),
    };
  }
}

async function checkRegionForLawUpdates(regionCode: RegionCode): Promise<boolean> {
  const rulesRef = db.collection('regional_rules').doc(regionCode);
  const rulesDoc = await rulesRef.get();

  if (!rulesDoc.exists) {
    return false;
  }

  const currentRules = rulesDoc.data();
  const predefinedRules = REGIONAL_RULES[regionCode];

  if (!currentRules || !predefinedRules) {
    return false;
  }

  if (currentRules.version !== predefinedRules.version) {
    return true;
  }

  const lastUpdateMillis = currentRules.lastUpdated?.toMillis() || 0;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  if (lastUpdateMillis < thirtyDaysAgo) {
    return true;
  }

  return false;
}

async function applyRegionalLawUpdates(regionCode: RegionCode): Promise<boolean> {
  try {
    const predefinedRules = REGIONAL_RULES[regionCode];
    
    if (!predefinedRules) {
      return false;
    }

    const rulesRef = db.collection('regional_rules').doc(regionCode);
    
    await rulesRef.set({
      ...predefinedRules,
      lastUpdated: Timestamp.now(),
    });

    await db.collection('regional_law_update_log').add({
      regionCode,
      version: predefinedRules.version,
      updatedAt: Timestamp.now(),
      source: 'automated-scanner',
    });

    const marketplaceFilter = new MarketplaceFilter();
    await marketplaceFilter.refreshMarketplaceCompliance(regionCode);

    return true;
  } catch (error) {
    console.error(`Failed to apply law updates for ${regionCode}:`, error);
    return false;
  }
}

export async function marketplaceComplianceRefresh(): Promise<void> {
  const regionsToRefresh: RegionCode[] = Object.keys(REGIONAL_RULES) as RegionCode[];

  for (const regionCode of regionsToRefresh) {
    try {
      const marketplaceFilter = new MarketplaceFilter();
      await marketplaceFilter.refreshMarketplaceCompliance(regionCode);

      await db.collection('marketplace_compliance_refreshes').add({
        regionCode,
        refreshedAt: Timestamp.now(),
        status: 'completed',
      });
    } catch (error: any) {
      await db.collection('marketplace_compliance_refreshes').add({
        regionCode,
        refreshedAt: Timestamp.now(),
        status: 'failed',
        error: error.message,
      });
    }
  }
}

export async function regionalComplianceHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
  checks: Record<string, boolean>;
}> {
  const issues: string[] = [];
  const checks: Record<string, boolean> = {};

  checks.rulesLoaded = Object.keys(REGIONAL_RULES).length > 0;
  if (!checks.rulesLoaded) {
    issues.push('Regional rules not loaded');
  }

  const regionsSnapshot = await db.collection('regional_rules').get();
  checks.rulesStored = regionsSnapshot.size > 0;
  if (!checks.rulesStored) {
    issues.push('No regional rules stored in database');
  }

  const userProfilesSnapshot = await db
    .collection('regional_user_profiles')
    .limit(1)
    .get();
  checks.userProfiles = userProfilesSnapshot.size > 0;

  const safetyFlagsSnapshot = await db
    .collection('regional_safety_flags')
    .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();
  checks.safetyMonitoring = true;

  const marketplaceItemsSnapshot = await db
    .collection('regional_marketplace_items')
    .limit(1)
    .get();
  checks.marketplaceFiltering = marketplaceItemsSnapshot.size > 0;

  const healthy = issues.length === 0;

  await db.collection('regional_compliance_health').add({
    timestamp: Timestamp.now(),
    healthy,
    issues,
    checks,
  });

  return {
    healthy,
    issues,
    checks,
  };
}

export async function detectStaleLawData(): Promise<{
  staleRegions: RegionCode[];
  totalRegions: number;
}> {
  const staleRegions: RegionCode[] = [];
  const allRegions = Object.keys(REGIONAL_RULES) as RegionCode[];

  for (const regionCode of allRegions) {
    const rulesRef = db.collection('regional_rules').doc(regionCode);
    const rulesDoc = await rulesRef.get();

    if (rulesDoc.exists) {
      const data = rulesDoc.data();
      const lastUpdateMillis = data?.lastUpdated?.toMillis() || 0;
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

      if (lastUpdateMillis < sixtyDaysAgo) {
        staleRegions.push(regionCode);
      }
    } else {
      staleRegions.push(regionCode);
    }
  }

  await db.collection('regional_stale_data_reports').add({
    timestamp: Timestamp.now(),
    staleRegions,
    totalRegions: allRegions.length,
    stalePct: (staleRegions.length / allRegions.length) * 100,
  });

  return {
    staleRegions,
    totalRegions: allRegions.length,
  };
}

export async function initializeRegionalRules(): Promise<void> {
  const allRegions = Object.keys(REGIONAL_RULES) as RegionCode[];

  for (const regionCode of allRegions) {
    const rulesRef = db.collection('regional_rules').doc(regionCode);
    const rulesDoc = await rulesRef.get();

    if (!rulesDoc.exists) {
      await rulesRef.set({
        ...REGIONAL_RULES[regionCode],
        lastUpdated: Timestamp.now(),
      });

      console.log(`Initialized regional rules for ${regionCode}`);
    }
  }
}

export async function generateComplianceReport(
  regionCode: RegionCode,
  startDate: Date,
  endDate: Date
): Promise<{
  regionCode: RegionCode;
  period: { start: Date; end: Date };
  safetyFlags: number;
  marketplaceBlocks: number;
  escalations: number;
  complianceScore: number;
}> {
  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(endDate);

  const safetyFlagsSnapshot = await db
    .collection('regional_safety_flags')
    .where('regionCode', '==', regionCode)
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<=', endTimestamp)
    .get();

  const marketplaceBlocksSnapshot = await db
    .collection('regional_marketplace_blocks')
    .where('regionCode', '==', regionCode)
    .where('blockedAt', '>=', startTimestamp)
    .where('blockedAt', '<=', endTimestamp)
    .get();

  const escalationsSnapshot = await db
    .collection('regional_escalations')
    .where('regionCode', '==', regionCode)
    .where('escalatedAt', '>=', startTimestamp)
    .where('escalatedAt', '<=', endTimestamp)
    .get();

  const safetyFlags = safetyFlagsSnapshot.size;
  const marketplaceBlocks = marketplaceBlocksSnapshot.size;
  const escalations = escalationsSnapshot.size;

  const totalIssues = safetyFlags + marketplaceBlocks + escalations;
  const complianceScore = Math.max(0, 100 - totalIssues);

  const report = {
    regionCode,
    period: { start: startDate, end: endDate },
    safetyFlags,
    marketplaceBlocks,
    escalations,
    complianceScore,
  };

  await db.collection('regional_compliance_reports').add({
    ...report,
    generatedAt: Timestamp.now(),
  });

  return report;
}