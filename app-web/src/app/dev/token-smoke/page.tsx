"use client";

import { useMemo, useState } from "react";
import { CANONICAL_TOKEN_PACKS, type CanonicalTokenPack } from "@/types/phase33.types";
import { createCheckoutSession } from "@/lib/api/tokens";

const ENABLED = process.env.NEXT_PUBLIC_ENABLE_TOKEN_SMOKE === "true";

export default function TokenSmokePage() {
  if (!ENABLED) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Token Purchase Smoke Test</h1>
        <p className="mt-3 text-sm text-gray-600">
          Unavailable. Set <code>NEXT_PUBLIC_ENABLE_TOKEN_SMOKE=true</code> to enable this dev-only page.
        </p>
      </main>
    );
  }

  return <TokenSmokeHarness />;
}

function TokenSmokeHarness() {
  const packs = useMemo(() => {
    return Object.values(CANONICAL_TOKEN_PACKS).sort((a, b) => a.tokens - b.tokens);
  }, []);

  const [selectedPackId, setSelectedPackId] = useState<string>(packs[0]?.packId ?? "MINI");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);

  const selectedPack = packs.find((p) => p.packId === selectedPackId) as CanonicalTokenPack;

  async function handleStartCheckout() {
    if (!selectedPack || loading) return;

    setLoading(true);
    setError(null);

    try {
      const origin = window.location.origin;
      const successUrl = `${origin}/wallet/success?session_id={CHECKOUT_SESSION_ID}&smoke=1`;
      const cancelUrl = `${origin}/dev/token-smoke?cancelled=1`;

      const result = await createCheckoutSession({
        packageId: selectedPack.packId,
        source: "web",
        successUrl,
        cancelUrl,
      });

      if (!result.success || !result.checkoutUrl) {
        setError(result.error || "Failed to create checkout session.");
        setLoading(false);
        return;
      }

      setLastSessionId(result.sessionId || null);
      window.location.href = result.checkoutUrl;
    } catch (e: any) {
      setError(e?.message || "Unexpected error while creating checkout session.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Dev-Only Token Purchase Smoke Test</h1>
      <p className="mt-2 text-sm text-gray-600">
        This page is for controlled smoke testing only. Checkout authority remains backend callable
        <code> tokens_createCheckoutSession</code>.
      </p>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Select Canonical Pack</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {packs.map((pack) => {
            const isSelected = pack.packId === selectedPackId;
            return (
              <button
                key={pack.packId}
                type="button"
                onClick={() => setSelectedPackId(pack.packId)}
                className={`rounded border px-3 py-2 text-left ${isSelected ? "border-black" : "border-gray-300"}`}
              >
                <div className="font-medium">{pack.packId}</div>
                <div className="text-sm text-gray-600">{pack.tokens.toLocaleString()} tokens</div>
                <div className="text-sm">${(pack.priceUSD / 100).toFixed(2)} USD</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <div className="text-sm">
          <div>
            Selected: <span className="font-medium">{selectedPack?.packId}</span>
          </div>
          <div>
            Tokens: <span className="font-medium">{selectedPack?.tokens.toLocaleString()}</span>
          </div>
          <div>
            Display price: <span className="font-medium">${((selectedPack?.priceUSD ?? 0) / 100).toFixed(2)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartCheckout}
          disabled={loading || !selectedPack}
          className="mt-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Creating checkout session..." : "Start Stripe Checkout (Smoke)"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {lastSessionId && (
          <p className="mt-3 text-sm text-gray-600">
            Last session id: <code>{lastSessionId}</code>
          </p>
        )}
      </section>
    </main>
  );
}
