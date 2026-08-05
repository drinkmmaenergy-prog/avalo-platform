// functions/src/payments/canonicalStripeCompletion.ts
//
// CANONICAL STRIPE COMPLETION SERVICE (Phase C1) — server-only.
//
// Accepts ONLY a NormalizedStripeSession produced by a trusted verification boundary (webhook AFTER
// stripe.webhooks.constructEvent, or callable AFTER stripe.checkout.sessions.retrieve). Trusts NO
// client-supplied token quantity, status, amount, or currency. Delegates the exactly-once durable
// credit to the accepted Phase B primitive (dual barrier + atomic PENDING completion outbox). Never
// calls the generic creditTokens.
//
// Provider identity: providerSessionId = Checkout Session id; providerTransactionId = PaymentIntent id;
// Stripe event id = audit/idempotency correlation only. Provider scope: single Stripe platform account
// per Firebase environment (STRIPE_SECRET_KEY; token purchases do not use Connect) -> provider + session
// + PaymentIntent is sufficient (see PRODUCTION_HARDENING execution record, Defect 5 finding A).
//
// Authority for token quantity / gross amount:
//   B (preferred): an immutable server-side checkout-intent snapshot (stripeCheckoutIntents) — a paid
//                  HISTORICAL session is never re-priced/re-quantified because config changed later.
//   A (fallback):  current canonical pack config (pack277) when no snapshot exists (legacy sessions).
//
// Durability: the durable credit + PENDING outbox commit atomically in the primitive. Post-credit audit
// docs are then written immutably (create-if-absent + immutable compare) and the outbox is marked
// COMPLETED only after audit success. If audit fails the outbox stays PENDING (durable repair signal)
// and RECONCILIATION_REQUIRED is returned — recovery does not depend on a second post-credit write.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  getCanonicalTokenPackById,
  normalizeTokenPackId,
  CanonicalTokenPack,
} from '../pack277-token-packs';
// Import DIRECTLY from walletService (NOT the '../wallet' barrel): the barrel re-exports
// payoutService, which imports config/economyConfig — a file with a known unrelated baseline
// TypeScript error (TS2367). ts-jest compiles every required file with diagnostics enabled, so the
// barrel import fails the whole emulator suite at load (35/35 hook failures, host run 20260704_1354)
// while the direct import keeps the runtime graph identical to the Phase-B-proven one.
import {
  creditVerifiedProviderPurchase,
  PAYMENT_RECONCILIATION_COLLECTION,
  PAYMENT_COMPLETION_OUTBOX_COLLECTION,
} from '../wallet/walletService';
import { loadCheckoutSnapshot, CheckoutSnapshot } from './stripeCheckoutIntent';
// S6: money runtime logs are whitelist-sanitized fixed classifications only.
import { sanitizeMoneyLogFields } from '../lib/moneyLog';

const db = getFirestore();

export const CANONICAL_CURRENCY = 'usd';
export const CANONICAL_CHECKOUT_MODE = 'payment';

export interface NormalizedStripeSession {
  checkoutSessionId: string;
  paymentIntentId: string | null;
  mode: string | null;
  paymentStatus: string | null;
  currency: string | null;
  amountTotalMinor: number | null;
  clientReferenceId: string | null;
  metadataUid?: string | null;
  metadataUserId?: string | null;
  metadataPackId?: string | null;
  eventId?: string | null;
  sourceRoute: string;
}

export type CanonicalStripeCompletionResult =
  | { status: 'CREDITED_NEW'; ledgerTxId: string; tokens: number }
  | { status: 'ALREADY_CREDITED'; ledgerTxId: string; tokens: number }
  | { status: 'RECONCILIATION_REQUIRED'; reason: string; reconciliationKey: string }
  | { status: 'REJECTED'; reason: string };

export interface CanonicalAuditArgs {
  checkoutSessionId: string;
  paymentIntentId: string;
  userId: string;
  packId: string;
  tokens: number;
  amountTotalMinor: number;
  currency: string;
  ledgerTxId: string;
  sourceRoute: string;
}

/**
 * Injectable ONLY for the two post-credit side-effects (NEVER the money transaction):
 *   persistAudit        — immutable audit persistence (audit-failure tests);
 *   markOutboxCompleted — the PENDING -> COMPLETED outbox status flip (update-failure tests).
 * Defaults are the real implementations.
 */
export interface CanonicalStripeCompletionDeps {
  persistAudit?: (args: CanonicalAuditArgs) => Promise<void>;
  markOutboxCompleted?: (outboxRef: FirebaseFirestore.DocumentReference) => Promise<void>;
}

// ---- Owner resolution (Defect 1) --------------------------------------------
// Collect ALL non-empty candidates; 0 -> missing_owner; >1 distinct -> owner_conflict; else the one.
function resolveOwner(
  input: NormalizedStripeSession,
): { ok: true; userId: string } | { ok: false; reason: 'missing_owner' | 'owner_conflict' } {
  const raw: Array<string | null | undefined> = [input.clientReferenceId, input.metadataUid, input.metadataUserId];
  const candidates = raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
  const unique = Array.from(new Set(candidates));
  if (unique.length === 0) return { ok: false, reason: 'missing_owner' };
  if (unique.length > 1) return { ok: false, reason: 'owner_conflict' };
  return { ok: true, userId: unique[0] };
}

// ---- Authority (Defect 3): immutable snapshot preferred, config fallback ----

export type AuthorityResult =
  | { ok: true; packId: string; tokens: number; amountTotalMinor: number; currency: string }
  | { ok: false; reason: string };

/**
 * Authority B (PURE, exported for real tests): validate a paid Stripe session against the immutable
 * checkout-intent snapshot. EVERY trusted Stripe value that is represented in the snapshot must match:
 * owner, currency, gross amount in integer minor units, and — when the trusted Stripe metadata carries
 * a non-empty pack ID — that pack ID must normalize to the snapshot's pack ID. Any mismatch fails
 * closed. Token quantity comes ONLY from the snapshot, never from current mutable pack configuration.
 */
export function evaluateSnapshotAuthority(
  snapshot: CheckoutSnapshot,
  input: Pick<NormalizedStripeSession, 'currency' | 'amountTotalMinor' | 'metadataPackId'>,
  userId: string,
): AuthorityResult {
  if (snapshot.userId !== userId) return { ok: false, reason: 'owner_snapshot_mismatch' };
  const trustedPackId = normalizeTokenPackId(input.metadataPackId || '');
  if (trustedPackId.length > 0 && trustedPackId !== normalizeTokenPackId(snapshot.packId)) {
    return { ok: false, reason: 'pack_snapshot_mismatch' };
  }
  if ((input.currency || '').toLowerCase() !== snapshot.currency) return { ok: false, reason: 'currency_mismatch' };
  if (input.amountTotalMinor !== snapshot.expectedAmountMinor) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true, packId: snapshot.packId, tokens: snapshot.tokens, amountTotalMinor: snapshot.expectedAmountMinor, currency: snapshot.currency };
}

/**
 * Authority A (PURE, exported for real tests): legacy sessions with no immutable snapshot are
 * validated against the current canonical pack configuration. Explicit legacy compatibility only —
 * no historical-price protection is claimed for them (see reality-audit migration plan).
 */
export function evaluateConfigAuthority(
  pack: CanonicalTokenPack | null,
  packId: string,
  input: Pick<NormalizedStripeSession, 'currency' | 'amountTotalMinor'>,
): AuthorityResult {
  if (pack === null) return { ok: false, reason: 'unknown_pack' };
  if (pack.active !== true) return { ok: false, reason: 'inactive_pack' };
  const expectedMinor = Math.round(pack.priceUSD * 100);
  if ((input.currency || '').toLowerCase() !== CANONICAL_CURRENCY) return { ok: false, reason: 'currency_mismatch' };
  if (input.amountTotalMinor !== expectedMinor) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true, packId, tokens: pack.tokens, amountTotalMinor: expectedMinor, currency: CANONICAL_CURRENCY };
}

async function resolveAuthority(input: NormalizedStripeSession, userId: string): Promise<AuthorityResult> {
  const snapshot = await loadCheckoutSnapshot(input.checkoutSessionId);
  if (snapshot !== null) return evaluateSnapshotAuthority(snapshot, input, userId);
  const packId = normalizeTokenPackId(input.metadataPackId || '');
  return evaluateConfigAuthority(getCanonicalTokenPackById(packId), packId, input);
}

// ---- Immutable audit (Defect 2): create-if-absent + immutable compare -------
class AuditImmutableConflictError extends Error {
  constructor() { super('audit_immutable_conflict'); this.name = 'AuditImmutableConflictError'; }
}

async function persistImmutableAudit(a: CanonicalAuditArgs): Promise<void> {
  const purchaseId = `stripe_${a.checkoutSessionId}`;
  const tpRef = db.collection('tokenPurchases').doc(purchaseId);
  const wtRef = db.collection('walletTransactions').doc(a.ledgerTxId);
  const paidAmount = a.amountTotalMinor / 100;
  await db.runTransaction(async (t) => {
    const tp = await t.get(tpRef);
    const wt = await t.get(wtRef);
    if (tp.exists) {
      // Immutable compare of every money-critical fact represented on tokenPurchases:
      // owner, pack, tokens, paid amount, paid currency, provider, checkout session (providerOrderId),
      // PaymentIntent, ledger tx. Conflict -> fail closed, PRESERVE the existing document.
      const d = tp.data() as Record<string, unknown>;
      const conflict =
        d.userId !== a.userId ||
        d.packageId !== a.packId ||
        d.tokens !== a.tokens ||
        d.paidAmount !== paidAmount ||
        d.paidCurrency !== a.currency.toUpperCase() ||
        d.provider !== 'stripe' ||
        d.providerOrderId !== a.checkoutSessionId ||
        d.paymentIntentId !== a.paymentIntentId ||
        d.ledgerTxId !== a.ledgerTxId;
      if (conflict) throw new AuditImmutableConflictError();
    } else {
      const now = FieldValue.serverTimestamp();
      t.create(tpRef, {
        purchaseId, userId: a.userId, packageId: a.packId, tokens: a.tokens,
        priceUSD: paidAmount, paidCurrency: a.currency.toUpperCase(), paidAmount,
        platform: 'web', provider: 'stripe', providerOrderId: a.checkoutSessionId,
        paymentIntentId: a.paymentIntentId, status: 'COMPLETED', ledgerTxId: a.ledgerTxId,
        source: a.sourceRoute, createdAt: now, updatedAt: now,
      });
    }
    if (wt.exists) {
      // Immutable compare for walletTransactions too (owner, purchase type, tokens, ledger tx,
      // checkout session, PaymentIntent). Conflict -> fail closed, PRESERVE — never overwrite,
      // never create a second audit document for the same durable credit.
      const w = wt.data() as Record<string, unknown>;
      const wMeta = (w.metadata ?? {}) as Record<string, unknown>;
      const wtConflict =
        w.userId !== a.userId ||
        w.type !== 'PURCHASE' ||
        w.amountTokens !== a.tokens ||
        w.txId !== a.ledgerTxId ||
        w.ledgerTxId !== a.ledgerTxId ||
        wMeta.stripeSessionId !== a.checkoutSessionId ||
        wMeta.paymentIntentId !== a.paymentIntentId;
      if (wtConflict) throw new AuditImmutableConflictError();
    } else {
      const now = FieldValue.serverTimestamp();
      t.create(wtRef, {
        txId: a.ledgerTxId, userId: a.userId, type: 'PURCHASE', source: 'STORE', amountTokens: a.tokens,
        ledgerTxId: a.ledgerTxId,
        metadata: { purchaseId, platform: 'web', stripeSessionId: a.checkoutSessionId, paymentIntentId: a.paymentIntentId },
        timestamp: now,
      });
    }
  });
}

// ---- Fixed-classification logging (Defect 4): no err.message, no UID, no amounts -----
export type CompletionAnomalyEvent =
  | 'stripe_audit_persistence_failed'
  | 'stripe_completion_outbox_conflict'
  | 'stripe_legacy_missing_outbox'
  | 'stripe_outbox_completion_update_failed';

/** PURE + exported so a real test can prove the payload carries no UID, no amount, no provider/
 * barrier/ledger identifier, no reconciliation key, and no caught error message. S6 MONEY-LOG
 * HYGIENE: fixed classifications only; identifiers live solely in the server-only durable
 * records (paymentReconciliation / outbox / audit), never in runtime logs. The signature keeps
 * the full context so builder and durable-record writer receive identical inputs. */
export function buildCompletionAnomalyPayload(event: CompletionAnomalyEvent, a: CanonicalAuditArgs, reconciliationKey: string): Record<string, unknown> {
  void reconciliationKey; // durable-record key — deliberately NOT logged (S6)
  return sanitizeMoneyLogFields({
    severity: 'HIGH',
    event,
    provider: 'stripe',
    sourceRoute: a.sourceRoute,
  });
}

function logCompletionAnomaly(event: CompletionAnomalyEvent, a: CanonicalAuditArgs, reconciliationKey: string): void {
  logger.error(`[SECURITY] ${event}`, buildCompletionAnomalyPayload(event, a, reconciliationKey));
}

async function openReconciliation(a: CanonicalAuditArgs, reason: string): Promise<string> {
  const reconciliationKey = `stripe:${a.paymentIntentId}`;
  const now = FieldValue.serverTimestamp();
  await db.collection(PAYMENT_RECONCILIATION_COLLECTION).doc(reconciliationKey).set(
    {
      reconciliationKey, provider: 'stripe',
      providerSessionId: a.checkoutSessionId, providerTransactionId: a.paymentIntentId,
      sessionBarrierId: `stripe:${a.checkoutSessionId}`, txnBarrierId: `stripe:${a.paymentIntentId}`,
      ledgerTxId: a.ledgerTxId, userId: a.userId, // server-only; operational repair; never logged.
      reason, status: 'OPEN', sourceRoute: a.sourceRoute, updatedAt: now, createdAt: now,
    },
    { merge: true },
  );
  return reconciliationKey;
}

/** Complete a VERIFIED Stripe token purchase. Fails closed unless every trusted condition holds. */
export async function completeStripeTokenPurchase(
  input: NormalizedStripeSession,
  deps: CanonicalStripeCompletionDeps = {},
): Promise<CanonicalStripeCompletionResult> {
  if (typeof input.checkoutSessionId !== 'string' || input.checkoutSessionId.length === 0) {
    return { status: 'REJECTED', reason: 'missing_session_id' };
  }
  if (input.mode !== CANONICAL_CHECKOUT_MODE) return { status: 'REJECTED', reason: 'invalid_mode' };
  if (input.paymentStatus !== 'paid') return { status: 'REJECTED', reason: 'payment_not_paid' };

  // S5 GLOBAL CANONICAL-USD GATE — consumer token purchases are USD-only, unconditionally.
  // Authority-independent defense-in-depth: authority A already enforces CANONICAL_CURRENCY, but
  // authority B compares input against snapshot.currency, so a corrupted/foreign non-USD snapshot
  // could otherwise "agree" with a non-USD session. This gate makes that structurally impossible:
  // a non-USD session is rejected before ANY authority or credit path runs. Reuses the
  // established 'currency_mismatch' class-C rejection (durable reconciliation + retry at every
  // route), so a non-USD-yet-paid session is surfaced to the operator, never silently dropped
  // and never credited.
  if ((input.currency || '').toLowerCase() !== CANONICAL_CURRENCY) {
    return { status: 'REJECTED', reason: 'currency_mismatch' };
  }

  const owner = resolveOwner(input);
  if (owner.ok === false) return { status: 'REJECTED', reason: owner.reason };
  const userId = owner.userId;

  const authority = await resolveAuthority(input, userId);
  if (authority.ok === false) return { status: 'REJECTED', reason: authority.reason };

  if (typeof input.paymentIntentId !== 'string' || input.paymentIntentId.length === 0) {
    return { status: 'REJECTED', reason: 'missing_payment_intent' };
  }
  const paymentIntentId = input.paymentIntentId;

  const credit = await creditVerifiedProviderPurchase({
    provider: 'stripe',
    providerSessionId: input.checkoutSessionId,
    providerTransactionId: paymentIntentId,
    userId,
    amountTokens: authority.tokens,
    metadata: { packId: authority.packId, stripeEventId: input.eventId || null, sourceRoute: input.sourceRoute },
    completion: {
      packId: authority.packId,
      amountTotalMinor: authority.amountTotalMinor,
      currency: authority.currency,
      eventId: input.eventId || null,
      sourceRoute: input.sourceRoute,
    },
  });

  if (credit.status === 'REJECTED') return { status: 'REJECTED', reason: credit.reason };
  if (credit.status === 'RECONCILIATION_REQUIRED') {
    return { status: 'RECONCILIATION_REQUIRED', reason: credit.reason, reconciliationKey: credit.reconciliationKey };
  }

  // CREDITED_NEW or ALREADY_CREDITED -> outbox-aware immutable audit + recovery.
  const auditArgs: CanonicalAuditArgs = {
    checkoutSessionId: input.checkoutSessionId,
    paymentIntentId,
    userId,
    packId: authority.packId,
    tokens: authority.tokens,
    amountTotalMinor: authority.amountTotalMinor,
    currency: authority.currency,
    ledgerTxId: credit.txId,
    sourceRoute: input.sourceRoute,
  };
  const persist = deps.persistAudit || persistImmutableAudit;
  const markCompleted =
    deps.markOutboxCompleted ||
    (async (ref: FirebaseFirestore.DocumentReference): Promise<void> => {
      await ref.update({ status: 'COMPLETED', updatedAt: FieldValue.serverTimestamp() });
    });
  const outboxKey = `stripe:${paymentIntentId}`;
  const outboxRef = db.collection(PAYMENT_COMPLETION_OUTBOX_COLLECTION).doc(outboxKey);
  const outboxSnap = await outboxRef.get();

  if (outboxSnap.exists === false) {
    // C1-D approach A: a durable credit exists (barriers) but no completion outbox. This is a legacy
    // compatibility state (pre-outbox Phase B credit — new credits from this service ALWAYS create the
    // outbox atomically). FAIL CLOSED: no audit mutation, no best-effort recovery. Write only the
    // durable, server-only reconciliation record (awaited — a failure here propagates and the
    // signature-verified route retries) so the designated operator reconciliation flow recovers it.
    const reconciliationKey = await openReconciliation(auditArgs, 'legacy_missing_completion_outbox');
    logCompletionAnomaly('stripe_legacy_missing_outbox', auditArgs, reconciliationKey);
    return { status: 'RECONCILIATION_REQUIRED', reason: 'legacy_missing_completion_outbox', reconciliationKey };
  }

  const outbox = outboxSnap.data() as Record<string, unknown>;
  const outboxConflict =
    outbox.userId !== userId ||
    outbox.packId !== authority.packId ||
    outbox.amountTokens !== authority.tokens ||
    outbox.amountTotalMinor !== authority.amountTotalMinor ||
    outbox.currency !== authority.currency ||
    outbox.providerSessionId !== input.checkoutSessionId ||
    outbox.providerTransactionId !== paymentIntentId ||
    outbox.ledgerTxId !== credit.txId;
  if (outboxConflict) {
    const reconciliationKey = await openReconciliation(auditArgs, 'stripe_completion_outbox_conflict');
    logCompletionAnomaly('stripe_completion_outbox_conflict', auditArgs, reconciliationKey);
    return { status: 'RECONCILIATION_REQUIRED', reason: 'provider_purchase_barrier_inconsistency', reconciliationKey };
  }

  if (outbox.status === 'COMPLETED') {
    return { status: credit.status, ledgerTxId: credit.txId, tokens: authority.tokens };
  }

  // PENDING outbox -> persist immutable audit, then mark COMPLETED. The PENDING outbox is the durable
  // repair signal; on failure it stays PENDING and we return RECONCILIATION_REQUIRED (no reliance on a
  // second post-credit write).
  try {
    await persist(auditArgs);
  } catch {
    logCompletionAnomaly('stripe_audit_persistence_failed', auditArgs, outboxKey);
    return { status: 'RECONCILIATION_REQUIRED', reason: 'stripe_audit_persistence_failed', reconciliationKey: outboxKey };
  }
  // C1-F: the audit is now DURABLE. If the PENDING -> COMPLETED flip fails, this is NOT a missing
  // audit — classify it distinctly, leave the outbox PENDING (durable, discoverable), and rely on the
  // idempotent retry (audit compare matches -> flip retried). Never credits or audits twice.
  try {
    await markCompleted(outboxRef);
  } catch {
    logCompletionAnomaly('stripe_outbox_completion_update_failed', auditArgs, outboxKey);
    return { status: 'RECONCILIATION_REQUIRED', reason: 'outbox_completion_update_failed', reconciliationKey: outboxKey };
  }
  return { status: credit.status, ledgerTxId: credit.txId, tokens: authority.tokens };
}
