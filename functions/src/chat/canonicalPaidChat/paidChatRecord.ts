// functions/src/chat/canonicalPaidChat/paidChatRecord.ts
//
// P0-05 R1B-2 — CANONICAL SERVER-OWNED `/paidChats` RECORD SCHEMA + PURE VALIDATOR.
//
// `/paidChats/{paidChatId}` is the FIRST server-owned canonical paid-chat authority domain. Its documents are the ONLY
// legitimate source of financial authority for paid chat (payer/earner/rate/multiplier/policy). Client-forgeable
// `/chats` documents are NEVER trusted (see R1B-1). Firestore rules keep `/paidChats` server-only (there is no client
// write rule → default-deny for create/update/delete; reads are not exposed to clients in R1B-2).
//
// This module is PURE and side-effect free: it defines the schema type and a strict validator that either returns a
// fully-validated record or throws. It does NOT read Firestore and it CANNOT mint a `TrustedPaidChatAuthority` (the
// trust brand is module-private to `../paidChatAuthority`). The authenticity capability is minted ONLY by the canonical
// loader (`../paidChatAuthority.loadTrustedPaidChatAuthority`) AFTER this validator accepts a server-loaded record.
//
// R1B-2 builds the foundation only — no billing is enabled, no wallet/reservation/ledger effect occurs, and no client
// creation path exists. Full RoleResolver, pair-level 3/3, reservation/billing integration, and the client facade are
// deferred to R1C+/R1D+/R1E.

import type { C5ChatState } from './../canonicalChatStateMachineV3';

/** Canonical server-owned collection for paid-chat financial authority records. */
export const PAID_CHATS_COLLECTION = 'paidChats';

/** Current canonical schema version. */
export const PAID_CHAT_SCHEMA_VERSION = 1;
/** Known authority version(s). A record with an unknown authorityVersion is rejected fail-closed. */
export const KNOWN_AUTHORITY_VERSIONS: readonly number[] = [1];
/** Known billing-policy version(s). A record with an unknown billingPolicyVersion is rejected fail-closed. */
export const KNOWN_BILLING_POLICY_VERSIONS: readonly number[] = [1];
/** Known role-policy version(s). RoleResolver is NOT implemented in R1B-2 (roles must be pre-resolved server-side). */
export const KNOWN_ROLE_POLICY_VERSIONS: readonly number[] = [1];

/**
 * Canonical base rate per eligible delivered earner response (product §0.3). Mirrors
 * `creator/canonicalEarningService.BASE_CREATOR_RESPONSE_RATE_TOKENS` and
 * `chat/canonicalChatStateMachineV3.BASE_CREATOR_RESPONSE_RATE_TOKENS` (= 3). Held locally to keep this foundation
 * module free of heavy runtime imports (KYC/wallet). effectiveRateTokens = baseRateTokens × multiplierSnapshot.
 */
export const CANONICAL_BASE_RATE_TOKENS = 3;

/** Minimum paid-entry reservation (product §0.4). Mirrors `wallet/walletService.MIN_SESSION_ENTRY_TOKENS` (= 100). */
export const CANONICAL_MIN_RESERVATION_TOKENS = 100;

/**
 * Canonical commercial multiplier ladder (product contract): x2,x3,x5,x7,x10,x20,x30,x50,x70,x100.
 * Mirrors the commercial set in `chat/canonicalMultiplierTiers` (x1 is a migration fallback only and is NOT a valid
 * financial-authority multiplier — it is excluded here). A multiplierSnapshot outside this ladder is rejected.
 */
export const CANONICAL_AUTHORITY_MULTIPLIER_LADDER: readonly number[] = [2, 3, 5, 7, 10, 20, 30, 50, 70, 100];

/**
 * Paid-chat state. Reuses canonical c5 state names (`C5ChatState`) — no conflicting second state model is introduced.
 * A financial-authority record must be in one of AUTHORITY_ELIGIBLE_STATES (roles already server-resolved and the
 * session is not closed). Other valid c5 states (e.g. FREE_ACTIVE, CLOSED, EXPIRED) are not authority-eligible.
 */
export type CanonicalPaidChatState = C5ChatState;

/** States in which a `/paidChats` record represents a live financial authority (roles resolved, not closed). */
export const AUTHORITY_ELIGIBLE_STATES: readonly CanonicalPaidChatState[] = [
  'AWAITING_EARNER_ACCEPT',
  'PAID_ENTRY_PENDING',
  'PAID_ACTIVE',
  'LOCKED_CONTINUATION',
];

/** Entry mode for a paid chat. */
export type PaidChatEntryMode = 'MATCHED' | 'PAID_REQUEST';

/** Creator acceptance state. */
export type PaidChatAcceptanceState = 'PENDING' | 'ACCEPTED' | 'DECLINED';

/**
 * Canonical server-owned paid-chat record. ALL fields are server-owned and server-written; a client can never supply
 * any of them (Firestore default-deny on `/paidChats`). Financial-classified fields (payer/earner/rate/multiplier/
 * reservation/policy) are the trusted basis for future billing.
 */
export interface CanonicalPaidChatRecord {
  readonly paidChatId: string;
  readonly pairKey: string;
  readonly participants: readonly string[];
  readonly payerId: string;                     // = fanId (server role-resolved)
  readonly earnerId: string | null;             // = creatorId (null until server role resolution completes)
  readonly roleReason: string;                  // server role-resolution reason (placeholder contract for R1D)
  readonly rolePolicyVersion: number;
  readonly state: CanonicalPaidChatState;
  readonly entryMode: PaidChatEntryMode;
  readonly acceptanceState: PaidChatAcceptanceState;
  readonly baseRateTokens: number;              // canonical 3
  readonly multiplierSnapshot: number;          // server-frozen, in the canonical ladder
  readonly effectiveRateTokens: number;         // = baseRateTokens × multiplierSnapshot
  readonly minimumReservationTokens: number;    // >= 100
  readonly sessionBudgetTokens: number;         // >= 0
  readonly remainingReservedTokens: number;     // >= 0
  readonly activeSessionId: string;
  readonly billingPolicyVersion: number;
  readonly authorityVersion: number;
  readonly version: number;
}

/** Fail-closed error thrown when a `/paidChats` record fails canonical validation. */
export class PaidChatRecordValidationError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`PAID_CHAT_RECORD_INVALID: ${reason}`);
    this.name = 'PaidChatRecordValidationError';
    this.reason = reason;
  }
}

// ── numeric guards (reject NaN / Infinity / non-integer / out-of-range) ──────────────────────────────────────────
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNonNegInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
}
function isPositiveInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0;
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Deterministic, order-stable pair key for two participant identities. Server-generated; no client-selected reset
 * semantics. Used both to derive/validate a record's pairKey and (later) to bind pair-level free-intro authority.
 */
export function normalizedPairKey(a: string, b: string): string {
  if (!isNonEmptyString(a) || !isNonEmptyString(b)) {
    throw new PaidChatRecordValidationError('pairKey_participants_invalid');
  }
  if (a === b) {
    throw new PaidChatRecordValidationError('pairKey_self_pair');
  }
  return [a, b].sort().join('__');
}

/**
 * Strictly validate a raw `/paidChats` document (as loaded server-side) and return a typed, fully-validated record.
 * Throws `PaidChatRecordValidationError` (fail-closed) on ANY invalid or inconsistent field. Never mints trust — that
 * is the exclusive responsibility of the canonical loader in `../paidChatAuthority`.
 */
export function validateCanonicalPaidChatRecord(raw: unknown): CanonicalPaidChatRecord {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PaidChatRecordValidationError('record_missing_or_not_object');
  }
  const r = raw as Record<string, unknown>;

  // schema / authority / billing / role policy versions
  if (!isPositiveInt(r.version) || (r.version as number) < 1) throw new PaidChatRecordValidationError('version_invalid');
  if (!isPositiveInt(r.authorityVersion) || !KNOWN_AUTHORITY_VERSIONS.includes(r.authorityVersion as number)) {
    throw new PaidChatRecordValidationError('authorityVersion_unknown');
  }
  if (!isPositiveInt(r.billingPolicyVersion) || !KNOWN_BILLING_POLICY_VERSIONS.includes(r.billingPolicyVersion as number)) {
    throw new PaidChatRecordValidationError('billingPolicyVersion_unknown');
  }
  if (!isPositiveInt(r.rolePolicyVersion) || !KNOWN_ROLE_POLICY_VERSIONS.includes(r.rolePolicyVersion as number)) {
    throw new PaidChatRecordValidationError('rolePolicyVersion_unknown');
  }

  // identity
  if (!isNonEmptyString(r.paidChatId)) throw new PaidChatRecordValidationError('paidChatId_invalid');
  if (!isNonEmptyString(r.pairKey)) throw new PaidChatRecordValidationError('pairKey_invalid');
  if (!isNonEmptyString(r.roleReason)) throw new PaidChatRecordValidationError('roleReason_invalid');

  // participants
  if (!Array.isArray(r.participants) || r.participants.length < 2 || !r.participants.every(isNonEmptyString)) {
    throw new PaidChatRecordValidationError('participants_invalid');
  }
  const participants = r.participants as string[];

  // payer / earner
  if (!isNonEmptyString(r.payerId)) throw new PaidChatRecordValidationError('payerId_invalid');
  const payerId = r.payerId as string;
  if (!participants.includes(payerId)) throw new PaidChatRecordValidationError('payer_not_participant');

  let earnerId: string | null;
  if (r.earnerId === null) {
    earnerId = null;
  } else if (isNonEmptyString(r.earnerId)) {
    earnerId = r.earnerId as string;
    if (earnerId === payerId) throw new PaidChatRecordValidationError('payer_equals_earner');
    if (!participants.includes(earnerId)) throw new PaidChatRecordValidationError('earner_not_participant');
  } else {
    throw new PaidChatRecordValidationError('earnerId_invalid');
  }

  // pairKey determinism (server-derived, order-stable)
  if (earnerId !== null && r.pairKey !== normalizedPairKey(payerId, earnerId)) {
    throw new PaidChatRecordValidationError('pairKey_mismatch');
  }

  // state (must be a live authority-eligible canonical state)
  if (typeof r.state !== 'string' || !AUTHORITY_ELIGIBLE_STATES.includes(r.state as CanonicalPaidChatState)) {
    throw new PaidChatRecordValidationError('state_invalid_or_not_authority_eligible');
  }
  if (r.entryMode !== 'MATCHED' && r.entryMode !== 'PAID_REQUEST') {
    throw new PaidChatRecordValidationError('entryMode_invalid');
  }
  if (r.acceptanceState !== 'PENDING' && r.acceptanceState !== 'ACCEPTED' && r.acceptanceState !== 'DECLINED') {
    throw new PaidChatRecordValidationError('acceptanceState_invalid');
  }

  // rate / multiplier / effective-rate consistency
  if (!isPositiveInt(r.baseRateTokens) || (r.baseRateTokens as number) !== CANONICAL_BASE_RATE_TOKENS) {
    throw new PaidChatRecordValidationError('baseRateTokens_not_canonical');
  }
  if (!isPositiveInt(r.multiplierSnapshot) || !CANONICAL_AUTHORITY_MULTIPLIER_LADDER.includes(r.multiplierSnapshot as number)) {
    throw new PaidChatRecordValidationError('multiplier_not_in_ladder');
  }
  const expectedEffective = (r.baseRateTokens as number) * (r.multiplierSnapshot as number);
  if (!isPositiveInt(r.effectiveRateTokens) || (r.effectiveRateTokens as number) !== expectedEffective) {
    throw new PaidChatRecordValidationError('effectiveRate_mismatch');
  }

  // reservation / budget
  if (!isPositiveInt(r.minimumReservationTokens) || (r.minimumReservationTokens as number) < CANONICAL_MIN_RESERVATION_TOKENS) {
    throw new PaidChatRecordValidationError('minimumReservation_below_floor');
  }
  if (!isNonNegInt(r.sessionBudgetTokens)) throw new PaidChatRecordValidationError('sessionBudgetTokens_invalid');
  if (!isNonNegInt(r.remainingReservedTokens)) throw new PaidChatRecordValidationError('remainingReservedTokens_invalid');

  // session
  if (!isNonEmptyString(r.activeSessionId)) throw new PaidChatRecordValidationError('activeSessionId_invalid');

  return {
    paidChatId: r.paidChatId as string,
    pairKey: r.pairKey as string,
    participants: participants.slice(),
    payerId,
    earnerId,
    roleReason: r.roleReason as string,
    rolePolicyVersion: r.rolePolicyVersion as number,
    state: r.state as CanonicalPaidChatState,
    entryMode: r.entryMode as PaidChatEntryMode,
    acceptanceState: r.acceptanceState as PaidChatAcceptanceState,
    baseRateTokens: r.baseRateTokens as number,
    multiplierSnapshot: r.multiplierSnapshot as number,
    effectiveRateTokens: r.effectiveRateTokens as number,
    minimumReservationTokens: r.minimumReservationTokens as number,
    sessionBudgetTokens: r.sessionBudgetTokens as number,
    remainingReservedTokens: r.remainingReservedTokens as number,
    activeSessionId: r.activeSessionId as string,
    billingPolicyVersion: r.billingPolicyVersion as number,
    authorityVersion: r.authorityVersion as number,
    version: r.version as number,
  };
}
