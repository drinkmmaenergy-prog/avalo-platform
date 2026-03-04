/**
 * PAYOUTS CONFIG (USD-CANONICAL)
 *
 * Canonical rules:
 * - Accounting is USD-only.
 * - No PLN/EUR/GBP in production logic.
 * - Platform payout fee is charged to the payout flow (creator side), not subsidized by Avalo.
 */

import { db } from "../init";
import { TOKEN_PAYOUT_USD } from "./economyConfig";

export type PayoutMethodType =
  | "STRIPE"
  | "WISE"
  // Legacy identifiers still referenced in code paths:
  | "BANK_TRANSFER"
  | "STRIPE_CONNECT";

export type PayoutStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  // payoutRequests.ts compares with REJECTED:
  | "REJECTED";

export type PayoutCurrency = "USD";

export interface PayoutConfig {
  // Primary settings
  defaultRail: PayoutMethodType;
  payoutCurrency: PayoutCurrency;

  // Limits
  MIN_PAYOUT_TOKENS: number;
  MAX_PAYOUT_METHODS_PER_USER: number;

  // Fee model
  payoutFeePlatformPercent: number; // 0.05 => 5%

  // Canonical token->USD rate for payout calculations (display/requests validation)
  PAYOUT_TOKEN_TO_USD_RATE: number; // must equal TOKEN_PAYOUT_USD (0.03)

  // Compatibility arrays referenced in payoutRequests.ts
  SUPPORTED_PAYOUT_METHODS: readonly PayoutMethodType[];
  SUPPORTED_CURRENCIES: readonly PayoutCurrency[];

  // Status transitions referenced in payoutRequests.ts
  ALLOWED_STATUS_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]>;
}

export const PAYOUT_CONFIG: PayoutConfig = {
  defaultRail: "STRIPE",
  payoutCurrency: "USD",

  MIN_PAYOUT_TOKENS: 1000,
  MAX_PAYOUT_METHODS_PER_USER: 3,

  payoutFeePlatformPercent: 0.05,

  PAYOUT_TOKEN_TO_USD_RATE: TOKEN_PAYOUT_USD,

  SUPPORTED_PAYOUT_METHODS: ["STRIPE","WISE","BANK_TRANSFER","STRIPE_CONNECT"] as const,
  SUPPORTED_CURRENCIES: ["USD"] as const,

  ALLOWED_STATUS_TRANSITIONS: {
    PENDING: ["PROCESSING","REJECTED","FAILED"] as const,
    PROCESSING: ["COMPLETED","FAILED"] as const,
    COMPLETED: [] as const,
    FAILED: [] as const,
    REJECTED: [] as const
  }
};

/**
 * Firestore bootstrapper for payout_config/global.
 */
export async function ensurePayoutConfig(): Promise<PayoutConfig> {
  const ref = db.collection("payout_config").doc("global");
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as Partial<PayoutConfig> | undefined;
    if (data?.payoutCurrency === "USD") {
      return { ...PAYOUT_CONFIG, ...data } as PayoutConfig;
    }
  }

  await ref.set(PAYOUT_CONFIG, { merge: false });
  return PAYOUT_CONFIG;
}

