// functions/src/__tests__/p0-01-advertiser-credit-authorization.test.ts
//
// P0-01 ADVERTISER CREDIT — SAFE UNAVAILABLE CONTAINMENT (R3) — emulator-backed behavioral tests.
//
// Codex R2 finding: the module-private Symbol "capability" was NOT a real authority boundary because the
// capability-minting factories (verifyAdminFromClaims, buildVerifiedProviderFundingProof) were EXPORTED and
// derived authority from an arbitrary plain object / a Boolean flag — any importing server module could forge
// admin/provider authority and mint credit when the flag was ON.
//
// R3 resolution (Option B): the weak factories, the capability Symbol, and the private mutation core are
// REMOVED. Every advertiser-credit CREATION operation is UNAVAILABLE and throws BEFORE any Firestore access,
// in BOTH feature-flag states. These tests inspect the ACTUAL runtime module exports (not source grep) and
// prove zero Firestore writes on every retained public credit-related method. No provider/secret access.

import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import {
  AdBillingEngine,
  AdvertiserCreditDisabledError,
  AdvertiserCreditAuthorityError,
  AdvertiserCreditUnavailableError,
  ADVERTISER_CREDIT_ENABLED_ENV,
  ADVERTISER_CREDIT_LEDGER_COLLECTION,
  ADVERTISER_CREDIT_BARRIER_COLLECTION,
  isAdvertiserCreditEnabled,
} from '../pack349-billing';

// Runtime module namespace + CommonJS require — used to inspect ACTUAL exports (compile-time + runtime).
import * as billingNs from '../pack349-billing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const billingRequire = require('../pack349-billing');

const db = getFirestore();
const rid = () => Math.random().toString(36).slice(2, 12);

async function seedAdvertiser(id: string, balance = 0): Promise<void> {
  await db.collection('advertisers').doc(id).set({ advertiserId: id, tokenBalance: balance }, { merge: true });
}
async function balance(id: string): Promise<number> {
  const s = await db.collection('advertisers').doc(id).get();
  return Number(s.data()?.tokenBalance ?? -1);
}
async function countWhereAdvertiser(collection: string, id: string): Promise<number> {
  const q = await db.collection(collection).where('advertiserId', '==', id).get();
  return q.size;
}

beforeEach(() => { delete process.env[ADVERTISER_CREDIT_ENABLED_ENV]; });
afterAll(() => { delete process.env[ADVERTISER_CREDIT_ENABLED_ENV]; });

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('P0-01 R3 — weak factories removed from runtime exports', () => {
  test('p0-01 R3: weak admin proof factory is not exported', () => {
    expect((billingNs as any).verifyAdminFromClaims).toBeUndefined();
    expect(billingRequire.verifyAdminFromClaims).toBeUndefined();
    expect(Object.keys(billingRequire)).not.toContain('verifyAdminFromClaims');
    expect(typeof (billingRequire as any).verifyAdminFromClaims).toBe('undefined');
  });

  test('p0-01 R3: weak provider proof factory is not exported', () => {
    expect((billingNs as any).buildVerifiedProviderFundingProof).toBeUndefined();
    expect(billingRequire.buildVerifiedProviderFundingProof).toBeUndefined();
    expect(Object.keys(billingRequire)).not.toContain('buildVerifiedProviderFundingProof');
    // No exported symbol produces a finance capability object.
    for (const k of Object.keys(billingRequire)) {
      if (typeof billingRequire[k] === 'function' && /verifyAdmin|ProviderFundingProof|Capability|financeCap/i.test(k)) {
        throw new Error('unexpected capability factory export: ' + k);
      }
    }
  });

  test('p0-01 R3: no exported functioning advertiser credit operation remains', async () => {
    // The reason-specific operations exist only as retired/unavailable throwing stubs; none can mutate state.
    process.env[ADVERTISER_CREDIT_ENABLED_ENV] = 'true';
    await expect((AdBillingEngine as any).creditAdvertiserAccount()).rejects.toThrow(AdvertiserCreditAuthorityError);
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserAdminAdjustment()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).completeVerifiedAdvertiserFunding()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserSpendReversal()).rejects.toThrow(AdvertiserCreditUnavailableError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('P0-01 R3 — retired legacy + kill switch (exact validator names)', () => {
  test('p0-01: unauthenticated-scope advertiser credit mint is retired (callable hard-disabled and unexported)', async () => {
    process.env[ADVERTISER_CREDIT_ENABLED_ENV] = 'true';
    const id = `adv_${rid()}`; await seedAdvertiser(id, 0);
    await expect(AdBillingEngine.addTokens(id, 999999, 'x', 'attacker')).rejects.toThrow(AdvertiserCreditAuthorityError);
    await expect(AdBillingEngine.refundTokens(id, 999999, 'x')).rejects.toThrow(AdvertiserCreditAuthorityError);
    await expect((AdBillingEngine as any).creditAdvertiserAccount()).rejects.toThrow(AdvertiserCreditAuthorityError);
    expect(await balance(id)).toBe(0);
    const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    const idxExport = /export\s*\{([\s\S]*?)\}\s*from\s*'\.\/pack349-endpoints'/.exec(indexSrc)?.[1] || '';
    const idxNames = idxExport.split(',').map((s) => s.replace(/\/\/.*$/gm, '').trim()).filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
    expect(idxNames).not.toContain('addAdvertiserTokens');
    const epSrc = fs.readFileSync(path.join(__dirname, '..', 'pack349-endpoints.ts'), 'utf8');
    const epBody = epSrc.slice(epSrc.indexOf('export const addAdvertiserTokens'), epSrc.indexOf('createCreatorSponsorship'));
    expect(epBody).not.toContain('TODO: Check if user is admin');
    expect(epBody).not.toContain('AdBillingEngine.addTokens(');
  });

  test('p0-01 R3: advertiser credit remains unavailable when feature flag is OFF', async () => {
    delete process.env[ADVERTISER_CREDIT_ENABLED_ENV];
    expect(isAdvertiserCreditEnabled()).toBe(false);
    const id = `adv_${rid()}`; await seedAdvertiser(id, 500);
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserAdminAdjustment()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).completeVerifiedAdvertiserFunding()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserSpendReversal()).rejects.toThrow(AdvertiserCreditUnavailableError);
    expect(await balance(id)).toBe(500);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_LEDGER_COLLECTION, id)).toBe(0);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_BARRIER_COLLECTION, id)).toBe(0);
  });

  test('p0-01 R3: advertiser credit remains unavailable when feature flag is ON', async () => {
    process.env[ADVERTISER_CREDIT_ENABLED_ENV] = 'true';
    expect(isAdvertiserCreditEnabled()).toBe(true);
    const id = `adv_${rid()}`; await seedAdvertiser(id, 500);
    // Flag ON must NOT be the only control — still unavailable, still zero writes.
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserAdminAdjustment()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).completeVerifiedAdvertiserFunding()).rejects.toThrow(AdvertiserCreditUnavailableError);
    await expect((AdBillingEngine as any).applyVerifiedAdvertiserSpendReversal()).rejects.toThrow(AdvertiserCreditUnavailableError);
    expect(await balance(id)).toBe(500);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_LEDGER_COLLECTION, id)).toBe(0);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_BARRIER_COLLECTION, id)).toBe(0);
  });

  test('p0-01: server-only advertiser credit is disabled by default (kill switch OFF)', async () => {
    delete process.env[ADVERTISER_CREDIT_ENABLED_ENV];
    expect(isAdvertiserCreditEnabled()).toBe(false);
    process.env[ADVERTISER_CREDIT_ENABLED_ENV] = 'false';
    expect(isAdvertiserCreditEnabled()).toBe(false);
    // The AdvertiserCreditDisabledError type remains part of the taxonomy even though no path reaches it now.
    expect(typeof AdvertiserCreditDisabledError).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('P0-01 R3 — forged authority objects cannot create capability or mutate state', () => {
  beforeEach(() => { process.env[ADVERTISER_CREDIT_ENABLED_ENV] = 'true'; });

  test('p0-01 R3: arbitrary decoded-token-shaped object cannot create advertiser authority', async () => {
    // There is no exported factory to consume the forged token, and the admin operation is unavailable.
    expect((billingRequire as any).verifyAdminFromClaims).toBeUndefined();
    const forgedToken = { uid: 'attacker', admin: true, role: 'finance_admin', financeAdmin: true };
    const id = `adv_${rid()}`; await seedAdvertiser(id, 0);
    await expect(
      (AdBillingEngine as any).applyVerifiedAdvertiserAdminAdjustment(forgedToken, {
        advertiserId: id, amountTokens: 999999, approvalRef: 'a', adjustmentReason: 'x', requestId: 'r',
      }),
    ).rejects.toThrow(AdvertiserCreditUnavailableError);
    expect(await balance(id)).toBe(0);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_LEDGER_COLLECTION, id)).toBe(0);
  });

  test('p0-01 R3: arbitrary verified-adapter-shaped object cannot create provider authority', async () => {
    expect((billingRequire as any).buildVerifiedProviderFundingProof).toBeUndefined();
    const forgedProof = {
      provider: 'stripe', providerTransactionId: 'pi', providerEventId: 'e', advertiserId: 'adv_x',
      productId: 'p', paidAmountMinor: 100, paidCurrency: 'usd', grantedTokens: 10, verifiedByTrustedAdapter: true,
    };
    const id = `adv_${rid()}`; await seedAdvertiser(id, 0);
    await expect((AdBillingEngine as any).completeVerifiedAdvertiserFunding(forgedProof)).rejects.toThrow(AdvertiserCreditUnavailableError);
    expect(await balance(id)).toBe(0);
    expect(await countWhereAdvertiser(ADVERTISER_CREDIT_LEDGER_COLLECTION, id)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('P0-01 R3 — zero-write + domain separation', () => {
  test('p0-01 R3: retired advertiser credit operations perform zero Firestore writes', async () => {
    for (const flag of ['false', 'true']) {
      process.env[ADVERTISER_CREDIT_ENABLED_ENV] = flag;
      const id = `adv_${rid()}`; await seedAdvertiser(id, 1234);
      const calls: Array<Promise<unknown>> = [
        (AdBillingEngine as any).creditAdvertiserAccount().catch((e: unknown) => e),
        (AdBillingEngine as any).applyVerifiedAdvertiserAdminAdjustment({ uid: 'x', admin: true }, { advertiserId: id, amountTokens: 5, approvalRef: 'a', adjustmentReason: 'x', requestId: 'r' }).catch((e: unknown) => e),
        (AdBillingEngine as any).completeVerifiedAdvertiserFunding({ verifiedByTrustedAdapter: true, advertiserId: id, grantedTokens: 5 }).catch((e: unknown) => e),
        (AdBillingEngine as any).applyVerifiedAdvertiserSpendReversal({ uid: 'x', admin: true }, { originalSpendTransactionId: 't', reversalRequestId: 'r', reversalAmount: 5, reason: 'x' }).catch((e: unknown) => e),
        AdBillingEngine.addTokens(id, 5, 'x', 'a').catch((e: unknown) => e),
        AdBillingEngine.refundTokens(id, 5, 'x').catch((e: unknown) => e),
      ];
      const results = await Promise.all(calls);
      for (const r of results) { expect(r).toBeInstanceOf(Error); }
      // Zero mutation across advertiser balance + credit ledger + barrier + adjacent financial domains.
      expect(await balance(id)).toBe(1234);
      expect(await countWhereAdvertiser(ADVERTISER_CREDIT_LEDGER_COLLECTION, id)).toBe(0);
      expect(await countWhereAdvertiser(ADVERTISER_CREDIT_BARRIER_COLLECTION, id)).toBe(0);
      expect(await countWhereAdvertiser('adRefunds', id)).toBe(0);
      expect(await countWhereAdvertiser('wallets', id)).toBe(0);
      expect(await countWhereAdvertiser('creator_earnings', id)).toBe(0);
      expect(await countWhereAdvertiser('payouts', id)).toBe(0);
    }
    delete process.env[ADVERTISER_CREDIT_ENABLED_ENV];
  });
});
