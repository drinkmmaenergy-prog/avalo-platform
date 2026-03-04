/**
 * PACK 452 — Monetization Engine vNext Scheduled Jobs
 *
 * Scheduled functions for:
 * - Expiring pending premium offers (every 15 minutes)
 * - Expiring inactive exclusive locks (every 5 minutes)
 * - Running revenue coach batch (daily at 06:00 UTC)
 * - Computing premium KPIs (daily at 02:00 UTC)
 *
 * @module pack452-scheduled
 * @version 1.0.0
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { expirePremiumOffer } from './pack452-premium-offer-engine';
import { expireInactiveExclusiveLocks } from './pack452-exclusive-mode';
import { runRevenueCoachBatch } from './pack452-revenue-coach';
import { runDailyPremiumKPIs } from './pack452-kpi-engine';
import { PREMIUM_OFFER_VALIDITY_MS } from './types/pack452-monetization-vnext.types';

// ============================================================================
// EXPIRE PENDING PREMIUM OFFERS (every 15 minutes)
// ============================================================================

/**
 * Scheduled job: Expire premium offers that have passed their 12h validity.
 * Runs every 15 minutes.
 * Returns reserved tokens to payer wallets.
 */
export const pack452_expirePendingOffers = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    console.log('[PACK 452] Running premium offer expiry check...');

    const now = Timestamp.now();

    // Find all PENDING offers that have expired
    const expiredOffersSnap = await db.collection('premiumOffers')
      .where('status', '==', 'PENDING')
      .where('expiresAt', '<=', now)
      .get();

    let expiredCount = 0;
    let errorCount = 0;

    for (const doc of expiredOffersSnap.docs) {
      try {
        await expirePremiumOffer(doc.id);
        expiredCount++;
      } catch (error) {
        console.error(`Failed to expire offer ${doc.id}:`, error);
        errorCount++;
      }
    }

    console.log(
      `[PACK 452] Offer expiry complete: ${expiredCount} expired, ${errorCount} errors`
    );
  }
);

// ============================================================================
// EXPIRE INACTIVE EXCLUSIVE LOCKS (every 5 minutes)
// ============================================================================

/**
 * Scheduled job: Expire exclusive locks with 30+ minutes of inactivity.
 * Runs every 5 minutes.
 * Releases earners from exclusive mode when inactive.
 */
export const pack452_expireExclusiveLocks = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    console.log('[PACK 452] Running exclusive lock expiry check...');

    const expiredCount = await expireInactiveExclusiveLocks();

    console.log(
      `[PACK 452] Exclusive lock expiry complete: ${expiredCount} expired`
    );
  }
);

// ============================================================================
// REVENUE COACH BATCH (daily at 06:00 UTC)
// ============================================================================

/**
 * Scheduled job: Run revenue coach evaluation for all earn_on users.
 * Runs daily at 06:00 UTC.
 * Generates NON-BLOCKING suggestions.
 */
export const pack452_revenueCoachDaily = onSchedule(
  {
    schedule: '0 6 * * *', // 06:00 UTC daily
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    console.log('[PACK 452] Running daily revenue coach batch...');

    const result = await runRevenueCoachBatch();

    console.log(
      `[PACK 452] Revenue coach complete: ${result.usersProcessed} users, ` +
      `${result.suggestionsCreated} suggestions, ${result.errors} errors`
    );
  }
);

// ============================================================================
// PREMIUM KPI COMPUTATION (daily at 02:00 UTC)
// ============================================================================

/**
 * Scheduled job: Compute and store premium KPI metrics.
 * Runs daily at 02:00 UTC.
 */
export const pack452_premiumKPIDaily = onSchedule(
  {
    schedule: '0 2 * * *', // 02:00 UTC daily
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    console.log('[PACK 452] Running daily premium KPI computation...');

    const metrics = await runDailyPremiumKPIs();

    console.log('[PACK 452] Premium KPIs computed:', JSON.stringify(metrics));
  }
);









