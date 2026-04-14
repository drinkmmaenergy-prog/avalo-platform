import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 277 — Token Packs Configuration & Purchase Logic (USD-only)
 *
 * SOURCE OF TRUTH:
 * - Retail prices: Stripe Products/Prices (USD)
 * - Payout rate: TOKEN_PAYOUT_USD from config/economyConfig.ts
 *
 * IMPORTANT:
 * - Do NOT compute retail price from payout rate.
 * - Do NOT introduce PLN/EUR/GBP into backend logic.
 */

import { db, generateId, serverTimestamp } from "./init";
import { FieldValue } from "firebase-admin/firestore";
import { TokenPack, PurchaseResponse } from "./types/pack277-wallet.types";

export const DEFAULT_TOKEN_PACKS: Omit<TokenPack, "createdAt" | "updatedAt">[] = [
  { id: "mini",     name: "Mini",     tokens: 100,   priceUSD: 9.99,   active: true, order: 1 },
  { id: "basic",    name: "Basic",    tokens: 300,   priceUSD: 26.99,  active: true, order: 2 },
  { id: "standard", name: "Standard", tokens: 500,   priceUSD: 42.99,  active: true, order: 3, popularBadge: true },
  { id: "premium",  name: "Premium",  tokens: 1000,  priceUSD: 76.99,  active: true, order: 4 },
  { id: "pro",      name: "Pro",      tokens: 2000,  priceUSD: 147.99, active: true, order: 5 },
  { id: "elite",    name: "Elite",    tokens: 5000,  priceUSD: 353.99, active: true, order: 6 },
  { id: "royal",    name: "Royal",    tokens: 10000, priceUSD: 674.99, active: true, order: 7 },
];

export type CanonicalTokenPack = Omit<TokenPack, "createdAt" | "updatedAt">;

export function normalizeTokenPackId(id: string): string {
  return (id || "").trim().toLowerCase();
}

export const CANONICAL_TOKEN_PACKS_BY_ID: Readonly<Record<string, CanonicalTokenPack>> = Object.freeze(
  DEFAULT_TOKEN_PACKS.reduce<Record<string, CanonicalTokenPack>>((acc, pack) => {
    acc[pack.id] = pack;
    return acc;
  }, {})
);

export function getCanonicalTokenPackById(id: string): CanonicalTokenPack | null {
  const normalized = normalizeTokenPackId(id);
  return CANONICAL_TOKEN_PACKS_BY_ID[normalized] || null;
}

export async function initializeTokenPacks(): Promise<void> {
  const packsRef = db.collection("config").doc("tokenPacks");
  const packsDoc = await packsRef.get();

  if (!packsDoc.exists) {
    const packs: Record<string, TokenPack> = {};
    for (const pack of DEFAULT_TOKEN_PACKS) {
      packs[pack.id] = {
        ...pack,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
    }
    await packsRef.set({ packs, lastUpdated: serverTimestamp() });
    console.log("Token packs initialized");
  }
}

export async function getTokenPacks(): Promise<TokenPack[]> {
  const packsDoc = await db.collection("config").doc("tokenPacks").get();
  if (!packsDoc.exists) {
    await initializeTokenPacks();
    return getTokenPacks();
  }
  const data = packsDoc.data();
  const packs: TokenPack[] = Object.values(data?.packs || {});
  return packs.filter(p => p.active).sort((a, b) => a.order - b.order);
}

export async function getTokenPack(packId: string): Promise<TokenPack | null> {
  const packsDoc = await db.collection("config").doc("tokenPacks").get();
  const data = packsDoc.data();
  return data?.packs?.[packId] || null;
}

export async function recordPurchase(
  userId: string,
  packId: string,
  tokens: number,
  platform: string,
  paymentIntentId?: string,
  receiptData?: string
): Promise<PurchaseResponse> {
  const walletRef = db.collection("wallets").doc(userId);

  const result = await db.runTransaction(async (tx) => {
    const walletDoc = await tx.get(walletRef);
    const wallet = walletDoc.data();

    const beforeBalance = wallet?.tokensBalance || 0;
    const afterBalance = beforeBalance + tokens;

    if (wallet) {
      tx.update(walletRef, {
        tokensBalance: afterBalance,
        lifetimePurchasedTokens: FieldValue.increment(tokens),
        lastUpdated: serverTimestamp(),
      });
    } else {
      tx.set(walletRef, {
        userId,
        tokensBalance: afterBalance,
        lifetimePurchasedTokens: tokens,
        lifetimeSpentTokens: 0,
        lifetimeEarnedTokens: 0,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }
    return { beforeBalance, afterBalance };
  });

  const txId = generateId();
  await db.collection("walletTransactions").doc(txId).set({
    txId,
    userId,
    type: "PURCHASE",
    source: "STORE",
    amountTokens: tokens,
    beforeBalance: result.beforeBalance,
    afterBalance: result.afterBalance,
    metadata: { packId, paymentIntentId, receiptData, platform },
    timestamp: serverTimestamp(),
  });

  return { success: true, txId, newBalance: result.afterBalance, tokensAdded: tokens };
}
export async function validatePurchase(userId: string, packId: string, paymentIntentId?: string): Promise<{ valid: boolean; error?: string }> {
  return { valid: true };
}





















