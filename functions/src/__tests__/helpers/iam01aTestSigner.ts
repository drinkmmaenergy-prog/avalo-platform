// functions/src/__tests__/helpers/iam01aTestSigner.ts
//
// TEST-ONLY financial-authority signer for P0-IAM-01A. Generates an EPHEMERAL EC P-256 keypair inside the test process
// and signs canonical payloads with the private key — a real cryptographic trust simulation of the future production
// KMS signer, WITHOUT any production exposure.
//
// ISOLATION GUARANTEES (P0-IAM-01A Phase 9):
//   - lives under src/__tests__/ (never bundled/imported by any production module);
//   - holds the private key ONLY in-process, generated per test run (nothing is committed);
//   - is injected into the loader/verifier ONLY through an explicit test seam (the `verifier` parameter of
//     `loadTrustedPaidChatAuthority`); production code has NO path that accepts a caller-supplied signer;
//   - production runtime exports NO signer that owns a private key and NO `__unsafeSign` function.
//
// A grep gate in the validator asserts that no production (non-__tests__) file imports this helper.

import * as crypto from 'crypto';
import {
  FinancialAuthoritySigner,
  FinancialAuthorityVerifier,
  AuthoritySigningInput,
  createPublicKeyVerifier,
} from '../../security/financialAuthority/authorityProvenance';
import { FinancialAuthorityEnvelope, FINANCIAL_AUTHORITY_DOMAINS } from '../../security/financialAuthority/authorityEnvelope';
import {
  buildPaidChatAuthorityCanonicalPayloadBytes,
  sha256Hex,
  FINGERPRINT_ALGORITHM_VERSION,
  PaidChatAuthorityFingerprintInput,
} from '../../security/financialAuthority/canonicalFingerprint';

export const TEST_SIGNING_KEY_VERSION = 'TEST_EPHEMERAL_V1';
export const TEST_SIGNATURE_ALGORITHM = 'EC_SIGN_P256_SHA256';

export interface TestAuthoritySignerBundle {
  readonly signer: FinancialAuthoritySigner;
  readonly verifier: FinancialAuthorityVerifier;
  readonly publicKeyPem: string;
  /** Sign a paid-chat record and return the companion envelope to store under `PAID_CHAT_AUTHORITY_ENVELOPE_FIELD`. */
  signPaidChatRecord(rec: PaidChatAuthorityFingerprintInput): FinancialAuthorityEnvelope;
}

/** Create an ephemeral test signer + matching public-key verifier. Generated fresh; nothing persisted. */
export function createTestAuthoritySigner(keyVersion: string = TEST_SIGNING_KEY_VERSION): TestAuthoritySignerBundle {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  function signBytes(canonicalPayloadBytes: Buffer): string {
    return crypto.createSign('SHA256').update(canonicalPayloadBytes).end().sign(privateKey).toString('base64');
  }

  const signer: FinancialAuthoritySigner = {
    keyVersion,
    signatureAlgorithm: TEST_SIGNATURE_ALGORITHM,
    async sign(input: AuthoritySigningInput): Promise<FinancialAuthorityEnvelope> {
      return {
        authorityDomain: input.domain,
        resourceId: input.resourceId,
        recordVersion: input.recordVersion,
        authorityVersion: input.authorityVersion,
        policyVersion: input.policyVersion,
        signingKeyVersion: keyVersion,
        fingerprintAlgorithmVersion: input.fingerprintAlgorithmVersion,
        payloadFingerprint: sha256Hex(input.canonicalPayloadBytes),
        signatureAlgorithm: TEST_SIGNATURE_ALGORITHM,
        signature: signBytes(input.canonicalPayloadBytes),
        signedAt: Date.now(),
      };
    },
  };

  const verifier = createPublicKeyVerifier({
    publicKeyPem: publicKey,
    allowedKeyVersions: [keyVersion],
  });

  function signPaidChatRecord(rec: PaidChatAuthorityFingerprintInput): FinancialAuthorityEnvelope {
    const canonicalPayloadBytes = buildPaidChatAuthorityCanonicalPayloadBytes(rec);
    return {
      authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT,
      resourceId: rec.paidChatId,
      recordVersion: rec.version,
      authorityVersion: rec.authorityVersion,
      policyVersion: rec.billingPolicyVersion,
      signingKeyVersion: keyVersion,
      fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
      payloadFingerprint: sha256Hex(canonicalPayloadBytes),
      signatureAlgorithm: TEST_SIGNATURE_ALGORITHM,
      signature: signBytes(canonicalPayloadBytes),
      signedAt: Date.now(),
    };
  }

  return { signer, verifier, publicKeyPem: publicKey, signPaidChatRecord };
}
