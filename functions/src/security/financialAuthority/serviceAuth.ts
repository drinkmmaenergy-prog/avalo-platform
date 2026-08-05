// functions/src/security/financialAuthority/serviceAuth.ts
//
// P0-IAM-01B — service-to-service authentication + authorized-caller policy for the Authority Service.
//
// Authentication proves WHICH service identity is calling; authorization decides whether THAT identity may request the
// requested operation. Both are required and default-deny. Trust is derived ONLY from a cryptographically verified,
// Google-issued OIDC identity token (issuer + audience + signature + expiry + service-account subject) — NEVER from
// request headers (x-service-name / x-internal / x-forwarded), NEVER from an email in the request body, NEVER from a
// Firebase end-user token, and NEVER from source IP alone. Until an audience + caller allowlist are wired
// (P0-IAM-01B2), service auth is SAFE_UNAVAILABLE (fail-closed).

/** The authenticated calling service identity (derived server-side from a verified OIDC token; never from payload). */
export interface ServiceCallerIdentity {
  readonly serviceAccountEmail: string;
  readonly subject: string;
}

/** Raw invocation context handed to the verifier. `idToken` is the Authorization: Bearer OIDC token (server-extracted). */
export interface ServiceInvocationContext {
  readonly idToken?: string;
  /** Headers are available for logging/correlation ONLY; they are NEVER a source of identity/authorization. */
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

/** Thrown when a service caller cannot be authenticated (fail-closed). */
export class ServiceAuthenticationError extends Error {
  readonly code = 'unauthenticated';
  readonly reason: string;
  constructor(reason: string) { super(`SERVICE_AUTH_FAILED: ${reason}`); this.name = 'ServiceAuthenticationError'; this.reason = reason; }
}
/** Thrown when an authenticated caller is not authorized for the operation/domain (fail-closed, default-deny). */
export class ServiceAuthorizationError extends Error {
  readonly code = 'permission-denied';
  readonly reason: string;
  constructor(reason: string) { super(`SERVICE_AUTHZ_DENIED: ${reason}`); this.name = 'ServiceAuthorizationError'; this.reason = reason; }
}
/** Thrown when service auth is not wired/configured (fail-closed; SAFE_UNAVAILABLE). */
export class ServiceAuthUnavailableError extends Error {
  readonly code = 'failed-precondition';
  constructor(what: string) { super(`SERVICE_AUTH_UNAVAILABLE: ${what} (REAL_SERVICE_TO_SERVICE_INVOCATION=SAFE_UNAVAILABLE)`); this.name = 'ServiceAuthUnavailableError'; }
}

export const SERVICE_AUTH_STATE = 'SAFE_UNAVAILABLE' as const;

/** Verifies a service invocation and returns the authenticated identity, or throws (fail-closed). */
export interface ServiceInvocationVerifier {
  verify(ctx: ServiceInvocationContext): Promise<ServiceCallerIdentity>;
}

/** Authorization policy: which service accounts may request which (operation, authorityDomain). Default-deny. */
export interface AuthorizedCallerPolicy {
  /** Throws `ServiceAuthorizationError` unless `caller` is explicitly authorized for (operation, authorityDomain). */
  authorize(caller: ServiceCallerIdentity, operation: string, authorityDomain: string): void;
}

/** Configuration for OIDC service-auth (P0-IAM-01B2 supplies the values; no secret — audience + allowlist only). */
export interface ServiceAuthConfig {
  readonly expectedAudience: string; // the Authority Service's Cloud Run URL / configured audience
  readonly allowedIssuers: readonly string[]; // e.g. https://accounts.google.com
  readonly authorizedCallers: readonly { readonly serviceAccountEmail: string; readonly operations: readonly string[]; readonly authorityDomains: readonly string[] }[];
}

/** Verified-OIDC claims shape (what a token verifier such as google-auth-library yields). Injected for testability. */
export interface VerifiedOidcClaims {
  readonly aud: string;
  readonly iss: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly sub: string;
  readonly exp: number;
}
/** Abstraction over the actual OIDC token verifier (google-auth-library in prod; a fake in tests). Verifies signature+expiry. */
export interface OidcTokenVerifier {
  verify(idToken: string, expectedAudience: string): Promise<VerifiedOidcClaims>;
}

/**
 * Build the production service-invocation verifier from a strict config + an OIDC token verifier. Enforces, fail-closed:
 * token present; audience match; issuer allowlist; email present + verified; subject present. The email/subject become
 * the identity — headers and payload are ignored. This is the ONLY path that yields a ServiceCallerIdentity.
 */
export function createServiceInvocationVerifier(config: ServiceAuthConfig, oidc: OidcTokenVerifier): ServiceInvocationVerifier {
  return {
    async verify(ctx: ServiceInvocationContext): Promise<ServiceCallerIdentity> {
      const token = ctx?.idToken;
      if (typeof token !== 'string' || token.length === 0) throw new ServiceAuthenticationError('missing_id_token'); // no header-only identity
      let claims: VerifiedOidcClaims;
      try {
        claims = await oidc.verify(token, config.expectedAudience); // verifies signature + expiry + audience cryptographically
      } catch {
        throw new ServiceAuthenticationError('token_verification_failed');
      }
      if (claims.aud !== config.expectedAudience) throw new ServiceAuthenticationError('audience_mismatch');
      if (!config.allowedIssuers.includes(claims.iss)) throw new ServiceAuthenticationError('issuer_not_allowed');
      if (typeof claims.email !== 'string' || claims.email.length === 0) throw new ServiceAuthenticationError('no_service_account_email'); // end-user tokens without SA email rejected
      if (claims.email_verified !== true) throw new ServiceAuthenticationError('email_not_verified');
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new ServiceAuthenticationError('no_subject');
      return { serviceAccountEmail: claims.email, subject: claims.sub };
    },
  };
}

/** Build a default-deny authorization policy from the config's explicit caller allowlist. */
export function createAuthorizedCallerPolicy(config: ServiceAuthConfig): AuthorizedCallerPolicy {
  const allow = new Map<string, { ops: Set<string>; domains: Set<string> }>();
  for (const c of config.authorizedCallers) {
    allow.set(c.serviceAccountEmail, { ops: new Set(c.operations), domains: new Set(c.authorityDomains) });
  }
  return {
    authorize(caller: ServiceCallerIdentity, operation: string, authorityDomain: string): void {
      const entry = allow.get(caller.serviceAccountEmail);
      if (!entry) throw new ServiceAuthorizationError('caller_not_in_allowlist'); // default-deny
      if (!entry.ops.has(operation)) throw new ServiceAuthorizationError('operation_not_allowed');
      if (!entry.domains.has(authorityDomain)) throw new ServiceAuthorizationError('domain_not_allowed');
    },
  };
}

/** Number of authorized callers configured (0 in P0-IAM-01B1 -> nothing is authorized -> SAFE_UNAVAILABLE). */
export function authorizedCallerCount(config: ServiceAuthConfig | null): number {
  return config ? config.authorizedCallers.length : 0;
}

/**
 * Production service-auth config source. Returns `null` (UNWIRED) in P0-IAM-01B1 — no audience/allowlist yet. Reads NO
 * env, applies NO default. P0-IAM-01B2 replaces this to return a validated `ServiceAuthConfig` (audience = Cloud Run
 * URL; allowlist = the single dedicated canonical-writer service account). Missing config -> SAFE_UNAVAILABLE.
 */
export function loadServiceAuthConfig(): ServiceAuthConfig | null {
  return null;
}
