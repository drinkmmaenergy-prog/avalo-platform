// functions/src/__tests__/helpers/iam01bTestHarness.ts
//
// TEST-ONLY harness for the P0-IAM-01B Authority Service. Builds real AuthorityServiceDeps with test fakes:
//   - fake KmsSignerClient backed by an EPHEMERAL EC P-256 keypair (signs the digest directly, exactly like Cloud KMS
//     asymmetricSign) — no private key leaves the test process, nothing committed;
//   - the REAL createServiceInvocationVerifier + createAuthorizedCallerPolicy driven by a fake OidcTokenVerifier, so the
//     real auth/authz logic is exercised;
//   - in-memory idempotency store, fake source-of-truth reader, capturing audit sink (optionally failing).
// Nothing here is importable by production (validator asserts 0 production imports).

import * as crypto from 'crypto';
import { KmsSignerClient, KmsFinancialAuthoritySigner, KmsSignerConfig } from '../../security/financialAuthority/kmsSigner';
import { validateProductionVerifierConfig, ValidatedKeyRegistry } from '../../security/financialAuthority/authorityProvenance';
import { FINANCIAL_AUTHORITY_DOMAINS, FinancialAuthorityEnvelope } from '../../security/financialAuthority/authorityEnvelope';
import { FINGERPRINT_ALGORITHM_VERSION } from '../../security/financialAuthority/canonicalFingerprint';
import {
  createServiceInvocationVerifier, createAuthorizedCallerPolicy, ServiceAuthConfig, OidcTokenVerifier, VerifiedOidcClaims,
} from '../../security/financialAuthority/serviceAuth';
import {
  AuthorityServiceDeps, IdempotencyStore, ReservationOutcome, AuthorityAuditSink, AuthorityAuditEvent, SourceOfTruthReader, SIGN_PAID_CHAT_AUTHORITY,
} from '../../security/financialAuthority/authorityService';

export const KEY_RESOURCE = 'projects/test/locations/global/keyRings/kr/cryptoKeys/authority/cryptoKeyVersions/1';
export const KEY_VERSION = 'KMS_V1';
export const ALGO = 'EC_SIGN_P256_SHA256';
export const AUDIENCE = 'https://authority-service.test/sign';
export const WRITER_SA = 'paidchat-authority-writer@test.iam.gserviceaccount.com';
export const VALID_TOKEN = 'oidc:writer:valid';

/** An EC P-256 keypair standing in for a KMS key version. */
export function makeKmsKeypair() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
}

/** Fake KMS client: signs the provided SHA-256 digest directly with ECDSA (DER), exactly like KMS asymmetricSign. */
export function makeFakeKmsClient(privateKeyPem: string, keyResource = KEY_RESOURCE): KmsSignerClient {
  return {
    async asymmetricSign({ keyVersionName, message }) {
      // ECDSA over SHA-256(message), DER-encoded — identical to Cloud KMS asymmetricSign(SHA-256 digest).
      const signatureDer = crypto.sign('sha256', message, { key: privateKeyPem, dsaEncoding: 'der' });
      return { signatureDer, signedKeyVersionName: keyVersionName };
    },
  };
}

/** Fake OIDC verifier: maps fixture tokens to claims; the REAL createServiceInvocationVerifier enforces policy. */
export function makeFakeOidc(overrides: Record<string, Partial<VerifiedOidcClaims> | 'THROW'> = {}): OidcTokenVerifier {
  return {
    async verify(idToken: string, expectedAudience: string): Promise<VerifiedOidcClaims> {
      const o = overrides[idToken];
      if (o === 'THROW') throw new Error('token_invalid'); // e.g. bad signature/expired
      const base: VerifiedOidcClaims = { aud: expectedAudience, iss: 'https://accounts.google.com', email: WRITER_SA, email_verified: true, sub: 'sub-writer', exp: 4102444800 };
      if (o) return { ...base, ...o };
      if (idToken === VALID_TOKEN) return base;
      throw new Error('unknown_token');
    },
  };
}

export function serviceAuthConfig(): ServiceAuthConfig {
  return {
    expectedAudience: AUDIENCE,
    allowedIssuers: ['https://accounts.google.com'],
    authorizedCallers: [{ serviceAccountEmail: WRITER_SA, operations: [SIGN_PAID_CHAT_AUTHORITY], authorityDomains: [FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT] }],
  };
}

interface ResEntry { fingerprint: string; status: 'RESERVED' | 'COMPLETED'; envelope?: FinancialAuthorityEnvelope; }
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private m = new Map<string, ResEntry>();
  failReserve = false; failComplete = false;
  async reserve(k: string, fp: string): Promise<ReservationOutcome> {
    if (this.failReserve) throw new Error('store_down');
    const e = this.m.get(k);
    if (!e) { this.m.set(k, { fingerprint: fp, status: 'RESERVED' }); return { kind: 'RESERVED_NEW' }; }
    if (e.fingerprint !== fp) return { kind: 'CONFLICT' };
    if (e.status === 'COMPLETED' && e.envelope) return { kind: 'ALREADY_COMPLETED', envelope: e.envelope };
    return { kind: 'IN_PROGRESS' };
  }
  async complete(k: string, fp: string, envelope: FinancialAuthorityEnvelope): Promise<void> {
    if (this.failComplete) throw new Error('store_down');
    this.m.set(k, { fingerprint: fp, status: 'COMPLETED', envelope });
  }
  /** test-only: simulate a crashed-mid-sign / concurrent in-flight reservation (RESERVED but not COMPLETED). */
  forceReserved(k: string, fp: string) { this.m.set(k, { fingerprint: fp, status: 'RESERVED' }); }
}
export class CapturingAuditSink implements AuthorityAuditSink {
  events: AuthorityAuditEvent[] = []; fail = false;
  async record(e: AuthorityAuditEvent): Promise<void> { if (this.fail) throw new Error('audit_down'); this.events.push(e); }
}

/** A registry with a single ACTIVE key (the fake KMS public key). Extra entries can be added for rotation tests. */
export function makeRegistry(publicKeyPem: string, extra: { keyVersion: string; publicKeyPem: string; status: string }[] = []): ValidatedKeyRegistry {
  return validateProductionVerifierConfig({
    authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, signatureAlgorithm: ALGO, fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
    keys: [{ keyVersion: KEY_VERSION, publicKeyPem, status: 'ACTIVE_FOR_SIGNING' }, ...extra],
  } as any);
}

export interface HarnessOptions {
  record?: unknown | null; // what the source reader returns for the resourceId
  oidcOverrides?: Record<string, Partial<VerifiedOidcClaims> | 'THROW'>;
  registry?: ValidatedKeyRegistry;
  signerKeyVersion?: string; // to simulate signer != active key
  now?: number;
}

export interface Harness {
  deps: AuthorityServiceDeps;
  idempotency: InMemoryIdempotencyStore;
  audit: CapturingAuditSink;
  publicKeyPem: string;
}

/** Build a full, real AuthorityServiceDeps wired with test fakes. */
export function makeHarness(opts: HarnessOptions = {}): Harness {
  const { publicKey, privateKey } = makeKmsKeypair();
  const client = makeFakeKmsClient(privateKey);
  const now = opts.now ?? 1_000_000_000_000;
  const signer = new KmsFinancialAuthoritySigner(client, {
    keyVersionResourceName: KEY_RESOURCE, signingKeyVersion: opts.signerKeyVersion ?? KEY_VERSION, signatureAlgorithm: ALGO,
    fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION, authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT,
  } as KmsSignerConfig, () => now);
  const cfg = serviceAuthConfig();
  const serviceAuth = createServiceInvocationVerifier(cfg, makeFakeOidc(opts.oidcOverrides));
  const callerPolicy = createAuthorizedCallerPolicy(cfg);
  const registry = opts.registry ?? makeRegistry(publicKey);
  const idempotency = new InMemoryIdempotencyStore();
  const audit = new CapturingAuditSink();
  const sourceReader: SourceOfTruthReader = { async readPaidChatRecord() { return opts.record === undefined ? null : opts.record; } };
  const deps: AuthorityServiceDeps = { serviceAuth, callerPolicy, signer, registry, sourceReader, idempotency, audit, nowMs: () => now, maxRequestAgeMs: 5 * 60 * 1000 };
  return { deps, idempotency, audit, publicKeyPem: publicKey };
}
