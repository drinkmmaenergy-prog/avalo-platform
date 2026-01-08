/**
 * PACK 372 — GLOBAL LAUNCH ORCHESTRATOR
 * Phased Rollouts + Kill-Switch System
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// TYPES & INTERFACES
// ============================================

type LaunchStatus = 'locked' | 'beta' | 'soft' | 'public' | 'frozen';
type FeatureState = 'on' | 'off' | 'restricted';

interface GlobalLaunchConfig {
  countryCode: string;
  launchStatus: LaunchStatus;
  enabledFeatures: string[];
  paymentEnabled: boolean;
  withdrawalsEnabled: boolean;
  adsEnabled: boolean;
  maxNewUsersPerDay: number;
  kycRequired: boolean;
  ageVerificationRequired: boolean;
  lastUpdated: admin.firestore.Timestamp;
}

interface FeatureKillSwitch {
  featureKey: string;
  globalState: FeatureState;
  countriesAllowed: string[];
  reason: string;
  activatedBy: string;
  activatedAt: admin.firestore.Timestamp;
}

interface CountryTrafficLimits {
  countryCode: string;
  maxRegistrationsPerHour: number;
  maxChatSessionsPerMinute: number;
  maxPaymentsPerMinute: number;
  maxPayoutRequestsPerHour: number;
  lastUpdated: admin.firestore.Timestamp;
}

interface PaymentSafetyGate {
  countryCode: string;
  payoutsBlocked: boolean;
  tokenSalesBlocked: boolean;
  maxDisputeRatioThreshold: number;
  minKycCoverageThreshold: number;
  maxFraudScoreThreshold: number;
  maxRefundRatioThreshold: number;
  lastUpdated: admin.firestore.Timestamp;
}

// ============================================
// 1️⃣ FEATURE ACCESS CHECKER
// ============================================

export const checkFeatureAccess = functions.https.onCall(
  async (data: { userId: string; featureKey: string }, context) => {
    const { userId, featureKey } = data;

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const userCountry = userData.countryCode || 'US';

      // Check global kill switch
      const killSwitchDoc = await db
        .collection('featureKillSwitches')
        .doc(featureKey)
        .get();

      if (killSwitchDoc.exists) {
        const killSwitch = killSwitchDoc.data() as FeatureKillSwitch;

        if (killSwitch.globalState === 'off') {
          return {
            allowed: false,
            reason: `Feature globally disabled: ${killSwitch.reason}`,
          };
        }

        if (
          killSwitch.globalState === 'restricted' &&
          !killSwitch.countriesAllowed.includes(userCountry)
        ) {
          return {
            allowed: false,
            reason: `Feature not available in ${userCountry}`,
          };
        }
      }

      // Check country launch config
      const launchConfigDoc = await db
        .collection('globalLaunchConfig')
        .doc(userCountry)
        .get();

      if (!launchConfigDoc.exists) {
        return {
          allowed: false,
          reason: 'Country not configured',
        };
      }

      const launchConfig = launchConfigDoc.data() as GlobalLaunchConfig;

      // Check if country is frozen
      if (launchConfig.launchStatus === 'frozen') {
        return {
          allowed: false,
          reason: 'Country temporarily frozen',
        };
      }

      // Check if country is locked
      if (launchConfig.launchStatus === 'locked') {
        return {
          allowed: false,
          reason: 'Service not available in your country',
        };
      }

      // Check if feature is enabled for this country
      if (!launchConfig.enabledFeatures.includes(featureKey)) {
        return {
          allowed: false,
          reason: 'Feature not enabled in your region',
        };
      }

      // All checks passed
      return {
        allowed: true,
        reason: 'Access granted',
      };
    } catch (error) {
      console.error('Error checking feature access:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to check feature access'
      );
    }
  }
);

// ============================================
// 2️⃣ COUNTRY TRAFFIC THROTTLER
// ============================================

export const throttleCountryTraffic = functions.https.onCall(
  async (
    data: {
      countryCode: string;
      action: 'registration' | 'chat' | 'payment' | 'payout';
    },
    context
  ) => {
    const { countryCode, action } = data;

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Get traffic limits
      const limitsDoc = await db
        .collection('countryTrafficLimits')
        .doc(countryCode)
        .get();

      if (!limitsDoc.exists) {
        // No limits set, allow by default
        return { allowed: true, reason: 'No limits configured' };
      }

      const limits = limitsDoc.data() as CountryTrafficLimits;

      // Get current metrics
      const now = new Date();
      const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const minuteStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes()
      );

      const metricsDoc = await db
        .collection('countryTrafficMetrics')
        .doc(`${countryCode}_${hourStart.getTime()}`)
        .get();

      let currentMetrics = {
        countryCode,
        hourTimestamp: hourStart.getTime(),
        registrationsThisHour: 0,
        chatsThisMinute: 0,
        paymentsThisMinute: 0,
        payoutsThisHour: 0,
      };

      if (metricsDoc.exists) {
        currentMetrics = { ...currentMetrics, ...metricsDoc.data() };
      }

      // Check limits based on action
      let allowed = true;
      let reason = 'Within limits';

      switch (action) {
        case 'registration':
          if (currentMetrics.registrationsThisHour >= limits.maxRegistrationsPerHour) {
            allowed = false;
            reason = 'Registration limit exceeded for this hour';
          }
          break;

        case 'chat':
          if (currentMetrics.chatsThisMinute >= limits.maxChatSessionsPerMinute) {
            allowed = false;
            reason = 'Chat session limit exceeded for this minute';
          }
          break;

        case 'payment':
          if (currentMetrics.paymentsThisMinute >= limits.maxPaymentsPerMinute) {
            allowed = false;
            reason = 'Payment limit exceeded for this minute';
          }
          break;

        case 'payout':
          if (currentMetrics.payoutsThisHour >= limits.maxPayoutRequestsPerHour) {
            allowed = false;
            reason = 'Payout request limit exceeded for this hour';
          }
          break;
      }

      // If allowed, increment counter
      if (allowed) {
        const updateData: any = {
          countryCode,
          hourTimestamp: hourStart.getTime(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };

        switch (action) {
          case 'registration':
            updateData.registrationsThisHour = admin.firestore.FieldValue.increment(1);
            break;
          case 'chat':
            updateData.chatsThisMinute = admin.firestore.FieldValue.increment(1);
            break;
          case 'payment':
            updateData.paymentsThisMinute = admin.firestore.FieldValue.increment(1);
            break;
          case 'payout':
            updateData.payoutsThisHour = admin.firestore.FieldValue.increment(1);
            break;
        }

        await db
          .collection('countryTrafficMetrics')
          .doc(`${countryCode}_${hourStart.getTime()}`)
          .set(updateData, { merge: true });
      }

      return { allowed, reason };
    } catch (error) {
      console.error('Error throttling traffic:', error);
      throw new functions.https.HttpsError('internal', 'Failed to check traffic limits');
    }
  }
);

// ============================================
// 3️⃣ EMERGENCY FREEZE
// ============================================

export const emergencyFreeze = functions.https.onCall(
  async (data: { countryCode: string; reason: string }, context) => {
    const { countryCode, reason } = data;

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin/superadmin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can trigger emergency freeze'
      );
    }

    try {
      const batch = db.batch();

      // 1. Update launch config to frozen
      const launchConfigRef = db.collection('globalLaunchConfig').doc(countryCode);
      batch.update(launchConfigRef, {
        launchStatus: 'frozen',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Block all payments
      const paymentGateRef = db.collection('paymentSafetyGates').doc(countryCode);
      batch.set(
        paymentGateRef,
        {
          countryCode,
          payoutsBlocked: true,
          tokenSalesBlocked: true,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 3. Set traffic limits to zero
      const trafficLimitsRef = db.collection('countryTrafficLimits').doc(countryCode);
      batch.set(
        trafficLimitsRef,
        {
          countryCode,
          maxRegistrationsPerHour: 0,
          maxChatSessionsPerMinute: 0,
          maxPaymentsPerMinute: 0,
          maxPayoutRequestsPerHour: 0,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 4. Create freeze log
      const freezeLogRef = db.collection('emergencyFreezeLogs').doc();
      batch.set(freezeLogRef, {
        countryCode,
        reason,
        triggeredBy: context.auth.uid,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
        disabledFeatures: [
          'registration',
          'wallet',
          'payouts',
          'meetings',
          'events',
          'ai',
          'chat',
        ],
        status: 'active',
      });

      // 5. Create state transition log
      const transitionLogRef = db.collection('rolloutStateTransitions').doc();
      batch.set(transitionLogRef, {
        countryCode,
        previousState: 'unknown', // Will be filled by trigger
        newState: 'frozen',
        approvedBy: context.auth.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        reason: `EMERGENCY FREEZE: ${reason}`,
      });

      await batch.commit();

      // Send notification (integrate with PACK 293)
      await db.collection('notifications').add({
        type: 'emergency_freeze',
        priority: 'critical',
        title: `Emergency Freeze: ${countryCode}`,
        message: reason,
        countryCode,
        triggeredBy: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

      return {
        success: true,
        message: `Emergency freeze activated for ${countryCode}`,
      };
    } catch (error) {
      console.error('Error executing emergency freeze:', error);
      throw new functions.https.HttpsError('internal', 'Failed to execute emergency freeze');
    }
  }
);

// ============================================
// 4️⃣ PAYMENT SAFETY CHECK
// ============================================

export const checkPaymentSafety = functions.https.onCall(
  async (
    data: {
      countryCode: string;
      action: 'payout' | 'tokenSale';
    },
    context
  ) => {
    const { countryCode, action } = data;

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      // Check launch config
      const launchConfigDoc = await db
        .collection('globalLaunchConfig')
        .doc(countryCode)
        .get();

      if (!launchConfigDoc.exists) {
        return { allowed: false, reason: 'Country not configured' };
      }

      const launchConfig = launchConfigDoc.data() as GlobalLaunchConfig;

      // Check if payments/withdrawals enabled
      if (action === 'payout' && !launchConfig.withdrawalsEnabled) {
        return { allowed: false, reason: 'Withdrawals not enabled in your country' };
      }

      if (action === 'tokenSale' && !launchConfig.paymentEnabled) {
        return { allowed: false, reason: 'Payments not enabled in your country' };
      }

      // Check safety gates
      const safetyGateDoc = await db
        .collection('paymentSafetyGates')
        .doc(countryCode)
        .get();

      if (safetyGateDoc.exists) {
        const safetyGate = safetyGateDoc.data() as PaymentSafetyGate;

        if (action === 'payout' && safetyGate.payoutsBlocked) {
          return { allowed: false, reason: 'Payouts temporarily suspended' };
        }

        if (action === 'tokenSale' && safetyGate.tokenSalesBlocked) {
          return { allowed: false, reason: 'Token sales temporarily suspended' };
        }
      }

      return { allowed: true, reason: 'Payment approved' };
    } catch (error) {
      console.error('Error checking payment safety:', error);
      throw new functions.https.HttpsError('internal', 'Failed to check payment safety');
    }
  }
);

// ============================================
// 5️⃣ UPDATE LAUNCH STATUS (with logging)
// ============================================

export const updateLaunchStatus = functions.https.onCall(
  async (
    data: {
      countryCode: string;
      newStatus: LaunchStatus;
      reason: string;
    },
    context
  ) => {
    const { countryCode, newStatus, reason } = data;

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can update launch status'
      );
    }

    try {
      // Get current status
      const launchConfigDoc = await db
        .collection('globalLaunchConfig')
        .doc(countryCode)
        .get();

      const previousStatus = launchConfigDoc.exists
        ? (launchConfigDoc.data() as GlobalLaunchConfig).launchStatus
        : 'locked';

      // Update status
      await db
        .collection('globalLaunchConfig')
        .doc(countryCode)
        .update({
          launchStatus: newStatus,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Log transition
      await db.collection('rolloutStateTransitions').add({
        countryCode,
        previousState: previousStatus,
        newState: newStatus,
        approvedBy: context.auth.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        reason,
      });

      // Send notification (PACK 293)
      await db.collection('notifications').add({
        type: 'launch_status_change',
        priority: 'high',
        title: `Launch Status Updated: ${countryCode}`,
        message: `${previousStatus} → ${newStatus}: ${reason}`,
        countryCode,
        approvedBy: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

      return {
        success: true,
        message: `Launch status updated: ${previousStatus} → ${newStatus}`,
      };
    } catch (error) {
      console.error('Error updating launch status:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update launch status');
    }
  }
);

// ============================================
// 6️⃣ CLEANUP OLD TRAFFIC METRICS (Scheduled)
// ============================================

export const cleanupOldTrafficMetrics = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago

    try {
      const oldMetricsQuery = await db
        .collection('countryTrafficMetrics')
        .where('hourTimestamp', '<', cutoffTime)
        .get();

      const batch = db.batch();
      oldMetricsQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`Cleaned up ${oldMetricsQuery.size} old traffic metric documents`);
    } catch (error) {
      console.error('Error cleaning up old metrics:', error);
    }
  });

// ============================================
// 7️⃣ CHECK COUNTRY AVAILABILITY
// ============================================

export const checkCountryAvailability = functions.https.onCall(
  async (data: { countryCode: string }, context) => {
    const { countryCode } = data;

    try {
      const launchConfigDoc = await db
        .collection('globalLaunchConfig')
        .doc(countryCode)
        .get();

      if (!launchConfigDoc.exists) {
        return {
          available: false,
          status: 'locked',
          message: 'Service not available in your country yet',
        };
      }

      const config = launchConfigDoc.data() as GlobalLaunchConfig;

      const statusMessages = {
        locked: 'Service not available in your country yet',
        beta: 'Beta access only - invitation required',
        soft: 'Limited availability',
        public: 'Fully available',
        frozen: 'Service temporarily unavailable',
      };

      return {
        available: config.launchStatus === 'public' || config.launchStatus === 'soft',
        status: config.launchStatus,
        message: statusMessages[config.launchStatus],
        requiresKyc: config.kycRequired,
        requiresAgeVerification: config.ageVerificationRequired,
      };
    } catch (error) {
      console.error('Error checking country availability:', error);
      throw new functions.https.HttpsError('internal', 'Failed to check availability');
    }
  }
);
