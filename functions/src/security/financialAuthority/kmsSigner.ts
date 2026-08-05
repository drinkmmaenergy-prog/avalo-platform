// functions/src/security/financialAuthority/kmsSigner.ts
//
// P0-IAM-01B — KMS-backed FinancialAuthoritySigner (production trust root).
//
// The ONLY production path to a valid financial-authority signature. It signs a canonical Avalo authority payload with a
// GCP Cloud KMS ASYMMETRIC key (EC_SIGN_P256_SHA256) via a narrow injected `KmsSignerClient`. The private key never
// leaves KMS; there is NO local key, NO HMAC, NO test-signer fallback, NO generateKeyPair, and NO raw-bytes/arbitrary-
// digest signing surface. The signer is constructed with a FIXED key configuration — the caller cannot choose the key,
// algorithm, or authority domain (those are enforced upstream by the Authority Service).
//
// Package note: `@google-cloud/kms` is intentionally NOT imported here (no package drift in P0-IAM-01B1). The concrete
// KMS client is bound in P0-IAM-01B2 provisioning against the `KmsSignerClient` interface below; until then the
// production factory returns null and KMS signing is SAFE_UNAVAILABLE.

import {
  FinancialAuthoritySigner,
  AuthoritySigningInput,
} from './authorityProvenance';
import { FinancialAuthorityEnvelope } from './authorityEnvelope';
import { sha256Hex } from './canonicalFingerprint';

/** Production KMS signing state until P0-IAM-01B2 binds a real client + key. */
export const KMS_SIGNING_STATE = 'SAFE_UNAVAILABLE' as const;

/** Thrown on any KMS signing failure (fail-closed; never produces an unsigned/local-signed authority). */
export class KmsSigningError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`KMS_SIGNING_FAILED: ${reason}`);
    this.name = 'KmsSigningError';
    this.reason = reason;
  }
}
/** Thrown when KMS signing is requested but not wired/configured (fail-closed; SAFE_UNAVAILABLE). */
export class KmsSignerUnavailableError extends Error {
  readonly code = 'failed-precondition';
  constructor(what: string) {
    super(`KMS_SIGNER_UNAVAILABLE: ${what} (KMS_SIGNING_STATE=SAFE_UNAVAILABLE)`);
    this.name = 'KmsSignerUnavailableError';
  }
}

/**
 * Narrow abstraction over Cloud KMS `asymmetricSign`. The ONLY operation the signer needs. It accepts a pre-computed
 * SHA-256 digest and returns a DER signature bound to an explicit key-version resource name. It CANNOT be asked to sign
 * arbitrary bytes with a caller-chosen key: the key-version name is fixed by `KmsSignerConfig`, not by any request.
 * In production this is backed by `@google-cloud/kms` (P0-IAM-01B2); in tests by an ephemeral local keypair.
 */
export interface KmsSignerClient {
  // Signs the canonical MESSAGE with the FIXED key version, returning a DER ECDSA signature over SHA-256(message). The
  // production wrapper (P0-IAM-01B2) computes the SHA-256 digest and calls Cloud KMS `asymmetricSign(digest)`; the local
  // test client uses ECDSA-SHA256 directly. Both yield an identical ECDSA(SHA-256(message)) signature that the
  // P0-IAM-01A public-key verifier (`createVerify('SHA256')`) accepts. The client CANNOT be asked to sign arbitrary
  // bytes with a caller-chosen key — the key-version name is fixed by config.
  asymmetricSign(input: {
    readonly keyVersionName: string; // full KMS resource name projects/.../cryptoKeyVersions/N — fixed by config
    readonly message: Buffer; // canonical payload bytes (the wrapper computes SHA-256 for KMS)
  }): Promise<{ readonly signatureDer: Buffer; readonly signedKeyVersionName: string }>;
}

/** Immutable production KMS signer configuration (the FIXED key this signer may use). */
export interface KmsSignerConfig {
  readonly keyVersionResourceName: string; // full KMS resource name (audit + client target)
  readonly signingKeyVersion: string; // logical key-version label bound into the envelope + registry
  readonly signatureAlgorithm: string; // EC_SIGN_P256_SHA256
  readonly fingerprintAlgorithmVersion: string; // must match the canonical fingerprint used to build the payload
  readonly authorityDomain: string; // the single domain this signer is provisioned for
}

const SUPPORTED_ALGO = 'EC_SIGN_P256_SHA256';

/** Optional injected clock (envelope.signedAt is informational only, excluded from the signed fingerprint). */
export type NowMs = () => number;

/**
 * KMS-backed signer. `sign()` computes the SHA-256 digest of the SERVICE-DERIVED canonical bytes, asks KMS to sign the
 * digest with the FIXED key version, validates the KMS response, and returns an envelope binding the key version.
 * Fail-closed on any inconsistency. There is no method to sign arbitrary bytes and no caller-selectable key.
 */
export class KmsFinancialAuthoritySigner implements FinancialAuthoritySigner {
  readonly keyVersion: string;
  readonly signatureAlgorithm: string;
  private readonly client: KmsSignerClient;
  private readonly config: KmsSignerConfig;
  private readonly nowMs: NowMs;

  constructor(client: KmsSignerClient, config: KmsSignerConfig, nowMs: NowMs) {
    if (!client || typeof client.asymmetricSign !== 'function') throw new KmsSigningError('client_missing');
    if (!config || typeof config !== 'object') throw new KmsSigningError('config_missing');
    if (config.signatureAlgorithm !== SUPPORTED_ALGO) throw new KmsSigningError('unsupported_algorithm');
    if (typeof config.keyVersionResourceName !== 'string' || config.keyVersionResourceName.length === 0) throw new KmsSigningError('key_resource_missing');
    if (typeof config.signingKeyVersion !== 'string' || config.signingKeyVersion.length === 0) throw new KmsSigningError('key_version_missing');
    this.client = client;
    this.config = config;
    this.nowMs = nowMs;
    this.keyVersion = config.signingKeyVersion;
    this.signatureAlgorithm = config.signatureAlgorithm;
  }

  async sign(input: AuthoritySigningInput): Promise<FinancialAuthorityEnvelope> {
    // Domain + fingerprint-version must match this signer's provisioning (defence in depth; the service also enforces).
    if (input.domain !== this.config.authorityDomain) throw new KmsSigningError('domain_mismatch');
    if (input.fingerprintAlgorithmVersion !== this.config.fingerprintAlgorithmVersion) throw new KmsSigningError('fingerprint_algorithm_mismatch');
    if (!Buffer.isBuffer(input.canonicalPayloadBytes) || input.canonicalPayloadBytes.length === 0) throw new KmsSigningError('empty_payload');

    let res: { signatureDer: Buffer; signedKeyVersionName: string };
    try {
      res = await this.client.asymmetricSign({ keyVersionName: this.config.keyVersionResourceName, message: input.canonicalPayloadBytes });
    } catch (e) {
      throw new KmsSigningError('kms_call_failed'); // KMS unavailable / permission denied -> fail closed
    }
    if (!res || !Buffer.isBuffer(res.signatureDer) || res.signatureDer.length === 0) throw new KmsSigningError('empty_signature');
    if (res.signedKeyVersionName !== this.config.keyVersionResourceName) throw new KmsSigningError('key_version_response_mismatch');

    return {
      authorityDomain: input.domain,
      resourceId: input.resourceId,
      recordVersion: input.recordVersion,
      authorityVersion: input.authorityVersion,
      policyVersion: input.policyVersion,
      signingKeyVersion: this.config.signingKeyVersion,
      fingerprintAlgorithmVersion: input.fingerprintAlgorithmVersion,
      payloadFingerprint: sha256Hex(input.canonicalPayloadBytes),
      signatureAlgorithm: this.config.signatureAlgorithm,
      signature: res.signatureDer.toString('base64'),
      signedAt: this.nowMs(),
    };
  }
}

/**
 * Production KMS client source. Returns `null` (UNWIRED) in P0-IAM-01B1 — no `@google-cloud/kms` binding exists yet.
 * P0-IAM-01B2 replaces this to construct a `KeyManagementServiceClient`-backed `KmsSignerClient` running under the
 * dedicated authority-service identity (the sole `cloudkms.cryptoKeyVersions.useToSign` holder). Reads NO env, applies
 * NO default. Generic backend identities never receive this client.
 */
export function loadProductionKmsSignerClient(): KmsSignerClient | null {
  return null;
}
/** Production signer factory. `null` until P0-IAM-01B2 binds a client + config -> KMS signing SAFE_UNAVAILABLE. */
export function getProductionKmsSigner(): FinancialAuthoritySigner | null {
  const client = loadProductionKmsSignerClient();
  if (client === null) return null;
  throw new KmsSignerUnavailableError('config_not_wired'); // client present but config wiring is a P0-IAM-01B2 concern
}
