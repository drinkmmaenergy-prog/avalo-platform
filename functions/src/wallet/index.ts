import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * WALLET MODULE — Barrel Export
 *
 * Unified wallet, ledger, and payout services.
 *
 * CANONICAL PATHS:
 *   wallets/{userId}         — user wallets
 *   wallets/AVALO_PLATFORM   — platform wallet
 *   ledger/{txId}            — immutable ledger
 *
 * USAGE:
 *   import { transactTokens, creditTokens, replayLedger } from '../wallet';
 *   import { requestPayout, processPayout } from '../wallet';
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  WalletDocument,
  LedgerEntry,
  LedgerEntryType,
  WalletMutationParams,
  WalletMutationResult,
  PayoutRequestDocument,
  PayoutStatus,
  IdempotencySentinel,
} from './types';

export {
  PLATFORM_WALLET_ID,
  WALLETS_COLLECTION,
  LEDGER_COLLECTION,
  IDEMPOTENCY_COLLECTION,
  PAYOUT_REQUESTS_COLLECTION,
  PAYOUT_STATE_TRANSITIONS,
  DEPRECATED_WALLET_PATHS,
} from './types';

// ── Wallet Service ──────────────────────────────────────────────────────────
export {
  transactTokens,
  creditTokens,
  debitForPayout,
  debitForRefund,
  getBalance,
  getWallet,
  getPlatformBalance,
  walletRef,
  platformWalletRef,
} from './walletService';

// ── Ledger Service ──────────────────────────────────────────────────────────
export {
  getLedgerEntry,
  getLedgerEntriesByActor,
  getLedgerEntriesByCounterparty,
  getAllLedgerEntries,
  replayLedger,
  verifyLedgerConsistency,
  verifyPlatformWalletSum,
  countLedgerEntriesByType,
} from './ledgerService';

// ── Split Engine ────────────────────────────────────────────────────────────
export {
  computeSplit,
  featureToLedgerType,
  getSplitDefinition,
  getAllSplitDefinitions,
  hasCreatorPayout,
  isAvaloOnly,
} from './splitEngine';

export type {
  MonetizationFeature,
  SplitDefinition,
  ComputedSplit,
} from './splitEngine';

// ── Payout Service ──────────────────────────────────────────────────────────
export {
  calculateStripeFee,
  calculatePayoutBreakdown,
  requestPayout as requestUnifiedPayout,
  approvePayout,
  rejectPayout,
  processPayout,
  retryPayout,
  getPayoutRequest,
  getUserPayoutRequests,
  getPendingPayouts as getUnifiedPendingPayouts,
  STRIPE_FEE_FIXED_USD,
  STRIPE_FEE_PERCENT,
  MINIMUM_PAYOUT_TOKENS,
  MAX_PAYOUT_RETRIES,
} from './payoutService';


















