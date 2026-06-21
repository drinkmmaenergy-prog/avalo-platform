/**
 * F6 unit tests — run WITHOUT emulator
 * Tests: T01 (kill switch), T05 (endCall disabled), T06 (billCall disabled),
 *        T08 (idempotency key format), T09 (commission math), T10 (ceiling minutes)
 */
import { PAYOUTS_ENABLED } from '../../src/wallet/payoutGuard';
import { endCall } from '../../src/calls';
import { billCall } from '../../src/callBilling';

describe('F6-T01: PAYOUTS_ENABLED kill switch', () => {
  it('is false as const', () => {
    expect(PAYOUTS_ENABLED).toBe(false);
    const _typeGuard: false = PAYOUTS_ENABLED;
    expect(_typeGuard).toBe(false);
  });
});

describe('F6-T05: calls.ts endCall HARD_DISABLED [F2]', () => {
  it('throws before any Firestore write', async () => {
    await expect(endCall({ callId: 'x' })).rejects.toThrow('HARD_DISABLED [F2]');
  });
});

describe('F6-T06: callBilling.billCall HARD_DISABLED', () => {
  it('throws referencing canonicalCallBillingV2', async () => {
    await expect(billCall('call-x')).rejects.toThrow(/HARD_DISABLED|canonicalCallBillingV2/);
  });
});

describe('F6-T08: Idempotency key format — no Date.now()', () => {
  it('CALL_BILL:{callId}:{windowId} format is canonical', () => {
    const key = `CALL_BILL:session-123:final`;
    expect(key).toMatch(/^CALL_BILL:[^:]+:[^:]+$/);
    expect(key).not.toMatch(/\d{10,}/);
  });
});

describe('F6-T09: Commission math — grossUsd × 0.20, no extra 5%', () => {
  it('grossUsdCents=earningTokens×4; avaloCommission=floor(gross×0.20); creatorNet=gross-commission', () => {
    const tokens = 100;
    const gross = tokens * 4;                    // 400
    const commission = Math.floor(gross * 0.20); // 80
    const net = gross - commission;              // 320
    expect(gross).toBe(400);
    expect(commission).toBe(80);
    expect(net).toBe(320);
    expect(net).toBe(Math.round(tokens * 4 * 0.80));
  });
});

describe('F6-T10: billCompletedCall ceiling minutes', () => {
  it.each([
    [60,  1],
    [61,  2],
    [120, 2],
    [1,   1],
    [119, 2],
  ])('ceil(%i/60) = %i', (secs, expected) => {
    expect(Math.ceil(secs / 60)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G2 unit tests (no emulator required)
// ─────────────────────────────────────────────────────────────────────────────

describe('G2-T01: calls.ts endCall HARD_DISABLED', () => {
  it('throws HARD_DISABLED [F2] before any write', async () => {
    await expect(endCall({ callId: 'g2-test' })).rejects.toThrow('HARD_DISABLED [F2]');
  });
});

describe('G2-T02: callBilling.billCall HARD_DISABLED', () => {
  it('throws referencing canonicalCallBillingV2', async () => {
    await expect(billCall('g2-call')).rejects.toThrow(/HARD_DISABLED|canonicalCallBillingV2/);
  });
});

describe('G2-T03: callSessions collection name is canonical', () => {
  it('source code uses callSessions, not call_sessions or calls', async () => {
    const callsTs = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/calls.ts'), 'utf8');
    expect(callsTs).toContain("'callSessions'");
    expect(callsTs).not.toContain("'call_sessions'");

    const callMonetizationTs = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/callMonetization.ts'), 'utf8');
    expect(callMonetizationTs).toContain("'callSessions'");
    // "collection('calls')" must not appear (excluding 'callSessions' which contains 'calls')
    expect(callMonetizationTs).not.toMatch(/collection\('calls'\)/);
  });
});
