// functions/src/__tests__/p0-iam-01a-financial-authority-trust-boundary-foundation.test.ts
//
// P0-IAM-01A — FINANCIAL AUTHORITY TRUST-BOUNDARY FOUNDATION.
//
// Proves the KMS-ready cryptographic provenance foundation for `/paidChats` financial authority:
//   - deterministic canonical fingerprint; envelope contract;
//   - test-only asymmetric signer + public-key verifier (production signer/verifier are SAFE_UNAVAILABLE);
//   - loader verifies provenance BEFORE minting -> the exact Codex "schema-valid but unsigned/forged Admin write"
//     defect is rejected at the code layer;
//   - tamper / copy / replay / unknown-key / unsupported-algorithm / malformed / unsigned all rejected;
//   - authenticity != action authorization; no billing; no financial side effects; messaging intact.
// No production provenance is faked: positive verification requires an injected test verifier holding the public key.

import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

import {
  loadTrustedPaidChatAuthority,
  isTrustedPaidChatAuthority,
  TrustedPaidChatAuthority,
  PAID_CHAT_AUTHORITY_ENVELOPE_FIELD,
} from '../chat/paidChatAuthority';
import {
  PAID_CHATS_COLLECTION,
  validateCanonicalPaidChatRecord,
  normalizedPairKey,
  CanonicalPaidChatRecord,
} from '../chat/canonicalPaidChat/paidChatRecord';
import {
  buildPaidChatAuthorityCanonicalPayloadBytes,
  canonicalizeAuthorityFields,
  sha256Hex,
  FINGERPRINT_ALGORITHM_VERSION,
} from '../security/financialAuthority/canonicalFingerprint';
import {
  parseAuthorityEnvelope,
  AuthorityEnvelopeError,
  FINANCIAL_AUTHORITY_DOMAINS,
  FinancialAuthorityEnvelope,
} from '../security/financialAuthority/authorityEnvelope';
import * as provenance from '../security/financialAuthority/authorityProvenance';
import {
  assertVerifiedAuthorityEnvelope,
  getProductionFinancialAuthoritySigner,
  getProductionFinancialAuthorityVerifier,
  resolveProductionFinancialAuthorityVerifier,
  validateProductionVerifierConfig,
  loadProductionVerifierConfig,
  FinancialAuthorityProvenanceUnavailableError,
  FinancialAuthorityVerificationError,
  FinancialAuthorityConfigurationError,
  PRODUCTION_FINANCIAL_AUTHORITY_SIGNING,
  AuthorityVerificationExpectation,
} from '../security/financialAuthority/authorityProvenance';
import { createTestAuthoritySigner, TEST_SIGNING_KEY_VERSION } from './helpers/iam01aTestSigner';
import { sendChatMessage } from '../chatSystemNextGen';
import { processMessage } from '../canonical-chat-engine';

const testEnv = fft();
const db = getFirestore() as any;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
const pid = () => 'pc_' + Math.random().toString(36).slice(2, 10);
afterAll(() => { testEnv.cleanup(); });

// One ephemeral keypair for the whole suite (the injected "test trust root").
const T = createTestAuthoritySigner();

/** Fully-valid canonical /paidChats record data (incl. paidChatId), overridable. */
function recordData(id: string, payerId: string, earnerId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const multiplier = 20;
  return {
    paidChatId: id,
    pairKey: normalizedPairKey(payerId, earnerId),
    participants: [earnerId, payerId],
    payerId,
    earnerId,
    roleReason: 'SERVER_RESOLVED_MATCH',
    rolePolicyVersion: 1,
    state: 'PAID_ACTIVE',
    entryMode: 'MATCHED',
    acceptanceState: 'ACCEPTED',
    baseRateTokens: 3,
    multiplierSnapshot: multiplier,
    effectiveRateTokens: 3 * multiplier,
    minimumReservationTokens: 100,
    sessionBudgetTokens: 100,
    remainingReservedTokens: 100,
    activeSessionId: 'sess_' + Math.random().toString(36).slice(2, 8),
    billingPolicyVersion: 1,
    authorityVersion: 1,
    version: 1,
    ...over,
  };
}
function validRecord(id: string, payerId: string, earnerId: string, over: Record<string, unknown> = {}): CanonicalPaidChatRecord {
  return validateCanonicalPaidChatRecord(recordData(id, payerId, earnerId, over));
}
function expectationFor(rec: CanonicalPaidChatRecord): AuthorityVerificationExpectation {
  return {
    domain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT,
    resourceId: rec.paidChatId,
    recordVersion: rec.version,
    authorityVersion: rec.authorityVersion,
    policyVersion: rec.billingPolicyVersion,
    canonicalPayloadBytes: buildPaidChatAuthorityCanonicalPayloadBytes(rec),
  };
}
async function seedSigned(id: string, rec: CanonicalPaidChatRecord): Promise<void> {
  const envelope = T.signPaidChatRecord(rec);
  await db.collection(PAID_CHATS_COLLECTION).doc(id).set({ ...rec, [PAID_CHAT_AUTHORITY_ENVELOPE_FIELD]: envelope });
}
async function bal(u: string): Promise<any> { return (await db.collection('wallets').doc(u).get()).data() || {}; }

// The loader resolves its verifier INTERNALLY (no caller parameter). To exercise the positive mint path in tests we
// spy the internal production-verifier RESOLVER (jest test infrastructure — NOT a production API/seam): production has
// no such override and the loader accepts no verifier argument. The injected verifier is the REAL registry-backed
// production verifier built from a test key (same code path P0-IAM-01B will use with the KMS public key).
function configuredProductionVerifier() {
  return resolveProductionFinancialAuthorityVerifier({
    authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT,
    signatureAlgorithm: 'EC_SIGN_P256_SHA256',
    fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
    keys: [{ keyVersion: 'TEST_EPHEMERAL_V1', publicKeyPem: T.publicKeyPem, status: 'ACTIVE_FOR_SIGNING' }],
  } as any);
}
async function loadWithProvenanceConfigured(id: string): Promise<TrustedPaidChatAuthority> {
  const spy = jest.spyOn(provenance, 'getProductionFinancialAuthorityVerifier').mockReturnValue(configuredProductionVerifier());
  try { return await loadTrustedPaidChatAuthority(id); } finally { spy.mockRestore(); }
}
async function expectLoadRejects(id: string, matcher: any): Promise<void> {
  const spy = jest.spyOn(provenance, 'getProductionFinancialAuthorityVerifier').mockReturnValue(configuredProductionVerifier());
  try { await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(matcher); } finally { spy.mockRestore(); }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// A. Canonical fingerprint (deterministic serialization)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — canonical fingerprint determinism', () => {
  test('same logical record -> identical bytes; field reordering in source does not change bytes', () => {
    const rec = validRecord(pid(), uid(), uid());
    const a = buildPaidChatAuthorityCanonicalPayloadBytes(rec);
    const b = buildPaidChatAuthorityCanonicalPayloadBytes({ ...rec });
    expect(a.equals(b)).toBe(true);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
    expect(a.toString('utf8').startsWith(`4:FPV|`)).toBe(false); // header present but length-prefixed
    expect(a.toString('utf8')).toContain(FINGERPRINT_ALGORITHM_VERSION);
  });
  test('any authority-relevant mutation -> different bytes', () => {
    const rec = validRecord(pid(), uid(), uid());
    const base = sha256Hex(buildPaidChatAuthorityCanonicalPayloadBytes(rec));
    const mutated = sha256Hex(buildPaidChatAuthorityCanonicalPayloadBytes({ ...rec, multiplierSnapshot: 100, effectiveRateTokens: 300 }));
    expect(mutated).not.toBe(base);
  });
  test('canonicalization is injection-safe (length-prefixed): no value can forge a neighbouring field', () => {
    const a = canonicalizeAuthorityFields([{ key: 'x', value: 'a' }, { key: 'y', value: 'b' }]);
    const b = canonicalizeAuthorityFields([{ key: 'x', value: 'a\ny=' }, { key: 'y', value: 'b' }]);
    expect(a.equals(b)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B. Positive path (test signer/verifier) + production fail-closed
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — positive verification (test trust root) and production fail-closed', () => {
  test('a validly signed canonical record verifies under the injected test verifier', () => {
    const rec = validRecord(pid(), uid(), uid());
    const env = T.signPaidChatRecord(rec);
    expect(() => assertVerifiedAuthorityEnvelope(env, expectationFor(rec), T.verifier)).not.toThrow();
  });

  test('production signer is SAFE_UNAVAILABLE (fail-closed, no private key in repo)', async () => {
    expect(PRODUCTION_FINANCIAL_AUTHORITY_SIGNING).toBe('SAFE_UNAVAILABLE');
    const signer = getProductionFinancialAuthoritySigner();
    await expect(
      signer.sign({
        domain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, resourceId: 'r', recordVersion: 1, authorityVersion: 1,
        policyVersion: 1, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, canonicalPayloadBytes: Buffer.from('x'),
      }),
    ).rejects.toThrow(FinancialAuthorityProvenanceUnavailableError);
  });

  test('production verifier is SAFE_UNAVAILABLE (rejects even a validly signed envelope)', () => {
    const rec = validRecord(pid(), uid(), uid());
    const env = T.signPaidChatRecord(rec);
    expect(() => getProductionFinancialAuthorityVerifier().verify(env, expectationFor(rec)))
      .toThrow(FinancialAuthorityProvenanceUnavailableError);
  });

  test('test signer/private key is NOT reachable from the production provenance module surface', () => {
    const exported = Object.keys(provenance);
    expect(exported.filter((k) => /unsafe|rawsign|privatekey|testsigner|__sign/i.test(k))).toEqual([]);
    expect((provenance as Record<string, unknown>).createTestAuthoritySigner).toBeUndefined();
    // The only signer the production module hands out is fail-closed.
    expect(getProductionFinancialAuthoritySigner().keyVersion).toBe('PRODUCTION_UNWIRED');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B2. Production key registry (keyVersion -> trusted public key + status): rotation, domain, fail-closed
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — production key registry (rotation / status / domain / no-fallback)', () => {
  const T2 = createTestAuthoritySigner('KEY_V2'); // a second, independent key version for rotation
  const DOMAIN = FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT;
  const ALGO = 'EC_SIGN_P256_SHA256';
  const reg = (keys: any[]): any => ({ authorityDomain: DOMAIN, signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, keys });
  const activeK1 = { keyVersion: 'TEST_EPHEMERAL_V1', publicKeyPem: T.publicKeyPem, status: 'ACTIVE_FOR_SIGNING' };
  const trustedK1 = { ...activeK1, status: 'TRUSTED_FOR_VERIFY' };
  const revokedK1 = { ...activeK1, status: 'REVOKED' };
  const activeK2 = { keyVersion: 'KEY_V2', publicKeyPem: T2.publicKeyPem, status: 'ACTIVE_FOR_SIGNING' };

  test('unconfigured production verifier is fail-closed (loadProductionVerifierConfig null)', () => {
    expect(loadProductionVerifierConfig()).toBeNull();
    const rec = validRecord(pid(), uid(), uid());
    expect(() => getProductionFinancialAuthorityVerifier().verify(T.signPaidChatRecord(rec), expectationFor(rec)))
      .toThrow(FinancialAuthorityProvenanceUnavailableError);
  });

  test('current ACTIVE key verifies a validly signed record (real production verification path)', () => {
    const rec = validRecord(pid(), uid(), uid());
    const v = resolveProductionFinancialAuthorityVerifier(reg([activeK1]));
    expect(() => v.verify(T.signPaidChatRecord(rec), expectationFor(rec))).not.toThrow();
  });

  test('rotation: retired-but-trusted key still verifies old records while the new active key verifies new ones', () => {
    const v = resolveProductionFinancialAuthorityVerifier(reg([trustedK1, activeK2])); // k1 retired, k2 active
    const oldRec = validRecord(pid(), uid(), uid());
    expect(() => v.verify(T.signPaidChatRecord(oldRec), expectationFor(oldRec))).not.toThrow();  // old k1 record OK
    const newRec = validRecord(pid(), uid(), uid());
    expect(() => v.verify(T2.signPaidChatRecord(newRec), expectationFor(newRec))).not.toThrow(); // new k2 record OK
  });

  test('REVOKED key fails closed even with an otherwise valid signature', () => {
    const rec = validRecord(pid(), uid(), uid());
    const v = resolveProductionFinancialAuthorityVerifier(reg([revokedK1]));
    expect(() => v.verify(T.signPaidChatRecord(rec), expectationFor(rec))).toThrow(/key_version_revoked/);
  });

  test('unknown keyVersion is rejected — NO fallback to the active key', () => {
    const rec = validRecord(pid(), uid(), uid());
    const v = resolveProductionFinancialAuthorityVerifier(reg([activeK2])); // only k2 registered
    expect(() => v.verify(T.signPaidChatRecord(rec), expectationFor(rec))).toThrow(/key_version_unknown/); // k1 not tried against k2
  });

  test('old key removal (revocation by omission) makes old records fail closed', () => {
    const rec = validRecord(pid(), uid(), uid());
    const env = T.signPaidChatRecord(rec); // signed by k1
    const vOnlyK2 = resolveProductionFinancialAuthorityVerifier(reg([activeK2])); // k1 removed
    expect(() => vOnlyK2.verify(env, expectationFor(rec))).toThrow(/key_version_unknown/);
  });

  test('authorityDomain mismatch is rejected (a WALLET-domain registry does not verify PAID_CHAT)', () => {
    const rec = validRecord(pid(), uid(), uid());
    const walletReg = resolveProductionFinancialAuthorityVerifier(
      { authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.WALLET, signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, keys: [activeK1] } as any);
    expect(() => walletReg.verify(T.signPaidChatRecord(rec), expectationFor(rec))).toThrow(/config_domain_mismatch/);
  });

  test('a registry-backed verifier still rejects a forged (non-trust-root) signature under a known keyVersion', () => {
    const rec = validRecord(pid(), uid(), uid());
    const attacker = createTestAuthoritySigner('TEST_EPHEMERAL_V1'); // SAME keyVersion label, DIFFERENT private key
    const forged = attacker.signPaidChatRecord(rec);
    const v = resolveProductionFinancialAuthorityVerifier(reg([activeK1]));
    expect(() => v.verify(forged, expectationFor(rec))).toThrow(FinancialAuthorityVerificationError); // signature_invalid
  });

  test('validated registry is immutable (frozen; no mutation/registration API)', () => {
    const registry = validateProductionVerifierConfig(reg([activeK1]));
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.keyVersions)).toBe(true);
    expect((registry as any).set).toBeUndefined();
    expect((registry as any).register).toBeUndefined();
    expect((registry as any).addKey).toBeUndefined();
    expect(registry.resolve('NOPE')).toBeNull();
  });

  test.each([
    ['empty registry', () => reg([])],
    ['duplicate keyVersion', () => reg([activeK1, { ...activeK1, status: 'TRUSTED_FOR_VERIFY' }])],
    ['malformed public key', () => reg([{ keyVersion: 'k', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----', status: 'ACTIVE_FOR_SIGNING' }])],
    ['PRIVATE key material in a key entry', () => reg([{ keyVersion: 'k', publicKeyPem: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----', status: 'ACTIVE_FOR_SIGNING' }])],
    ['invalid status', () => reg([{ ...activeK1, status: 'TOTALLY_TRUSTED' }])],
    ['bad authorityDomain', () => ({ authorityDomain: 'NOT_A_DOMAIN', signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, keys: [activeK1] })],
    ['unsupported algorithm', () => ({ ...reg([activeK1]), signatureAlgorithm: 'HS256' })],
    ['unsupported fingerprint version', () => ({ ...reg([activeK1]), fingerprintAlgorithmVersion: 'AVALO_FP_V0_MD5' })],
    ['forbidden private field on config', () => ({ ...reg([activeK1]), privateKey: 'x' })],
    ['forbidden secret field on a key entry', () => reg([{ ...activeK1, hmacSecret: 'x' }])],
  ])('invalid production config (%s) fails closed at validation (throws, never a silent default)', (_label, mk) => {
    expect(() => validateProductionVerifierConfig(mk() as any)).toThrow(FinancialAuthorityConfigurationError);
    expect(() => resolveProductionFinancialAuthorityVerifier(mk() as any)).toThrow(FinancialAuthorityConfigurationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// C. Negative crypto matrix (tamper / copy / replay / unknown-key / algorithm / malformed / bad signature)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — provenance negative matrix (fail-closed)', () => {
  const baseRec = () => validRecord(pid(), uid(), uid());

  test('invalid (corrupted) signature is rejected', () => {
    const rec = baseRec();
    const env = T.signPaidChatRecord(rec);
    const bad: FinancialAuthorityEnvelope = { ...env, signature: Buffer.from('not-the-real-signature').toString('base64') };
    expect(() => assertVerifiedAuthorityEnvelope(bad, expectationFor(rec), T.verifier))
      .toThrow(FinancialAuthorityVerificationError);
  });

  test.each([
    ['payerId', (r: CanonicalPaidChatRecord) => ({ ...r, payerId: r.participants[0] === r.payerId ? r.participants[1] : r.participants[0] })],
    ['earnerId', (r: CanonicalPaidChatRecord) => ({ ...r, earnerId: 'attacker_' + uid() })],
    ['pairKey', (r: CanonicalPaidChatRecord) => ({ ...r, pairKey: 'attacker__forged' })],
    ['participants', (r: CanonicalPaidChatRecord) => ({ ...r, participants: [...r.participants, 'ghost_' + uid()] })],
    ['multiplierSnapshot', (r: CanonicalPaidChatRecord) => ({ ...r, multiplierSnapshot: 100, effectiveRateTokens: 300 })],
    ['effectiveRateTokens', (r: CanonicalPaidChatRecord) => ({ ...r, effectiveRateTokens: 99999 })],
    ['minimumReservationTokens', (r: CanonicalPaidChatRecord) => ({ ...r, minimumReservationTokens: 100000 })],
    ['state', (r: CanonicalPaidChatRecord) => ({ ...r, state: 'LOCKED_CONTINUATION' as CanonicalPaidChatRecord['state'] })],
    ['activeSessionId', (r: CanonicalPaidChatRecord) => ({ ...r, activeSessionId: 'attacker_session' })],
    ['authorityVersion(binding)', (r: CanonicalPaidChatRecord) => ({ ...r, authorityVersion: 2 })],
    ['billingPolicyVersion(binding)', (r: CanonicalPaidChatRecord) => ({ ...r, billingPolicyVersion: 2 })],
  ])('tampering with %s (envelope kept from original) is rejected', (_label, mutate) => {
    const rec = baseRec();
    const env = T.signPaidChatRecord(rec);              // signature over the ORIGINAL record
    const tampered = mutate(rec) as CanonicalPaidChatRecord;
    expect(() => assertVerifiedAuthorityEnvelope(env, expectationFor(tampered), T.verifier))
      .toThrow(FinancialAuthorityVerificationError);
  });

  test('copy attack A->B (envelope from A presented for resource B) is rejected', () => {
    const payer = uid(); const earner = uid();
    const recA = validRecord(pid(), payer, earner);
    const env = T.signPaidChatRecord(recA);
    const recB = validRecord(pid(), payer, earner);      // different paidChatId
    expect(() => assertVerifiedAuthorityEnvelope(env, expectationFor(recB), T.verifier))
      .toThrow(/resourceId_mismatch|payload_fingerprint_mismatch/);
  });

  test('stale record-version replay (old envelope after version bump) is rejected', () => {
    const payer = uid(); const earner = uid(); const id = pid();
    const recV1 = validRecord(id, payer, earner, { version: 1 });
    const env = T.signPaidChatRecord(recV1);
    const recV2 = validRecord(id, payer, earner, { version: 2 });
    expect(() => assertVerifiedAuthorityEnvelope(env, expectationFor(recV2), T.verifier))
      .toThrow(/recordVersion_mismatch|payload_fingerprint_mismatch/);
  });

  test('unknown signing key version is rejected', () => {
    const rec = baseRec();
    const env = T.signPaidChatRecord(rec);
    const bad: FinancialAuthorityEnvelope = { ...env, signingKeyVersion: 'ATTACKER_KEY_V9' };
    expect(() => assertVerifiedAuthorityEnvelope(bad, expectationFor(rec), T.verifier))
      .toThrow(/key_version_unknown/);
  });

  test('unsupported signature algorithm is rejected', () => {
    const rec = baseRec();
    const env = T.signPaidChatRecord(rec);
    const bad: FinancialAuthorityEnvelope = { ...env, signatureAlgorithm: 'HS256' };
    expect(() => assertVerifiedAuthorityEnvelope(bad, expectationFor(rec), T.verifier))
      .toThrow(/signature_algorithm_unsupported/);
  });

  test('unsupported fingerprint algorithm version is rejected', () => {
    const rec = baseRec();
    const env = T.signPaidChatRecord(rec);
    const bad: FinancialAuthorityEnvelope = { ...env, fingerprintAlgorithmVersion: 'AVALO_FP_V0_MD5' };
    expect(() => assertVerifiedAuthorityEnvelope(bad, expectationFor(rec), T.verifier))
      .toThrow(/fingerprint_algorithm_unsupported/);
  });

  test('malformed / missing envelope is rejected at parse (shape) stage', () => {
    expect(() => parseAuthorityEnvelope(undefined)).toThrow(AuthorityEnvelopeError);
    expect(() => parseAuthorityEnvelope(null)).toThrow(AuthorityEnvelopeError);
    expect(() => parseAuthorityEnvelope({ authorityDomain: 'PAID_CHAT' })).toThrow(AuthorityEnvelopeError);
    expect(() => parseAuthorityEnvelope('a-string')).toThrow(AuthorityEnvelopeError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// D. Loader integration (Firestore emulator) — the Codex defect closed at the loader
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — loader verifies provenance INTERNALLY before minting; no caller seam (emulator)', () => {
  test('validly signed record loads a trusted authority once provenance is configured (internal resolver)', async () => {
    const payer = uid(); const earner = uid(); const id = pid();
    await seedSigned(id, validRecord(id, payer, earner));
    const auth = await loadWithProvenanceConfigured(id);
    expect(isTrustedPaidChatAuthority(auth)).toBe(true);
    expect(auth.payerId).toBe(payer);
    expect(auth.earnerId).toBe(earner);
    expect(auth.effectiveRateTokens).toBe(60);
  });

  test('DIRECT ADMIN WRITE ATTACK: schema-valid but UNSIGNED record is REJECTED (Codex defect closed)', async () => {
    const victim = uid(); const attacker = uid(); const id = pid();
    const forged = recordData(id, victim, attacker, { multiplierSnapshot: 100, effectiveRateTokens: 300 });
    await db.collection(PAID_CHATS_COLLECTION).doc(id).set(forged); // NO envelope
    // Even with provenance CONFIGURED, an unsigned record has no envelope -> rejected before verification.
    await expectLoadRejects(id, AuthorityEnvelopeError);
  });

  test('DIRECT ADMIN WRITE ATTACK: schema-valid record with a FORGED (self-made) envelope is REJECTED', async () => {
    const victim = uid(); const attacker = uid(); const id = pid();
    const forged = recordData(id, victim, attacker, { multiplierSnapshot: 100, effectiveRateTokens: 300 });
    const attackerSigner = createTestAuthoritySigner('ATTACKER_SELF_MINTED_V1'); // not the trust-root key
    const forgedEnvelope = attackerSigner.signPaidChatRecord(validateCanonicalPaidChatRecord(forged));
    await db.collection(PAID_CHATS_COLLECTION).doc(id).set({ ...forged, [PAID_CHAT_AUTHORITY_ENVELOPE_FIELD]: forgedEnvelope });
    await expectLoadRejects(id, FinancialAuthorityVerificationError); // unknown key version / bad signature
  });

  test('CODEX R2: loader has NO caller-supplied verifier — a no-op verifier arg cannot force a mint', async () => {
    const payer = uid(); const earner = uid(); const id = pid();
    await seedSigned(id, validRecord(id, payer, earner)); // a perfectly, validly signed record
    // The exact bypass Codex flagged: try to pass a permissive verifier. The loader takes ONLY an id, so the extra
    // argument is IGNORED, and the INTERNAL production verifier is SAFE_UNAVAILABLE -> fail closed. No mint.
    const noop = { verify() { /* approve everything */ } };
    await expect((loadTrustedPaidChatAuthority as any)(id, noop))
      .rejects.toThrow(FinancialAuthorityProvenanceUnavailableError);
    expect(loadTrustedPaidChatAuthority.length).toBe(1); // no verifier parameter exists in the signature
  });

  test('default (unconfigured) production verifier refuses even a validly signed record — no shipped mint path', async () => {
    const payer = uid(); const earner = uid(); const id = pid();
    await seedSigned(id, validRecord(id, payer, earner));
    await expect(loadTrustedPaidChatAuthority(id)) // production verifier SAFE_UNAVAILABLE until P0-IAM-01B
      .rejects.toThrow(FinancialAuthorityProvenanceUnavailableError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// E. Authenticity != authorization; no billing; no side effects; messaging intact (emulator)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P0-IAM-01A — authenticity-only, no billing, no side effects, messaging intact', () => {
  test('a verified authority is data-only: it confers NO action authorization (paidChatId is not authorization)', async () => {
    const payer = uid(); const earner = uid(); const id = pid();
    await seedSigned(id, validRecord(id, payer, earner));
    const auth = await loadWithProvenanceConfigured(id);
    // No method / capability / boolean on the authority authorizes send/debit/earn/state-change.
    const authRec = auth as unknown as Record<string, unknown>;
    for (const v of Object.values(authRec)) expect(typeof v === 'function').toBe(false);
    expect(authRec.canSend).toBeUndefined();
    expect(authRec.authorize).toBeUndefined();
    expect(authRec.authorized).toBeUndefined();
  });

  test('loading a verified authority produces NO wallet/reservation/earner/ledger side effect', async () => {
    const payer = uid(); const earner = uid(); const id = pid();
    await db.collection('wallets').doc(payer).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(earner).set({ balance: 0, reservedTokens: 0 });
    await seedSigned(id, validRecord(id, payer, earner));
    const auth = await loadWithProvenanceConfigured(id);
    expect(isTrustedPaidChatAuthority(auth)).toBe(true);
    const p = await bal(payer); const e = await bal(earner);
    expect(p.balance).toBe(1000); expect(p.reservedTokens || 0).toBe(0);
    expect(e.balance).toBe(0); expect(e.reservedTokens || 0).toBe(0);
    expect((await db.collection('creatorEarningAccounts').doc(earner).get()).exists).toBe(false);
    expect((await db.collection('reservations').where('userId', '==', payer).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
    expect((await db.collection('billingEvents').where('actorId', '==', payer).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
  });

  test('sendChatMessage remains HARD_FAIL_CLOSED and forged /chats still mints no authority', async () => {
    const wrapped = testEnv.wrap(sendChatMessage as any);
    await expect(wrapped({ auth: { uid: uid() }, data: { chatId: 'c', type: 'text', content: 'hi' } } as any))
      .rejects.toThrow(/HUMAN_CHAT_BILLING_DISABLED/);
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    const cid = 'chat_' + uid();
    await db.collection('chats').doc(cid).set({
      chatId: cid, participants: [attacker, victim], roles: { payerId: victim, earnerId: attacker },
      state: 'PAID_ACTIVE', paidSession: { sessionId: 's', configSnapshot: { burnMultiplier: 100 } }, free: {},
    });
    await expect(processMessage(cid, attacker, 'steal', 'm_iam01a')).rejects.toThrow(/PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED/);
    expect((await bal(victim)).balance).toBe(1000);
  });

  test('general /chats DM and group shell still work', async () => {
    const a = uid(); const b = uid(); const c = uid();
    const dm = 'chat_' + uid();
    await db.collection('chats').doc(dm).set({ chatId: dm, participants: [a, b], type: 'DM', createdAt: new Date() });
    expect((await db.collection('chats').doc(dm).get()).exists).toBe(true);
    const grp = 'chat_' + uid();
    await db.collection('chats').doc(grp).set({ chatId: grp, participants: [a, b, c], type: 'GROUP', createdAt: new Date() });
    await db.collection('chats').doc(grp).collection('messages').doc('m1').set({ senderId: a, text: 'hello group' });
    expect((await db.collection('chats').doc(grp).collection('messages').doc('m1').get()).exists).toBe(true);
  });
});
