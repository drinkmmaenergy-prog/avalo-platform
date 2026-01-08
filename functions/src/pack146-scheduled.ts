/**
 * PACK 146 — Scheduled Jobs for Copyright Protection
 * Background scanning and maintenance
 * 
 * Jobs:
 * - Daily duplicate content scan
 * - Weekly piracy network detection
 * - Hourly watermark consistency audits
 */

import { onSchedule } from './common';
import { logger } from './common';
import { scanUserContentForDuplicates } from './pack146-hashing';
import { detectPiracyNetworks } from './pack146-piracy-watchlist';
import { db } from './init';

// ============================================================================
// DUPLICATE CONTENT SCAN
// ============================================================================

/**
 * Daily duplicate content scan
 * Runs at 2 AM daily
 */
export const dailyDuplicateScan = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting daily duplicate content scan...');
    
    try {
      // Get all users with protected content
      const hashesSnapshot = await db.collection('content_hash_registry')
        .where('duplicateDetectionEnabled', '==', true)
        .limit(100)
        .get();
      
      const uniqueOwners = new Set<string>();
      hashesSnapshot.docs.forEach(doc => {
        uniqueOwners.add(doc.data().ownerId);
      });
      
      let totalScanned = 0;
      let totalDuplicatesFound = 0;
      
      // Scan each user's content
      for (const ownerId of Array.from(uniqueOwners)) {
        try {
          const result = await scanUserContentForDuplicates(ownerId);
          totalScanned += result.total;
          totalDuplicatesFound += result.duplicatesFound;
          
          // Create copyright cases for found duplicates
          if (result.duplicatesFound > 0) {
            logger.warn(`Found ${result.duplicatesFound} duplicates for user ${ownerId}`);
            
            // Auto-create cases for high-confidence matches
            for (const duplicate of result.duplicates) {
              if (duplicate.confidence > 0.9) {
                await createAutoCopyrightCase(ownerId, duplicate);
              }
            }
          }
        } catch (error) {
          logger.error(`Failed to scan content for user ${ownerId}:`, error);
        }
      }
      
      logger.info(`Daily scan complete: ${totalScanned} items scanned, ${totalDuplicatesFound} duplicates found`);
      
      // Store scan results
      await db.collection('scan_logs').add({
        scanType: 'DUPLICATE_CONTENT',
        timestamp: new Date(),
        itemsScanned: totalScanned,
        duplicatesFound: totalDuplicatesFound,
        usersScanned: uniqueOwners.size,
      });
    } catch (error) {
      logger.error('Daily duplicate scan failed:', error);
    }
  }
);

/**
 * Create automatic copyright case for detected duplicate
 */
async function createAutoCopyrightCase(
  originalOwnerId: string,
  duplicate: {
    contentId: string;
    originalOwnerId: string;
    confidence: number;
  }
): Promise<void> {
  
  // Create auto-detected copyright case
  const caseId = require('crypto').randomBytes(16).toString('hex');
  
  await db.collection('copyright_cases').add({
    caseId,
    claimantId: originalOwnerId,
    originalContentId: duplicate.contentId,
    allegedInfringerId: duplicate.originalOwnerId,
    infringingContentId: duplicate.contentId,
    claimType: 'UNAUTHORIZED_UPLOAD',
    claimDescription: 'Auto-detected duplicate content',
    detectedBy: 'AUTO_SCAN',
    detectionConfidence: duplicate.confidence,
    status: 'AI_SCANNING',
    priority: 'MEDIUM',
    createdAt: new Date(),
  });
  
  logger.info(`Auto-created copyright case for detected duplicate: ${duplicate.contentId}`);
}

// ============================================================================
// PIRACY NETWORK DETECTION
// ============================================================================

/**
 * Weekly piracy network detection
 * Runs every Monday at 3 AM
 */
export const weeklyPiracyNetworkScan = onSchedule(
  {
    schedule: '0 3 * * 1',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting weekly piracy network detection...');
    
    try {
      const networks = await detectPiracyNetworks();
      
      logger.info(`Detected ${networks.length} potential piracy networks`);
      
      // Create moderation cases for high-risk networks
      for (const network of networks) {
        if (network.riskLevel === 'CRITICAL' || network.riskLevel === 'HIGH') {
          await createNetworkModerationCase(network);
        }
      }
      
      // Store scan results
      await db.collection('scan_logs').add({
        scanType: 'PIRACY_NETWORK',
        timestamp: new Date(),
        networksDetected: networks.length,
        highRiskNetworks: networks.filter(n => n.riskLevel === 'HIGH' || n.riskLevel === 'CRITICAL').length,
      });
    } catch (error) {
      logger.error('Weekly piracy network scan failed:', error);
    }
  }
);

/**
 * Create moderation case for detected network
 */
async function createNetworkModerationCase(network: any): Promise<void> {
  const caseId = require('crypto').randomBytes(16).toString('hex');
  
  await db.collection('moderation_cases').doc(caseId).set({
    caseId,
    caseType: 'PIRACY_NETWORK',
    networkId: network.networkId,
    involvedUsers: network.memberUserIds,
    priority: network.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
    status: 'OPEN',
    detectedAt: new Date(),
    requiresReview: true,
    automated: true,
  });
  
  logger.warn(`Created moderation case for piracy network: ${network.networkId}`);
}

// ============================================================================
// WATERMARK CONSISTENCY AUDIT
// ============================================================================

/**
 * Hourly watermark consistency audit
 * Runs every hour
 */
export const hourlyWatermarkAudit = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting hourly watermark audit...');
    
    try {
      // Check recent watermarks for consistency
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentWatermarks = await db.collection('watermark_registry')
        .where('createdAt', '>=', oneHourAgo)
        .get();
      
      let inconsistencies = 0;
      
      for (const doc of recentWatermarks.docs) {
        const watermark = doc.data();
        
        // Check if watermark has both visible and invisible components
        if (!watermark.visibleWatermark?.enabled && !watermark.invisibleWatermark?.enabled) {
          logger.warn(`Watermark ${doc.id} has no protection enabled`);
          inconsistencies++;
        }
        
        // Check if buyer watermark is present for paid content
        if (watermark.contentType === 'DIGITAL_PRODUCT' && !watermark.buyerWatermark) {
          logger.warn(`Digital product watermark ${doc.id} missing buyer watermark`);
          inconsistencies++;
        }
      }
      
      logger.info(`Watermark audit complete: ${recentWatermarks.size} checked, ${inconsistencies} inconsistencies`);
      
      // Store audit results
      await db.collection('audit_logs').add({
        auditType: 'WATERMARK_CONSISTENCY',
        timestamp: new Date(),
        watermarksChecked: recentWatermarks.size,
        inconsistenciesFound: inconsistencies,
      });
    } catch (error) {
      logger.error('Hourly watermark audit failed:', error);
    }
  }
);

// ============================================================================
// EXPIRED ACCESS CLEANUP
// ============================================================================

/**
 * Daily cleanup of expired downloads and access freezes
 * Runs at 4 AM daily
 */
export const dailyAccessCleanup = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting daily access cleanup...');
    
    try {
      const now = new Date();
      
      // Clean up expired downloads
      const expiredDownloads = await db.collection('download_records')
        .where('expiresAt', '<', now)
        .where('downloadValid', '==', true)
        .limit(100)
        .get();
      
      const batch = db.batch();
      expiredDownloads.docs.forEach(doc => {
        batch.update(doc.ref, {
          downloadValid: false,
          expiredAt: now,
        });
      });
      
      await batch.commit();
      
      // Clean up expired access freezes
      const expiredFreezes = await db.collection('access_freezes')
        .where('expiresAt', '<', now)
        .limit(100)
        .get();
      
      const freezeBatch = db.batch();
      expiredFreezes.docs.forEach(doc => {
        freezeBatch.delete(doc.ref);
      });
      
      await freezeBatch.commit();
      
      logger.info(`Access cleanup complete: ${expiredDownloads.size} downloads expired, ${expiredFreezes.size} freezes removed`);
      
      // Store cleanup results
      await db.collection('maintenance_logs').add({
        maintenanceType: 'ACCESS_CLEANUP',
        timestamp: now,
        downloadsExpired: expiredDownloads.size,
        freezesRemoved: expiredFreezes.size,
      });
    } catch (error) {
      logger.error('Daily access cleanup failed:', error);
    }
  }
);

// ============================================================================
// WATCHLIST RISK SCORE UPDATE
// ============================================================================

/**
 * Daily risk score recalculation for watchlist
 * Runs at 5 AM daily
 */
export const dailyWatchlistUpdate = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
  },
  async () => {
    logger.info('Starting daily watchlist update...');
    
    try {
      // Get all watchlist entries
      const watchlist = await db.collection('piracy_watchlist')
        .limit(200)
        .get();
      
      let updated = 0;
      
      for (const doc of watchlist.docs) {
        const entry = doc.data();
        
        // Recalculate risk score based on recent activity
        const recentViolations = entry.violations?.filter((v: any) => {
          const violationDate = v.detectedAt?.toDate?.();
          return violationDate && (Date.now() - violationDate.getTime()) < 30 * 24 * 60 * 60 * 1000;
        }) || [];
        
        // Risk score decays over time
        let newRiskScore = entry.riskScore || 0;
        
        if (recentViolations.length === 0 && !entry.isBlacklisted) {
          // Decay by 5 points per day if no recent violations
          newRiskScore = Math.max(0, newRiskScore - 5);
        }
        
        // Update if score changed
        if (newRiskScore !== entry.riskScore) {
          await doc.ref.update({
            riskScore: newRiskScore,
            riskLevel: determineRiskLevel(newRiskScore),
            updatedAt: new Date(),
          });
          updated++;
        }
      }
      
      logger.info(`Watchlist update complete: ${updated} entries updated out of ${watchlist.size}`);
      
      // Store update results
      await db.collection('maintenance_logs').add({
        maintenanceType: 'WATCHLIST_UPDATE',
        timestamp: new Date(),
        entriesChecked: watchlist.size,
        entriesUpdated: updated,
      });
    } catch (error) {
      logger.error('Daily watchlist update failed:', error);
    }
  }
);

/**
 * Determine risk level from score
 */
function determineRiskLevel(score: number): string {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  if (score >= 10) return 'LOW';
  return 'NONE';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  dailyDuplicateScan,
  weeklyPiracyNetworkScan,
  hourlyWatermarkAudit,
  dailyAccessCleanup,
  dailyWatchlistUpdate,
};