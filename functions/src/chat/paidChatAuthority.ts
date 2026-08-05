// functions/src/chat/paidChatAuthority.ts
//
// P0-05 R1B-1 (R2) — NON-FORGEABLE TRUSTED PAID-CHAT AUTHORITY (source-level ENGINE_A financial-vector neutralization).
//
// Legacy `/chats` documents are NEVER trusted financial authority. Any function that can cause a financial effect
// (wallet debit/reservation, earner credit, creator earning, ledger, billing event, multiplier charge) must require a
// `TrustedPaidChatAuthority`. That capability is:
//   - branded with a MODULE-PRIVATE `unique symbol` (`TRUSTED_PAID_CHAT_AUTHORITY_BRAND`) that NO code outside this
//     module can reproduce, so no client / `{trusted:true}` / object-literal / cast / JSON / spread object can satisfy
//     `isTrustedPaidChatAuthority`;
//   - **not constructible from arbitrary caller-supplied fields** — this module exports NO mint/factory. (The earlier
//     R1 exported `mintTrustedPaidChatAuthority(rawFields)`; independent review flagged it as a forgeable-trust factory
//     because any server importer could mint a valid authority from client/`/chats`-derived fields. It is removed.)
//
// Consequently, in R1B-1 there is NO way — production OR test — to construct a valid `TrustedPaidChatAuthority`.
// `isTrustedPaidChatAuthority` therefore returns false for EVERYTHING, and every legacy financial path
// (canonical-chat-engine.processMessage, the legacy shim) is fail-closed at the SOURCE — independent of the disabled
// `sendChatMessage` entrypoint.
//
// R1B-2 (this stage) introduces the FIRST legitimate authority constructor as a MODULE-INTERNAL capability
// (`issueTrustedAuthorityFromValidatedRecord`, NOT exported) that mints ONLY after the canonical loader
// (`loadTrustedPaidChatAuthority`) has loaded and validated a SERVER-OWNED `/paidChats/{paidChatId}` record — never
// from client `/chats` data, never from a caller-asserted boolean, never from raw caller-supplied fields. The loader
// proves RECORD AUTHENTICITY only; per-action CALLER AUTHORIZATION (may this caller send/debit/earn) is a separate
// concern deferred to later canonical operation authorization (R1C+). Billing remains DISABLED: no production path
// invokes the loader to bill, and payer/earner/rate/multiplier/policy all derive from the server-owned record.

import { getFirestore } from 'firebase-admin/firestore';
import {
  PAID_CHATS_COLLECTION,
  validateCanonicalPaidChatRecord,
  CanonicalPaidChatRecord,
} from './canonicalPaidChat/paidChatRecord';
import { buildPaidChatAuthorityCanonicalPayloadBytes } from '../security/financialAuthority/canonicalFingerprint';
import { parseAuthorityEnvelope, FINANCIAL_AUTHORITY_DOMAINS } from '../security/financialAuthority/authorityEnvelope';
import {
  assertVerifiedAuthorityEnvelope,
  getProductionFinancialAuthorityVerifier,
} from '../security/financialAuthority/authorityProvenance';

export const PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED = 'PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED';

/**
 * Companion field on a `/paidChats/{id}` document holding the cryptographic provenance envelope (P0-IAM-01A). It is
 * NOT part of the canonical business record (`validateCanonicalPaidChatRecord` ignores it) and is NEVER trusted by
 * shape — it is validated only through signature verification against an external public key.
 */
export const PAID_CHAT_AUTHORITY_ENVELOPE_FIELD = '__authorityEnvelope';

// Module-private brand. Not exported. No external module can construct an object carrying this key === true.
const TRUSTED_PAID_CHAT_AUTHORITY_BRAND: unique symbol = Symbol('avalo.trustedPaidChatAuthority.v1');

// Opaque capability type. Its trust derives from the module-private brand PROVENANCE, never from its data shape:
// possessing these fields does NOT make an object trusted.
export interface TrustedPaidChatAuthority {
  readonly [TRUSTED_PAID_CHAT_AUTHORITY_BRAND]: true;
  readonly paidChatId: string;
  readonly pairKey: string;
  readonly payerId: string;
  readonly earnerId: string | null;
  readonly baseRateTokens: number;            // canonical base (3), loaded from /paidChats — NOT trusted-by-shape
  readonly multiplierSnapshot: number;        // server-frozen multiplier, loaded from /paidChats
  readonly effectiveRateTokens: number;       // = baseRateTokens × multiplierSnapshot, loaded from /paidChats (R1B-2)
  readonly minimumReservationTokens: number;  // canonical entry floor (>=100), loaded from /paidChats (R1B-2)
  readonly sessionId: string;
  readonly billingPolicyVersion: number;      // loaded from /paidChats (R1B-2)
  readonly authorityVersion: number;
}

// Fail-closed error thrown when a financial operation is attempted without trusted canonical authority.
export class PaidChatCanonicalAuthorityRequiredError extends Error {
  readonly code = 'failed-precondition';
  constructor() { super(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED); this.name = 'PaidChatCanonicalAuthorityRequiredError'; }
}

// Type guard: TRUE only for objects carrying the module-private brand. Non-forgeable: since no code outside this
// module can obtain the symbol, and this module exports no constructor, nothing can produce a `true` here in R1B-1.
export function isTrustedPaidChatAuthority(x: unknown): x is TrustedPaidChatAuthority {
  return typeof x === 'object' && x !== null &&
    (x as Record<symbol, unknown>)[TRUSTED_PAID_CHAT_AUTHORITY_BRAND] === true;
}

// Require trusted authority before any financial mutation; throws fail-closed otherwise.
export function requirePaidChatAuthority(a: unknown): TrustedPaidChatAuthority {
  if (!isTrustedPaidChatAuthority(a)) { throw new PaidChatCanonicalAuthorityRequiredError(); }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// R1B-2 — canonical server-owned authority loader + module-internal minter.
//
// The minter below is the ONE and ONLY place a `TrustedPaidChatAuthority` is constructed. It is NOT exported, accepts
// NO raw caller fields (only an already-validated `CanonicalPaidChatRecord`), and is reachable ONLY via the canonical
// loader after a server-owned `/paidChats` record has been loaded and validated. There is deliberately NO exported
// mint/create/build/issue/factory that takes arbitrary fields (that R1 defect is permanently closed).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fail-closed error thrown when the canonical `/paidChats` authority load cannot produce a trusted authority. */
export class PaidChatAuthorityLoadError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`PAID_CHAT_AUTHORITY_LOAD_FAILED: ${reason}`);
    this.name = 'PaidChatAuthorityLoadError';
    this.reason = reason;
  }
}

// MODULE-PRIVATE. Constructs the branded capability from an ALREADY-VALIDATED server-owned record. Not exported; the
// only caller is `loadTrustedPaidChatAuthority`. It carries payer/earner/rate/multiplier/policy straight from the
// validated `/paidChats` record — closing the R1B-1 deferred rate/multiplier trust gap at the data path.
function issueTrustedAuthorityFromValidatedRecord(rec: CanonicalPaidChatRecord): TrustedPaidChatAuthority {
  return {
    [TRUSTED_PAID_CHAT_AUTHORITY_BRAND]: true,
    paidChatId: rec.paidChatId,
    pairKey: rec.pairKey,
    payerId: rec.payerId,
    earnerId: rec.earnerId,
    baseRateTokens: rec.baseRateTokens,
    multiplierSnapshot: rec.multiplierSnapshot,
    effectiveRateTokens: rec.effectiveRateTokens,
    minimumReservationTokens: rec.minimumReservationTokens,
    sessionId: rec.activeSessionId,
    billingPolicyVersion: rec.billingPolicyVersion,
    authorityVersion: rec.authorityVersion,
  };
}

/**
 * Canonical server-internal loader — the FIRST and ONLY legitimate authority construction path.
 *
 * Accepts a minimal server-derived identifier (`paidChatId`), loads the server-owned `/paidChats/{paidChatId}` record
 * from Firestore, validates it fail-closed (existence, schema/version, participants, payer/earner, pairKey, state,
 * rate/multiplier/effective-rate consistency, minimum reservation, authority/billing policy versions), THEN verifies a
 * cryptographic provenance envelope (P0-IAM-01A) over the record's canonical fingerprint, and only THEN mints a
 * non-forgeable `TrustedPaidChatAuthority` internally.
 *
 * Provenance closes the Codex "schema-validity != writer-provenance" defect at the code layer: a record written by
 * arbitrary Admin-capable co-tenant code (no valid signature) FAILS verification and never becomes a loadable
 * authority. The verifier is resolved INTERNALLY from the production trust root
 * (`getProductionFinancialAuthorityVerifier`, SAFE_UNAVAILABLE until KMS is wired in P0-IAM-01B). It is NOT a
 * caller-supplied parameter and there is NO verifier/config injection seam on this function — removing the injectable
 * verifier closes the Codex R2 bypass, where an importer could pass a permissive `{ verify() {} }` to force a mint from
 * an arbitrary/unsigned record. `loadTrustedPaidChatAuthority` takes ONLY a server-derived id (`.length === 1`); until
 * production verification is configured (P0-IAM-01B), EVERY load fails closed, so no shipped path mints authority.
 *
 * It does NOT accept raw authority fields, a client payload, a caller-asserted boolean, or a caller-supplied verifier.
 * It performs NO financial mutation (no wallet debit/credit, no reservation, no ledger, no earning) — it is
 * authenticity-only. Per-action caller authorization (may THIS caller send/debit/earn) is a separate downstream concern
 * (R1C+); a verified authority is NOT action authorization. Billing is NOT enabled by this loader.
 *
 * @throws PaidChatAuthorityLoadError when the id is invalid or the record does not exist
 * @throws PaidChatRecordValidationError (fail-closed) when the loaded record fails canonical validation
 * @throws AuthorityEnvelopeError / FinancialAuthorityVerificationError / FinancialAuthorityProvenanceUnavailableError
 *         (fail-closed) when the provenance envelope is missing, malformed, unverifiable, or verification is unwired
 */
export async function loadTrustedPaidChatAuthority(paidChatId: string): Promise<TrustedPaidChatAuthority> {
  if (typeof paidChatId !== 'string' || paidChatId.trim().length === 0) {
    throw new PaidChatAuthorityLoadError('invalid_paidChatId');
  }
  const db = getFirestore();
  const snap = await db.collection(PAID_CHATS_COLLECTION).doc(paidChatId).get();
  if (!snap.exists) {
    throw new PaidChatAuthorityLoadError('record_not_found');
  }
  const data = snap.data() as Record<string, unknown>;
  // (1) business-data validity (fail-closed on any schema/consistency error, BEFORE crypto).
  const record = validateCanonicalPaidChatRecord({ ...data, paidChatId: snap.id });
  // (2) cryptographic provenance: parse the companion envelope, re-derive the canonical fingerprint from the validated
  //     record, and verify signature + bindings using the INTERNAL production verifier (no caller seam). Any
  //     mismatch/missing signature/unwired verifier throws fail-closed.
  const envelope = parseAuthorityEnvelope(data[PAID_CHAT_AUTHORITY_ENVELOPE_FIELD]);
  const canonicalPayloadBytes = buildPaidChatAuthorityCanonicalPayloadBytes(record);
  assertVerifiedAuthorityEnvelope(
    envelope,
    {
      domain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT,
      resourceId: record.paidChatId,
      recordVersion: record.version,
      authorityVersion: record.authorityVersion,
      policyVersion: record.billingPolicyVersion,
      canonicalPayloadBytes,
    },
    getProductionFinancialAuthorityVerifier(),
  );
  // (3) only now mint the non-forgeable capability from the verified, validated record.
  return issueTrustedAuthorityFromValidatedRecord(record);
}
