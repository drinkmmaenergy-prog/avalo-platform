// functions/src/lib/moneyLog.ts
//
// S6 — MONEY RUNTIME LOG HYGIENE (shared redaction/classification helper).
//
// POLICY: runtime logs on money paths carry FIXED CLASSIFICATIONS ONLY. No user IDs (or hashes
// of them), no Stripe/provider resource IDs (cs_/pi_/ch_/re_/dp_/sub_), no barrier/ledger IDs,
// no reconciliation keys, no raw metadata/payloads/document snapshots, no caught errors or
// error messages, no amounts/balances/prices. Operational evidence (raw IDs) lives ONLY in
// server-only durable records (paymentReconciliation, ledger, barriers, audit docs).
//
// This module is the single choke point: every field is whitelisted by KEY, and every value is
// additionally screened by PATTERN so a fixed-classification key can never smuggle an
// identifier-shaped value. Anything not explicitly allowed is dropped.

import { logger } from 'firebase-functions/v2';

/** Keys allowed in money runtime log payloads (fixed classifications only). */
export const MONEY_LOG_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'severity',
  'event',
  'eventType',
  'provider',
  'sourceRoute',
  'reason',
  'conflictType',
  'status',
  'storedStatus',
  'route',
  'operation',
  'action',
  'kind',
  'retryable',
]);

/** Identifier-shaped substrings that must never appear in a runtime log value. */
const FORBIDDEN_VALUE_PATTERN =
  /cs_|pi_|ch_|re_|dp_|sub_|px_|stripe:|internal:|user_|uid|Bearer |sk_|whsec_/i;

function safeString(v: string): string {
  return FORBIDDEN_VALUE_PATTERN.test(v) ? '[REDACTED]' : v;
}

/**
 * Whitelist-sanitize a payload for money runtime logging. Pure and exported so tests can prove
 * the policy directly. Non-allowed keys are DROPPED; allowed keys keep only boolean values,
 * pattern-screened strings, or arrays of pattern-screened strings. Everything else (objects,
 * numbers, Errors, snapshots) is dropped — numbers are excluded on purpose (amounts/balances).
 */
export function sanitizeMoneyLogFields(
  fields?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (!MONEY_LOG_ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = safeString(v);
    else if (Array.isArray(v)) {
      out[k] = v.filter((x): x is string => typeof x === 'string').map(safeString);
    }
    // objects / numbers / Errors / null / undefined: dropped.
  }
  return out;
}

export type MoneyLogSeverity = 'info' | 'warn' | 'error';

/** Fixed-classification runtime log for money paths. The ONLY logging entry point they use. */
export function moneyLog(
  severity: MoneyLogSeverity,
  message: string,
  fields?: Record<string, unknown>,
): void {
  logger[severity](message, sanitizeMoneyLogFields(fields));
}
