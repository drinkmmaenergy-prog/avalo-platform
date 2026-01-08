/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Scheduled Jobs for Graph Maintenance and Detection
 * 
 * Jobs run periodically to:
 * - Update fraud graph edges
 * - Detect collusion rings
 * - Detect spam clusters
 * - Clean up old data
 * - Expire temporary enforcements
 */

import * as functions from 'firebase-functions';
import { decayStaleEdges } from './pack104-fraudGraph';
import { 
  detectCollusionRings,
  cleanupOldRings,
} from './pack104-collusionDetection';
import {
  detectCommercialSpamClusters,
} from './pack104-spamDetection';
import {
  applyCollusionRingEnforcement,
  applySpamClusterEnforcement,
  cleanupExpiredEnforcements,
} from './pack104-enforcement';
import {
  createCollusionRingCase,
  createSpamClusterCase,
} from './pack104-caseManagement';

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Update fraud graph edges - Daily at 2 AM
 * Applies decay to stale edges
 */
export const updateFraudGraphEdges = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK104] Starting fraud graph edge update...');
    
    try {
      const result = await decayStaleEdges();
      
      console.log(`[PACK104] Graph update complete: ${result.decayed} decayed, ${result.removed} removed`);
      
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      console.error('[PACK104] Error updating graph edges:', error);
      throw error;
    }
  });

/**
 * Detect collusion rings - Daily at 3 AM
 * Runs graph analysis to find coordinated groups
 */
export const detectCollusionRingsJob = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK104] Starting collusion ring detection...');
    
    try {
      const rings = await detectCollusionRings();
      
      console.log(`[PACK104] Detected ${rings.length} collusion rings`);
      
      // Apply enforcement and create cases for high-risk rings
      for (const ring of rings) {
        if (ring.riskLevel === 'MEDIUM' || ring.riskLevel === 'HIGH') {
          // Apply enforcement
          await applyCollusionRingEnforcement(ring.ringId);
          
          // Create moderation case
          await createCollusionRingCase(ring.ringId);
        }
      }
      
      return {
        success: true,
        ringsDetected: rings.length,
        highRiskRings: rings.filter(r => r.riskLevel === 'HIGH').length,
        mediumRiskRings: rings.filter(r => r.riskLevel === 'MEDIUM').length,
      };
    } catch (error) {
      console.error('[PACK104] Error detecting collusion rings:', error);
      throw error;
    }
  });

/**
 * Detect commercial spam clusters - Daily at 4 AM
 * Analyzes recent signups for spam patterns
 */
export const detectCommercialSpamClustersJob = functions.pubsub
  .schedule('0 4 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK104] Starting commercial spam cluster detection...');
    
    try {
      const clusters = await detectCommercialSpamClusters();
      
      console.log(`[PACK104] Detected ${clusters.length} spam clusters`);
      
      // Apply enforcement and create cases for high-risk clusters
      for (const cluster of clusters) {
        if (cluster.riskLevel === 'MEDIUM' || cluster.riskLevel === 'HIGH') {
          // Apply enforcement
          await applySpamClusterEnforcement(cluster.clusterId);
          
          // Create moderation case
          await createSpamClusterCase(cluster.clusterId);
        }
      }
      
      return {
        success: true,
        clustersDetected: clusters.length,
        highRiskClusters: clusters.filter(c => c.riskLevel === 'HIGH').length,
        mediumRiskClusters: clusters.filter(c => c.riskLevel === 'MEDIUM').length,
      };
    } catch (error) {
      console.error('[PACK104] Error detecting spam clusters:', error);
      throw error;
    }
  });

/**
 * Cleanup expired enforcements - Every 6 hours
 * Removes temporary restrictions that have expired
 */
export const cleanupExpiredEnforcementsJob = functions.pubsub
  .schedule('0 */6 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK104] Starting expired enforcement cleanup...');
    
    try {
      const cleaned = await cleanupExpiredEnforcements();
      
      console.log(`[PACK104] Cleaned up ${cleaned} expired enforcements`);
      
      return {
        success: true,
        cleaned,
      };
    } catch (error) {
      console.error('[PACK104] Error cleaning up enforcements:', error);
      throw error;
    }
  });

/**
 * Cleanup old rings and clusters - Weekly on Sundays at 1 AM
 * Removes resolved/false positive cases older than 90 days
 */
export const cleanupOldDataJob = functions.pubsub
  .schedule('0 1 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK104] Starting old data cleanup...');
    
    try {
      const cleanedRings = await cleanupOldRings(90);
      
      console.log(`[PACK104] Cleaned up ${cleanedRings} old rings`);
      
      return {
        success: true,
        cleanedRings,
      };
    } catch (error) {
      console.error('[PACK104] Error cleaning up old data:', error);
      throw error;
    }
  });

// ============================================================================
// UTILITY: Manual Trigger Functions (for testing/admin)
// ============================================================================

/**
 * Manually trigger ring detection (admin only)
 */
export const triggerRingDetection = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  console.log('[PACK104] Manual trigger: Ring detection');
  
  const rings = await detectCollusionRings();
  
  return {
    success: true,
    ringsDetected: rings.length,
    rings: rings.map(r => ({
      ringId: r.ringId,
      size: r.ringSize,
      riskLevel: r.riskLevel,
      probability: r.collusionProbability,
    })),
  };
});

/**
 * Manually trigger spam cluster detection (admin only)
 */
export const triggerSpamDetection = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  console.log('[PACK104] Manual trigger: Spam cluster detection');
  
  const clusters = await detectCommercialSpamClusters();
  
  return {
    success: true,
    clustersDetected: clusters.length,
    clusters: clusters.map(c => ({
      clusterId: c.clusterId,
      size: c.clusterSize,
      riskLevel: c.riskLevel,
      probability: c.spamProbability,
    })),
  };
});