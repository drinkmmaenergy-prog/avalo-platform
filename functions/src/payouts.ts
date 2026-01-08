/**
 * PACK 56 — Payout APIs
 *
 * Main payout logic integrating with Stripe Connect, Wise, and eligibility checks.
 * PACK 71 — Enhanced with fraud detection and payment anomaly checks
 */

import { db, admin, serverTimestamp, increment, generateId } from "./init";
import * as functions from "firebase-functions";
import {
  computePayoutEligibility,
  PayoutEligibilityContext,
  PayoutEligibilityResult,
} from "./payoutEligibility";
import {
  createOrUpdateStripeAccount,
  createStripeOnboardingLink,
  getStripeAccountStatus,
  createStripeTransfer,
} from "./integrations/stripeConnect";
import {
  createWiseRecipient,
  createWiseTransfer,
  getWiseProfileId,
} from "./integrations/wise";
import { createAmlEvent } from "./amlMonitoring";
import { checkPayoutHold } from "./fraudEngine";

// Types
export type PayoutRail = "STRIPE" | "WISE" | "AUTO";
export type PayoutRailEffective = "STRIPE" | "WISE" | null;
export type OnboardingStatus = "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE";
export type PayoutRequestStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";

export interface PayoutAccount {
  userId: string;
  enabled: boolean;
  reasonDisabled: string | null;
  preferredRail: PayoutRail;
  effectiveRail: PayoutRailEffective;
  country: string | null;
  currency: string | null;
  stripe: {
    accountId?: string | null;
    onboardingStatus?: OnboardingStatus;
    lastOnboardingUrl?: string | null;
    lastUpdatedAt?: admin.firestore.Timestamp | null;
  };
  wise: {
    recipientId?: string | null;
    onboardingStatus?: OnboardingStatus;
    lastUpdatedAt?: admin.firestore.Timestamp | null;
  };
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: "NONE" | "BASIC" | "FULL";
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface PayoutRequest {
  requestId: string;
  userId: string;
  rail: "STRIPE" | "WISE";
  currency: string;
  tokensRequested: number;
  tokensFeePlatform: number;
  tokensNetToUser: number;
  fxRate: number;
  amountFiatGross: number;
  amountFiatNetToUser: number;
  status: PayoutRequestStatus;
  providerData: {
    stripeTransferId?: string;
    wiseTransferId?: string;
  };
  amlSnapshot?: {
    amlProfileId?: string;
    kycRequired: boolean;
    kycVerified: boolean;
    kycLevel: string;
    riskScore: number;
    riskFlags: string[];
  };
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp;
}

export interface PayoutConfig {
  defaultRail: "STRIPE" | "WISE";
  countryRailOverrides: Record<string, "STRIPE" | "WISE">;
  supportedCurrenciesByRail: {
    STRIPE: string[];
    WISE: string[];
  };
  tokenToFiatRate: {
    USD: number;
    EUR: number;
    GBP: number;
    PLN: number;
  };
  minimumPayoutTokens: number;
  payoutFeePlatformPercent: number;
}

/**
 * Get or initialize payout configuration.
 */
async function getPayoutConfig(): Promise<PayoutConfig> {
  const configDoc = await db.collection("payout_config").doc("global").get();
  
  if (configDoc.exists) {
    return configDoc.data() as PayoutConfig;
  }

  // Default configuration
  const defaultConfig: PayoutConfig = {
    defaultRail: "STRIPE",
    countryRailOverrides: {
      PL: "WISE",
      DE: "WISE",
      FR: "WISE",
      ES: "WISE",
      IT: "WISE",
      NL: "WISE",
      BE: "WISE",
      AT: "WISE",
      PT: "WISE",
      IE: "WISE",
      FI: "WISE",
      SE: "WISE",
      DK: "WISE",
      NO: "WISE",
      GB: "WISE",
      US: "STRIPE",
      CA: "STRIPE",
      AU: "STRIPE",
    },
    supportedCurrenciesByRail: {
      STRIPE: ["USD", "EUR", "GBP", "AUD", "CAD"],
      WISE: ["EUR", "GBP", "PLN", "USD", "SEK", "DKK", "NOK"],
    },
    tokenToFiatRate: {
      USD: 0.01, // 1 token = $0.01
      EUR: 0.009, // 1 token = €0.009
      GBP: 0.008, // 1 token = £0.008
      PLN: 0.04, // 1 token = 0.04 PLN
    },
    minimumPayoutTokens: 1000, // Minimum 1000 tokens ($10 USD equivalent)
    payoutFeePlatformPercent: 0.02, // 2% platform fee on payouts
  };

  await db.collection("payout_config").doc("global").set(defaultConfig);
  return defaultConfig;
}

/**
 * Resolve effective payout rail based on user preference and country.
 */
function resolveEffectiveRail(
  preferredRail: PayoutRail,
  country: string | null,
  config: PayoutConfig
): "STRIPE" | "WISE" {
  if (preferredRail !== "AUTO") {
    return preferredRail;
  }

  if (country && config.countryRailOverrides[country]) {
    return config.countryRailOverrides[country];
  }

  return config.defaultRail;
}

/**
 * Get currency for a country.
 */
function getCurrencyForCountry(country: string): string {
  const currencyMap: Record<string, string> = {
    US: "USD",
    CA: "CAD",
    GB: "GBP",
    AU: "AUD",
    NZ: "NZD",
    PL: "PLN",
    DE: "EUR",
    FR: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    BE: "EUR",
    AT: "EUR",
    PT: "EUR",
    IE: "EUR",
    FI: "EUR",
    GR: "EUR",
    SE: "SEK",
    DK: "DKK",
    NO: "NOK",
    CH: "CHF",
    CZ: "CZK",
    HU: "HUF",
    RO: "RON",
    BG: "BGN",
  };

  return currencyMap[country] || "EUR";
}

/**
 * Fetch eligibility context for a user.
 */
async function fetchEligibilityContext(userId: string): Promise<PayoutEligibilityContext> {
  // Fetch age verification status
  const ageGateDoc = await db.collection("age_gates").doc(userId).get();
  const ageVerified = ageGateDoc.exists && ageGateDoc.data()?.verified === true;

  // Fetch enforcement status
  const enforcementDoc = await db.collection("enforcement_profiles").doc(userId).get();
  const enforcement = enforcementDoc.exists
    ? {
        accountStatus: (enforcementDoc.data()?.accountStatus || "ACTIVE") as "ACTIVE" | "LIMITED" | "SUSPENDED" | "BANNED",
        earningStatus: (enforcementDoc.data()?.earningStatus || "NORMAL") as "NORMAL" | "EARN_DISABLED",
      }
    : { accountStatus: "ACTIVE" as const, earningStatus: "NORMAL" as const };

  // Fetch AML profile
  const amlDoc = await db.collection("aml_profiles").doc(userId).get();
  const aml = amlDoc.exists
    ? {
        kycRequired: amlDoc.data()?.kycRequired || false,
        kycVerified: amlDoc.data()?.kycVerified || false,
        kycLevel: (amlDoc.data()?.kycLevel || "NONE") as "NONE" | "BASIC" | "FULL",
        riskScore: amlDoc.data()?.riskScore || 0,
      }
    : {
        kycRequired: false,
        kycVerified: false,
        kycLevel: "NONE" as const,
        riskScore: 0,
      };

  // Fetch creator earnings
  const earningsDoc = await db.collection("creator_earnings").doc(userId).get();
  const earningsData = earningsDoc.data();

  // Calculate withdrawable tokens
  const totalTokensEarnedAllTime = earningsData?.totalEarned || 0;
  const tokensPaidOut = earningsData?.tokensPaidOut || 0;
  const tokensFrozen = earningsData?.tokensFrozen || 0;
  const withdrawableTokens = totalTokensEarnedAllTime - tokensPaidOut - tokensFrozen;

  return {
    ageVerified,
    enforcement,
    aml,
    creatorEarnings: {
      totalTokensEarnedAllTime,
      withdrawableTokens: Math.max(0, withdrawableTokens),
    },
  };
}

/**
 * Get payout state for a user.
 */
export async function getPayoutState(userId: string) {
  const eligibilityContext = await fetchEligibilityContext(userId);
  const eligibility = computePayoutEligibility(eligibilityContext);

  // Get payout account if exists
  const accountDoc = await db.collection("payout_accounts").doc(userId).get();
  let account: any = null;

  if (accountDoc.exists) {
    account = accountDoc.data();
  } else {
    // Return minimal account structure
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    account = {
      userId,
      enabled: eligibility.eligible,
      reasonDisabled: eligibility.eligible ? null : eligibility.reasons[0] || null,
      preferredRail: "AUTO",
      effectiveRail: null,
      country: userData?.country || null,
      currency: userData?.country ? getCurrencyForCountry(userData.country) : null,
      stripe: {
        accountId: null,
        onboardingStatus: "NONE",
        lastOnboardingUrl: null,
      },
      wise: {
        recipientId: null,
        onboardingStatus: "NONE",
      },
      kycRequired: eligibilityContext.aml.kycRequired,
      kycVerified: eligibilityContext.aml.kycVerified,
      kycLevel: eligibilityContext.aml.kycLevel,
    };
  }

  return {
    userId,
    eligibility,
    account,
    earnings: {
      totalTokensEarnedAllTime: eligibilityContext.creatorEarnings.totalTokensEarnedAllTime,
      withdrawableTokens: eligibilityContext.creatorEarnings.withdrawableTokens,
    },
  };
}

/**
 * Setup or update payout account.
 */
export async function setupPayoutAccount(params: {
  userId: string;
  preferredRail?: PayoutRail;
  country?: string;
  currency?: string;
}) {
  const { userId, preferredRail = "AUTO", country, currency } = params;

  // Fetch eligibility
  const eligibilityContext = await fetchEligibilityContext(userId);
  const eligibility = computePayoutEligibility(eligibilityContext);

  if (!eligibility.eligible) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "User is not eligible for payouts",
      { reasons: eligibility.reasons }
    );
  }

  // Get user data
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  const userCountry = country || userData?.country || null;
  const userCurrency = currency || (userCountry ? getCurrencyForCountry(userCountry) : null);

  if (!userCountry || !userCurrency) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Country and currency must be specified"
    );
  }

  // Get config and resolve effective rail
  const config = await getPayoutConfig();
  const effectiveRail = resolveEffectiveRail(preferredRail, userCountry, config);

  // Prepare account data
  const accountData: Partial<PayoutAccount> = {
    userId,
    enabled: true,
    reasonDisabled: null,
    preferredRail,
    effectiveRail,
    country: userCountry,
    currency: userCurrency,
    kycRequired: eligibilityContext.aml.kycRequired,
    kycVerified: eligibilityContext.aml.kycVerified,
    kycLevel: eligibilityContext.aml.kycLevel,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  // Initialize stripe/wise data if not exists
  const existingDoc = await db.collection("payout_accounts").doc(userId).get();
  if (!existingDoc.exists) {
    accountData.createdAt = admin.firestore.Timestamp.now();
    accountData.stripe = {
      accountId: null,
      onboardingStatus: "NONE",
      lastOnboardingUrl: null,
    };
    accountData.wise = {
      recipientId: null,
      onboardingStatus: "NONE",
    };
  }

  // Setup Stripe Connect if needed
  let onboardingUrl: string | null = null;
  if (effectiveRail === "STRIPE") {
    const existingData = existingDoc.data();
    const stripeAccountId = existingData?.stripe?.accountId;

    if (!stripeAccountId) {
      // Create new Stripe Connect account
      const stripeResult = await createOrUpdateStripeAccount({
        userId,
        email: userData?.email || `${userId}@avalo.app`,
        country: userCountry,
      });

      accountData.stripe = {
        accountId: stripeResult.accountId,
        onboardingStatus: stripeResult.onboardingStatus,
        lastUpdatedAt: admin.firestore.Timestamp.now(),
      };

      // Create onboarding link
      const linkResult = await createStripeOnboardingLink({
        accountId: stripeResult.accountId,
        refreshUrl: "https://avalo.app/payouts/setup",
        returnUrl: "https://avalo.app/payouts/complete",
      });

      onboardingUrl = linkResult.url;
      accountData.stripe.lastOnboardingUrl = linkResult.url;
    } else {
      // Check existing account status
      const statusResult = await getStripeAccountStatus(stripeAccountId);
      accountData.stripe = {
        accountId: stripeAccountId,
        onboardingStatus: statusResult.onboardingStatus,
        lastUpdatedAt: admin.firestore.Timestamp.now(),
      };

      // Generate new onboarding link if needed
      if (statusResult.onboardingStatus !== "COMPLETE") {
        const linkResult = await createStripeOnboardingLink({
          accountId: stripeAccountId,
          refreshUrl: "https://avalo.app/payouts/setup",
          returnUrl: "https://avalo.app/payouts/complete",
        });

        onboardingUrl = linkResult.url;
        accountData.stripe.lastOnboardingUrl = linkResult.url;
      }
    }
  }

  // Setup Wise if needed (stub for now)
  if (effectiveRail === "WISE") {
    const existingData = existingDoc.data();
    if (!existingData?.wise?.recipientId) {
      accountData.wise = {
        recipientId: null,
        onboardingStatus: "PENDING",
        lastUpdatedAt: admin.firestore.Timestamp.now(),
      };
    }
  }

  // Save account
  await db.collection("payout_accounts").doc(userId).set(accountData, { merge: true });

  // Fetch and return updated state
  const updatedState = await getPayoutState(userId);

  return {
    ...updatedState,
    onboardingUrl,
  };
}

/**
 * Request a payout.
 */
export async function requestPayout(params: {
  userId: string;
  tokensRequested: number;
}) {
  const { userId, tokensRequested } = params;

  // Validate minimum payout
  const config = await getPayoutConfig();
  if (tokensRequested < config.minimumPayoutTokens) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Minimum payout is ${config.minimumPayoutTokens} tokens`
    );
  }

  // Fetch eligibility
  const eligibilityContext = await fetchEligibilityContext(userId);
  const eligibility = computePayoutEligibility(eligibilityContext);

  if (!eligibility.eligible) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "User is not eligible for payouts",
      { reasons: eligibility.reasons }
    );
  }

  // Check sufficient balance
  if (tokensRequested > eligibilityContext.creatorEarnings.withdrawableTokens) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Insufficient withdrawable tokens"
    );
  }

  // Get payout account
  const accountDoc = await db.collection("payout_accounts").doc(userId).get();
  if (!accountDoc.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payout account not set up"
    );
  }

  const account = accountDoc.data() as PayoutAccount;
  if (!account.effectiveRail) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payout rail not configured"
    );
  }

  // PACK 71: Check for fraud-related payout hold
  const fraudCheck = await checkPayoutHold(userId);
  if (fraudCheck.hasHold) {
    throw new functions.https.HttpsError(
      "permission-denied",
      fraudCheck.reason || "Your payout is under review for security reasons.",
      {
        error: "PAYOUT_ON_HOLD",
        riskLevel: fraudCheck.riskLevel
      }
    );
  }

  // Calculate amounts
  const tokensFeePlatform = Math.floor(tokensRequested * config.payoutFeePlatformPercent);
  const tokensNetToUser = tokensRequested - tokensFeePlatform;

  const currency = account.currency || "USD";
  const fxRate = config.tokenToFiatRate[currency as keyof typeof config.tokenToFiatRate] || 0.01;

  const amountFiatGross = tokensRequested * fxRate;
  const amountFiatNetToUser = tokensNetToUser * fxRate;

  // Get AML snapshot
  const amlDoc = await db.collection("aml_profiles").doc(userId).get();
  const amlData = amlDoc.data();

  // Create payout request
  const requestId = db.collection("payout_requests").doc().id;
  const requestData: PayoutRequest = {
    requestId,
    userId,
    rail: account.effectiveRail,
    currency,
    tokensRequested,
    tokensFeePlatform,
    tokensNetToUser,
    fxRate,
    amountFiatGross,
    amountFiatNetToUser,
    status: "PENDING",
    providerData: {},
    amlSnapshot: amlData ? {
      amlProfileId: amlDoc.id,
      kycRequired: amlData.kycRequired || false,
      kycVerified: amlData.kycVerified || false,
      kycLevel: amlData.kycLevel || "NONE",
      riskScore: amlData.riskScore || 0,
      riskFlags: amlData.riskFlags || [],
    } : undefined,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await db.collection("payout_requests").doc(requestId).set(requestData);

  // Update creator earnings - reserve tokens
  await db.collection("creator_earnings").doc(userId).update({
    tokensPaidOut: admin.firestore.FieldValue.increment(tokensRequested),
    updatedAt: admin.firestore.Timestamp.now(),
  });

  // PACK 63: AML Event Logging
  try {
    // Get AML config for thresholds
    const amlConfigDoc = await db.collection('aml_config').doc('global').get();
    const amlConfig = amlConfigDoc.data();
    const largePayoutThreshold = amlConfig?.largePayoutTokens || 5000;
    const frequentPayoutsThreshold = amlConfig?.frequentPayoutsCount30d || 10;
    
    // Check for large payout
    if (tokensRequested >= largePayoutThreshold) {
      await createAmlEvent({
        userId,
        kind: 'LARGE_PAYOUT',
        severity: 'HIGH',
        description: `Large payout requested: ${tokensRequested} tokens (${amountFiatNetToUser} ${currency})`,
        details: {
          requestId,
          tokensRequested,
          amountFiatNetToUser,
          currency,
          rail: account.effectiveRail
        },
        source: 'PAYOUTS'
      });
    }
    
    // Check for frequent payouts (count recent payouts)
    const date30dAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentPayoutsSnapshot = await db.collection('payout_requests')
      .where('userId', '==', userId)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
      .get();
    
    const payoutsCount30d = recentPayoutsSnapshot.size;
    
    if (payoutsCount30d >= frequentPayoutsThreshold) {
      await createAmlEvent({
        userId,
        kind: 'FREQUENT_PAYOUTS',
        severity: 'WARN',
        description: `Frequent payout pattern: ${payoutsCount30d} payouts in 30 days`,
        details: { requestId, payoutsCount30d },
        source: 'PAYOUTS'
      });
    }
  } catch (amlError: any) {
    // Non-blocking - log error but don't fail payout
    console.error('[AML Hook] Error in payout AML logging:', amlError);
  }

  return {
    requestId: requestData.requestId,
    rail: requestData.rail,
    currency: requestData.currency,
    tokensRequested: requestData.tokensRequested,
    amountFiatNetToUser: requestData.amountFiatNetToUser,
    status: requestData.status,
    createdAt: requestData.createdAt.toMillis(),
  };
}

/**
 * Get payout requests for a user.
 */
export async function getPayoutRequests(params: {
  userId: string;
  limit?: number;
  cursor?: string;
}) {
  const { userId, limit = 20, cursor } = params;

  let query = db
    .collection("payout_requests")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (cursor) {
    const cursorDoc = await db.collection("payout_requests").doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map((doc) => {
    const data = doc.data() as PayoutRequest;
    return {
      requestId: data.requestId,
      rail: data.rail,
      currency: data.currency,
      tokensRequested: data.tokensRequested,
      amountFiatNetToUser: data.amountFiatNetToUser,
      status: data.status,
      createdAt: data.createdAt.toMillis(),
      processedAt: data.processedAt?.toMillis(),
    };
  });

  const nextCursor = snapshot.docs.length === limit
    ? snapshot.docs[snapshot.docs.length - 1].id
    : null;

  return {
    items,
    nextCursor,
  };
}