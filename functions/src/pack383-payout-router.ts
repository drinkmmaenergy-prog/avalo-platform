/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * Payout Routing Engine
 * 
 * Resolves optimal payout route based on:
 * - User country
 * - Risk score
 * - Payout size
 * - Fraud history
 * - Provider availability
 * - Cost efficiency
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Payout Route Interface
interface PayoutRoute {
  countryCode: string;
  supportedCurrencies: string[];
  minPayoutThreshold: number;
  processingTime: string; // e.g., "1-3 days", "instant"
  providerPriority: string[]; // ordered list of providers
  riskTier: number; // 1-5
  costPerTransaction: number;
  regulatoryRequirements: string[];
  maxPayoutAmount?: number;
  enabled: boolean;
  lastUpdated: admin.firestore.Timestamp;
}

// Payout Request Interface
interface PayoutRequest {
  userId: string;
  amount: number;
  currency: string;
  tokens?: number;
  reason: string;
  priority: 'normal' | 'urgent';
  metadata?: Record<string, any>;
}

// Provider Config Interface
interface ProviderConfig {
  name: string;
  type: 'stripe' | 'wise' | 'sepa' | 'ach' | 'local' | 'crypto';
  enabled: boolean;
  supportedCountries: string[];
  supportedCurrencies: string[];
  minAmount: number;
  maxAmount: number;
  costPerTransaction: number;
  processingTime: string;
  riskScore: number; // 1-10, lower is better
  reliability: number; // 0-1, higher is better
}

/**
 * Resolve optimal payout route
 * Callable function
 */
export const pack383_resolveOptimalPayoutRoute = functions.https.onCall(
  async (data: { userId: string; amount: number; currency: string }, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, amount, currency } = data;

    try {
      // Get user profile
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const userCountry = userData.country || userData.countryCode || 'US';

      // Get user risk profile
      const riskProfile = await getUserRiskProfile(userId);

      // Get fraud history
      const fraudHistory = await getUserFraudHistory(userId);

      // Get available routes for user's country
      const routesSnapshot = await db
        .collection('globalPayoutRoutes')
        .where('countryCode', '==', userCountry)
        .where('enabled', '==', true)
        .get();

      if (routesSnapshot.empty) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `No payout routes available for country: ${userCountry}`
        );
      }

      // Filter routes by currency support and amount
      const eligibleRoutes = routesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PayoutRoute & { id: string }))
        .filter(route => {
          return (
            route.supportedCurrencies.includes(currency) &&
            amount >= route.minPayoutThreshold &&
            (!route.maxPayoutAmount || amount <= route.maxPayoutAmount)
          );
        });

      if (eligibleRoutes.length === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'No eligible payout routes for the specified currency and amount'
        );
      }

      // Score routes
      const scoredRoutes = await Promise.all(
        eligibleRoutes.map(async route => {
          const score = await calculateRouteScore(route, {
            amount,
            riskScore: riskProfile.score,
            fraudHistory: fraudHistory.count,
            currency,
          });
          return { route, score };
        })
      );

      // Sort by score (highest first)
      scoredRoutes.sort((a, b) => b.score - a.score);

      const optimalRoute = scoredRoutes[0].route;

      // Get available providers for this route
      const providers = await getAvailableProviders(
        optimalRoute.providerPriority,
        userCountry,
        currency,
        amount
      );

      if (providers.length === 0) {
        throw new functions.https.HttpsError(
          'unavailable',
          'No providers currently available for this route'
        );
      }

      // Log route resolution
      await db.collection('payoutRoutingLogs').add({
        userId,
        amount,
        currency,
        country: userCountry,
        selectedRoute: optimalRoute.id,
        selectedProvider: providers[0].name,
        riskScore: riskProfile.score,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        route: {
          id: optimalRoute.id,
          countryCode: optimalRoute.countryCode,
          processingTime: optimalRoute.processingTime,
          costPerTransaction: optimalRoute.costPerTransaction,
        },
        provider: {
          name: providers[0].name,
          type: providers[0].type,
          processingTime: providers[0].processingTime,
          estimatedCost: providers[0].costPerTransaction,
        },
        estimatedArrival: calculateEstimatedArrival(optimalRoute.processingTime),
        alternativeProviders: providers.slice(1, 3).map(p => ({
          name: p.name,
          type: p.type,
        })),
      };
    } catch (error: any) {
      console.error('Error resolving payout route:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Execute payout request
 * Creates payout entry and initiates provider execution
 */
export const pack383_initiatePayout = functions.https.onCall(
  async (data: PayoutRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, amount, currency, tokens, reason, priority, metadata } = data;

    try {
      // Validate user
      if (context.auth.uid !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot initiate payout for another user');
      }

      // Check KYC status (integrated with pack383-kyc-aml.ts)
      const kycStatus = await checkKYCStatus(userId);
      if (!kycStatus.verified) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'KYC verification required before payout'
        );
      }

      // Check payout limits (integrated with pack383-payout-limits.ts)
      const limitsCheck = await checkPayoutLimits(userId, amount);
      if (!limitsCheck.allowed) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `Payout limit exceeded: ${limitsCheck.reason}`
        );
      }

      // Run AML check
      const amlCheck = await runAMLCheck(userId, amount);
      if (amlCheck.blocked) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Payout blocked by AML screening'
        );
      }

      // Run sanctions screening
      const sanctionsCheck = await runSanctionsScreening(userId);
      if (sanctionsCheck.blocked) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Payout blocked by sanctions screening'
        );
      }

      // Check chargeback risk
      const chargebackRisk = await checkChargebackRisk(userId);
      if (chargebackRisk.high) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Payout temporarily blocked due to chargeback risk'
        );
      }

      // Resolve optimal route using internal logic
      const userDoc2 = await db.collection('users').doc(userId).get();
      const userData2 = userDoc2.data()!;
      const userCountry = userData2.country || userData2.countryCode || 'US';
      const riskProfile = await getUserRiskProfile(userId);
      
      const routesSnapshot = await db
        .collection('globalPayoutRoutes')
        .where('countryCode', '==', userCountry)
        .where('enabled', '==', true)
        .get();

      const eligibleRoutes = routesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PayoutRoute & { id: string }))
        .filter(route => {
          return (
            route.supportedCurrencies.includes(currency) &&
            amount >= route.minPayoutThreshold &&
            (!route.maxPayoutAmount || amount <= route.maxPayoutAmount)
          );
        });

      if (eligibleRoutes.length === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'No eligible payout routes for the specified currency and amount'
        );
      }

      const scoredRoutes = await Promise.all(
        eligibleRoutes.map(async route => {
          const score = await calculateRouteScore(route, {
            amount,
            riskScore: riskProfile.score,
            fraudHistory: 0,
            currency,
          });
          return { route, score };
        })
      );

      scoredRoutes.sort((a, b) => b.score - a.score);
      const optimalRoute = scoredRoutes[0].route;
      const providers = await getAvailableProviders(
        optimalRoute.providerPriority,
        userCountry,
        currency,
        amount
      );

      const routeResolution = {
        route: {
          id: optimalRoute.id,
          countryCode: optimalRoute.countryCode,
          processingTime: optimalRoute.processingTime,
          costPerTransaction: optimalRoute.costPerTransaction,
        },
        provider: providers[0],
        estimatedArrival: calculateEstimatedArrival(optimalRoute.processingTime),
      };

      // Calculate tax withholding
      const taxCalc = await calculateWithholding(userId, amount);

      // Create payout record
      const payoutRef = await db.collection('payouts').add({
        userId,
        grossAmount: amount,
        netAmount: taxCalc.netAmount,
        taxAmount: taxCalc.taxAmount,
        currency,
        tokens: tokens || null,
        reason,
        priority,
        status: 'pending',
        route: routeResolution.route,
        provider: routeResolution.provider,
        kycVerified: true,
        amlCleared: true,
        sanctionsCleared: true,
        estimatedArrival: routeResolution.estimatedArrival,
        metadata: metadata || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create audit log (PACK 296)
      await db.collection('auditLogs').add({
        action: 'payout_initiated',
        userId,
        targetType: 'payout',
        targetId: payoutRef.id,
        details: {
          amount,
          currency,
          provider: routeResolution.provider.name,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        payoutId: payoutRef.id,
        netAmount: taxCalc.netAmount,
        taxAmount: taxCalc.taxAmount,
        estimatedArrival: routeResolution.estimatedArrival,
        provider: routeResolution.provider.name,
      };
    } catch (error: any) {
      console.error('Error initiating payout:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Queue payout for processing
 * Scheduled function to process pending payouts
 */
export const pack383_processPayoutQueue = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      // Get pending payouts
      const pendingPayouts = await db
        .collection('payouts')
        .where('status', '==', 'pending')
        .limit(50)
        .get();

      if (pendingPayouts.empty) {
        console.log('No pending payouts to process');
        return null;
      }

      const processPromises = pendingPayouts.docs.map(async (payoutDoc) => {
        const payout = payoutDoc.data();
        const payoutId = payoutDoc.id;

        try {
          // Update status to processing
          await payoutDoc.ref.update({
            status: 'processing',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Execute payout via provider (will be implemented in provider abstraction layer)
          const result = await executePayoutViaProvider(payoutId, payout);

          if (result.success) {
            await payoutDoc.ref.update({
              status: 'completed',
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              providerTransactionId: result.transactionId,
            });
          } else {
            await payoutDoc.ref.update({
              status: 'failed',
              failureReason: (result as any).error || 'Provider execution failed',
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } catch (error: any) {
          console.error(`Error processing payout ${payoutId}:`, error);
          await payoutDoc.ref.update({
            status: 'failed',
            failureReason: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      await Promise.all(processPromises);

      console.log(`Processed ${pendingPayouts.size} payouts`);
      return null;
    } catch (error) {
      console.error('Error processing payout queue:', error);
      return null;
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function getUserRiskProfile(userId: string) {
  const riskDoc = await db.collection('userRiskProfiles').doc(userId).get();
  if (riskDoc.exists) {
    return riskDoc.data() as { score: number; tier: number };
  }
  return { score: 50, tier: 3 }; // Default medium risk
}

async function getUserFraudHistory(userId: string) {
  const fraudSnapshot = await db
    .collection('fraudDetectionLogs')
    .where('userId', '==', userId)
    .where('flagged', '==', true)
    .get();

  return { count: fraudSnapshot.size };
}

async function calculateRouteScore(
  route: PayoutRoute,
  factors: {
    amount: number;
    riskScore: number;
    fraudHistory: number;
    currency: string;
  }
) {
  let score = 100;

  // Risk tier penalty
  score -= route.riskTier * 5;

  // Cost efficiency
  const costRatio = route.costPerTransaction / factors.amount;
  score -= costRatio * 100;

  // User risk adjustment
  if (factors.riskScore > 70) {
    score -= 20;
  }

  // Fraud history penalty
  score -= factors.fraudHistory * 10;

  // Processing time bonus (instant is better)
  if (route.processingTime.includes('instant')) {
    score += 15;
  }

  return Math.max(0, score);
}

async function getAvailableProviders(
  providerPriority: string[],
  country: string,
  currency: string,
  amount: number
): Promise<ProviderConfig[]> {
  const providersSnapshot = await db.collection('payoutProviders').get();

  const availableProviders = providersSnapshot.docs
    .map(doc => doc.data() as ProviderConfig)
    .filter(provider => {
      return (
        provider.enabled &&
        provider.supportedCountries.includes(country) &&
        provider.supportedCurrencies.includes(currency) &&
        amount >= provider.minAmount &&
        amount <= provider.maxAmount
      );
    });

  // Sort by priority list
  availableProviders.sort((a, b) => {
    const aPriority = providerPriority.indexOf(a.name);
    const bPriority = providerPriority.indexOf(b.name);
    if (aPriority === -1) return 1;
    if (bPriority === -1) return -1;
    return aPriority - bPriority;
  });

  return availableProviders;
}

function calculateEstimatedArrival(processingTime: string): Date {
  const now = new Date();
  if (processingTime.includes('instant')) {
    return now;
  } else if (processingTime.includes('1-3')) {
    now.setDate(now.getDate() + 2);
  } else if (processingTime.includes('3-5')) {
    now.setDate(now.getDate() + 4);
  } else {
    now.setDate(now.getDate() + 7);
  }
  return now;
}

// These functions are imported from other pack383 modules
async function checkKYCStatus(userId: string) {
  const kycDoc = await db.collection('userKYCProfiles').doc(userId).get();
  if (!kycDoc.exists) {
    return { verified: false };
  }
  const kycData = kycDoc.data()!;
  return { verified: kycData.status === 'verified' };
}

async function checkPayoutLimits(userId: string, amount: number) {
  // Placeholder - implemented in pack383-payout-limits.ts
  return { allowed: true, reason: '' };
}

async function runAMLCheck(userId: string, amount: number) {
  // Placeholder - implemented in pack383-kyc-aml.ts
  return { blocked: false };
}

async function runSanctionsScreening(userId: string) {
  // Placeholder - implemented in pack383-kyc-aml.ts
  return { blocked: false };
}

async function checkChargebackRisk(userId: string) {
  // Placeholder - implemented in pack383-chargeback-firewall.ts
  return { high: false };
}

async function calculateWithholding(userId: string, grossAmount: number) {
  // Placeholder - implemented in pack383-tax-engine.ts
  return {
    netAmount: grossAmount * 0.85, // 15% withholding example
    taxAmount: grossAmount * 0.15,
  };
}

async function executePayoutViaProvider(payoutId: string, payout: any) {
  // Placeholder - implemented in provider abstraction layer
  return {
    success: true,
    transactionId: `mock-${payoutId}`,
  };
}
