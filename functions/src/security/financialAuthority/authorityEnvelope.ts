// functions/src/security/financialAuthority/authorityEnvelope.ts
//
// P0-IAM-01A — CANONICAL FINANCIAL-AUTHORITY ENVELOPE CONTRACT (generic).
//
// The envelope is the cryptographic provenance wrapper stored alongside a financial-authority record. It carries the
// fingerprint of the canonical payload and a signature over it, plus the binding metadata (domain, resource, versions,
// key version, algorithms). CRITICAL: an envelope is NEVER trusted by shape. `parseAuthorityEnvelope` validates SHAPE
// only; trust is conferred solely by a successful signature verification in ../financialAuthority/authorityProvenance.
//
// This contract is domain-generic so the same envelope + verifier can later protect wallet/ledger/earning/payout/
// AI-billing/advertiser/purchase/refund authority (P0-IAM-01A Phase 20).

/** Financial-authority domains. `/paidChats` is the first proving ground; others are reserved for later reuse. */
export const FINANCIAL_AUTHORITY_DOMAINS = {
  PAID_CHAT: 'PAID_CHAT',
  WALLET: 'WALLET',
  LEDGER: 'LEDGER',
  CREATOR_EARNING: 'CREATOR_EARNING',
  PAYOUT: 'PAYOUT',
  AI_BILLING: 'AI_BILLING',
  ADVERTISER_FUNDING: 'ADVERTISER_FUNDING',
  PURCHASE: 'PURCHASE',
  REFUND: 'REFUND',
} as const;
export type FinancialAuthorityDomain = (typeof FINANCIAL_AUTHORITY_DOMAINS)[keyof typeof FINANCIAL_AUTHORITY_DOMAINS];

/**
 * Supported signature algorithms. `EC_SIGN_P256_SHA256` mirrors GCP Cloud KMS' asymmetric-signing algorithm of the same
 * name (ECDSA P-256 over a SHA-256 digest), so the LOCAL verifier and a future KMS signer speak the same contract.
 */
export const SUPPORTED_SIGNATURE_ALGORITHMS = ['EC_SIGN_P256_SHA256'] as const;
export type SupportedSignatureAlgorithm = (typeof SUPPORTED_SIGNATURE_ALGORITHMS)[number];

/** Supported fingerprint algorithm versions (must equal the one bound into the canonical byte stream). */
export const SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS = ['AVALO_FP_V1_SHA256'] as const;
export type SupportedFingerprintAlgorithmVersion = (typeof SUPPORTED_FINGERPRINT_ALGORITHM_VERSIONS)[number];

/**
 * Immutable provenance envelope. Stored as a companion field on the authority record. NOT trusted by shape.
 *
 * `signedAt` is INFORMATIONAL ONLY (audit/debugging). It is deliberately excluded from the signed fingerprint, so it is
 * neither a provenance signal nor a tamper vector.
 */
export interface FinancialAuthorityEnvelope {
  readonly authorityDomain: FinancialAuthorityDomain;
  readonly resourceId: string;
  readonly recordVersion: number;
  readonly authorityVersion: number;
  readonly policyVersion: number;
  readonly signingKeyVersion: string;
  readonly fingerprintAlgorithmVersion: string;
  readonly payloadFingerprint: string; // hex SHA-256 of the canonical payload bytes
  readonly signatureAlgorithm: string;
  readonly signature: string; // base64 signature over the canonical payload bytes
  readonly signedAt: number; // epoch ms — informational, NOT in the fingerprint
}

/** Thrown when an envelope is missing or structurally malformed (SHAPE failure, before any crypto verification). */
export class AuthorityEnvelopeError extends Error {
  readonly code = 'failed-precondition';
  readonly reason: string;
  constructor(reason: string) {
    super(`AUTHORITY_ENVELOPE_INVALID: ${reason}`);
    this.name = 'AuthorityEnvelopeError';
    this.reason = reason;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}
function isDomain(v: unknown): v is FinancialAuthorityDomain {
  return typeof v === 'string' && (Object.values(FINANCIAL_AUTHORITY_DOMAINS) as string[]).includes(v);
}

/**
 * Validate the SHAPE of a raw envelope and return a typed copy. Throws `AuthorityEnvelopeError` (fail-closed) on any
 * missing/mistyped field. This performs NO cryptographic verification and confers NO trust — it only guarantees the
 * verifier receives a well-formed object. Unknown signing-key versions / algorithms are accepted at SHAPE level and
 * rejected later by the verifier (so the negative reasons stay distinct and testable).
 */
export function parseAuthorityEnvelope(raw: unknown): FinancialAuthorityEnvelope {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AuthorityEnvelopeError('missing_or_not_object');
  }
  const e = raw as Record<string, unknown>;
  if (!isDomain(e.authorityDomain)) throw new AuthorityEnvelopeError('authorityDomain_invalid');
  if (!isNonEmptyString(e.resourceId)) throw new AuthorityEnvelopeError('resourceId_invalid');
  if (!isNonNegInt(e.recordVersion)) throw new AuthorityEnvelopeError('recordVersion_invalid');
  if (!isNonNegInt(e.authorityVersion)) throw new AuthorityEnvelopeError('authorityVersion_invalid');
  if (!isNonNegInt(e.policyVersion)) throw new AuthorityEnvelopeError('policyVersion_invalid');
  if (!isNonEmptyString(e.signingKeyVersion)) throw new AuthorityEnvelopeError('signingKeyVersion_invalid');
  if (!isNonEmptyString(e.fingerprintAlgorithmVersion)) throw new AuthorityEnvelopeError('fingerprintAlgorithmVersion_invalid');
  if (!isNonEmptyString(e.payloadFingerprint)) throw new AuthorityEnvelopeError('payloadFingerprint_invalid');
  if (!isNonEmptyString(e.signatureAlgorithm)) throw new AuthorityEnvelopeError('signatureAlgorithm_invalid');
  if (!isNonEmptyString(e.signature)) throw new AuthorityEnvelopeError('signature_invalid');
  if (!isNonNegInt(e.signedAt)) throw new AuthorityEnvelopeError('signedAt_invalid');
  return {
    authorityDomain: e.authorityDomain,
    resourceId: e.resourceId,
    recordVersion: e.recordVersion,
    authorityVersion: e.authorityVersion,
    policyVersion: e.policyVersion,
    signingKeyVersion: e.signingKeyVersion,
    fingerprintAlgorithmVersion: e.fingerprintAlgorithmVersion,
    payloadFingerprint: e.payloadFingerprint,
    signatureAlgorithm: e.signatureAlgorithm,
    signature: e.signature,
    signedAt: e.signedAt,
  };
}
