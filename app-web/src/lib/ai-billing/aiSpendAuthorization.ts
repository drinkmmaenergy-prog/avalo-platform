// app-web/src/lib/ai-billing/aiSpendAuthorization.ts
//
// P0-02 R2 — CANONICAL SERVER-AUTHORITATIVE AI SPEND PREAUTHORIZATION (single source of truth).
//
// Repairs the R1 blockers:
//  A) DUAL BALANCE — spend authority is now the CANONICAL wallet spendable field `wallets.balance` (never the
//     non-canonical `tokensBalance`). Reserve moves `balance -> reservedTokens` (canonical invariant
//     `balance + reservedTokens = total holdings`), matching functions/src/wallet/walletService semantics.
//  B) CANONICAL LEDGER — every economic wallet mutation writes exactly one immutable entry to the canonical
//     `ledger` collection (types CHAT_RESERVATION_RESERVE / CHAT_RESPONSE_BURN / CHAT_RESERVATION_RELEASE),
//     linked to the AI operationId. `ai_spend_authorizations` is only the reservation/idempotency LIFECYCLE
//     record — NOT the accounting truth.
//  C) SEMANTIC IDEMPOTENCY — the reservation fingerprint binds user + product + avatar + canonical price +
//     policy version + a payload DIGEST; a reused idempotency key with any changed material dimension is a
//     CONFLICT (before any provider call).
//  D) CROSS-PACKAGE — this module is app-web-owned (traced by Next standalone output) and dependency-free
//     (Node `crypto` only); the Firestore handle and FieldValue are INJECTED, so it is also unit/emulator
//     testable from the functions harness without a cross-package firebase-admin import.
//
// Retry convergence: two-phase PREAUTHORIZED -> PROVIDER_CAPTURED (durable result) -> SETTLED, so a retry after
// provider success never re-invokes the provider or double-charges; provider KNOWN failure releases; provider
// UNCERTAIN (timeout) moves to FAILED_RECONCILIATION (never blind release, never silent free result).

import { createHash } from 'crypto';

export const WALLETS_COLLECTION = 'wallets';
export const LEDGER_COLLECTION = 'ledger';                       // canonical accounting ledger (walletService)
export const AI_SPEND_AUTHORIZATION_COLLECTION = 'ai_spend_authorizations';
export const AI_BILLING_POLICY_VERSION = 1;
export const AI_BILLING_NAMESPACE = 'ai-spend-v1';

// ── Injected Firestore surface (structural; firebase-admin Firestore satisfies it) ──────────────────────────
export interface FieldValueLike { increment(n: number): unknown; serverTimestamp(): unknown; }
export interface DocSnapLike { exists: boolean; data(): Record<string, unknown> | undefined; }
export interface DocRefLike { id: string; }
export interface TxLike {
  get(ref: DocRefLike): Promise<DocSnapLike>;
  set(ref: DocRefLike, data: Record<string, unknown>, opts?: { merge?: boolean }): void;
  update(ref: DocRefLike, data: Record<string, unknown>): void;
  create(ref: DocRefLike, data: Record<string, unknown>): void;
}
export interface CollLike { doc(id?: string): DocRefLike; }
export interface FirestoreLike { collection(name: string): CollLike; runTransaction<T>(fn: (t: TxLike) => Promise<T>): Promise<T>; }

// ── Errors (fail-closed) ────────────────────────────────────────────────────────────────────────────────────
export class AiBillingUnavailableError extends Error { constructor(reason: string) { super('AI_BILLING_UNAVAILABLE:' + reason); this.name = 'AiBillingUnavailableError'; } }
export class AiBillingConflictError extends Error { constructor(operationId: string) { super('AI_BILLING_IDEMPOTENCY_CONFLICT:' + operationId); this.name = 'AiBillingConflictError'; } }
export class AiInsufficientFundsError extends Error { constructor() { super('AI_BILLING_INSUFFICIENT_FUNDS'); this.name = 'AiInsufficientFundsError'; } }
// A billable operation MUST carry a bounded, caller-supplied logical operation id (reused across transport retries).
// A missing/malformed id fails closed BEFORE any provider call — no random fallback (which would defeat idempotency).
export class AiOperationIdRequiredError extends Error { constructor(reason: string) { super('BILLABLE_OPERATION_ID_REQUIRED:' + reason); this.name = 'AiOperationIdRequiredError'; } }
// Provider failure classification — the route throws one of these from providerFn.
export class AiProviderKnownFailure extends Error { constructor(reason: string) { super('AI_PROVIDER_KNOWN_FAILURE:' + reason); this.name = 'AiProviderKnownFailure'; } }
export class AiProviderUncertainError extends Error { constructor(reason: string) { super('AI_PROVIDER_UNCERTAIN:' + reason); this.name = 'AiProviderUncertainError'; } }
export class AiSettlementReconciliationError extends Error { constructor(operationId: string) { super('AI_SETTLEMENT_RECONCILIATION:' + operationId); this.name = 'AiSettlementReconciliationError'; } }

// ── Server-owned price/class policy (client NEVER supplies price or class) ───────────────────────────────────
export type AiBillingClass = 'BILLABLE' | 'NON_BILLABLE' | 'DISABLED';
export interface AiBillingPolicy { product: string; billingClass: AiBillingClass; unitPriceTokens: number; maxChargeTokens: number; policyVersion: number; }

const AI_BILLING_POLICIES: Readonly<Record<string, AiBillingPolicy>> = Object.freeze({
  ai_companion: { product: 'ai_companion', billingClass: 'BILLABLE', unitPriceTokens: 3, maxChargeTokens: 3, policyVersion: AI_BILLING_POLICY_VERSION },
  ai_coach: { product: 'ai_coach', billingClass: 'NON_BILLABLE', unitPriceTokens: 0, maxChargeTokens: 0, policyVersion: AI_BILLING_POLICY_VERSION },
});
export function resolveAiBillingPolicy(product: unknown): AiBillingPolicy {
  if (typeof product !== 'string' || product.trim().length === 0) { return { product: 'unknown', billingClass: 'DISABLED', unitPriceTokens: 0, maxChargeTokens: 0, policyVersion: AI_BILLING_POLICY_VERSION }; }
  const p = AI_BILLING_POLICIES[product];
  return p ? p : { product, billingClass: 'DISABLED', unitPriceTokens: 0, maxChargeTokens: 0, policyVersion: AI_BILLING_POLICY_VERSION };
}

// ── Identity ────────────────────────────────────────────────────────────────────────────────────────────────
function assertNonEmpty(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > 256 || /[\u0000-\u001f\u007f]/.test(v)) { throw new AiBillingUnavailableError('invalid_' + field); }
  return v;
}
// operationId is the idempotency KEY scope: server namespace + authenticated user + clientRequestId. Product,
// avatar, price and payload are intentionally NOT in the key so a reused key with any changed material dimension
// resolves to the SAME record and is detected as a fingerprint CONFLICT.
export function deriveOperationId(userId: string, clientRequestId: string): string {
  const u = assertNonEmpty(userId, 'user_id'); const r = assertNonEmpty(clientRequestId, 'request_id');
  return createHash('sha256').update(AI_BILLING_NAMESPACE + '|' + AI_BILLING_POLICY_VERSION + '|' + u + '|' + r, 'utf8').digest('hex').slice(0, 48);
}
// Deterministic digest of the material billable request payload (never stores raw prompt in financial records).
export function payloadDigest(parts: { userMessage?: string; history?: unknown; hasImage?: boolean }): string {
  const canon = JSON.stringify({ m: parts.userMessage ?? '', h: parts.history ?? null, img: !!parts.hasImage });
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
function fingerprint(userId: string, policy: AiBillingPolicy, avatarId: string, digest: string): string {
  return createHash('sha256')
    .update([AI_BILLING_NAMESPACE, AI_BILLING_POLICY_VERSION, userId, policy.product, policy.billingClass, policy.unitPriceTokens, avatarId, digest].join('|'), 'utf8')
    .digest('hex');
}

export type AiAuthState = 'PREAUTHORIZED' | 'PROVIDER_CLAIMED' | 'PROVIDER_CAPTURED' | 'SETTLED' | 'RELEASED' | 'FAILED_RECONCILIATION';

function readCanonicalBalance(data: Record<string, unknown> | undefined): number {
  const raw = data ? data['balance'] : undefined;
  if (raw === undefined || raw === null) { return 0; }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isSafeInteger(raw) || raw < 0) { throw new AiBillingUnavailableError('malformed_canonical_balance'); }
  return raw;
}
function readReserved(data: Record<string, unknown> | undefined): number {
  const raw = data ? data['reservedTokens'] : undefined;
  if (raw === undefined || raw === null) { return 0; }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isSafeInteger(raw) || raw < 0) { throw new AiBillingUnavailableError('malformed_reserved_tokens'); }
  return raw;
}
// Canonical immutable ledger entry (shape-compatible with functions/src/wallet/types LedgerEntry).
function writeLedger(t: TxLike, db: FirestoreLike, fv: FieldValueLike, e: {
  type: 'CHAT_RESERVATION_RESERVE' | 'CHAT_RESPONSE_BURN' | 'CHAT_RESERVATION_RELEASE';
  actorId: string; amountTokens: number; avaloTokens: number; before: number; after: number; operationId: string; sessionId: string;
}): string {
  const ref = db.collection(LEDGER_COLLECTION).doc();
  t.create(ref, {
    txId: ref.id, type: e.type, actorId: e.actorId, counterpartyId: null, chatId: null, sessionId: e.sessionId,
    amountTokens: e.amountTokens, split: { creatorTokens: 0, avaloTokens: e.avaloTokens },
    beforeAfter: { actor: { before: e.before, after: e.after }, counterparty: null, platform: { before: 0, after: 0 } },
    timestamp: fv.serverTimestamp(), idempotencyKey: e.type + ':' + e.actorId + ':' + e.operationId,
    metadata: { source: 'ai_spend', operationId: e.operationId, policyVersion: AI_BILLING_POLICY_VERSION },
  });
  return ref.id;
}

export interface PreauthResult { status: 'PREAUTHORIZED' | 'ALREADY_PREAUTHORIZED' | 'ALREADY_CAPTURED' | 'ALREADY_SETTLED' | 'ALREADY_RELEASED' | 'RECONCILIATION'; operationId: string; reservedTokens: number; policy: AiBillingPolicy; capturedResult?: string | null; }

// ── PREAUTHORIZE (atomic, idempotent, canonical balance + ledger) ───────────────────────────────────────────
export async function preauthorizeAiSpend(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; product: string; avatarId: string; operationId: string; payloadDigest: string; clientRequestId: string },
): Promise<PreauthResult> {
  const userId = assertNonEmpty(params.userId, 'user_id');
  const policy = resolveAiBillingPolicy(params.product);
  if (policy.billingClass === 'DISABLED') { throw new AiBillingUnavailableError('product_disabled_or_unknown:' + policy.product); }
  const avatarId = assertNonEmpty(params.avatarId, 'avatar_id');
  const operationId = assertNonEmpty(params.operationId, 'operation_id');
  const fp = fingerprint(userId, policy, avatarId, params.payloadDigest);
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  const walletRef = db.collection(WALLETS_COLLECTION).doc(userId);

  return db.runTransaction(async (t): Promise<PreauthResult> => {
    const authSnap = await t.get(authRef);
    if (authSnap.exists) {
      const a = authSnap.data() as Record<string, unknown>;
      if (a.fingerprint !== fp || a.userId !== userId) { throw new AiBillingConflictError(operationId); }
      const state = a.state as AiAuthState;
      const reserved = Number(a.reservedTokens) || 0;
      const captured = (a.resultText as string | undefined) ?? null;
      if (state === 'SETTLED') { return { status: 'ALREADY_SETTLED', operationId, reservedTokens: reserved, policy, capturedResult: captured }; }
      if (state === 'RELEASED') { return { status: 'ALREADY_RELEASED', operationId, reservedTokens: 0, policy }; }
      if (state === 'PROVIDER_CAPTURED') { return { status: 'ALREADY_CAPTURED', operationId, reservedTokens: reserved, policy, capturedResult: captured }; }
      if (state === 'FAILED_RECONCILIATION') { return { status: 'RECONCILIATION', operationId, reservedTokens: reserved, policy }; }
      return { status: 'ALREADY_PREAUTHORIZED', operationId, reservedTokens: reserved, policy };
    }
    let reservedTokens = 0;
    if (policy.billingClass === 'BILLABLE') {
      const walletSnap = await t.get(walletRef);
      if (!walletSnap.exists) { throw new AiInsufficientFundsError(); }
      const balance = readCanonicalBalance(walletSnap.data());
      readReserved(walletSnap.data()); // validate reservedTokens is well-formed
      reservedTokens = policy.unitPriceTokens;
      if (balance < reservedTokens) { throw new AiInsufficientFundsError(); }
      const after = balance - reservedTokens;
      t.update(walletRef, { balance: fv.increment(-reservedTokens), reservedTokens: fv.increment(reservedTokens), updatedAt: fv.serverTimestamp() });
      writeLedger(t, db, fv, { type: 'CHAT_RESERVATION_RESERVE', actorId: userId, amountTokens: reservedTokens, avaloTokens: 0, before: balance, after, operationId, sessionId: operationId });
    }
    t.create(authRef, {
      operationId, userId, product: policy.product, avatarId, billingClass: policy.billingClass,
      policyVersion: policy.policyVersion, unitPriceTokens: policy.unitPriceTokens, maxChargeTokens: policy.maxChargeTokens,
      reservedTokens, settledTokens: 0, releasedTokens: 0, state: 'PREAUTHORIZED' as AiAuthState,
      fingerprint: fp, payloadDigest: params.payloadDigest, clientRequestId: params.clientRequestId,
      resultText: null, createdAt: fv.serverTimestamp(),
    });
    return { status: 'PREAUTHORIZED', operationId, reservedTokens, policy };
  });
}

// ── CAPTURE provider result durably (idempotent) BEFORE settlement, so retries never re-invoke the provider ──
export async function captureProviderResult(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; operationId: string; resultText: string; eligible: boolean },
): Promise<{ status: 'CAPTURED' | 'ALREADY_CAPTURED' | 'ALREADY_SETTLED'; }> {
  const userId = assertNonEmpty(params.userId, 'user_id');
  const operationId = assertNonEmpty(params.operationId, 'operation_id');
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(authRef);
    if (!snap.exists) { throw new AiBillingUnavailableError('capture_unknown_operation'); }
    const a = snap.data() as Record<string, unknown>;
    if (a.userId !== userId) { throw new AiBillingUnavailableError('capture_user_mismatch'); }
    const state = a.state as AiAuthState;
    if (state === 'SETTLED') { return { status: 'ALREADY_SETTLED' as const }; }
    if (state === 'PROVIDER_CAPTURED') { return { status: 'ALREADY_CAPTURED' as const }; }
    // Capture is performed by the single provider-execution claim owner (PROVIDER_CLAIMED). PREAUTHORIZED is also
    // accepted for the non-concurrent path where claim+capture collapse.
    if (state !== 'PREAUTHORIZED' && state !== 'PROVIDER_CLAIMED') { throw new AiBillingUnavailableError('capture_invalid_state:' + state); }
    t.update(authRef, { state: 'PROVIDER_CAPTURED' as AiAuthState, resultText: params.resultText, resultEligible: !!params.eligible, capturedAt: fv.serverTimestamp() });
    return { status: 'CAPTURED' as const };
  });
}

export interface SettleResult { status: 'SETTLED' | 'ALREADY_SETTLED'; settledTokens: number; releasedTokens: number; resultText: string | null; }

// ── SETTLE (idempotent): charge eligible (<= reserved) via canonical BURN ledger; release remainder. ─────────
export async function settleAiSpend(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; operationId: string; eligibleTokens: number },
): Promise<SettleResult> {
  const userId = assertNonEmpty(params.userId, 'user_id');
  const operationId = assertNonEmpty(params.operationId, 'operation_id');
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  const walletRef = db.collection(WALLETS_COLLECTION).doc(userId);
  return db.runTransaction(async (t): Promise<SettleResult> => {
    const snap = await t.get(authRef);
    if (!snap.exists) { throw new AiBillingUnavailableError('settle_unknown_operation'); }
    const a = snap.data() as Record<string, unknown>;
    if (a.userId !== userId) { throw new AiBillingUnavailableError('settle_user_mismatch'); }
    const state = a.state as AiAuthState;
    const reserved = Number(a.reservedTokens) || 0;
    const resultText = (a.resultText as string | undefined) ?? null;
    if (state === 'SETTLED') { return { status: 'ALREADY_SETTLED', settledTokens: Number(a.settledTokens) || 0, releasedTokens: Number(a.releasedTokens) || 0, resultText }; }
    if (state !== 'PREAUTHORIZED' && state !== 'PROVIDER_CLAIMED' && state !== 'PROVIDER_CAPTURED') { throw new AiBillingUnavailableError('settle_invalid_state:' + state); }
    let eligible = Number(params.eligibleTokens);
    if (!Number.isFinite(eligible) || !Number.isSafeInteger(eligible) || eligible < 0) { throw new AiBillingUnavailableError('settle_invalid_eligible'); }
    if (eligible > reserved) { eligible = reserved; }
    const release = reserved - eligible;
    if (reserved > 0) {
      const walletSnap = await t.get(walletRef);
      const balance = readCanonicalBalance(walletSnap.data());
      // The reserved amount already left `balance` at preauth; settle consumes `eligible` from the hold and
      // returns only the unused `release` portion to canonical balance. Each effect is a canonical ledger entry.
      t.update(walletRef, {
        reservedTokens: fv.increment(-reserved),
        ...(release > 0 ? { balance: fv.increment(release) } : {}),
        spent: fv.increment(eligible),
        updatedAt: fv.serverTimestamp(),
      });
      if (eligible > 0) { writeLedger(t, db, fv, { type: 'CHAT_RESPONSE_BURN', actorId: userId, amountTokens: eligible, avaloTokens: eligible, before: balance, after: balance, operationId, sessionId: operationId }); }
      if (release > 0) { writeLedger(t, db, fv, { type: 'CHAT_RESERVATION_RELEASE', actorId: userId, amountTokens: release, avaloTokens: 0, before: balance, after: balance + release, operationId, sessionId: operationId }); }
    }
    t.update(authRef, { state: 'SETTLED' as AiAuthState, settledTokens: eligible, releasedTokens: release, settledAt: fv.serverTimestamp() });
    return { status: 'SETTLED', settledTokens: eligible, releasedTokens: release, resultText };
  });
}

export interface ReleaseResult { status: 'RELEASED' | 'ALREADY_RELEASED' | 'ALREADY_SETTLED'; releasedTokens: number; }
// ── RELEASE (idempotent): return full reservation to canonical balance via canonical RELEASE ledger. ────────
export async function releaseAiSpend(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; operationId: string },
): Promise<ReleaseResult> {
  const userId = assertNonEmpty(params.userId, 'user_id');
  const operationId = assertNonEmpty(params.operationId, 'operation_id');
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  const walletRef = db.collection(WALLETS_COLLECTION).doc(userId);
  return db.runTransaction(async (t): Promise<ReleaseResult> => {
    const snap = await t.get(authRef);
    if (!snap.exists) { throw new AiBillingUnavailableError('release_unknown_operation'); }
    const a = snap.data() as Record<string, unknown>;
    if (a.userId !== userId) { throw new AiBillingUnavailableError('release_user_mismatch'); }
    const state = a.state as AiAuthState;
    const reserved = Number(a.reservedTokens) || 0;
    if (state === 'RELEASED') { return { status: 'ALREADY_RELEASED', releasedTokens: Number(a.releasedTokens) || 0 }; }
    if (state === 'SETTLED') { return { status: 'ALREADY_SETTLED', releasedTokens: Number(a.releasedTokens) || 0 }; }
    if (state !== 'PREAUTHORIZED' && state !== 'PROVIDER_CLAIMED') { throw new AiBillingUnavailableError('release_invalid_state:' + state); }
    if (reserved > 0) {
      const walletSnap = await t.get(walletRef);
      const balance = readCanonicalBalance(walletSnap.data());
      t.update(walletRef, { reservedTokens: fv.increment(-reserved), balance: fv.increment(reserved), updatedAt: fv.serverTimestamp() });
      writeLedger(t, db, fv, { type: 'CHAT_RESERVATION_RELEASE', actorId: userId, amountTokens: reserved, avaloTokens: 0, before: balance, after: balance + reserved, operationId, sessionId: operationId });
    }
    t.update(authRef, { state: 'RELEASED' as AiAuthState, releasedTokens: reserved, releasedAt: fv.serverTimestamp() });
    return { status: 'RELEASED', releasedTokens: reserved };
  });
}

async function markReconciliation(db: FirestoreLike, fv: FieldValueLike, userId: string, operationId: string): Promise<void> {
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(authRef);
    if (!snap.exists) { return; }
    const a = snap.data() as Record<string, unknown>;
    if (a.state === 'PREAUTHORIZED' || a.state === 'PROVIDER_CLAIMED') { t.update(authRef, { state: 'FAILED_RECONCILIATION' as AiAuthState, reconciledAt: fv.serverTimestamp() }); }
  });
}

// ── ATOMIC PROVIDER-EXECUTION CLAIM. Exactly ONE caller may cross the provider boundary per canonical operation.
// The single transaction that transitions PREAUTHORIZED -> PROVIDER_CLAIMED receives CLAIM_ACQUIRED; every
// concurrent duplicate receives IN_PROGRESS (or an existing terminal state) and must NOT invoke the provider. The
// claim identity is server-created (never client-supplied). Fingerprint is re-verified (semantic idempotency). ──
export interface ClaimResult {
  status: 'CLAIM_ACQUIRED' | 'IN_PROGRESS' | 'EXISTING_CAPTURED' | 'EXISTING_SETTLED' | 'RELEASED' | 'RECONCILIATION';
  reservedTokens: number; capturedResult: string | null; providerClaimId: string | null;
}
export async function claimProviderExecution(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; product: string; avatarId: string; operationId: string; payloadDigest: string },
): Promise<ClaimResult> {
  const userId = assertNonEmpty(params.userId, 'user_id');
  const policy = resolveAiBillingPolicy(params.product);
  if (policy.billingClass === 'DISABLED') { throw new AiBillingUnavailableError('product_disabled_or_unknown:' + policy.product); }
  const avatarId = assertNonEmpty(params.avatarId, 'avatar_id');
  const operationId = assertNonEmpty(params.operationId, 'operation_id');
  const fp = fingerprint(userId, policy, avatarId, params.payloadDigest);
  const authRef = db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId);
  return db.runTransaction(async (t): Promise<ClaimResult> => {
    const snap = await t.get(authRef);
    if (!snap.exists) { throw new AiBillingUnavailableError('claim_unknown_operation'); }
    const a = snap.data() as Record<string, unknown>;
    if (a.userId !== userId) { throw new AiBillingUnavailableError('claim_user_mismatch'); }
    if (a.fingerprint !== fp) { throw new AiBillingConflictError(operationId); } // semantic idempotency preserved
    const state = a.state as AiAuthState;
    const reserved = Number(a.reservedTokens) || 0;
    const captured = (a.resultText as string | undefined) ?? null;
    const existingClaim = (a.providerClaimId as string | undefined) ?? null;
    if (state === 'SETTLED') { return { status: 'EXISTING_SETTLED', reservedTokens: reserved, capturedResult: captured, providerClaimId: existingClaim }; }
    if (state === 'RELEASED') { return { status: 'RELEASED', reservedTokens: 0, capturedResult: null, providerClaimId: existingClaim }; }
    if (state === 'PROVIDER_CAPTURED') { return { status: 'EXISTING_CAPTURED', reservedTokens: reserved, capturedResult: captured, providerClaimId: existingClaim }; }
    if (state === 'FAILED_RECONCILIATION') { return { status: 'RECONCILIATION', reservedTokens: reserved, capturedResult: null, providerClaimId: existingClaim }; }
    if (state === 'PROVIDER_CLAIMED') { return { status: 'IN_PROGRESS', reservedTokens: reserved, capturedResult: null, providerClaimId: existingClaim }; }
    // state === 'PREAUTHORIZED' — atomically claim single provider ownership (only one transaction wins this).
    const providerClaimId = createHash('sha256').update('claim|' + operationId + '|' + Date.now() + '|' + Math.random(), 'utf8').digest('hex').slice(0, 32);
    t.update(authRef, { state: 'PROVIDER_CLAIMED' as AiAuthState, providerClaimId, claimedAt: fv.serverTimestamp() });
    return { status: 'CLAIM_ACQUIRED', reservedTokens: reserved, capturedResult: null, providerClaimId };
  });
}

// ── ORCHESTRATOR: the ONLY sanctioned way to run a billable AI operation. Provider is invoked strictly AFTER a
// successful preauthorization; retries converge without re-invoking the provider or double-charging. ─────────
export interface AiProviderOutcome { eligible: boolean; eligibleTokens?: number; }
export type AiProviderFn = () => Promise<{ result: string; outcome: AiProviderOutcome }>;
export interface RunBillableAiResult {
  operationId: string; billingClass: AiBillingClass; reservedTokens: number; settledTokens: number; releasedTokens: number;
  providerInvoked: boolean; result: string | null; replay: boolean; inProgress?: boolean;
}

export async function runBillableAiOperation(
  db: FirestoreLike, fv: FieldValueLike,
  params: { userId: string; product: string; avatarId: string; clientRequestId: string; payloadDigest: string },
  providerFn: AiProviderFn,
): Promise<RunBillableAiResult> {
  const policy = resolveAiBillingPolicy(params.product);
  if (policy.billingClass === 'DISABLED') { throw new AiBillingUnavailableError('product_disabled_or_unknown:' + policy.product); }
  // FAIL CLOSED on a missing/malformed logical operation id, BEFORE any provider call. No random fallback.
  const cri = params.clientRequestId;
  if (typeof cri !== 'string' || cri.trim().length === 0) { throw new AiOperationIdRequiredError('missing'); }
  if (cri.length > 256 || /[\u0000-\u001f\u007f]/.test(cri)) { throw new AiOperationIdRequiredError('malformed'); }
  const operationId = deriveOperationId(params.userId, params.clientRequestId);

  const pre = await preauthorizeAiSpend(db, fv, { userId: params.userId, product: policy.product, avatarId: params.avatarId, operationId, payloadDigest: params.payloadDigest, clientRequestId: params.clientRequestId });

  // Idempotent replays that already reached a terminal state do NOT re-invoke the provider.
  if (pre.status === 'ALREADY_SETTLED') { return { operationId, billingClass: policy.billingClass, reservedTokens: pre.reservedTokens, settledTokens: 0, releasedTokens: 0, providerInvoked: false, result: pre.capturedResult ?? null, replay: true }; }
  if (pre.status === 'ALREADY_RELEASED') { return { operationId, billingClass: policy.billingClass, reservedTokens: 0, settledTokens: 0, releasedTokens: 0, providerInvoked: false, result: null, replay: true }; }
  if (pre.status === 'RECONCILIATION') { throw new AiSettlementReconciliationError(operationId); }
  // (ALREADY_PREAUTHORIZED / ALREADY_CAPTURED fall through to the atomic provider-execution claim below.)

  // ── ATOMIC PROVIDER-EXECUTION CLAIM: only the single CLAIM_ACQUIRED winner may invoke the provider. ──
  const claim = await claimProviderExecution(db, fv, { userId: params.userId, product: policy.product, avatarId: params.avatarId, operationId, payloadDigest: params.payloadDigest });
  if (claim.status === 'EXISTING_SETTLED') { return { operationId, billingClass: policy.billingClass, reservedTokens: claim.reservedTokens, settledTokens: 0, releasedTokens: 0, providerInvoked: false, result: claim.capturedResult ?? null, replay: true }; }
  if (claim.status === 'RELEASED') { return { operationId, billingClass: policy.billingClass, reservedTokens: 0, settledTokens: 0, releasedTokens: 0, providerInvoked: false, result: null, replay: true }; }
  if (claim.status === 'RECONCILIATION') { throw new AiSettlementReconciliationError(operationId); }
  if (claim.status === 'EXISTING_CAPTURED') {
    // Provider already ran (durable result); converge by settling without re-invoking the provider.
    const eligibleTokens = policy.billingClass === 'NON_BILLABLE' ? 0 : policy.unitPriceTokens;
    const set = await settleAiSpend(db, fv, { userId: params.userId, operationId, eligibleTokens });
    return { operationId, billingClass: policy.billingClass, reservedTokens: claim.reservedTokens, settledTokens: set.settledTokens, releasedTokens: set.releasedTokens, providerInvoked: false, result: set.resultText, replay: true };
  }
  if (claim.status === 'IN_PROGRESS') {
    // A concurrent owner holds the single provider-execution claim; this exact duplicate must NOT call the provider.
    return { operationId, billingClass: policy.billingClass, reservedTokens: claim.reservedTokens, settledTokens: 0, releasedTokens: 0, providerInvoked: false, result: null, replay: true, inProgress: true };
  }

  // claim.status === 'CLAIM_ACQUIRED' — WE own the single provider execution. Invoke the provider now.
  let providerInvoked = false;
  let captured: { result: string; outcome: AiProviderOutcome };
  try {
    providerInvoked = true;
    captured = await providerFn();
  } catch (err) {
    if (err instanceof AiProviderKnownFailure) {
      await releaseAiSpend(db, fv, { userId: params.userId, operationId }).catch(() => undefined);
      throw err;
    }
    // Unknown / uncertain / timeout: DO NOT blindly release (provider may have done work). Reconcile — the claim
    // is NOT freed for another automatic provider execution.
    await markReconciliation(db, fv, params.userId, operationId).catch(() => undefined);
    throw (err instanceof AiProviderUncertainError) ? err : new AiProviderUncertainError('provider_threw');
  }

  // BILLABLE ineligible (empty/error result) → release the reservation; no charge.
  if (policy.billingClass === 'BILLABLE' && !captured.outcome.eligible) {
    const rel = await releaseAiSpend(db, fv, { userId: params.userId, operationId });
    return { operationId, billingClass: policy.billingClass, reservedTokens: claim.reservedTokens, settledTokens: 0, releasedTokens: rel.releasedTokens, providerInvoked, result: captured.result, replay: false };
  }
  // Durably capture BEFORE settlement, then settle to a terminal state (NON_BILLABLE settles 0 → SETTLED so
  // concurrent duplicates converge to a replay rather than remaining IN_PROGRESS forever).
  await captureProviderResult(db, fv, { userId: params.userId, operationId, resultText: captured.result, eligible: true });
  const eligibleTokens = policy.billingClass === 'NON_BILLABLE' ? 0 : (typeof captured.outcome.eligibleTokens === 'number' ? captured.outcome.eligibleTokens : policy.unitPriceTokens);
  let set: SettleResult;
  try {
    set = await settleAiSpend(db, fv, { userId: params.userId, operationId, eligibleTokens });
  } catch (settleErr) {
    // Provider succeeded + settlement failed: the paid result must NOT escape as free. It is durably captured;
    // a retry converges by settling from PROVIDER_CAPTURED without re-invoking the provider.
    throw new AiSettlementReconciliationError(operationId);
  }
  return { operationId, billingClass: policy.billingClass, reservedTokens: claim.reservedTokens, settledTokens: set.settledTokens, releasedTokens: set.releasedTokens, providerInvoked, result: set.resultText ?? captured.result, replay: false };
}
