/**
 * PACK 161 — Smart Social Graph Background Jobs
 * Scheduled jobs for discovery refresh, safety scanning, and fairness audits
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DiscoveryRefreshJob,
  SafetyComplianceScanJob,
  FairnessDiversityAudit,
  DiscoveryCategory,
} from '../types/smartSocialGraph.types';
import { updateCreatorRelevanceScore } from './relevanceRanking';
import { scanRecentContentForFlirts } from './antiFlirtManipulation';
import {
  getShadowDensityStats,
  identifyGuaranteedSlotCreators,
  grantGuaranteedSlots,
} from './shadowDensityControl';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[BackgroundJobs]', ...args),
  warn: (...args: any[]) => console.warn('[BackgroundJobs]', ...args),
  error: (...args: any[]) => console.error('[BackgroundJobs]', ...args),
};

// ============================================================================
// DAILY DISCOVERY REFRESH
// ============================================================================

/**
 * Scheduled job: Refresh discovery scores daily
 * Runs at 02:00 UTC every day
 */
export const dailyDiscoveryRefresh = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const jobId = `refresh_${Date.now()}`;
    
    logger.info(`Starting daily discovery refresh job ${jobId}`);
    
    const job: DiscoveryRefreshJob = {
      jobId,
      status: 'RUNNING',
      profilesProcessed: 0,
      profilesFailed: 0,
      startedAt: serverTimestamp() as Timestamp,
    };
    
    // Save job status
    const jobRef = db.collection('discovery_refresh_jobs').doc(jobId);
    await jobRef.set(job);
    
    try {
      // Get all active creators
      const creatorsSnapshot = await db
        .collection('users')
        .where('roles.creator', '==', true)
        .where('accountStatus.status', '==', 'active')
        .get();
      
      logger.info(`Found ${creatorsSnapshot.size} active creators to refresh`);
      
      // Process in batches of 50
      const batchSize = 50;
      const creators = creatorsSnapshot.docs;
      
      for (let i = 0; i < creators.length; i += batchSize) {
        const batch = creators.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (doc) => {
            try {
              await updateCreatorRelevanceScore(doc.id);
              job.profilesProcessed++;
            } catch (error) {
              logger.error(`Error refreshing creator ${doc.id}:`, error);
              job.profilesFailed++;
            }
          })
        );
        
        // Update job progress
        await jobRef.update({
          profilesProcessed: job.profilesProcessed,
          profilesFailed: job.profilesFailed,
        });
        
        logger.info(`Progress: ${job.profilesProcessed}/${creators.length} processed`);
      }
      
      // Mark job as complete
      await jobRef.update({
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
      });
      
      logger.info(
        `Daily discovery refresh completed: ${job.profilesProcessed} processed, ` +
        `${job.profilesFailed} failed`
      );
    } catch (error) {
      logger.error('Daily discovery refresh failed:', error);
      
      await jobRef.update({
        status: 'FAILED',
        error: String(error),
        completedAt: serverTimestamp(),
      });
    }
  });

// ============================================================================
// SAFETY & COMPLIANCE SCAN
// ============================================================================

/**
 * Scheduled job: Scan for flirt manipulation and safety violations
 * Runs every 6 hours
 */
export const safetyComplianceScan = functions.pubsub
  .schedule('0 */6 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const jobId = `safety_scan_${Date.now()}`;
    
    logger.info(`Starting safety compliance scan ${jobId}`);
    
    const job: SafetyComplianceScanJob = {
      jobId,
      status: 'RUNNING',
      contentScanned: 0,
      violationsDetected: 0,
      actionsTaken: 0,
      startedAt: serverTimestamp() as Timestamp,
    };
    
    const jobRef = db.collection('safety_compliance_jobs').doc(jobId);
    await jobRef.set(job);
    
    try {
      // Scan last 6 hours of content
      const scanResults = await scanRecentContentForFlirts(6);
      
      job.contentScanned = scanResults.scanned;
      job.violationsDetected = scanResults.violations;
      job.actionsTaken = scanResults.demoted;
      
      // Mark job as complete
      await jobRef.update({
        status: 'COMPLETED',
        contentScanned: job.contentScanned,
        violationsDetected: job.violationsDetected,
        actionsTaken: job.actionsTaken,
        completedAt: serverTimestamp(),
      });
      
      logger.info(
        `Safety scan completed: ${job.contentScanned} scanned, ` +
        `${job.violationsDetected} violations, ${job.actionsTaken} actions taken`
      );
    } catch (error) {
      logger.error('Safety compliance scan failed:', error);
      
      await jobRef.update({
        status: 'FAILED',
        error: String(error),
        completedAt: serverTimestamp(),
      });
    }
  });

// ============================================================================
// FAIRNESS & DIVERSITY AUDIT
// ============================================================================

/**
 * Scheduled job: Audit discovery fairness and diversity
 * Runs daily at 03:00 UTC
 */
export const fairnessDiversityAudit = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const auditId = `audit_${Date.now()}`;
    
    logger.info(`Starting fairness & diversity audit ${auditId}`);
    
    try {
      // Get shadow density stats
      const densityStats = await getShadowDensityStats();
      
      // Calculate category distribution
      const categoryDistribution = await calculateCategoryDistribution();
      
      // Calculate mega-creator dominance
      const megaDominance = densityStats.creatorsInRotationLimit > 0
        ? (densityStats.creatorsInRotationLimit / densityStats.totalCreators) * 100
        : 0;
      
      // Calculate new creator visibility
      const newCreatorVisibility = await calculateNewCreatorVisibility();
      
      // Check token spending correlation (should be ~0)
      const tokenCorrelation = await checkTokenSpendingCorrelation();
      
      // Calculate regional balance
      const regionalBalance = await calculateRegionalBalance();
      
      // Determine pass/fail
      const issues: string[] = [];
      const recommendations: string[] = [];
      
      if (megaDominance > 10) {
        issues.push(`Mega-creator dominance too high: ${megaDominance.toFixed(1)}%`);
        recommendations.push('Increase shadow density penalties for high-exposure creators');
      }
      
      if (newCreatorVisibility < 20) {
        issues.push(`New creator visibility too low: ${newCreatorVisibility.toFixed(1)}%`);
        recommendations.push('Grant more guaranteed discovery slots to new creators');
      }
      
      if (Math.abs(tokenCorrelation) > 0.3) {
        issues.push(`Token spending correlation detected: ${tokenCorrelation.toFixed(3)}`);
        recommendations.push('⚠️ CRITICAL: Discovery may be influenced by spending');
      }
      
      if (regionalBalance < 50) {
        issues.push(`Regional balance low: ${regionalBalance}/100`);
        recommendations.push('Improve regional creator prioritization');
      }
      
      const passed = issues.length === 0;
      
      // Create audit report
      const audit: FairnessDiversityAudit = {
        auditId,
        timestamp: serverTimestamp() as Timestamp,
        categoryDistribution,
        newCreatorVisibility,
        megaCreatorDominance: megaDominance,
        tokenSpendingCorrelation: tokenCorrelation,
        regionalBalance,
        passed,
        issues,
        recommendations,
      };
      
      // Save audit
      await db.collection('fairness_diversity_audits').doc(auditId).set(audit);
      
      // If audit passed, grant guaranteed slots to new creators
      if (passed || newCreatorVisibility < 30) {
        await grantGuaranteedSlotsToNewCreators();
      }
      
      logger.info(
        `Fairness audit completed: ${passed ? 'PASSED' : 'FAILED'}, ` +
        `${issues.length} issues, ${recommendations.length} recommendations`
      );
      
      if (!passed) {
        logger.warn('Fairness audit issues:', issues);
      }
    } catch (error) {
      logger.error('Fairness & diversity audit failed:', error);
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate category distribution across all impressions
 */
async function calculateCategoryDistribution(): Promise<Record<DiscoveryCategory, number>> {
  try {
    const distribution: Record<string, number> = {};
    
    const snapshot = await db
      .collection('creator_relevance_scores')
      .select('primaryCategory', 'weeklyImpressions')
      .get();
    
    let totalImpressions = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const category = data.primaryCategory;
      const impressions = data.weeklyImpressions || 0;
      
      distribution[category] = (distribution[category] || 0) + impressions;
      totalImpressions += impressions;
    });
    
    // Convert to percentages
    const result: any = {};
    for (const [category, count] of Object.entries(distribution)) {
      result[category] = totalImpressions > 0 
        ? Math.round((count / totalImpressions) * 100)
        : 0;
    }
    
    return result;
  } catch (error) {
    logger.error('Error calculating category distribution:', error);
    return {} as any;
  }
}

/**
 * Calculate percentage of impressions going to new creators
 */
async function calculateNewCreatorVisibility(): Promise<number> {
  try {
    const densitySnapshot = await db
      .collection('shadow_density_counters')
      .get();
    
    let totalImpressions = 0;
    let newCreatorImpressions = 0;
    
    densitySnapshot.docs.forEach(doc => {
      const data = doc.data();
      const impressions = data.weeklyImpressions || 0;
      
      totalImpressions += impressions;
      
      // Consider "new" if under 10K impressions
      if (impressions < 10_000) {
        newCreatorImpressions += impressions;
      }
    });
    
    return totalImpressions > 0
      ? (newCreatorImpressions / totalImpressions) * 100
      : 0;
  } catch (error) {
    logger.error('Error calculating new creator visibility:', error);
    return 0;
  }
}

/**
 * Check correlation between token spending and discovery visibility
 * Should be close to 0 (no correlation)
 */
async function checkTokenSpendingCorrelation(): Promise<number> {
  try {
    // Get sample of creators with spending and impression data
    const creatorsSnapshot = await db
      .collection('creator_relevance_scores')
      .limit(100)
      .get();
    
    const data: Array<{ spending: number; impressions: number }> = [];
    
    for (const doc of creatorsSnapshot.docs) {
      const creatorId = doc.id;
      const impressions = doc.data().weeklyImpressions || 0;
      
      // Get spending data
      const walletDoc = await db.collection('wallets').doc(creatorId).get();
      const spending = walletDoc.exists ? (walletDoc.data()?.spent || 0) : 0;
      
      data.push({ spending, impressions });
    }
    
    if (data.length < 10) {
      return 0; // Not enough data
    }
    
    // Calculate Pearson correlation
    const correlation = calculatePearsonCorrelation(
      data.map(d => d.spending),
      data.map(d => d.impressions)
    );
    
    return correlation;
  } catch (error) {
    logger.error('Error checking token spending correlation:', error);
    return 0;
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate regional balance score (0-100)
 */
async function calculateRegionalBalance(): Promise<number> {
  try {
    const snapshot = await db
      .collection('interest_vectors')
      .select('region', 'countryCode')
      .limit(1000)
      .get();
    
    const regions = new Set<string>();
    const countries = new Set<string>();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.region) regions.add(data.region);
      if (data.countryCode) countries.add(data.countryCode);
    });
    
    // Score based on diversity
    const regionScore = Math.min(100, regions.size * 20); // 5 regions = 100
    const countryScore = Math.min(100, countries.size * 2); // 50 countries = 100
    
    return Math.round((regionScore + countryScore) / 2);
  } catch (error) {
    logger.error('Error calculating regional balance:', error);
    return 50; // Default neutral score
  }
}

/**
 * Grant guaranteed discovery slots to eligible new creators
 */
async function grantGuaranteedSlotsToNewCreators(): Promise<void> {
  try {
    const eligibleCreators = await identifyGuaranteedSlotCreators(50);
    
    logger.info(`Granting guaranteed slots to ${eligibleCreators.length} new creators`);
    
    for (const creatorId of eligibleCreators) {
      await grantGuaranteedSlots(creatorId, 3);
    }
    
    logger.info('Guaranteed slots granted successfully');
  } catch (error) {
    logger.error('Error granting guaranteed slots:', error);
  }
}

logger.info('✅ Smart Social Graph Background Jobs initialized');