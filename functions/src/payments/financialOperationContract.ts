// functions/src/payments/financialOperationContract.ts
//
// P2-POST-STAGE3 FND-1 — CANONICAL SERVER FINANCIAL-OPERATION CONTRACT (server-only, types + policy).
//
// PURPOSE: give every later restoration lane (token checkout, paid media, tips, paid chat, bookings,
// memberships, creator offers/drops, subscriptions, AI billing, boosts) ONE reusable, server-only
// contract so no lane invents its own wallet, ledger, idempotency, entitlement or refund engine.
//
// THIS MODULE ADDS NO ENGINE. It formalizes the reuse surface over the ALREADY-ACCEPTED, host-proven
// primitives and DELEGATES all canonical mutation to them:
//   - wallet + ledger + atomic transaction + server-owned split : ../wallet/walletService
//       (transferTokens / creditVerifiedProviderPurchase / debitForRefund / debitForPayout — all
//        Firestore runTransaction; integer-only; positive-only; insufficient-balance protected;
//        dual-barrier idempotency for provider purchases; PENDING completion outbox).
//   - provider-verified token purchase completion            : ./canonicalStripeCompletion
//   - server-owned pricing / token quantity authority        : ../pack277-token-packs
//   - immutable checkout-intent snapshot authority           : ./stripeCheckoutIntent
//   - server-only VIP/Royal entitlements                     : ../entitlementService (rules-enforced)
//   - reconciliation + audit                                 : walletService reconciliation/outbox +
//                                                              canonicalStripeCompletion immutable audit
//
// CANONICAL COLLECTIONS (reused, NEVER duplicated): wallets, walletTransactions (ledger), tokenPurchases,
// paymentReconciliation, paymentCompletionOutbox, entitlements. FND-1 introduces NO new wallet or ledger
// collection.
//
// CLIENT AUTHORITY: NONE. The client may only submit intent (operation type + resource + idempotency
// key) and read server-returned state. The client NEVER supplies a canonical amount, credit, debit,
// creator earning, platform fee, tax, entitlement outcome, ledger status, or completion status — those
// fields are intentionally ABSENT from FinancialOperationRequest.

// ---- Canonical operation types (extensible; CORE-1 uses TOKEN_CHECKOUT_COMPLETION) -----------------
export type FinancialOperationType =
  | 'TOKEN_CHECKOUT_COMPLETION' // CORE-1: provider-verified Stripe token purchase -> canonicalStripeCompletion
  | 'PAID_MEDIA_UNLOCK'         // future CORE-2
  | 'TIP_SEND'                  // future REV-1
  | 'PAID_CHAT_ESCROW'          // future CORE-3
  | 'BOOKING_SETTLEMENT'        // future REV-3
  | 'MEMBERSHIP_PURCHASE'       // future REV-2
  | 'CREATOR_OFFER_PURCHASE'    // future EXT-2
  | 'CREATOR_DROP_PURCHASE'     // future EXT-2
  | 'SUBSCRIPTION_CHARGE'       // future EXT-3
  | 'AI_USAGE_BILLING'          // future PREM-1
  | 'BOOST_PURCHASE';           // future EXT-1

// ---- CLIENT-SAFE request envelope: intent only. NO canonical financial field is accepted. ----------
export interface FinancialOperationRequest {
  operationType: FinancialOperationType;
  // actorUid is DERIVED from the authenticated context server-side; a client-supplied actorUid is
  // ignored/rejected (see resolveActor). Present here only to type the resolved value.
  resourceType: string;      // e.g. 'tokenPack' | 'media' | 'offer' — validated per-operation policy
  resourceId: string;        // server re-resolves canonical price/tokens from this + server config
  idempotencyKey: string;    // operation-scoped; see IdempotencyScope
  pricingReference?: string; // OPTIONAL server-config reference (e.g. packId); NEVER a client amount
  // NOTE: deliberately NO amount / tokens / creatorEarnings / platformFee / tax / status field.
}

// ---- Server execution context (resolved server-side; never from the client) ------------------------
export interface ServerExecutionContext {
  actorUid: string;              // resolved from auth
  appCheckVerified: boolean;     // explicit App Check posture per entry point
  canonicalPriceMinor: number;   // resolved from server pricing authority (pack277 / snapshot)
  canonicalTokens: number;       // resolved from server authority (never client)
  operationPolicyId: string;     // bounded server-owned policy (see OperationPolicy) — no arbitrary paths
  auditCorrelationId: string;    // links wallet tx + ledger + audit + reconciliation
  providerEvidence?: unknown;    // provider verification evidence (webhook/retrieve) where applicable
}

// ---- Idempotency scope (operation-scoped; reuses walletService dual-barrier for provider purchases) -
export interface IdempotencyScope {
  actorUid: string;
  operationType: FinancialOperationType;
  resourceId: string;
  idempotencyKey: string;
}

// ---- Canonical result union (GENERALIZES canonicalStripeCompletion's proven union) -----------------
export type FinancialOperationStatus =
  | 'CREDITED_NEW'
  | 'DEBITED_NEW'
  | 'ALREADY_APPLIED'      // idempotent duplicate -> original canonical result returned
  | 'RECONCILIATION_REQUIRED'
  | 'REJECTED';

export interface FinancialOperationResult {
  operationId: string;
  status: FinancialOperationStatus;
  ledgerTransactionId?: string;
  walletBalanceAfter?: number;     // included only when server-safe
  entitlementId?: string;          // only for entitlement-effect operations
  purchaseId?: string;
  duplicate: boolean;
  completedAt?: FirebaseFirestore.Timestamp | null;
  // display-safe summary only; NEVER secrets/provider internals/mutable policy
  summary?: { operationType: FinancialOperationType; tokens?: number };
}

// ---- Stable failure taxonomy (deterministic, client-safe, secret-free) -----------------------------
export type FinancialOperationError =
  | 'UNAUTHENTICATED'
  | 'APP_CHECK_REQUIRED'
  | 'INVALID_REQUEST'
  | 'OPERATION_NOT_SUPPORTED'
  | 'INVALID_STATE'
  | 'INSUFFICIENT_FUNDS'
  | 'DUPLICATE_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PRICING_UNAVAILABLE'
  | 'ENTITLEMENT_CONFLICT'
  | 'PROVIDER_VERIFICATION_PENDING'
  | 'PROVIDER_VERIFICATION_FAILED'
  | 'TRANSACTION_CONFLICT'
  | 'REFUND_UNAVAILABLE'
  | 'FINANCIAL_OPERATION_DISABLED'
  | 'INTERNAL_INVARIANT_VIOLATION';

// ---- Bounded, server-owned optional-effects policy (NO arbitrary client-selected collections/paths) -
// Each operation type maps to a fixed policy describing which server-owned effects it may apply. Lanes
// register their policy here (server-side); the client can never select an effect or a target path.
export interface OperationPolicy {
  operationType: FinancialOperationType;
  appCheckRequired: boolean;
  effects: {
    walletDebit: boolean;
    walletCredit: boolean;
    ledgerWrite: true;               // every canonical financial op writes the single canonical ledger
    entitlementGrant: boolean;
    creatorEarningAllocation: boolean; // server-owned split (walletService.transferTokens split)
    refundLinkage: boolean;
    subscriptionStateChange: boolean;
  };
  // Delegation target: the accepted walletService primitive this policy uses. Documentation-level
  // binding so no lane implements a parallel engine.
  delegatesTo:
    | 'creditVerifiedProviderPurchase'
    | 'transferTokens'
    | 'debitForRefund'
    | 'debitForPayout';
}

// FND-1 seeds ONLY the CORE-1 policy (token checkout completion). Later lanes append their policy.
export const OPERATION_POLICY_REGISTRY: Readonly<Record<'TOKEN_CHECKOUT_COMPLETION', OperationPolicy>> = Object.freeze({
  TOKEN_CHECKOUT_COMPLETION: {
    operationType: 'TOKEN_CHECKOUT_COMPLETION',
    appCheckRequired: false, // webhook/provider-verified route: signature-verified, not App Check
    effects: {
      walletDebit: false,
      walletCredit: true,
      ledgerWrite: true,
      entitlementGrant: false,
      creatorEarningAllocation: false, // token purchase credits the buyer; no creator split
      refundLinkage: true,
      subscriptionStateChange: false,
    },
    delegatesTo: 'creditVerifiedProviderPurchase',
  },
});

// FND-1 asserts (documented invariant, enforced by the foundation guard test): the contract defines NO
// wallet/ledger collection of its own, accepts NO client amount, and delegates every canonical mutation
// to the accepted walletService primitives. There is exactly ONE wallet model and ONE ledger model.
export const FND1_CONTRACT_VERSION = 1 as const;
