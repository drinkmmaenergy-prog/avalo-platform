/**
 * PACK 336 — GROWTH EXPERIMENTS FRAMEWORK
 * 
 * A/B testing and experimentation system for:
 * - Pricing experiments
 * - Free message limits
 * - Royal perks tests
 * - Geo-rollouts
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init.js';
import type { KpiExperiment, ExperimentResult } from './pack336-types.js';

// ============================================================================
// EXPERIMENT CREATION & MANAGEMENT
// ============================================================================

/**
 * Create a new growth experiment (admin only)
 */
export const pack336_createExperiment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { title, hypothesis, startDate, endDate, controlMetric, targetMetric } = data;
  
  if (!title || !hypothesis || !startDate || !endDate || !controlMetric || !targetMetric) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: title, hypothesis, startDate, endDate, controlMetric, targetMetric'
    );
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid date format. Use YYYY-MM-DD');
  }
  
  // Validate dates
  if (new Date(startDate) >= new Date(endDate)) {
    throw new functions.https.HttpsError('invalid-argument', 'startDate must be before endDate');
  }
  
  try {
    const experimentRef = db.collection('kpiExperiments').doc();
    
    const experiment: Partial<KpiExperiment> = {
      id: experimentRef.id,
      title,
      hypothesis,
      startDate,
      endDate,
      controlMetric,
      targetMetric,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      createdBy: context.auth.uid,
    };
    
    await experimentRef.set(experiment);
    
    console.log(`[PACK 336] Experiment created: ${experimentRef.id} - ${title}`);
    
    return {
      success: true,
      experimentId: experimentRef.id,
      experiment,
    };
  } catch (error: any) {
    console.error('[PACK 336] Error creating experiment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update experiment with results (admin only)
 */
export const pack336_updateExperimentResults = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { experimentId, result, deltaPercent } = data;
  
  if (!experimentId || !result) {
    throw new functions.https.HttpsError('invalid-argument', 'experimentId and result are required');
  }
  
  if (!['WIN', 'LOSE', 'INCONCLUSIVE'].includes(result)) {
    throw new functions.https.HttpsError('invalid-argument', 'result must be WIN, LOSE, or INCONCLUSIVE');
  }
  
  try {
    const experimentRef = db.collection('kpiExperiments').doc(experimentId);
    const experimentDoc = await experimentRef.get();
    
    if (!experimentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Experiment not found');
    }
    
    await experimentRef.update({
      result,
      deltaPercent: deltaPercent || 0,
      updatedAt: serverTimestamp(),
    });
    
    console.log(`[PACK 336] Experiment results updated: ${experimentId} - ${result}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[PACK 336] Error updating experiment results:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get all experiments with filtering (admin only)
 */
export const pack336_getExperiments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { result, limit } = data;
  
  try {
    let query = db.collection('kpiExperiments')
      .orderBy('startDate', 'desc') as any;
    
    if (result) {
      query = query.where('result', '==', result);
    }
    
    query = query.limit(limit || 50);
    
    const snapshot = await query.get();
    
    const experiments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return { success: true, experiments };
  } catch (error: any) {
    console.error('[PACK 336] Error getting experiments:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get experiment details (admin only)
 */
export const pack336_getExperiment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { experimentId } = data;
  
  if (!experimentId) {
    throw new functions.https.HttpsError('invalid-argument', 'experimentId is required');
  }
  
  try {
    const experimentDoc = await db.collection('kpiExperiments').doc(experimentId).get();
    
    if (!experimentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Experiment not found');
    }
    
    return {
      success: true,
      experiment: {
        id: experimentDoc.id,
        ...experimentDoc.data(),
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting experiment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Delete an experiment (admin only)
 */
export const pack336_deleteExperiment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { experimentId } = data;
  
  if (!experimentId) {
    throw new functions.https.HttpsError('invalid-argument', 'experimentId is required');
  }
  
  try {
    await db.collection('kpiExperiments').doc(experimentId).delete();
    
    console.log(`[PACK 336] Experiment deleted: ${experimentId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[PACK 336] Error deleting experiment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get experiment statistics (admin only)
 * Returns summary of all experiments
 */
export const pack336_getExperimentStatistics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  try {
    const snapshot = await db.collection('kpiExperiments').get();
    
    let totalExperiments = 0;
    let wins = 0;
    let losses = 0;
    let inconclusive = 0;
    let ongoing = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      totalExperiments++;
      
      if (data.result === 'WIN') wins++;
      else if (data.result === 'LOSE') losses++;
      else if (data.result === 'INCONCLUSIVE') inconclusive++;
      else ongoing++;
    });
    
    const winRate = totalExperiments > 0 ? (wins / totalExperiments) * 100 : 0;
    
    return {
      success: true,
      statistics: {
        totalExperiments,
        wins,
        losses,
        inconclusive,
        ongoing,
        winRate,
      },
    };
  } catch (error: any) {
    console.error('[PACK 336] Error getting experiment statistics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});