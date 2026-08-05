// functions/src/__tests__/p0-iam-01b-production-authority-trust-root.test.ts
//
// P0-IAM-01B — Authority Service adversarial matrix. Proves: only an authenticated+authorized service caller, over a
// strict request, against the authoritative record, with exactly one ACTIVE KMS key, can obtain a valid envelope; every
// other path fails closed; and a generic shared-Admin write cannot manufacture authority. Pure unit tests (no emulator).

import * as crypto from 'crypto';
import { normalizedPairKey } from '../chat/canonicalPaidChat/paidChatRecord';
import { FINANCIAL_AUTHORITY_DOMAINS } from '../security/financialAuthority/authorityEnvelope';
import { FINGERPRINT_ALGORITHM_VERSION, buildPaidChatAuthorityCanonicalPayloadBytes } from '../security/financialAuthority/canonicalFingerprint';
import {
  signFinancialAuthorityWithDeps as signFinancialAuthority, validateSignRequest, resolveSingleActiveSigningKey, AuthorityServiceError, AuthorityAuditPersistenceError,
  getProductionAuthorityServiceDeps, SIGN_PAID_CHAT_AUTHORITY, AUTHORITY_SERVICE_STATE,
  signPaidChatAuthority, AuthorityServiceUnavailableError,
} from '../security/financialAuthority/authorityService';
import * as authorityServiceModule from '../security/financialAuthority/authorityService';
import * as kmsSigner from '../security/financialAuthority/kmsSigner';
import * as serviceAuth from '../security/financialAuthority/serviceAuth';
import { validateCanonicalPaidChatRecord } from '../chat/canonicalPaidChat/paidChatRecord';
import {
  makeHarness, makeRegistry, KEY_VERSION, VALID_TOKEN, AUDIENCE, WRITER_SA, ALGO,
} from './helpers/iam01bTestHarness';

const NOW = 1_000_000_000_000;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
const pid = () => 'pc_' + Math.random().toString(36).slice(2, 10);

function record(id: string, payer: string, earner: string, over: Record<string, unknown> = {}) {
  const m = 20;
  return {
    paidChatId: id, pairKey: normalizedPairKey(payer, earner), participants: [earner, payer], payerId: payer, earnerId: earner,
    roleReason: 'SERVER_RESOLVED_MATCH', rolePolicyVersion: 1, state: 'PAID_ACTIVE', entryMode: 'MATCHED', acceptanceState: 'ACCEPTED',
    baseRateTokens: 3, multiplierSnapshot: m, effectiveRateTokens: 3 * m, minimumReservationTokens: 100, sessionBudgetTokens: 100,
    remainingReservedTokens: 100, activeSessionId: 'sess1', billingPolicyVersion: 1, authorityVersion: 1, version: 1, ...over,
  };
}
function request(id: string, over: Record<string, unknown> = {}) {
  return {
    authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, operation: SIGN_PAID_CHAT_AUTHORITY, resourceId: id, recordVersion: 1,
    authorityVersion: 1, rolePolicyVersion: 1, billingPolicyVersion: 1, activeSessionId: 'sess1',
    fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, idempotencyKey: 'idem-' + id, expiresAtMs: NOW + 60_000, ...over,
  };
}
const ctx = (idToken?: string) => ({ idToken });

// ── A. Happy path + end-to-end verification ──────────────────────────────────────────────────────────────────────
describe('P0-IAM-01B — authorized signing produces a KMS envelope that verifies via the P0-IAM-01A registry', () => {
  test('ACTIVE key signs; envelope verifies with the public-key registry (full chain)', async () => {
    const id = pid(); const payer = uid(); const earner = uid();
    const rec = record(id, payer, earner);
    const h = makeHarness({ record: rec });
    const env = await signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'corr-1');
    expect(env.signingKeyVersion).toBe(KEY_VERSION);
    expect(env.authorityDomain).toBe(FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT);
    // The registry verifier (P0-IAM-01A public-key path) accepts the KMS-signed envelope.
    const validated = validateCanonicalPaidChatRecord(rec);
    const hit = h.deps.registry.resolve(KEY_VERSION)!;
    expect(() => hit.verifier.verify(env, {
      domain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, resourceId: id, recordVersion: 1, authorityVersion: 1, policyVersion: 1,
      canonicalPayloadBytes: buildPaidChatAuthorityCanonicalPayloadBytes(validated),
    })).not.toThrow();
    expect(h.audit.events.some((e) => e.outcome === 'ACCEPTED')).toBe(true);
  });
});

// ── B. Authentication / authorization (anti-confused-deputy) ─────────────────────────────────────────────────────
describe('P0-IAM-01B — service authentication + authorization (default-deny)', () => {
  const setup = (over: any = {}, oidc: any = {}) => makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: oidc });
  test('missing id token rejected (no header-only identity)', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e') });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(undefined), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('unknown / forged token rejected', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e') });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx('forged'), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('wrong audience rejected', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: { [VALID_TOKEN]: { aud: 'https://evil.test' } } });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('bad issuer rejected', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: { [VALID_TOKEN]: { iss: 'https://evil.test' } } });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('expired / cryptographically invalid token rejected', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: { [VALID_TOKEN]: 'THROW' } });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('end-user token without service-account email rejected', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: { [VALID_TOKEN]: { email: undefined } } });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('authenticated but NON-allowlisted service account rejected (default-deny)', async () => {
    const h = makeHarness({ record: record('pc_x', 'p', 'e'), oidcOverrides: { [VALID_TOKEN]: { email: 'other-sa@test.iam.gserviceaccount.com' } } });
    await expect(signFinancialAuthority(h.deps, request('pc_x'), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
});

// ── C. Request schema (no raw bytes / digest / key / algorithm; strict scalars) ──────────────────────────────────
describe('P0-IAM-01B — strict request contract (no signing-input injection)', () => {
  const h = () => makeHarness({ record: record('pc_x', 'p', 'e') });
  test.each([
    ['unknown field canonicalBytes', { canonicalBytes: 'AAAA' }],
    ['unknown field digest', { digest: 'AAAA' }],
    ['unknown field kmsKey', { kmsKey: 'projects/evil/...' }],
    ['unknown field algorithm', { algorithm: 'HS256' }],
    ['unknown field callerServiceAccount', { callerServiceAccount: WRITER_SA }],
    ['arbitrary authorityDomain', { authorityDomain: 'WALLET' }],
    ['wrong operation', { operation: 'signAnything' }],
    ['unsupported fingerprint version', { fingerprintAlgorithmVersion: 'AVALO_FP_V0_MD5' }],
    ['fractional recordVersion', { recordVersion: 1.5 }],
    ['NaN authorityVersion', { authorityVersion: NaN }],
    ['Infinity billingPolicyVersion', { billingPolicyVersion: Infinity }],
    ['empty resourceId', { resourceId: '' }],
    ['oversized activeSessionId', { activeSessionId: 'x'.repeat(1000) }],
  ])('request rejected: %s', async (_l, over) => {
    await expect(signFinancialAuthority(h().deps, request('pc_x', over), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
    expect(() => validateSignRequest(request('pc_x', over))).toThrow(AuthorityServiceError);
  });
});

// ── D. Source-of-truth substitution / freshness ──────────────────────────────────────────────────────────────────
describe('P0-IAM-01B — authoritative-record verification + freshness', () => {
  test('record not found rejected', async () => {
    const h = makeHarness({ record: null });
    await expect(signFinancialAuthority(h.deps, request(pid()), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test.each([
    ['recordVersion mismatch vs record', { recordVersion: 2 }],
    ['authorityVersion mismatch vs record', { authorityVersion: 2 }],
    ['activeSessionId mismatch vs record', { activeSessionId: 'attacker_session' }],
    ['billingPolicyVersion mismatch vs record', { billingPolicyVersion: 2 }],
  ])('caller field %s rejected (must equal authoritative record)', async (_l, over) => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    await expect(signFinancialAuthority(h.deps, request(id, over), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityServiceError);
  });
  test('expired request rejected', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    await expect(signFinancialAuthority(h.deps, request(id, { expiresAtMs: NOW - 1 }), ctx(VALID_TOKEN), 'c')).rejects.toThrow(/request_expired/);
  });
  test('request expiry too far in future rejected', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    await expect(signFinancialAuthority(h.deps, request(id, { expiresAtMs: NOW + 60 * 60 * 1000 }), ctx(VALID_TOKEN), 'c')).rejects.toThrow(/expiry_too_far/);
  });
});

// ── E. Idempotency reservation (pre-sign; closes the post-KMS crash window) ──────────────────────────────────────
describe('P0-IAM-01B — idempotency reservation / replay (no duplicate KMS)', () => {
  const countingSigner = (h: any) => { const real = h.deps.signer; const st = { n: 0 }; h.deps.signer = { keyVersion: KEY_VERSION, signatureAlgorithm: ALGO, sign: async (i: any) => { st.n++; return real.sign(i); } }; return st; };
  test('same key + same request replays the SAME envelope; KMS invoked EXACTLY once', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    const st = countingSigner(h);
    const e1 = await signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c1');
    const e2 = await signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c2');
    expect(e2.signature).toBe(e1.signature);
    expect(st.n).toBe(1);
  });
  test('store CONFLICT: same key + different request fingerprint rejected', async () => {
    const h = makeHarness({ record: record('x', 'p', 'e') });
    expect(await h.idempotency.reserve('k', 'fpA')).toEqual({ kind: 'RESERVED_NEW' });
    expect(await h.idempotency.reserve('k', 'fpB')).toEqual({ kind: 'CONFLICT' });
    expect(await h.idempotency.reserve('k', 'fpA')).toEqual({ kind: 'IN_PROGRESS' });
  });
  test('reserve store unavailable -> fail closed', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    h.idempotency.failReserve = true;
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c')).rejects.toThrow(/idempotency_store_unavailable/);
  });
  test('POST-KMS CRASH: complete fails -> fail closed; retry sees IN_PROGRESS and does NOT re-sign (exactly one KMS sign)', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    const st = countingSigner(h);
    h.idempotency.failComplete = true;
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c1')).rejects.toThrow(/idempotency_complete_failed/);
    expect(st.n).toBe(1); // KMS signed once, but not durably completed
    h.idempotency.failComplete = false;
    // retry with the same key: the reservation is still RESERVED -> IN_PROGRESS -> rejected, NO blind re-sign
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c2')).rejects.toThrow(/signing_in_progress/);
    expect(st.n).toBe(1); // still exactly one KMS invocation
  });
});

// ── F. Key lifecycle ─────────────────────────────────────────────────────────────────────────────────────────────
describe('P0-IAM-01B — key lifecycle (single active; revoked/verify-only/unknown fail closed)', () => {
  test('zero ACTIVE key -> SAFE_UNAVAILABLE (no_active_signing_key)', () => {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const reg = makeRegistry(kp.publicKey);
    // rebuild a registry whose only key is TRUSTED_FOR_VERIFY
    const only = require('../security/financialAuthority/authorityProvenance').validateProductionVerifierConfig({
      authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
      keys: [{ keyVersion: 'OLD', publicKeyPem: kp.publicKey, status: 'TRUSTED_FOR_VERIFY' }],
    });
    expect(() => resolveSingleActiveSigningKey(only)).toThrow(/no_active_signing_key/);
  });
  test('multiple ACTIVE keys -> CONFIG INVALID (fail closed)', () => {
    const a = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const b = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const reg = require('../security/financialAuthority/authorityProvenance').validateProductionVerifierConfig({
      authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
      keys: [{ keyVersion: 'K1', publicKeyPem: a.publicKey, status: 'ACTIVE_FOR_SIGNING' }, { keyVersion: 'K2', publicKeyPem: b.publicKey, status: 'ACTIVE_FOR_SIGNING' }],
    });
    expect(() => resolveSingleActiveSigningKey(reg)).toThrow(/multiple_active_signing_keys/);
  });
  test('signer key != registry active key -> rejected', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()), signerKeyVersion: 'DIFFERENT' });
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c')).rejects.toThrow(/signer_not_active_key/);
  });
});

// ── G. KMS + durable-audit failure modes (fail closed) ───────────────────────────────────────────────────────────
describe('P0-IAM-01B — failure modes fail closed', () => {
  test('KMS error (permission denied / unavailable) -> fail closed', async () => {
    const id = pid();
    const h = makeHarness({ record: record(id, uid(), uid()) });
    (h.deps as any).signer = { keyVersion: KEY_VERSION, signatureAlgorithm: ALGO, async sign() { throw new Error('KMS permission denied'); } };
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c')).rejects.toThrow(/kms_signing_failed/);
  });
  test('durable audit persistence failure -> signing fails closed', async () => {
    const id = pid(); const h = makeHarness({ record: record(id, uid(), uid()) });
    h.audit.fail = true;
    await expect(signFinancialAuthority(h.deps, request(id), ctx(VALID_TOKEN), 'c')).rejects.toThrow(AuthorityAuditPersistenceError);
  });
});

// ── H. Load-bearing invariant + production SAFE_UNAVAILABLE + export surface ─────────────────────────────────────
describe('P0-IAM-01B — shared-Admin write != signing authority; production gated; no unsafe exports', () => {
  test('a generic Admin-written schema-valid record CANNOT mint authority without the service (no signature obtainable)', async () => {
    // Generic co-tenant "attacker" writes a perfectly schema-valid record and has NO valid service token.
    const id = pid(); const rec = record(id, uid(), uid());
    const h = makeHarness({ record: rec });
    // Best it can do without an authorized OIDC service token: rejected at authentication.
    await expect(signFinancialAuthority(h.deps, request(id), ctx('attacker-forged-token'), 'c')).rejects.toThrow(AuthorityServiceError);
    // And there is no other production path to a signature (see SAFE_UNAVAILABLE assertions below).
  });
  test('production KMS signer + authority service + service-auth are all SAFE_UNAVAILABLE (unwired)', () => {
    expect(kmsSigner.KMS_SIGNING_STATE).toBe('SAFE_UNAVAILABLE');
    expect(AUTHORITY_SERVICE_STATE).toBe('SAFE_UNAVAILABLE');
    expect(serviceAuth.SERVICE_AUTH_STATE).toBe('SAFE_UNAVAILABLE');
    expect(kmsSigner.loadProductionKmsSignerClient()).toBeNull();
    expect(kmsSigner.getProductionKmsSigner()).toBeNull();
    expect(getProductionAuthorityServiceDeps()).toBeNull();
    expect(serviceAuth.loadServiceAuthConfig()).toBeNull();
  });
  test('no raw-bytes / arbitrary-digest signing function is exported; no caller-selectable signer/verifier', () => {
    const kExports = Object.keys(kmsSigner);
    expect(kExports.filter((k) => /signRaw|signBytes|signDigest|__unsafe|arbitrarySign/i.test(k))).toEqual([]);
    const sExports = Object.keys(require('../security/financialAuthority/authorityService'));
    expect(sExports.filter((k) => /signRaw|signBytes|signDigest|setSigner|setVerifier/i.test(k))).toEqual([]);
  });
});

// ── I. Trust boundary: the production-reachable API exposes NO dependency injection ──────────────────────────────
describe('P0-IAM-01B — production trust boundary: no caller-selectable dependencies', () => {
  const bid = 'pc_boundary';
  const rec = record(bid, 'p', 'e');
  const req = () => request(bid);
  const fakeDeps = () => makeHarness({ record: rec }).deps; // a fully-wired fake (fake KMS/OIDC/in-memory/capturing)

  test('production entrypoint signPaidChatAuthority does NOT accept a deps parameter (arity = request, ctx, correlationId)', () => {
    expect(signPaidChatAuthority.length).toBe(3);
    expect(getProductionAuthorityServiceDeps()).toBeNull();
  });

  test('production entrypoint fails closed (SAFE_UNAVAILABLE), signing nothing, when the composition root is empty', async () => {
    await expect(signPaidChatAuthority(req(), ctx(VALID_TOKEN), 'c')).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
  });

  test('JavaScript extra-argument injection of a full fake deps has NO effect (ignored -> SAFE_UNAVAILABLE)', async () => {
    await expect((signPaidChatAuthority as any)(req(), ctx(VALID_TOKEN), 'c', fakeDeps())).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
    await expect((signPaidChatAuthority as any)(fakeDeps(), req(), ctx(VALID_TOKEN), 'c')).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
  });

  test.each([
    ['signer', (d: any) => { d.signer = { keyVersion: 'X', signatureAlgorithm: 'A', sign: async () => ({}) }; }],
    ['callerPolicy', (d: any) => { d.callerPolicy = { authorize: () => { /* permissive */ } }; }],
    ['serviceAuth', (d: any) => { d.serviceAuth = { verify: async () => ({ serviceAccountEmail: 'x', subject: 'y' }) }; }],
    ['registry', (d: any) => { d.registry = {}; }],
    ['sourceReader', (d: any) => { d.sourceReader = { readPaidChatRecord: async () => rec }; }],
    ['idempotency', (d: any) => { d.idempotency = { reserve: async () => ({ kind: 'RESERVED_NEW' }), complete: async () => { /* noop */ } }; }],
    ['audit', (d: any) => { d.audit = { record: async () => { /* swallow */ } }; }],
  ])('importer cannot substitute a fake %s through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)', async (_l, mutate) => {
    const d = fakeDeps(); mutate(d);
    await expect((signPaidChatAuthority as any)(req(), ctx(VALID_TOKEN), 'c', d)).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
  });

  test('production module exposes NO caller-selectable business signing API and NO mutable override seam', () => {
    const exp = Object.keys(authorityServiceModule);
    expect(exp.filter((k) => /^set[A-Z]|configureForTest|useDeps|injectDeps|__unsafe|replaceDeps/.test(k))).toEqual([]);
    expect(exp).toContain('signPaidChatAuthority');            // production entrypoint (no deps)
    expect(exp).toContain('signFinancialAuthorityWithDeps');   // explicitly-named test seam
    expect(exp).not.toContain('signFinancialAuthority');       // the old production-shaped DI export is gone
    expect(exp).not.toContain('signFinancialAuthorityCore');   // core is module-private
  });

  test('partial / zero production bindings never activate (composition root is all-or-nothing null)', () => {
    expect(getProductionAuthorityServiceDeps()).toBeNull();
    expect(AUTHORITY_SERVICE_STATE).toBe('SAFE_UNAVAILABLE');
  });

  test('the dependency-injected core is reachable ONLY through the test seam; production entrypoint stays unavailable', async () => {
    const h = makeHarness({ record: rec });
    const env = await signFinancialAuthority(h.deps, req(), ctx(VALID_TOKEN), 'seam'); // seam exercises the REAL orchestration
    expect(env.signingKeyVersion).toBe(KEY_VERSION);
    await expect(signPaidChatAuthority(req(), ctx(VALID_TOKEN), 'prod')).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
  });

  test('generic shared-Admin request via the production entrypoint cannot sign (no bindings -> SAFE_UNAVAILABLE)', async () => {
    await expect(signPaidChatAuthority(req(), ctx('attacker-forged-token'), 'c')).rejects.toBeInstanceOf(AuthorityServiceUnavailableError);
  });
});
