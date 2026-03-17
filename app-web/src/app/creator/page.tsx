'use client';

/**
 * Earn with Avalo — Earner Dashboard
 *
 * earn_on is GLOBAL — not just for chat.
 * ANY user can be an earner. No isCreator gate.
 *
 * Surfaces: CHAT, CALL, VIDEO_CALL, TIPS, UNLOCK_MEDIA, LIVE_GIFTS,
 *           SUBSCRIPTION, CALENDAR_MEETING, EVENT_TICKET
 *
 * Firestore reads:
 *   - users/{uid} -> earn_on, earn_surfaces, earn_profile
 *   - creator_stats/{uid} -> messageCount
 *   - wallets/{uid} -> pending balance
 *
 * Firestore writes:
 *   - users/{uid} -> earn_on, earn_surfaces, earn_profile (via earnerService)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCreatorEarningsSummary, getCreatorAnalytics } from '@/lib/services/phase33';
import type { CreatorEarningsSummary, CreatorAnalyticsDashboard } from '@/types/phase33.types';
import {
  getEarnerSettings,
  setEarnOn,
  setEarnSurface,
  setEarnProfile,
  EARN_SURFACE_META,
  type EarnerSettings,
  type EarnSurfaceKey,
  type EarnProfile,
} from '@/lib/services/earnerService';
import {
  getCreatorMessageCount,
  getWalletData,
  type WalletData,
} from '@/lib/services/creatorService';
import { MONETIZATION_SPLITS } from '@/config/monetizationSplits';

// ============================================================================
// SURFACE SPLIT LOOKUP
// ============================================================================

function getSplitForSurface(surfaceKey: string): number {
  const splits = MONETIZATION_SPLITS as Record<string, { creator: number; avalo: number }>;
  const entry = splits[surfaceKey];
  return entry ? Math.round(entry.creator * 100) : 65;
}

// ============================================================================
// START EARNING CTA (for non-earners)
// ============================================================================

function StartEarningCTA({ onEnable, saving }: { onEnable: () => void; saving: boolean }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg text-center border border-gray-100">
        <div className="text-6xl mb-6">💰</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Earn with Avalo</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Start earning on Avalo by enabling earner mode. Monetize your chat, calls,
          tips, media, live streams, subscriptions, meetings, and events.
        </p>
        <button
          onClick={onEnable}
          disabled={saving}
          className="inline-flex items-center px-6 py-3 bg-pink-600 hover:bg-pink-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed text-white
                     font-medium rounded-lg transition"
        >
          {saving ? 'Enabling…' : '🚀 Start Earning with Avalo'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// EARN ON MASTER TOGGLE
// ============================================================================

function EarnOnMasterToggle({
  earnOn,
  onToggle,
  saving,
}: {
  earnOn: boolean;
  onToggle: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl shadow-md p-5 border border-pink-200">
      <div>
        <h3 className="font-bold text-gray-900 text-lg">Earn with Avalo</h3>
        <p className="text-sm text-gray-600 mt-1">
          {earnOn
            ? 'You are earning on Avalo. Toggle surfaces below to control what you monetize.'
            : 'Enable to start earning across all activated surfaces.'}
        </p>
      </div>
      <button
        onClick={onToggle}
        disabled={saving}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full
                    border-2 border-transparent transition-colors duration-200 ease-in-out
                    focus:outline-none ${earnOn ? 'bg-pink-600' : 'bg-gray-200'}
                    ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={earnOn}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow
                      ring-0 transition-transform duration-200 ease-in-out
                      ${earnOn ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

// ============================================================================
// SURFACE TOGGLES GRID
// ============================================================================

function SurfaceTogglesGrid({
  surfaces,
  earnOn,
  onToggleSurface,
  savingSurface,
}: {
  surfaces: Record<EarnSurfaceKey, boolean>;
  earnOn: boolean;
  onToggleSurface: (surface: EarnSurfaceKey) => void;
  savingSurface: EarnSurfaceKey | null;
}) {
  const surfaceKeys = Object.keys(EARN_SURFACE_META) as EarnSurfaceKey[];

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-1">Monetization Surfaces</h3>
      <p className="text-sm text-gray-500 mb-4">
        Toggle each surface you want to monetize. Your split percentage is shown for each.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {surfaceKeys.map((key) => {
          const meta = EARN_SURFACE_META[key];
          const isActive = surfaces[key];
          const splitPct = getSplitForSurface(meta.splitSurface);
          const isSaving = savingSurface === key;
          const disabled = !earnOn || isSaving;

          return (
            <div
              key={key}
              className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all
                ${isActive && earnOn
                  ? 'border-pink-400 bg-pink-50'
                  : 'border-gray-200 bg-gray-50'}
                ${disabled ? 'opacity-60' : ''}`}
            >
              <span className="text-3xl mb-2">{meta.icon}</span>
              <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
              <span className="text-xs text-gray-500 mt-0.5">{meta.description}</span>
              <span className="text-xs font-bold text-pink-700 mt-1">You keep {splitPct}%</span>
              <button
                onClick={() => onToggleSurface(key)}
                disabled={disabled}
                className={`mt-3 relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full
                            border-2 border-transparent transition-colors duration-200 ease-in-out
                            focus:outline-none ${isActive && earnOn ? 'bg-pink-600' : 'bg-gray-300'}
                            ${disabled ? 'cursor-not-allowed' : ''}`}
                role="switch"
                aria-checked={isActive}
                aria-label={`Toggle ${meta.label}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
                              ring-0 transition-transform duration-200 ease-in-out
                              ${isActive && earnOn ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// EARN PROFILE EDITOR
// ============================================================================

function EarnProfileEditor({
  profile,
  onSave,
  saving,
}: {
  profile: EarnProfile;
  onSave: (updates: Partial<EarnProfile>) => void;
  saving: boolean;
}) {
  const [chatPrice, setChatPrice] = useState(profile.chatPriceTokens);
  const [callRate, setCallRate] = useState(profile.callRatePerMin);
  const [subPrice, setSubPrice] = useState(profile.subscriptionPrice);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setChatPrice(profile.chatPriceTokens);
    setCallRate(profile.callRatePerMin);
    setSubPrice(profile.subscriptionPrice);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setDirty(false);
  }, [profile]);

  const handleChange = () => setDirty(true);

  const handleSave = () => {
    if (chatPrice < 100) {
      setError('Chat price must be at least 100 tokens');
      return;
    }
    if (callRate < 1) {
      setError('Call rate must be at least 1 token/min');
      return;
    }
    if (subPrice < 1) {
      setError('Subscription price must be at least 1 token');
      return;
    }
    setError(null);
    onSave({
      chatPriceTokens: chatPrice,
      callRatePerMin: callRate,
      subscriptionPrice: subPrice,
      displayName,
      bio,
    });
    setDirty(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-1">Earner Profile & Pricing</h3>
      <p className="text-sm text-gray-500 mb-4">
        Set how you appear as an earner and your pricing for each surface.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); handleChange(); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            placeholder="Your earner display name"
          />
        </div>
        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <input
            type="text"
            value={bio}
            onChange={(e) => { setBio(e.target.value); handleChange(); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            placeholder="Short earner bio"
          />
        </div>
        {/* Chat Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat Deposit Price</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={100}
              value={chatPrice}
              onChange={(e) => { setChatPrice(Number(e.target.value)); handleChange(); }}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-500">tokens (min 100)</span>
          </div>
        </div>
        {/* Call Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Call Rate</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={callRate}
              onChange={(e) => { setCallRate(Number(e.target.value)); handleChange(); }}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-500">tokens / min</span>
          </div>
        </div>
        {/* Subscription Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Subscription</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={subPrice}
              onChange={(e) => { setSubPrice(Number(e.target.value)); handleChange(); }}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-500">tokens / month</span>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-5 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300
                     disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EarnWithAvaloPage() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<CreatorEarningsSummary | null>(null);
  const [analytics, setAnalytics] = useState<CreatorAnalyticsDashboard | null>(null);
  const [earnerSettings, setEarnerSettings] = useState<EarnerSettings | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingEarnOn, setSavingEarnOn] = useState(false);
  const [savingSurface, setSavingSurface] = useState<EarnSurfaceKey | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        setLoading(true);
        const [earningsData, analyticsData, settingsData, walletData, msgCount] =
          await Promise.all([
            getCreatorEarningsSummary(user.uid).catch(() => null),
            getCreatorAnalytics(user.uid, 'week').catch(() => null),
            getEarnerSettings(user.uid),
            getWalletData(user.uid).catch(() => null),
            getCreatorMessageCount(user.uid).catch(() => 0),
          ]);
        setEarnings(earningsData);
        setAnalytics(analyticsData);
        setEarnerSettings(settingsData);
        setWallet(walletData);
        setMessageCount(msgCount);
      } catch (err: any) {
        setError(err.message || 'Failed to load earnings');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleToggleEarnOn = useCallback(async () => {
    if (!user || !earnerSettings) return;
    const newValue = !earnerSettings.earn_on;
    setSavingEarnOn(true);
    try {
      await setEarnOn(user.uid, newValue);
      setEarnerSettings((prev) =>
        prev ? { ...prev, earn_on: newValue } : prev
      );
    } catch {
      /* toast / ignore */
    } finally {
      setSavingEarnOn(false);
    }
  }, [user, earnerSettings]);

  const handleEnableEarnOn = useCallback(async () => {
    if (!user) return;
    setSavingEarnOn(true);
    try {
      await setEarnOn(user.uid, true);
      setEarnerSettings((prev) =>
        prev ? { ...prev, earn_on: true } : prev
      );
    } catch {
      /* toast / ignore */
    } finally {
      setSavingEarnOn(false);
    }
  }, [user]);

  const handleToggleSurface = useCallback(
    async (surface: EarnSurfaceKey) => {
      if (!user || !earnerSettings) return;
      const newValue = !earnerSettings.earn_surfaces[surface];
      setSavingSurface(surface);
      try {
        await setEarnSurface(user.uid, surface, newValue);
        setEarnerSettings((prev) =>
          prev
            ? {
                ...prev,
                earn_surfaces: { ...prev.earn_surfaces, [surface]: newValue },
              }
            : prev
        );
      } catch {
        /* toast / ignore */
      } finally {
        setSavingSurface(null);
      }
    },
    [user, earnerSettings],
  );

  const handleSaveProfile = useCallback(
    async (updates: Partial<EarnProfile>) => {
      if (!user) return;
      setSavingProfile(true);
      try {
        await setEarnProfile(user.uid, updates);
        setEarnerSettings((prev) =>
          prev
            ? {
                ...prev,
                earn_profile: { ...prev.earn_profile, ...updates },
              }
            : prev
        );
      } catch {
        /* toast */
      } finally {
        setSavingProfile(false);
      }
    },
    [user],
  );

  // ── Loading state ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Earnings</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // ── Non-earner CTA ───────────────────────────────────────────────
  if (earnerSettings && !earnerSettings.earn_on) {
    return <StartEarningCTA onEnable={handleEnableEarnOn} saving={savingEarnOn} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Earn with Avalo</h1>
        <p className="text-gray-600 mt-1">Manage your earning surfaces, pricing, and payouts</p>
      </div>

      {/* Earn On Master Toggle */}
      {earnerSettings && (
        <EarnOnMasterToggle
          earnOn={earnerSettings.earn_on}
          onToggle={handleToggleEarnOn}
          saving={savingEarnOn}
        />
      )}

      {/* Surface Toggles Grid */}
      {earnerSettings && (
        <SurfaceTogglesGrid
          surfaces={earnerSettings.earn_surfaces}
          earnOn={earnerSettings.earn_on}
          onToggleSurface={handleToggleSurface}
          savingSurface={savingSurface}
        />
      )}

      {/* Earn Profile Editor */}
      {earnerSettings && (
        <EarnProfileEditor
          profile={earnerSettings.earn_profile}
          onSave={handleSaveProfile}
          saving={savingProfile}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Earned */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">💰</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">All Time</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(earnings?.totalTokensEarnedAllTime || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Tokens Earned</div>
        </div>

        {/* Available for Payout */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-md p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">✅</span>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Available</span>
          </div>
          <div className="text-2xl font-bold text-green-800">
            {(earnings?.availableForPayout || 0).toLocaleString()}
          </div>
          <div className="text-sm text-green-700 mt-1">Ready for Payout</div>
        </div>

        {/* Pending Balance (from wallets/{uid}) */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">⏳</span>
            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">Pending</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(wallet?.pending ?? earnings?.pendingTokens ?? 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Pending Clearance</div>
          <div className="text-xs text-gray-400 mt-2">7-day hold period</div>
        </div>

        {/* Messages Count (from creator_stats/{uid}) */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">💬</span>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">Messages</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {messageCount.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Paid Messages Received</div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <a
            href="/creator/payouts"
            className="inline-flex items-center px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium rounded-lg transition"
          >
            💳 Request Payout
          </a>
          <a
            href="/creator/stripe"
            className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition"
          >
            🔗 Stripe Connect
          </a>
          <a
            href="/creator/analytics"
            className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition"
          >
            📊 View Analytics
          </a>
        </div>
      </div>

      {/* Earnings Breakdown (if analytics available) */}
      {analytics && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Earnings Breakdown (This Week)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(analytics.earningsBySource).map(([source, tokens]) => (
              <div key={source} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">
                  {tokens.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 capitalize mt-1">{source}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Split Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-900">Revenue Split</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your earnings split depends on the surface: Chat/Calls/Tips 65%, Subscriptions 70%,
              Meetings/Events 80%. Minimum payout: 1,000 tokens.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
