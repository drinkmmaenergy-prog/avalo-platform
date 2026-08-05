// functions/src/security/financialAuthority/canonicalFingerprint.ts
//
// P0-IAM-01A — DETERMINISTIC CANONICAL FINGERPRINT (generic financial-authority primitive).
//
// This module turns an authority-relevant field set into EXACT, reproducible bytes and a cryptographic fingerprint
// (SHA-256). It is the INTEGRITY INPUT for provenance; it is NOT provenance by itself (a hash proves nothing about WHO
// produced it — see ../financialAuthority/authorityProvenance and evidence 04/05). Provenance is established only when
// a signature over these bytes is verified against an external public key (future production KMS; test keypair locally).
//
// Design requirements (P0-IAM-01A Phase 4):
//   - explicit, fixed field order;
//   - explicit null representation;
//   - deterministic array encoding;
//   - NO `undefined` and NO NaN/Infinity/non-integer numbers;
//   - length-prefixed tokens so no value can forge a field boundary (canonicalization is injection-safe);
//   - an explicit fingerprint-algorithm version prefix.
// Property: same logical record -> identical bytes; ANY authority-relevant mutation -> different bytes.
//
// This primitive is intentionally domain-agnostic so it can later protect wallet/ledger/earning/payout/AI-billing/
// advertiser/purchase/refund authority (P0-IAM-01A Phase 20) — only `buildPaidChatAuthorityCanonicalFields` below is
// paid-chat specific.

import * as crypto from 'crypto';

/** Current canonical fingerprint algorithm version. Bound into the byte stream and the envelope. */
export const FINGERPRINT_ALGORITHM_VERSION = 'AVALO_FP_V1_SHA256';

/** A single canonical field value: an integer, a non-empty-safe string, a boolean, null, or a string array. */
export type CanonicalFieldValue = string | number | boolean | null | readonly string[];

/** An ordered canonical field. Order is significant and fixed by the domain binder. */
export interface CanonicalField {
  readonly key: string;
  readonly value: CanonicalFieldValue;
}

/** Thrown when a value cannot be canonicalized deterministically (fail-closed; never guess). */
export class CanonicalFingerprintError extends Error {
  readonly code = 'failed-precondition';
  constructor(reason: string) {
    super(`CANONICAL_FINGERPRINT_INVALID: ${reason}`);
    this.name = 'CanonicalFingerprintError';
  }
}

// Length-prefixed token: `<len>:<utf8>`; length is the UTF-8 byte length so multi-byte content cannot forge boundaries.
function lp(s: string): string {
  const bytes = Buffer.byteLength(s, 'utf8');
  return `${bytes}:${s}`;
}

function encodeInteger(key: string, v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new CanonicalFingerprintError(`non_integer_number:${key}`);
  }
  // Normalize -0 to 0; integers only (no float ambiguity in the byte stream).
  const norm = Object.is(v, -0) ? 0 : v;
  return `I|${lp(String(norm))}`;
}

function encodeValue(key: string, value: CanonicalFieldValue): string {
  if (value === undefined) throw new CanonicalFingerprintError(`undefined_value:${key}`);
  if (value === null) return 'N|';
  if (typeof value === 'string') return `S|${lp(value)}`;
  if (typeof value === 'boolean') return `B|${value ? '1' : '0'}`;
  if (typeof value === 'number') return encodeInteger(key, value);
  if (Array.isArray(value)) {
    // Deterministic array: element count + each element length-prefixed, in the given (already-canonical) order.
    for (const el of value) {
      if (typeof el !== 'string') throw new CanonicalFingerprintError(`array_non_string_element:${key}`);
    }
    const parts = (value as readonly string[]).map((el) => lp(el));
    return `A|${lp(String(value.length))}|${parts.join('|')}`;
  }
  throw new CanonicalFingerprintError(`unsupported_value_type:${key}`);
}

/**
 * Serialize an ordered field list into deterministic canonical bytes. Each field is emitted as
 * `<len>:<key>=<typedValue>` joined by `\n`, with a fingerprint-version header. Length prefixes on both key and value
 * make the encoding unambiguous and injection-safe.
 */
export function canonicalizeAuthorityFields(fields: readonly CanonicalField[]): Buffer {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new CanonicalFingerprintError('empty_field_set');
  }
  const seen = new Set<string>();
  const lines: string[] = [`FPV|${lp(FINGERPRINT_ALGORITHM_VERSION)}`];
  for (const f of fields) {
    if (!f || typeof f.key !== 'string' || f.key.length === 0) {
      throw new CanonicalFingerprintError('invalid_field_key');
    }
    if (seen.has(f.key)) throw new CanonicalFingerprintError(`duplicate_field_key:${f.key}`);
    seen.add(f.key);
    lines.push(`${lp(f.key)}=${encodeValue(f.key, f.value)}`);
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

/** SHA-256 hex of arbitrary bytes. Standard cryptographic hash; requires NO secret. Integrity input only. */
export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Convenience: canonical bytes -> fingerprint hex. */
export function fingerprintOf(fields: readonly CanonicalField[]): { canonicalBytes: Buffer; fingerprintHex: string } {
  const canonicalBytes = canonicalizeAuthorityFields(fields);
  return { canonicalBytes, fingerprintHex: sha256Hex(canonicalBytes) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Paid-chat domain binding (P0-IAM-01A Phase 3).
//
// Bind EVERY field whose mutation changes: who pays, who earns, how much is billed, whether billing may occur, or which
// session is authoritative. Fields and the reason each is IN/OUT:
//   IN  paidChatId        — resource identity; binds the signature to this resource (prevents copy A->B).
//   IN  version           — record version; binds provenance to a record generation (prevents stale replay).
//   IN  authorityVersion  — authority schema generation.
//   IN  rolePolicyVersion — the policy under which payer/earner were resolved.
//   IN  payerId, earnerId — WHO pays / WHO earns.
//   IN  pairKey           — order-stable pair identity (payer/earner binding).
//   IN  participants      — full membership (sorted canonically; pairKey already order-stable).
//   IN  roleReason        — server role-resolution reason (authority-relevant provenance of the role assignment).
//   IN  state, entryMode, acceptanceState — whether the record is a live, accepted authority.
//   IN  baseRateTokens, multiplierSnapshot, effectiveRateTokens — HOW MUCH is billed per response.
//   IN  minimumReservationTokens, sessionBudgetTokens, remainingReservedTokens — reservation/billing envelope.
//   IN  activeSessionId   — WHICH session this authority is bound to (prevents cross-session replay).
//   IN  billingPolicyVersion — the billing policy generation.
//   OUT nothing authority-relevant is excluded. (No timestamps/free-text beyond roleReason are part of authority; the
//       envelope's signedAt is informational and deliberately NOT in the fingerprint so it cannot be a tamper vector.)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Minimal shape this binder needs (matches the validated CanonicalPaidChatRecord; kept structural for reuse). */
export interface PaidChatAuthorityFingerprintInput {
  readonly paidChatId: string;
  readonly version: number;
  readonly authorityVersion: number;
  readonly rolePolicyVersion: number;
  readonly payerId: string;
  readonly earnerId: string | null;
  readonly pairKey: string;
  readonly participants: readonly string[];
  readonly roleReason: string;
  readonly state: string;
  readonly entryMode: string;
  readonly acceptanceState: string;
  readonly baseRateTokens: number;
  readonly multiplierSnapshot: number;
  readonly effectiveRateTokens: number;
  readonly minimumReservationTokens: number;
  readonly sessionBudgetTokens: number;
  readonly remainingReservedTokens: number;
  readonly activeSessionId: string;
  readonly billingPolicyVersion: number;
}

/** Fixed-order canonical fields for a paid-chat authority record. */
export function buildPaidChatAuthorityCanonicalFields(rec: PaidChatAuthorityFingerprintInput): CanonicalField[] {
  // participants sorted for a stable set representation; pairKey (order-stable) separately binds the payer/earner pair.
  const participantsCanonical = [...rec.participants].sort();
  return [
    { key: 'paidChatId', value: rec.paidChatId },
    { key: 'version', value: rec.version },
    { key: 'authorityVersion', value: rec.authorityVersion },
    { key: 'rolePolicyVersion', value: rec.rolePolicyVersion },
    { key: 'payerId', value: rec.payerId },
    { key: 'earnerId', value: rec.earnerId },
    { key: 'pairKey', value: rec.pairKey },
    { key: 'participants', value: participantsCanonical },
    { key: 'roleReason', value: rec.roleReason },
    { key: 'state', value: rec.state },
    { key: 'entryMode', value: rec.entryMode },
    { key: 'acceptanceState', value: rec.acceptanceState },
    { key: 'baseRateTokens', value: rec.baseRateTokens },
    { key: 'multiplierSnapshot', value: rec.multiplierSnapshot },
    { key: 'effectiveRateTokens', value: rec.effectiveRateTokens },
    { key: 'minimumReservationTokens', value: rec.minimumReservationTokens },
    { key: 'sessionBudgetTokens', value: rec.sessionBudgetTokens },
    { key: 'remainingReservedTokens', value: rec.remainingReservedTokens },
    { key: 'activeSessionId', value: rec.activeSessionId },
    { key: 'billingPolicyVersion', value: rec.billingPolicyVersion },
  ];
}

/** Canonical bytes for a paid-chat authority record (what the signer signs and the verifier re-derives). */
export function buildPaidChatAuthorityCanonicalPayloadBytes(rec: PaidChatAuthorityFingerprintInput): Buffer {
  return canonicalizeAuthorityFields(buildPaidChatAuthorityCanonicalFields(rec));
}
