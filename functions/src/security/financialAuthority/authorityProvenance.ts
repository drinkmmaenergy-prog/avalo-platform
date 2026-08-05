// functions/src/security/financialAuthority/authorityProvenance.ts
//
// P0-IAM-01A — FINANCIAL-AUTHORITY PROVENANCE: signer/verifier interfaces, production fail-closed adapters, a
// public-key verifier, and the pure verification core used by the loader.
//
// TRUST MODEL (the whole point of P0-IAM-01A):
//   A valid financial authority requires  VALID BUSINESS DATA  +  VALID CRYPTOGRAPHIC PROVENANCE.
//   Provenance is a signature over the canonical payload, verifiable ONLY with a PUBLIC key whose matching PRIVATE key
//   lives behind an external trust root — in production a GCP Cloud KMS asymmetric key held solely by a dedicated
//   authority-service identity (wired in P0-IAM-01B). Generic Admin-capable backend code can WRITE a Firestore doc but
//   CANNOT produce a valid signature, so a schema-valid-but-unsigned/forged record fails verification (closes the Codex
//   "schema-validity != writer-provenance" defect at the code layer).
//
// SAFETY INVARIANTS enforced here:
//   - production signer is SAFE_UNAVAILABLE (no private key in repo; no HMAC; no fallback) until P0-IAM-01B;
//   - production verifier is SAFE_UNAVAILABLE until a real KMS public key + key-version registry is wired;
//   - verification uses ONLY a public key (no secret) — so a verifier is production-safe to construct once wired;
//   - there is NO exported raw signer and NO exported test signer here (the test signer lives under __tests__ and is
//     injected only through a test seam; production has no code path that accepts a caller-supplied signer).

import * as crypto from 'crypto';
import {
  FinancialAuthorityEnvelope,
  FinancialAuthorityDomain,
  FINANCIAL_AUTHORITY_DOMAINS,
  SUPPORTED_SIGNATURE_ALGORITHMS,
  SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS,
} from './authorityEnvelope';
import { sha256Hex } from './canonicalFingerprint';

/** Production signing state marker. Flips to a wired KMS mode only in P0-IAM-01B. */
export const PRODUCTION_FINANCIAL_AUTHORITY_SIGNING = 'SAFE_UNAVAILABLE' as const;

// ── Errors ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Thrown when production signing/verification is requested but no external trust root is wired (fail-closed). */
export class FinancialAuthorityProvenanceUnavailableError extends Error {
  readonly code = 'failed-precondition';
  constructor(what: string) {
    super(`FINANCIAL_AUTHORITY_PROVENANCE_UNAVAILABLE: ${what} (PRODUCTION_FINANCIAL_AUTHORITY_SIGNING=SAFE_UNAVAILABLE)`);
    this.name = 'FinancialAuthorityProvenanceUnavailableError';
  }
}
/** Thrown when an envelope fails cryptographic/ binding verification (fail-closed). */
export class FinancialAuthorityVerificationError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`FINANCIAL_AUTHORITY_VERIFICATION_FAILED: ${reason}`);
    this.name = 'FinancialAuthorityVerificationError';
    this.reason = reason;
  }
}
/** Thrown when a production provenance configuration is present but structurally invalid (fail-closed; never default). */
export class FinancialAuthorityConfigurationError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`FINANCIAL_AUTHORITY_CONFIG_INVALID: ${reason}`);
    this.name = 'FinancialAuthorityConfigurationError';
    this.reason = reason;
  }
}

// ── Interfaces (Phase 6 / Phase 7) ───────────────────────────────────────────────────────────────────────────────
/** Input a signer needs to produce an envelope over already-canonicalized bytes. */
export interface AuthoritySigningInput {
  readonly domain: FinancialAuthorityDomain;
  readonly resourceId: string;
  readonly recordVersion: number;
  readonly authorityVersion: number;
  readonly policyVersion: number;
  readonly fingerprintAlgorithmVersion: string;
  readonly canonicalPayloadBytes: Buffer;
}

/** Narrow signer interface. Production target: KMS asymmetric sign (never an in-repo private key). */
export interface FinancialAuthoritySigner {
  readonly keyVersion: string;
  readonly signatureAlgorithm: string;
  sign(input: AuthoritySigningInput): Promise<FinancialAuthorityEnvelope>;
}

/** Expected binding a verifier checks the envelope against (all must match the loaded record). */
export interface AuthorityVerificationExpectation {
  readonly domain: FinancialAuthorityDomain;
  readonly resourceId: string;
  readonly recordVersion: number;
  readonly authorityVersion: number;
  readonly policyVersion: number;
  readonly canonicalPayloadBytes: Buffer;
}

/** Narrow verifier interface. Production target: public-key verification (needs NO secret). */
export interface FinancialAuthorityVerifier {
  /** Throws `FinancialAuthorityVerificationError` on ANY failure; returns void on success. */
  verify(envelope: FinancialAuthorityEnvelope, expected: AuthorityVerificationExpectation): void;
}

// ── Production fail-closed adapters (Phase 8) ────────────────────────────────────────────────────────────────────
const PRODUCTION_UNAVAILABLE_SIGNER: FinancialAuthoritySigner = {
  keyVersion: 'PRODUCTION_UNWIRED',
  signatureAlgorithm: 'EC_SIGN_P256_SHA256',
  async sign(): Promise<FinancialAuthorityEnvelope> {
    throw new FinancialAuthorityProvenanceUnavailableError('production_signer');
  },
};
const PRODUCTION_UNAVAILABLE_VERIFIER: FinancialAuthorityVerifier = {
  verify(): void {
    // No KMS public key / key-version registry is wired yet -> cannot verify -> fail closed. Never falls back to a
    // test key, an HMAC, or "accept unsigned". Positive verification is possible only under an injected test verifier.
    throw new FinancialAuthorityProvenanceUnavailableError('production_verifier');
  },
};

/** The production signer. Currently fail-closed (SAFE_UNAVAILABLE). Exposed for the future authority service. */
export function getProductionFinancialAuthoritySigner(): FinancialAuthoritySigner {
  return PRODUCTION_UNAVAILABLE_SIGNER;
}
/**
 * The production verifier. Resolves through the REAL production configuration contract: when no verifier config is
 * wired yet (P0-IAM-01B), it is fail-closed (SAFE_UNAVAILABLE); once a valid config (KMS public key + key-version
 * registry) is supplied, it is the real `createPublicKeyVerifier`. It NEVER silently defaults to an insecure verifier.
 */
export function getProductionFinancialAuthorityVerifier(): FinancialAuthorityVerifier {
  return resolveProductionFinancialAuthorityVerifier(loadProductionVerifierConfig());
}

// ── Public-key verifier (production-safe building block; also used by the test seam) ─────────────────────────────
export interface PublicKeyVerifierConfig {
  /** SPKI/PEM public key. In production this is the KMS key's public key; locally it is the ephemeral test public key. */
  readonly publicKeyPem: string;
  readonly allowedKeyVersions: readonly string[];
  readonly allowedSignatureAlgorithms?: readonly string[];
  readonly allowedFingerprintAlgorithmVersions?: readonly string[];
}

/**
 * Build a verifier from a PUBLIC key. Requires NO secret, so it is safe to construct in any module once real KMS
 * public-key material is available. It enforces, in order: domain, resourceId, record/authority/policy version binding,
 * key-version allowlist, algorithm allowlists, payload-fingerprint match, and finally the ECDSA signature.
 */
export function createPublicKeyVerifier(config: PublicKeyVerifierConfig): FinancialAuthorityVerifier {
  const allowedAlgos = config.allowedSignatureAlgorithms ?? SUPPORTED_SIGNATURE_ALGORITHMS;
  const allowedFpv = config.allowedFingerprintAlgorithmVersions ?? SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS;
  const keyObject = crypto.createPublicKey(config.publicKeyPem); // throws early if the PEM is not a valid public key
  return {
    verify(envelope: FinancialAuthorityEnvelope, expected: AuthorityVerificationExpectation): void {
      // 1. binding checks (cheap, before crypto)
      if (envelope.authorityDomain !== expected.domain) throw new FinancialAuthorityVerificationError('domain_mismatch');
      if (envelope.resourceId !== expected.resourceId) throw new FinancialAuthorityVerificationError('resourceId_mismatch');
      if (envelope.recordVersion !== expected.recordVersion) throw new FinancialAuthorityVerificationError('recordVersion_mismatch');
      if (envelope.authorityVersion !== expected.authorityVersion) throw new FinancialAuthorityVerificationError('authorityVersion_mismatch');
      if (envelope.policyVersion !== expected.policyVersion) throw new FinancialAuthorityVerificationError('policyVersion_mismatch');
      // 2. algorithm / key-version allowlists
      if (!allowedFpv.includes(envelope.fingerprintAlgorithmVersion as (typeof allowedFpv)[number])) {
        throw new FinancialAuthorityVerificationError('fingerprint_algorithm_unsupported');
      }
      if (!allowedAlgos.includes(envelope.signatureAlgorithm as (typeof allowedAlgos)[number])) {
        throw new FinancialAuthorityVerificationError('signature_algorithm_unsupported');
      }
      if (!config.allowedKeyVersions.includes(envelope.signingKeyVersion)) {
        throw new FinancialAuthorityVerificationError('key_version_unknown');
      }
      // 3. fingerprint (integrity) — re-derived from the loaded record, must equal the envelope's claim
      const recomputed = sha256Hex(expected.canonicalPayloadBytes);
      if (recomputed !== envelope.payloadFingerprint) {
        throw new FinancialAuthorityVerificationError('payload_fingerprint_mismatch');
      }
      // 4. signature (provenance) — verify over the canonical bytes with the public key
      let sigBuf: Buffer;
      try {
        sigBuf = Buffer.from(envelope.signature, 'base64');
      } catch {
        throw new FinancialAuthorityVerificationError('signature_not_base64');
      }
      if (sigBuf.length === 0) throw new FinancialAuthorityVerificationError('signature_empty');
      let ok = false;
      try {
        ok = crypto.createVerify('SHA256').update(expected.canonicalPayloadBytes).end().verify(keyObject, sigBuf);
      } catch {
        throw new FinancialAuthorityVerificationError('signature_verify_error');
      }
      if (!ok) throw new FinancialAuthorityVerificationError('signature_invalid');
    },
  };
}

// ── Production key registry (keyVersion -> trusted public key + status): strict, fail-closed, immutable ───────────
// P0-IAM-01B supplies the VALUES (KMS public keys + versions/status), not a redesign. Verification always flows:
//   envelope.signingKeyVersion -> deterministic exact registry lookup -> that key's `createPublicKeyVerifier` ->
//   signature check. There is NO fallback to an active key, NO "try all keys", and NO env/secret/default.

/** Lifecycle status of a trusted key version (supports safe rotation). */
export const TRUSTED_KEY_STATUSES = ['ACTIVE_FOR_SIGNING', 'TRUSTED_FOR_VERIFY', 'REVOKED'] as const;
export type TrustedKeyStatus = (typeof TRUSTED_KEY_STATUSES)[number];

/** One trusted verification key. `publicKeyPem` MUST be a PUBLIC key — private material is rejected at validation. */
export interface TrustedVerificationKeyEntry {
  readonly keyVersion: string;
  readonly publicKeyPem: string;
  readonly status: TrustedKeyStatus;
}

/**
 * Production verifier configuration: a keyVersion registry bound to exactly ONE authority domain + signature algorithm
 * + fingerprint version. No insecure default; no env/secret reading in this module. The public keys are NOT secrets.
 */
export interface ProductionVerifierConfig {
  readonly authorityDomain: FinancialAuthorityDomain;
  readonly signatureAlgorithm: string;
  readonly fingerprintAlgorithmVersion: string;
  readonly keys: readonly TrustedVerificationKeyEntry[];
  /** Optional KMS key resource id — audit metadata only; never trusted for verification. */
  readonly kmsKeyResourceId?: string;
}

// Field names that must NEVER appear in verifier config or a key entry (no private/secret/symmetric material may enter).
const FORBIDDEN_CONFIG_FIELDS = [
  'privateKey', 'privateKeyPem', 'privateKeyPkcs8', 'secret', 'hmacSecret', 'signingSecret', 'seed', 'testPrivateKey', 'symmetricKey',
];
function assertNoPrivateMaterial(obj: Record<string, unknown>, where: string): void {
  for (const f of FORBIDDEN_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, f)) {
      throw new FinancialAuthorityConfigurationError(`private_material_field:${where}.${f}`);
    }
  }
}
function assertPublicKeyOnly(pem: string, keyVersion: string): void {
  if (typeof pem !== 'string') throw new FinancialAuthorityConfigurationError(`publicKeyPem_invalid:${keyVersion}`);
  if (/PRIVATE KEY/.test(pem)) throw new FinancialAuthorityConfigurationError(`private_key_material:${keyVersion}`);
  if (!/-----BEGIN PUBLIC KEY-----/.test(pem)) throw new FinancialAuthorityConfigurationError(`publicKeyPem_invalid:${keyVersion}`);
  let ko: crypto.KeyObject;
  try { ko = crypto.createPublicKey(pem); } catch { throw new FinancialAuthorityConfigurationError(`publicKeyPem_unparseable:${keyVersion}`); }
  if (ko.type !== 'public') throw new FinancialAuthorityConfigurationError(`not_public_key:${keyVersion}`);
}

/** An immutable validated registry. The keyVersion->verifier map is encapsulated; NO mutation API is exported. */
export interface ValidatedKeyRegistry {
  readonly authorityDomain: FinancialAuthorityDomain;
  readonly keyVersions: readonly string[];
  /** Deterministic exact lookup: the per-key verifier + status, or null if the keyVersion is not registered. */
  resolve(keyVersion: string): { readonly verifier: FinancialAuthorityVerifier; readonly status: TrustedKeyStatus } | null;
}

/**
 * Strictly validate config and build an IMMUTABLE key registry. Throws `FinancialAuthorityConfigurationError` on ANY
 * problem (missing/empty registry, duplicate keyVersion, malformed/ private public key, bad status, unsupported
 * algorithm/fingerprint version, forbidden private material). Never returns a partial or defaulted registry.
 */
export function validateProductionVerifierConfig(config: ProductionVerifierConfig): ValidatedKeyRegistry {
  if (!config || typeof config !== 'object') throw new FinancialAuthorityConfigurationError('config_missing');
  assertNoPrivateMaterial(config as unknown as Record<string, unknown>, 'config');
  const domain = config.authorityDomain;
  if (typeof domain !== 'string' || !(Object.values(FINANCIAL_AUTHORITY_DOMAINS) as string[]).includes(domain)) {
    throw new FinancialAuthorityConfigurationError('authorityDomain_invalid');
  }
  if (!SUPPORTED_SIGNATURE_ALGORITHMS.includes(config.signatureAlgorithm as (typeof SUPPORTED_SIGNATURE_ALGORITHMS)[number])) {
    throw new FinancialAuthorityConfigurationError('signatureAlgorithm_unsupported');
  }
  if (!SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS.includes(config.fingerprintAlgorithmVersion as (typeof SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS)[number])) {
    throw new FinancialAuthorityConfigurationError('fingerprintAlgorithmVersion_unsupported');
  }
  if (!Array.isArray(config.keys) || config.keys.length === 0) {
    throw new FinancialAuthorityConfigurationError('empty_registry');
  }
  const map = new Map<string, { verifier: FinancialAuthorityVerifier; status: TrustedKeyStatus }>();
  for (const entry of config.keys) {
    if (!entry || typeof entry !== 'object') throw new FinancialAuthorityConfigurationError('key_entry_invalid');
    assertNoPrivateMaterial(entry as unknown as Record<string, unknown>, 'key');
    if (typeof entry.keyVersion !== 'string' || entry.keyVersion.length === 0) {
      throw new FinancialAuthorityConfigurationError('keyVersion_invalid');
    }
    if (!TRUSTED_KEY_STATUSES.includes(entry.status as TrustedKeyStatus)) {
      throw new FinancialAuthorityConfigurationError(`status_invalid:${entry.keyVersion}`);
    }
    if (map.has(entry.keyVersion)) throw new FinancialAuthorityConfigurationError(`duplicate_key_version:${entry.keyVersion}`);
    assertPublicKeyOnly(entry.publicKeyPem, entry.keyVersion);
    // The SAME real verification primitive, scoped to exactly this one key version + configured algorithm/fp version.
    const verifier = createPublicKeyVerifier({
      publicKeyPem: entry.publicKeyPem,
      allowedKeyVersions: [entry.keyVersion],
      allowedSignatureAlgorithms: [config.signatureAlgorithm],
      allowedFingerprintAlgorithmVersions: [config.fingerprintAlgorithmVersion],
    });
    map.set(entry.keyVersion, { verifier, status: entry.status });
  }
  const keyVersions = Object.freeze([...map.keys()]);
  return Object.freeze({
    authorityDomain: domain,
    keyVersions,
    resolve(keyVersion: string) { return map.get(keyVersion) ?? null; },
  });
}

/**
 * Resolve the production verifier from config. `null`/`undefined` (not wired yet) -> fail-closed SAFE_UNAVAILABLE.
 * A present-but-invalid config -> throws (never a silent insecure default). A valid config -> a REGISTRY-backed
 * verifier that (a) binds authorityDomain, (b) looks up EXACTLY the envelope's keyVersion (no fallback, no try-all),
 * (c) rejects unknown/revoked keyVersion fail-closed, and (d) delegates the signature check to the same
 * `createPublicKeyVerifier` primitive. Old records keep verifying under a TRUSTED_FOR_VERIFY key after signing rotates.
 */
export function resolveProductionFinancialAuthorityVerifier(config: ProductionVerifierConfig | null | undefined): FinancialAuthorityVerifier {
  if (config === null || config === undefined) return PRODUCTION_UNAVAILABLE_VERIFIER;
  const registry = validateProductionVerifierConfig(config); // immutable; throws on invalid
  return {
    verify(envelope: FinancialAuthorityEnvelope, expected: AuthorityVerificationExpectation): void {
      if (registry.authorityDomain !== expected.domain) {
        throw new FinancialAuthorityVerificationError('config_domain_mismatch');
      }
      const hit = registry.resolve(envelope.signingKeyVersion); // deterministic exact lookup — NO fallback to active
      if (!hit) throw new FinancialAuthorityVerificationError('key_version_unknown');
      if (hit.status === 'REVOKED') throw new FinancialAuthorityVerificationError('key_version_revoked');
      hit.verifier.verify(envelope, expected); // real per-key verification (domain/version/fp/algo/fingerprint/signature)
    },
  };
}

/**
 * Source of the production verifier config. Returns `null` (explicitly UNCONFIGURED) until P0-IAM-01B wires the KMS
 * public keys + key-version registry. It deliberately reads NO environment variable and applies NO default, so
 * provenance cannot be enabled accidentally or with insecure example values. P0-IAM-01B replaces this body to return a
 * validated `ProductionVerifierConfig` (public keys fetched from KMS/secret-manager at deploy/config time).
 */
export function loadProductionVerifierConfig(): ProductionVerifierConfig | null {
  return null;
}

/**
 * Production signer configuration contract (for P0-IAM-01B). The signer itself requires the GCP KMS client + a
 * provisioned key + `useToSign` IAM on the dedicated authority-service identity, so it is intentionally NOT bound in
 * P0-IAM-01A (no KMS package added). `getProductionFinancialAuthoritySigner` stays fail-closed until P0-IAM-01B binds a
 * `KmsFinancialAuthoritySigner` that satisfies `FinancialAuthoritySigner` using these values.
 */
export interface ProductionSignerConfig {
  readonly kmsKeyResourceId: string;   // projects/.../cryptoKeyVersions/<n>
  readonly signingKeyVersion: string;  // logical key-version label bound into the envelope
  readonly signatureAlgorithm: string; // EC_SIGN_P256_SHA256
  readonly fingerprintAlgorithmVersion: string;
}

// ── Pure verification core used by the loader (Phase 11) ─────────────────────────────────────────────────────────
/**
 * Assert that `envelope` is an authentic provenance envelope for the canonical payload described by `expected`, using
 * the supplied `verifier`. Pure and side-effect free; throws on ANY failure and returns void on success. This does NOT
 * mint any trusted capability — minting remains the exclusive, module-private responsibility of the paid-chat loader.
 */
export function assertVerifiedAuthorityEnvelope(
  envelope: FinancialAuthorityEnvelope,
  expected: AuthorityVerificationExpectation,
  verifier: FinancialAuthorityVerifier,
): void {
  if (!verifier || typeof verifier.verify !== 'function') {
    throw new FinancialAuthorityVerificationError('verifier_missing');
  }
  verifier.verify(envelope, expected);
}

// ── Future authority-service contract (Phase 10; types only — no implementation, no client callable) ─────────────
/** Server-internal request to mint canonical paid-chat authority (roles pre-resolved server-side; never raw client). */
export interface PaidChatAuthorityMintRequest {
  readonly paidChatId: string;
  readonly rolePolicyVersion: number;
  readonly billingPolicyVersion: number;
  readonly authorityVersion: number;
}
export interface PaidChatAuthorityMintResult {
  readonly paidChatId: string;
  readonly recordVersion: number;
  readonly signingKeyVersion: string;
  readonly status: 'WRITTEN';
}
/**
 * Contract for the future dedicated PaidChat Authority Service (implemented under P0-IAM-01B/R1B-2R3). It is the SOLE
 * holder of the KMS sign grant; generic subsystems call it instead of writing canonical authority directly. It
 * validates invariants + server-resolved roles, canonicalizes, requests a KMS signature, and atomically persists the
 * record + envelope. No implementation and no client-callable surface exists in P0-IAM-01A.
 */
export interface PaidChatAuthorityService {
  mintCanonicalPaidChatAuthority(req: PaidChatAuthorityMintRequest): Promise<PaidChatAuthorityMintResult>;
}
