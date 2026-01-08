/**
 * PACK 386 - Global Budget Guardrails
 * 
 * Protects marketing spend with:
 * - Daily max per country
 * - Global max burn rate
 * - Emergency kill switch
 * - Budget alerts and notifications
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface MarketingBudget {
  budgetId: string;
  date: string;
  geo?: string;
  dailyMax: number;
  dailySpend: number;
  campaigns: Record<string, number>;
  status: 'ACTIVE' | 'WARNING' | 'CAPPED' | 'KILLED';
  alerts: string[];
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface BudgetRule {
  ruleId: string;
  type: 'DAILY_GEO' | 'DAILY_GLOBAL' | 'CAMPAIGN' | 'EMERGENCY';
  limit: number;
  warningThreshold: number;
  enabled: boolean;
  createdAt: admin.firestore.Timestamp;
}

// Global constants
const GLOBAL_DAILY_MAX = 50000; // $50k per day
const EMERGENCY_THRESHOLD = 0.9; // 90% of limit triggers alert
const CRITICAL_THRESHOLD = 0.95; // 95% triggers automatic pause

// ============================================================================
// INITIALIZE BUDGET RULES
// ============================================================================

export const pack386_initializeBudgetRules = functions.https.onCall(
  async (data: {}, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Default budget rules
    const rules = [
      {
        type: 'DAILY_GLOBAL',
        limit: GLOBAL_DAILY_MAX,
        warningThreshold: 0.8,
        enabled: true,
      },
      {
        type: 'DAILY_GEO' as const,
        geo: 'US',
        limit: 20000,
        warningThreshold: 0.8,
        enabled: true,
      },
      {
        type: 'DAILY_GEO' as const,
        geo: 'UK',
        limit: 10000,
        warningThreshold: 0.8,
        enabled: true,
      },
      {
        type: 'DAILY_GEO' as const,
        geo: 'EU',
        limit: 15000,
        warningThreshold: 0.8,
        enabled: true,
      },
    ];

    const batch = db.batch();
    for (const rule of rules) {
      const ruleRef = db.collection('marketingBudgetRules').doc();
      batch.set(ruleRef, {
        ruleId: ruleRef.id,
        ...rule,
        createdAt: admin.firestore.Timestamp.now(),
      });
    }

    await batch.commit();

    return { success: true, rulesCreated: rules.length };
  }
);

// ============================================================================
// CHECK BUDGET LIMITS (CALLED BEFORE SPENDING)
// ============================================================================

export const pack386_checkBudgetLimit = functions.https.onCall(
  async (data: {
    campaignId: string;
    amount: number;
    geo?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const today = new Date().toISOString().split('T')[0];

    // Get today's budget
    let budgetDoc = await db.collection('marketingBudgets')
      .where('date', '==', today)
      .where('geo', '==', data.geo || 'global')
      .limit(1)
      .get();

    let currentSpend = 0;
    let budgetRef;

    if (budgetDoc.empty) {
      // Create new budget document
      budgetRef = db.collection('marketingBudgets').doc();
      await budgetRef.set({
        budgetId: budgetRef.id,
        date: today,
        geo: data.geo || 'global',
        dailyMax: getDailyMaxForGeo(data.geo),
        dailySpend: 0,
        campaigns: {},
        status: 'ACTIVE',
        alerts: [],
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } else {
      budgetRef = budgetDoc.docs[0].ref;
      const budgetData = budgetDoc.docs[0].data();
      currentSpend = budgetData.dailySpend || 0;
    }

    // Refresh budget data
    const refreshedDoc = await budgetRef.get();
    const budget = refreshedDoc.data() as MarketingBudget;
    const dailyMax = budget.dailyMax;
    const newSpend = currentSpend + data.amount;

    // Check if exceeds limit
    if (newSpend > dailyMax) {
      return {
        allowed: false,
        reason: 'BUDGET_EXCEEDED',
        currentSpend,
        dailyMax,
        requestedAmount: data.amount,
      };
    }

    // Check warning threshold
    const threshold = newSpend / dailyMax;
    if (threshold >= EMERGENCY_THRESHOLD) {
      await budgetRef.update({
        status: 'WARNING',
        alerts: admin.firestore.FieldValue.arrayUnion(`Budget at ${Math.round(threshold * 100)}%`),
      });

      // Send alert
      await db.collection('adminAlerts').add({
        type: 'BUDGET_WARNING',
        geo: data.geo || 'global',
        currentSpend: newSpend,
        dailyMax,
        threshold: Math.round(threshold * 100),
        timestamp: admin.firestore.Timestamp.now(),
      });
    }

    return {
      allowed: true,
      currentSpend,
      dailyMax,
      remaining: dailyMax - newSpend,
      thresholdPercent: Math.round(threshold * 100),
    };
  }
);

// ============================================================================
// RECORD SPEND (CALLED AFTER SPENDING)
// ============================================================================

export const pack386_recordSpend = functions.https.onCall(
  async (data: {
    campaignId: string;
    amount: number;
    geo?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const today = new Date().toISOString().split('T')[0];

    // Get or create budget
    const budgetSnapshot = await db.collection('marketingBudgets')
      .where('date', '==', today)
      .where('geo', '==', data.geo || 'global')
      .limit(1)
      .get();

    let budgetRef;
    if (budgetSnapshot.empty) {
      budgetRef = db.collection('marketingBudgets').doc();
      await budgetRef.set({
        budgetId: budgetRef.id,
        date: today,
        geo: data.geo || 'global',
        dailyMax: getDailyMaxForGeo(data.geo),
        dailySpend: 0,
        campaigns: {},
        status: 'ACTIVE',
        alerts: [],
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } else {
      budgetRef = budgetSnapshot.docs[0].ref;
    }

    // Update spend
    await budgetRef.update({
      dailySpend: admin.firestore.FieldValue.increment(data.amount),
      [`campaigns.${data.campaignId}`]: admin.firestore.FieldValue.increment(data.amount),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// BUDGET MONITORING (SCHEDULED)
// ============================================================================

export const pack386_monitorBudgets = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const today = new Date().toISOString().split('T')[0];

    // Get today's budgets
    const budgetsSnapshot = await db.collection('marketingBudgets')
      .where('date', '==', today)
      .get();

    for (const doc of budgetsSnapshot.docs) {
      const budget = doc.data() as MarketingBudget;
      const threshold = budget.dailySpend / budget.dailyMax;

      // Critical threshold - auto-pause campaigns
      if (threshold >= CRITICAL_THRESHOLD && budget.status !== 'CAPPED') {
        await doc.ref.update({
          status: 'CAPPED',
          alerts: admin.firestore.FieldValue.arrayUnion('Budget cap reached - campaigns paused'),
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Pause all campaigns in this geo
        const campaignsSnapshot = await db.collection('marketingCampaigns')
          .where('status', '==', 'ACTIVE')
          .get();

        const batch = db.batch();
        let pausedCount = 0;

        for (const campaignDoc of campaignsSnapshot.docs) {
          const campaign = campaignDoc.data();
          const matchesGeo = budget.geo === 'global' || 
            (campaign.geoTargeting && campaign.geoTargeting.includes(budget.geo));

          if (matchesGeo) {
            batch.update(campaignDoc.ref, {
              status: 'PAUSED',
              updatedAt: admin.firestore.Timestamp.now(),
            });
            pausedCount++;
          }
        }

        await batch.commit();

        // Send critical alert
        await db.collection('adminAlerts').add({
          type: 'BUDGET_CRITICAL',
          geo: budget.geo,
          dailySpend: budget.dailySpend,
          dailyMax: budget.dailyMax,
          campaignsPaused: pausedCount,
          timestamp: admin.firestore.Timestamp.now(),
        });

        await db.collection('adminAuditLog').add({
          action: 'BUDGET_CAP_REACHED',
          geo: budget.geo,
          dailySpend: budget.dailySpend,
          dailyMax: budget.dailyMax,
          campaignsPaused: pausedCount,
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
      // Warning threshold
      else if (threshold >= EMERGENCY_THRESHOLD && budget.status === 'ACTIVE') {
        await doc.ref.update({
          status: 'WARNING',
          alerts: admin.firestore.FieldValue.arrayUnion(`Budget at ${Math.round(threshold * 100)}%`),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    }

    return null;
  });

// ============================================================================
// EMERGENCY KILL SWITCH
// ============================================================================

export const pack386_budgetKillSwitch = functions.https.onCall(
  async (data: {
    reason: string;
    geo?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const today = new Date().toISOString().split('T')[0];

    // Get budgets
    let budgetsQuery: FirebaseFirestore.Query = db.collection('marketingBudgets')
      .where('date', '==', today);

    if (data.geo) {
      budgetsQuery = budgetsQuery.where('geo', '==', data.geo);
    }

    const budgetsSnapshot = await budgetsQuery.get();

    // Kill all budgets
    const batch = db.batch();
    budgetsSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        status: 'KILLED',
        alerts: admin.firestore.FieldValue.arrayUnion(`EMERGENCY KILL: ${data.reason}`),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await batch.commit();

    // Pause ALL campaigns
    let campaignsQuery: FirebaseFirestore.Query = db.collection('marketingCampaigns')
      .where('status', '==', 'ACTIVE');

    if (data.geo) {
      campaignsQuery = campaignsQuery.where('geoTargeting', 'array-contains', data.geo);
    }

    const campaignsSnapshot = await campaignsQuery.get();

    const campaignBatch = db.batch();
    campaignsSnapshot.forEach(doc => {
      campaignBatch.update(doc.ref, {
        status: 'KILLED',
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await campaignBatch.commit();

    // Log critical event
    await db.collection('adminAuditLog').add({
      action: 'EMERGENCY_KILL_SWITCH',
      reason: data.reason,
      geo: data.geo || 'ALL',
      campaignsKilled: campaignsSnapshot.size,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    // Send critical alert
    await db.collection('adminAlerts').add({
      type: 'EMERGENCY_KILL_SWITCH',
      reason: data.reason,
      geo: data.geo || 'ALL',
      campaignsKilled: campaignsSnapshot.size,
      triggeredBy: userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return {
      success: true,
      budgetsKilled: budgetsSnapshot.size,
      campaignsKilled: campaignsSnapshot.size,
    };
  }
);

// ============================================================================
// RESET DAILY BUDGETS (SCHEDULED)
// ============================================================================

export const pack386_resetDailyBudgets = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const today = new Date().toISOString().split('T')[0];

    // Archive yesterday's budgets
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayBudgets = await db.collection('marketingBudgets')
      .where('date', '==', yesterdayStr)
      .get();

    const batch = db.batch();
    yesterdayBudgets.forEach(doc => {
      const archiveRef = db.collection('marketingBudgetArchive').doc(doc.id);
      batch.set(archiveRef, doc.data());
    });

    await batch.commit();

    // Log reset
    await db.collection('adminAuditLog').add({
      action: 'DAILY_BUDGET_RESET',
      date: today,
      archivedBudgets: yesterdayBudgets.size,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return null;
  });

// ============================================================================
// GET BUDGET DASHBOARD
// ============================================================================

export const pack386_getBudgetDashboard = functions.https.onCall(
  async (data: { date?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const date = data.date || new Date().toISOString().split('T')[0];

    // Get budgets for date
    const budgetsSnapshot = await db.collection('marketingBudgets')
      .where('date', '==', date)
      .get();

    const budgets = budgetsSnapshot.docs.map(doc => doc.data());

    // Calculate totals
    const totalSpend = budgets.reduce((sum, b: any) => sum + (b.dailySpend || 0), 0);
    const totalMax = budgets.reduce((sum, b: any) => sum + (b.dailyMax || 0), 0);

    // Get campaigns
    const campaignsSnapshot = await db.collection('marketingCampaigns')
      .where('status', '==', 'ACTIVE')
      .get();

    const activeCampaigns = campaignsSnapshot.size;

    return {
      date,
      totalSpend,
      totalMax,
      remaining: totalMax - totalSpend,
      utilizationPercent: totalMax > 0 ? Math.round((totalSpend / totalMax) * 100) : 0,
      activeCampaigns,
      budgetsByGeo: budgets,
      status: totalSpend / totalMax >= CRITICAL_THRESHOLD ? 'CRITICAL' :
              totalSpend / totalMax >= EMERGENCY_THRESHOLD ? 'WARNING' : 'HEALTHY',
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDailyMaxForGeo(geo?: string): number {
  const geoLimits: Record<string, number> = {
    'US': 20000,
    'UK': 10000,
    'EU': 15000,
    'global': GLOBAL_DAILY_MAX,
  };

  return geoLimits[geo || 'global'] || 5000;
}
