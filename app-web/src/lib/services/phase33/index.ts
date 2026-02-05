/**
 * PHASE 3.3 — Web Core Integration Services
 * 
 * Exports all Phase 3.3 services for Creator Panel, Payments, and Admin.
 * 
 * HARD RULES ENFORCED:
 * 1. NO business logic in web — all services call backend functions
 * 2. Web is a thin client consuming existing Firebase Functions
 * 3. Payments use the same Stripe Checkout + webhook invariants as mobile
 * 4. Token pricing MUST match CANONICAL_TOKEN_PACKS
 * 5. No admin surface may directly mutate wallet balances
 * 6. Role-based access is enforced at component level
 */

// Creator Panel Services
export {
  getCreatorEarningsSummary,
  getPayoutHistory,
  getStripeConnectStatus,
  initiateStripeOnboarding,
  getCreatorAnalytics,
  requestCreatorPayout,
} from './creatorPanel';

// Token Purchase Services
export {
  getAvailableTokenPacks,
  getTokenPackById,
  formatPackPrice,
  createTokenCheckoutSession,
  redirectToCheckout,
  initiatePurchase,
} from './tokenPurchase';

// Admin / Ops Services (READ-ONLY)
export {
  getFeatureFlags,
  getFeatureFlag,
  getTrustSignals,
  getTrustSignalCounts,
  getSystemHealth,
  getAdminOpsView,
} from './adminOps';
