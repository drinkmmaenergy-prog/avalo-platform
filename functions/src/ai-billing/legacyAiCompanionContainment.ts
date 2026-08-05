// functions/src/ai-billing/legacyAiCompanionContainment.ts
//
// P0-02 R3 — SAFE UNAVAILABLE CONTAINMENT for the LEGACY Functions AI companion callables.
//
// The Functions AI companion callables (aiCompanionFunctions.sendAIMessage, aiCompanions.sendAIMessageCallable)
// invoked the AI provider BEFORE billing and mutated a NON-canonical wallet (`users/{uid}/wallet/current`) with
// direct earner credit — a reachable billable provider-before-billing path outside the canonical wallet/ledger
// contract established for the app-web AI route (which explicitly "Replaces the CORS-blocked sendAIMessageCallable").
//
// These legacy callables are superseded by the canonical server-authoritative app-web AI route
// (app-web/src/lib/ai-billing/aiSpendAuthorization). Until a genuine canonical Functions AI billing stage is
// authorized, they are fail-closed: NO provider call, NO wallet/ledger/earner mutation. This is ONE canonical
// containment contract reused by every legacy callable (no per-callable divergence, no second billing engine).

export const LEGACY_AI_COMPANION_UNAVAILABLE = 'AI_COMPANION_LEGACY_UNAVAILABLE_USE_CANONICAL_AI_ROUTE';

export class LegacyAiCompanionUnavailableError extends Error {
  readonly code = 'failed-precondition';
  constructor() { super(LEGACY_AI_COMPANION_UNAVAILABLE); this.name = 'LegacyAiCompanionUnavailableError'; }
}

// Fail-closed guard: throws BEFORE any provider/wallet/ledger/earner work can occur.
export function assertLegacyAiCompanionUnavailable(): never {
  throw new LegacyAiCompanionUnavailableError();
}
