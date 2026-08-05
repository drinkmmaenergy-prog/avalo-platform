// functions/src/security/financialAuthority/authorityService.ts
//
// P0-IAM-01B — dedicated PaidChat Authority Service (the ONLY path to a valid KMS financial-authority signature).
//
// Generic shared-Admin backend code may write /paidChats, but it cannot manufacture a TrustedPaidChatAuthority: minting
// requires a valid signature, and the ONLY way to obtain one is to successfully invoke this service, which
//   (1) authenticates the calling SERVICE identity (OIDC; never headers/body/user-token) — fail closed;
//   (2) authorizes that identity for (operation, authorityDomain) — default-deny;
//   (3) strictly validates a narrow request DTO (no raw bytes, no digest, no key/algo/domain selection);
//   (4) enforces exactly ONE ACTIVE_FOR_SIGNING key for the domain;
//   (5) reads the AUTHORITATIVE record itself and derives the canonical bytes (caller cannot supply signing input);
//   (6) enforces idempotency/replay/freshness;
//   (7) signs via KMS (private key never leaves KMS);
//   (8) durably records idempotency + audit (fail closed if durable audit fails).
// It is NOT a generic signing oracle. Until deps are wired (P0-IAM-01B2) it is SAFE_UNAVAILABLE.

import { FinancialAuthoritySigner } from './authorityProvenance';
import { FinancialAuthorityEnvelope, FINANCIAL_AUTHORITY_DOMAINS, SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS } from './authorityEnvelope';
import { ValidatedKeyRegistry } from './authorityProvenance';
import { buildPaidChatAuthorityCanonicalPayloadBytes } from './canonicalFingerprint';
import { CanonicalPaidChatRecord, validateCanonicalPaidChatRecord } from '../../chat/canonicalPaidChat/paidChatRecord';
import { ServiceInvocationVerifier, AuthorizedCallerPolicy, ServiceInvocationContext, ServiceCallerIdentity } from './serviceAuth';
import * as crypto from 'crypto';

/** The single operation this service exposes. There is no raw/arbitrary signing operation. */
export const SIGN_PAID_CHAT_AUTHORITY = 'signPaidChatAuthority' as const;
export const AUTHORITY_SERVICE_STATE = 'SAFE_UNAVAILABLE' as const;

/** Strict request DTO. NO caller identity, NO canonical bytes, NO digest, NO key/algorithm/domain-free-choice. */
export interface SignFinancialAuthorityRequest {
  readonly authorityDomain: string; // must be PAID_CHAT (allowlisted)
  readonly operation: string; // must be SIGN_PAID_CHAT_AUTHORITY
  readonly resourceId: string; // paidChatId
  readonly recordVersion: number;
  readonly authorityVersion: number;
  readonly rolePolicyVersion: number;
  readonly billingPolicyVersion: number;
  readonly activeSessionId: string;
  readonly fingerprintAlgorithmVersion: string;
  readonly idempotencyKey: string;
  readonly expiresAtMs: number; // bounded freshness (server rejects stale/expired)
}

/** The service reads the AUTHORITATIVE record with its OWN narrowly-scoped identity (Strategy A). */
export interface SourceOfTruthReader {
  readPaidChatRecord(resourceId: string): Promise<unknown | null>;
}
/**
 * Durable idempotency store implemented as a PRE-SIGN RESERVATION state machine (closes the post-KMS crash window). The
 * key is atomically RESERVED for a request fingerprint BEFORE KMS is invoked, and COMPLETED with the exact envelope
 * AFTER signing. Consequences: concurrent duplicate requests reserve once (the loser sees IN_PROGRESS and never re-signs);
 * a crash after KMS-sign but before COMPLETE leaves the key RESERVED, so a retry sees IN_PROGRESS and does NOT blind
 * re-sign — at most ONE KMS signature per idempotency key. Production (01B2) realizes this with a durable atomic
 * transaction (e.g. Firestore create-if-absent + conditional update); the in-memory fake is test-only.
 */
export type ReservationOutcome =
  | { readonly kind: 'RESERVED_NEW' }
  | { readonly kind: 'ALREADY_COMPLETED'; readonly envelope: FinancialAuthorityEnvelope }
  | { readonly kind: 'IN_PROGRESS' } // reserved but not yet completed (concurrent or crashed mid-sign)
  | { readonly kind: 'CONFLICT' }; // key reused with a different request fingerprint
export interface IdempotencyStore {
  /** Atomically reserve the key for `requestFingerprint` before signing (durable). */
  reserve(idempotencyKey: string, requestFingerprint: string): Promise<ReservationOutcome>;
  /** Durably persist the EXACT envelope, transitioning RESERVED -> COMPLETED (same fingerprint). */
  complete(idempotencyKey: string, requestFingerprint: string, envelope: FinancialAuthorityEnvelope): Promise<void>;
}
/** Durable security audit sink. If persistence fails, signing MUST fail closed (financial authority). */
export interface AuthorityAuditEvent {
  readonly outcome: 'ACCEPTED' | 'REJECTED';
  readonly failureCode?: string;
  readonly callerServiceAccount?: string;
  readonly authorityDomain?: string;
  readonly resourceId?: string;
  readonly recordVersion?: number;
  readonly authorityVersion?: number;
  readonly signingKeyVersion?: string;
  readonly idempotencyKeyHash?: string;
  readonly correlationId: string;
  readonly latencyMs: number;
}
export interface AuthorityAuditSink { record(event: AuthorityAuditEvent): Promise<void>; }

export interface AuthorityServiceDeps {
  readonly serviceAuth: ServiceInvocationVerifier;
  readonly callerPolicy: AuthorizedCallerPolicy;
  readonly signer: FinancialAuthoritySigner; // KMS-backed; keyVersion must equal the registry's single ACTIVE key
  readonly registry: ValidatedKeyRegistry;
  readonly sourceReader: SourceOfTruthReader;
  readonly idempotency: IdempotencyStore;
  readonly audit: AuthorityAuditSink;
  readonly nowMs: () => number;
  readonly maxRequestAgeMs: number; // upper bound on expiresAtMs skew into the future
}

export class AuthorityServiceError extends Error {
  readonly code: string;
  readonly reason: string;
  constructor(reason: string, code = 'failed-precondition') { super(`AUTHORITY_SERVICE_REJECTED: ${reason}`); this.name = 'AuthorityServiceError'; this.reason = reason; this.code = code; }
}
export class AuthorityAuditPersistenceError extends Error {
  readonly code = 'failed-precondition';
  constructor() { super('AUTHORITY_AUDIT_PERSISTENCE_FAILED: signing failed closed (durable audit required)'); this.name = 'AuthorityAuditPersistenceError'; }
}

// ── strict scalar validators (reject NaN/Infinity/fractional/oversized/empty) ────────────────────────────────────
const MAX_STR = 512;
function nonEmptyStr(v: unknown, max = MAX_STR): v is string { return typeof v === 'string' && v.length > 0 && v.length <= max; }
function posInt(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0; }
function nonNegInt(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0; }

/** Strictly validate + normalize the request DTO (rejects unknown fields, bad enums/versions/domain, NaN/Inf/fraction). */
export function validateSignRequest(raw: unknown): SignFinancialAuthorityRequest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new AuthorityServiceError('request_not_object');
  const r = raw as Record<string, unknown>;
  const ALLOWED = new Set(['authorityDomain', 'operation', 'resourceId', 'recordVersion', 'authorityVersion', 'rolePolicyVersion', 'billingPolicyVersion', 'activeSessionId', 'fingerprintAlgorithmVersion', 'idempotencyKey', 'expiresAtMs']);
  for (const k of Object.keys(r)) if (!ALLOWED.has(k)) throw new AuthorityServiceError(`unknown_field:${k}`);
  if (r.authorityDomain !== FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT) throw new AuthorityServiceError('authorityDomain_not_allowed');
  if (r.operation !== SIGN_PAID_CHAT_AUTHORITY) throw new AuthorityServiceError('operation_not_allowed');
  if (!nonEmptyStr(r.resourceId, 256)) throw new AuthorityServiceError('resourceId_invalid');
  if (!posInt(r.recordVersion)) throw new AuthorityServiceError('recordVersion_invalid');
  if (!posInt(r.authorityVersion)) throw new AuthorityServiceError('authorityVersion_invalid');
  if (!posInt(r.rolePolicyVersion)) throw new AuthorityServiceError('rolePolicyVersion_invalid');
  if (!posInt(r.billingPolicyVersion)) throw new AuthorityServiceError('billingPolicyVersion_invalid');
  if (!nonEmptyStr(r.activeSessionId, 256)) throw new AuthorityServiceError('activeSessionId_invalid');
  if (!SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS.includes(r.fingerprintAlgorithmVersion as (typeof SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS)[number])) throw new AuthorityServiceError('fingerprintAlgorithmVersion_unsupported');
  if (!nonEmptyStr(r.idempotencyKey, 256)) throw new AuthorityServiceError('idempotencyKey_invalid');
  if (!nonNegInt(r.expiresAtMs)) throw new AuthorityServiceError('expiresAtMs_invalid');
  return {
    authorityDomain: r.authorityDomain as string, operation: r.operation as string, resourceId: r.resourceId as string,
    recordVersion: r.recordVersion as number, authorityVersion: r.authorityVersion as number, rolePolicyVersion: r.rolePolicyVersion as number,
    billingPolicyVersion: r.billingPolicyVersion as number, activeSessionId: r.activeSessionId as string,
    fingerprintAlgorithmVersion: r.fingerprintAlgorithmVersion as string, idempotencyKey: r.idempotencyKey as string, expiresAtMs: r.expiresAtMs as number,
  };
}

/** Resolve the single ACTIVE_FOR_SIGNING key version for the registry's domain; fail closed on 0 or >1. */
export function resolveSingleActiveSigningKey(registry: ValidatedKeyRegistry): string {
  const active: string[] = [];
  for (const kv of registry.keyVersions) {
    const hit = registry.resolve(kv);
    if (hit && hit.status === 'ACTIVE_FOR_SIGNING') active.push(kv);
  }
  if (active.length === 0) throw new AuthorityServiceError('no_active_signing_key', 'failed-precondition'); // SAFE_UNAVAILABLE
  if (active.length > 1) throw new AuthorityServiceError('multiple_active_signing_keys_config_invalid', 'failed-precondition');
  return active[0];
}

function requestHashOf(req: SignFinancialAuthorityRequest): string {
  const canonical = [req.authorityDomain, req.operation, req.resourceId, req.recordVersion, req.authorityVersion, req.rolePolicyVersion, req.billingPolicyVersion, req.activeSessionId, req.fingerprintAlgorithmVersion, req.idempotencyKey].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
function hashKey(k: string): string { return crypto.createHash('sha256').update(k, 'utf8').digest('hex'); }

/**
 * Sign a paid-chat financial authority. The sole legitimate production producer of a `FinancialAuthorityEnvelope`.
 * Every failure is fail-closed and audited. `correlationId` must be a server-generated request id.
 */
async function signFinancialAuthorityCore(
  deps: AuthorityServiceDeps,
  rawRequest: unknown,
  ctx: ServiceInvocationContext,
  correlationId: string,
): Promise<FinancialAuthorityEnvelope> {
  const started = deps.nowMs();
  let identity: ServiceCallerIdentity | undefined;
  let req: SignFinancialAuthorityRequest | undefined;
  const audit = async (outcome: 'ACCEPTED' | 'REJECTED', failureCode?: string, signingKeyVersion?: string): Promise<void> => {
    // Durable audit is REQUIRED. If it throws we surface AuthorityAuditPersistenceError (fail closed).
    try {
      await deps.audit.record({
        outcome, failureCode, callerServiceAccount: identity?.serviceAccountEmail, authorityDomain: req?.authorityDomain,
        resourceId: req?.resourceId, recordVersion: req?.recordVersion, authorityVersion: req?.authorityVersion,
        signingKeyVersion, idempotencyKeyHash: req ? hashKey(req.idempotencyKey) : undefined, correlationId, latencyMs: deps.nowMs() - started,
      });
    } catch { throw new AuthorityAuditPersistenceError(); }
  };
  const reject = async (reason: string, code = 'failed-precondition'): Promise<never> => {
    await audit('REJECTED', reason);
    throw new AuthorityServiceError(reason, code);
  };

  try {
    // (1) authenticate the calling service identity — fail closed.
    try { identity = await deps.serviceAuth.verify(ctx); } catch (e) { return await reject('service_authentication_failed', 'unauthenticated'); }
    // (2) validate request schema (also fixes the domain/operation before authorization).
    try { req = validateSignRequest(rawRequest); } catch (e) { return await reject((e as AuthorityServiceError).reason ?? 'request_invalid'); }
    // (3) authorize (operation, domain) — default-deny.
    try { deps.callerPolicy.authorize(identity, req.operation, req.authorityDomain); } catch (e) { return await reject('caller_not_authorized', 'permission-denied'); }
    // (4) freshness: not expired, not absurdly far in the future.
    const now = deps.nowMs();
    if (req.expiresAtMs <= now) return await reject('request_expired');
    if (req.expiresAtMs > now + deps.maxRequestAgeMs) return await reject('request_expiry_too_far');
    // (5) exactly one ACTIVE signing key; injected signer must be that key.
    let activeKeyVersion: string;
    try { activeKeyVersion = resolveSingleActiveSigningKey(deps.registry); } catch (e) { return await reject((e as AuthorityServiceError).reason ?? 'active_key_error'); }
    if (deps.signer.keyVersion !== activeKeyVersion) return await reject('signer_not_active_key');
    // (6) source-of-truth: read + validate the AUTHORITATIVE record; caller fields must match it exactly.
    const rawRecord = await deps.sourceReader.readPaidChatRecord(req.resourceId).catch(() => null);
    if (rawRecord === null || rawRecord === undefined) return await reject('authoritative_record_not_found');
    let record: CanonicalPaidChatRecord;
    try { record = validateCanonicalPaidChatRecord(rawRecord); } catch (e) { return await reject('authoritative_record_invalid'); }
    if (record.paidChatId !== req.resourceId) return await reject('resourceId_mismatch_vs_record');
    if (record.version !== req.recordVersion) return await reject('recordVersion_mismatch_vs_record');
    if (record.authorityVersion !== req.authorityVersion) return await reject('authorityVersion_mismatch_vs_record');
    if (record.rolePolicyVersion !== req.rolePolicyVersion) return await reject('rolePolicyVersion_mismatch_vs_record');
    if (record.billingPolicyVersion !== req.billingPolicyVersion) return await reject('billingPolicyVersion_mismatch_vs_record');
    if (record.activeSessionId !== req.activeSessionId) return await reject('activeSessionId_mismatch_vs_record');
    // (7) PRE-SIGN durable reservation (atomic; closes the post-KMS crash window; prevents concurrent/crash duplicate).
    const rHash = requestHashOf(req);
    let reservation: ReservationOutcome;
    try { reservation = await deps.idempotency.reserve(req.idempotencyKey, rHash); }
    catch { return await reject('idempotency_store_unavailable'); }
    if (reservation.kind === 'CONFLICT') return await reject('idempotency_conflict_different_payload');
    if (reservation.kind === 'ALREADY_COMPLETED') { await audit('ACCEPTED', undefined, reservation.envelope.signingKeyVersion); return reservation.envelope; }
    if (reservation.kind === 'IN_PROGRESS') return await reject('signing_in_progress'); // do NOT re-sign (no blind retry after unknown KMS outcome)
    // reservation.kind === 'RESERVED_NEW' -> we (and only we) may sign this key exactly once.
    // (8) derive canonical bytes FROM THE RECORD (not from the caller) and KMS-sign.
    const canonicalPayloadBytes = buildPaidChatAuthorityCanonicalPayloadBytes(record);
    let envelope: FinancialAuthorityEnvelope;
    try {
      envelope = await deps.signer.sign({
        domain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, resourceId: record.paidChatId, recordVersion: record.version,
        authorityVersion: record.authorityVersion, policyVersion: record.billingPolicyVersion,
        fingerprintAlgorithmVersion: req.fingerprintAlgorithmVersion, canonicalPayloadBytes,
      });
    } catch (e) { return await reject('kms_signing_failed'); }
    // (9) durably COMPLETE the reservation with the EXACT envelope BEFORE responding; then audit. If completion fails
    //     the key stays RESERVED -> a retry sees IN_PROGRESS and does not re-sign (recoverable, not silent success).
    try { await deps.idempotency.complete(req.idempotencyKey, rHash, envelope); } catch { return await reject('idempotency_complete_failed'); }
    await audit('ACCEPTED', undefined, envelope.signingKeyVersion);
    return envelope;
  } catch (e) {
    if (e instanceof AuthorityAuditPersistenceError || e instanceof AuthorityServiceError) throw e;
    // Unexpected error -> fail closed + best-effort audit.
    try { await audit('REJECTED', 'unexpected_error'); } catch { /* already failing closed */ }
    throw new AuthorityServiceError('unexpected_error');
  }
}

/** Thrown when the production Authority Service is not fully provisioned (SAFE_UNAVAILABLE, fail-closed). */
export class AuthorityServiceUnavailableError extends Error {
  readonly code = 'failed-precondition';
  constructor() {
    super('AUTHORITY_SERVICE_UNAVAILABLE: production dependencies are not provisioned (SAFE_UNAVAILABLE)');
    this.name = 'AuthorityServiceUnavailableError';
  }
}

/**
 * PRODUCTION ENTRYPOINT — the ONLY production-reachable way to request a paid-chat authority signature. Its signature
 * accepts ONLY business request data + the authenticated invocation context; it does NOT accept caller-supplied
 * dependencies. All trust-critical dependencies (OIDC verifier, caller authorization policy, KMS signer, key registry,
 * source-of-truth reader, durable idempotency, durable audit) are resolved INTERNALLY from the non-caller-selectable
 * production composition root (`getProductionAuthorityServiceDeps`). An importer/caller cannot substitute a signer,
 * verifier, policy, registry, reader, idempotency, or audit implementation. Until every P0-IAM-01B2 binding exists the
 * composition root is `null` and this entrypoint fails closed (SAFE_UNAVAILABLE); a partial dependency set never
 * activates the service. There is no mutable dependency override anywhere in this module.
 */
export async function signPaidChatAuthority(
  rawRequest: unknown,
  ctx: ServiceInvocationContext,
  correlationId: string,
): Promise<FinancialAuthorityEnvelope> {
  const deps = getProductionAuthorityServiceDeps(); // non-caller-selectable production composition root
  if (deps === null) throw new AuthorityServiceUnavailableError(); // SAFE_UNAVAILABLE — zero/partial bindings never activate
  return signFinancialAuthorityCore(deps, rawRequest, ctx, correlationId);
}

/**
 * @internal TEST-SEAM ONLY — dependency-injected core, exported solely so the isolated test harness can exercise the
 * REAL signing orchestration with fakes. It is NOT production-reachable: production code imports `signPaidChatAuthority`
 * (above), never this symbol. The P0-IAM-01B1 validator enforces, via the export/import graph, that ZERO non-test
 * production module imports this seam; introducing such an import fails the validator. There is intentionally no mutable
 * dependency setter (`setDeps/setSigner/setVerifier/...`) and no environment/NODE_ENV-selected dependency path.
 */
export async function signFinancialAuthorityWithDeps(
  deps: AuthorityServiceDeps,
  rawRequest: unknown,
  ctx: ServiceInvocationContext,
  correlationId: string,
): Promise<FinancialAuthorityEnvelope> {
  return signFinancialAuthorityCore(deps, rawRequest, ctx, correlationId);
}

/**
 * Production Authority Service resolver. Returns `null` (SAFE_UNAVAILABLE) in P0-IAM-01B1 — the KMS signer, service-auth
 * config, registry, source reader, idempotency store, and audit sink are not wired. P0-IAM-01B2 constructs the real
 * `AuthorityServiceDeps` under the dedicated service identity. There is NO public/HTTP export here; the Cloud Run
 * request handler is a thin deploy-time adapter that calls the production entrypoint `signPaidChatAuthority(request, ctx, correlationId)`.
 */
export function getProductionAuthorityServiceDeps(): AuthorityServiceDeps | null {
  return null;
}
