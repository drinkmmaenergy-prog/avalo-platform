'use client';

/**
 * Earn with Avalo — Creator Hub Dashboard
 *
 * earn_on is GLOBAL — not just for chat.
 * ANY user can be an earner. No isCreator gate.
 *
 * Surfaces: CHAT, CALL, VIDEO_CALL, TIPS, UNLOCK_MEDIA, LIVE_GIFTS,
 *           SUBSCRIPTION, CALENDAR_MEETING, EVENT_TICKET
 *
 * Firestore reads:
 *   - users/{uid} -> earn_on, earn_surfaces, earn_profile, discovery_settings
 *   - creator_stats/{uid} -> messageCount
 *   - wallets/{uid} -> pending balance
 *   - public_profiles/{uid} -> totalPosts, totalLikes, followerCount
 *
 * Firestore writes:
 *   - users/{uid} -> earn_on, earn_surfaces, earn_profile, discovery_settings (via earnerService)
 *
 * Sections:
 *   1. EARN STATUS — master ON/OFF toggle (green ON, grey OFF)
 *   2. EARNINGS OVERVIEW — this month, pending, available, payout button
 *   3. ACTIVE SURFACES — per-surface toggle switches
 *   4. CONTENT STATS — posts, likes, followers, create buttons
 *   5. DISCOVERY SETTINGS — radius slider, incognito, passport mode
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';
import { requireDb } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { toast } from '@/components/ui/Toaster';
import CreatorMediaSection, { type CreatorPhoto } from './CreatorMediaSection';
import EarningsFilters, {
  type EarningsFilterState,
  DEFAULT_EARNINGS_FILTERS,
  filterEarningsBySource,
} from './EarningsFilters';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Canonical payout rate imported from @/lib/economyConfig (TOKEN_PAYOUT_USD = 0.03) */

// ============================================================================
// TYPES — Discovery Settings
// ============================================================================

export interface DiscoverySettingsData {
  profileRadiusKm: number; // 0 = local only, up to 50000 = international
  incognitoMode: boolean;  // profile not shown in discover
  passportMode: boolean;   // allow international discovery
}

const DEFAULT_DISCOVERY_SETTINGS: DiscoverySettingsData = {
  profileRadiusKm: 50,
  incognitoMode: false,
  passportMode: false,
};

// ============================================================================
// TYPES — Content Stats
// ============================================================================

export interface ContentStatsData {
  totalPosts: number;
  totalLikes: number;
  followerCount: number;
}

const DEFAULT_CONTENT_STATS: ContentStatsData = {
  totalPosts: 0,
  totalLikes: 0,
  followerCount: 0,
};

// ============================================================================
// SERVICE HELPERS — Content Stats & Discovery Settings
// ============================================================================

async function getContentStats(userId: string): Promise<ContentStatsData> {
  try {
    const profileRef = doc(requireDb(), 'public_profiles', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return { ...DEFAULT_CONTENT_STATS };
    }

    const data = profileSnap.data();
    return {
      totalPosts: data.totalPosts ?? data.postCount ?? 0,
      totalLikes: data.totalLikes ?? data.likeCount ?? 0,
      followerCount: data.followerCount ?? data.followers ?? 0,
    };
  } catch (error) {
    console.error('Error getting content stats:', error);
    return { ...DEFAULT_CONTENT_STATS };
  }
}

async function getCreatorPhotos(userId: string): Promise<CreatorPhoto[]> {
  try {
    const profileRef = doc(requireDb(), 'public_profiles', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return [];
    }

    const data = profileSnap.data();
    const photos = data.photos;

    if (!Array.isArray(photos)) {
      return [];
    }

    return photos.map((p: any) => ({
      url: typeof p === 'string' ? p : p.url ?? '',
      caption: typeof p === 'string' ? '' : p.caption ?? '',
    }));
  } catch (error) {
    console.error('Error getting creator photos:', error);
    return [];
  }
}

async function getDiscoverySettings(userId: string): Promise<DiscoverySettingsData> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { ...DEFAULT_DISCOVERY_SETTINGS };
    }

    const data = userSnap.data();
    const stored = data.discovery_settings ?? {};
    return {
      profileRadiusKm: stored.profileRadiusKm ?? DEFAULT_DISCOVERY_SETTINGS.profileRadiusKm,
      // BUG 5 fix: read incognito from top-level users/{uid}.incognito
      // to share state with account page (both use the same Firestore path)
      incognitoMode: data.incognito ?? DEFAULT_DISCOVERY_SETTINGS.incognitoMode,
      passportMode: stored.passportMode ?? DEFAULT_DISCOVERY_SETTINGS.passportMode,
    };
  } catch (error) {
    console.error('Error getting discovery settings:', error);
    return { ...DEFAULT_DISCOVERY_SETTINGS };
  }
}

async function saveDiscoverySettings(
  userId: string,
  settings: Partial<DiscoverySettingsData>,
): Promise<void> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    const updatePayload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (settings.profileRadiusKm !== undefined) {
      updatePayload['discovery_settings.profileRadiusKm'] = settings.profileRadiusKm;
    }
    if (settings.incognitoMode !== undefined) {
      // BUG 5 fix: write incognito to top-level users/{uid}.incognito
      // to share state with account page (both use the same Firestore path)
      updatePayload['incognito'] = settings.incognitoMode;
    }
    if (settings.passportMode !== undefined) {
      updatePayload['discovery_settings.passportMode'] = settings.passportMode;
    }

    await setDoc(userRef, updatePayload as any, { merge: true });
  } catch (error) {
    console.error('Error saving discovery settings:', error);
    throw error;
  }
}

// ============================================================================
// SURFACE SPLIT LOOKUP
// ============================================================================

function getSplitForSurface(surfaceKey: string): number {
  const splits = MONETIZATION_SPLITS as Record<string, { creator: number; avalo: number }>;
  const entry = splits[surfaceKey];
  return entry ? Math.round(entry.creator * 100) : 65;
}

// ============================================================================
// HELPER — Token to USD conversion
// ============================================================================

function tokensToUsd(tokens: number): string {
  return (tokens * TOKEN_PAYOUT_USD).toFixed(2);
}

// ============================================================================
// HELPER — Radius label
// ============================================================================

function getRadiusLabel(km: number): string {
  if (km <= 50) return 'Local';
  if (km <= 500) return 'Regional';
  return 'International';
}

// ============================================================================
// SECTION 1: EARN STATUS CARD (ON/OFF toggle)
// ============================================================================

/** Info card explaining how creators earn — shown above StartEarningCTA when earn_on is null */
function CreatorWelcomeCard() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 max-w-lg mx-auto mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-3">How creators earn on Avalo</h2>
      <ul className="space-y-2 text-sm text-gray-700">
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">💬</span>
          <span><strong>Chat</strong> — fans pay per message</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">💝</span>
          <span><strong>Tips</strong> — supporters send tips anytime</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">🔒</span>
          <span><strong>Media</strong> — sell exclusive locked photos and videos</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">📹</span>
          <span><strong>Meetings</strong> — paid 1-on-1 video calls</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">🎫</span>
          <span><strong>Events</strong> — sell tickets to your live events</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-base leading-5">⭐</span>
          <span><strong>Subscriptions</strong> — monthly fan memberships</span>
        </li>
      </ul>
      <p className="mt-4 text-xs text-gray-500 leading-relaxed">
        Post photos regularly and engage with fans — treat your Avalo like Instagram.
      </p>
    </div>
  );
}

function StartEarningCTA({ onEnable, saving }: { onEnable: () => void; saving: boolean }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-lg w-full">
        {/* Creator welcome card */}
        <CreatorWelcomeCard />

        <div className="bg-white rounded-2xl shadow-lg p-10 text-center border border-gray-100">
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
    </div>
  );
}

function EarnStatusCard({
  earnOn,
  onToggle,
  saving,
  todayTokens,
  monthTokens,
}: {
  earnOn: boolean;
  onToggle: () => void;
  saving: boolean;
  todayTokens: number;
  monthTokens: number;
}) {
  return (
    <div
      className={`rounded-xl shadow-md p-6 border-2 transition-all ${
        earnOn
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Earn with Avalo</h2>
          {earnOn ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-green-700 font-medium">
                ✅ Earning is <span className="font-bold">ON</span>
              </p>
              <div className="flex gap-6 mt-2">
                <div>
                  <span className="text-xs text-gray-500">Today</span>
                  <p className="text-lg font-bold text-green-800">
                    {todayTokens.toLocaleString()} tokens
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">This Month</span>
                  <p className="text-lg font-bold text-green-800">
                    {monthTokens.toLocaleString()} tokens
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-1">
              Enable earning to start receiving tips and paid messages
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onToggle}
            disabled={saving}
            className={`relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full
                        border-2 border-transparent transition-colors duration-200 ease-in-out
                        focus:outline-none focus:ring-2 focus:ring-offset-2
                        ${earnOn ? 'bg-green-500 focus:ring-green-500' : 'bg-gray-300 focus:ring-gray-400'}
                        ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="switch"
            aria-checked={earnOn}
            aria-label="Toggle earning"
          >
            <span
              className={`pointer-events-none inline-block h-7 w-7 rounded-full bg-white shadow
                          ring-0 transition-transform duration-200 ease-in-out
                          ${earnOn ? 'translate-x-6' : 'translate-x-0'}`}
            />
          </button>
          <span className={`text-xs font-semibold ${earnOn ? 'text-green-700' : 'text-gray-400'}`}>
            {earnOn ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 2: EARNINGS OVERVIEW
// ============================================================================

function EarningsOverview({
  earnings,
  wallet,
}: {
  earnings: CreatorEarningsSummary | null;
  wallet: WalletData | null;
}) {
  const monthTokens = earnings?.totalTokensEarnedThisMonth ?? 0;
  const pendingTokens = wallet?.pending ?? earnings?.pendingTokens ?? 0;
  const availableTokens = earnings?.availableForPayout ?? 0;

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Earnings Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* This Month */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
          <span className="text-xs text-gray-500 uppercase tracking-wide">This Month</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {monthTokens.toLocaleString()} <span className="text-sm font-normal text-gray-500">tokens</span>
          </p>
          <p className="text-sm text-gray-600 mt-0.5">= ${tokensToUsd(monthTokens)} USD</p>
        </div>

        {/* Pending Settlement */}
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Pending Settlement</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {pendingTokens.toLocaleString()} <span className="text-sm font-normal text-gray-500">tokens</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">7-day hold period</p>
        </div>

        {/* Available for Payout */}
        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Available for Payout</span>
          <p className="text-2xl font-bold text-green-800 mt-1">
            {availableTokens.toLocaleString()} <span className="text-sm font-normal text-gray-500">tokens</span>
          </p>
          <p className="text-sm text-green-700 mt-0.5">= ${tokensToUsd(availableTokens)} USD</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Link
          href="/creator/payouts"
          className="inline-flex items-center px-5 py-2.5 bg-pink-600 hover:bg-pink-700
                     text-white font-medium rounded-lg transition shadow-sm"
        >
          💳 Request Payout
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 3: ACTIVE SURFACES (toggle switches)
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
      <h3 className="font-semibold text-gray-900 text-lg mb-1">Active Surfaces</h3>
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
// SECTION 4: CONTENT STATS
// ============================================================================

function ContentStatsSection({ stats }: { stats: ContentStatsData }) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Content Stats</h3>
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{stats.totalPosts.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Posts</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{stats.totalLikes.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Likes</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{stats.followerCount.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Followers</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/feed"
          className="inline-flex items-center px-4 py-2.5 bg-pink-600 hover:bg-pink-700
                     text-white font-medium rounded-lg transition"
        >
          ✏️ Create Post
        </Link>
        <Link
          href="/feed"
          className="inline-flex items-center px-4 py-2.5 bg-gray-100 hover:bg-gray-200
                     text-gray-800 font-medium rounded-lg transition"
        >
          🎬 Upload Reel
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 5: DISCOVERY SETTINGS
// ============================================================================

function DiscoverySettingsSection({
  settings,
  onUpdate,
  saving,
}: {
  settings: DiscoverySettingsData;
  onUpdate: (updates: Partial<DiscoverySettingsData>) => void;
  saving: boolean;
}) {
  const [radius, setRadius] = useState(settings.profileRadiusKm);

  useEffect(() => {
    setRadius(settings.profileRadiusKm);
  }, [settings.profileRadiusKm]);

  // Map slider value to km ranges: 0-50 = Local, 50-500 = Regional, 500+ = International
  const sliderToKm = (val: number): number => {
    if (val <= 33) return Math.round((val / 33) * 50);
    if (val <= 66) return Math.round(50 + ((val - 33) / 33) * 450);
    return Math.round(500 + ((val - 66) / 34) * 49500);
  };

  const kmToSlider = (km: number): number => {
    if (km <= 50) return Math.round((km / 50) * 33);
    if (km <= 500) return Math.round(33 + ((km - 50) / 450) * 33);
    return Math.round(66 + ((km - 500) / 49500) * 34);
  };

  const handleRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const km = sliderToKm(Number(e.target.value));
    setRadius(km);
  };

  const handleRadiusCommit = () => {
    onUpdate({ profileRadiusKm: radius });
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Discovery Settings</h3>

      {/* Radius Slider */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Earn-On Profile Radius
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={kmToSlider(radius)}
          onChange={handleRadiusChange}
          onMouseUp={handleRadiusCommit}
          onTouchEnd={handleRadiusCommit}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
          disabled={saving}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Local (0-50km)</span>
          <span>Regional (50-500km)</span>
          <span>International</span>
        </div>
        <p className="text-sm text-gray-700 mt-2 font-medium">
          Current: {radius} km — <span className="text-pink-600">{getRadiusLabel(radius)}</span>
        </p>
      </div>

      {/* Incognito Mode */}
      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-900">🕶️ Incognito Mode</p>
          <p className="text-xs text-gray-500">Profile not shown in Discover feed</p>
        </div>
        <button
          onClick={() => onUpdate({ incognitoMode: !settings.incognitoMode })}
          disabled={saving}
          className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full
                      border-2 border-transparent transition-colors duration-200 ease-in-out
                      focus:outline-none ${settings.incognitoMode ? 'bg-pink-600' : 'bg-gray-300'}
                      ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          role="switch"
          aria-checked={settings.incognitoMode}
          aria-label="Toggle incognito mode"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
                        ring-0 transition-transform duration-200 ease-in-out
                        ${settings.incognitoMode ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {/* Passport Mode */}
      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-900">🌍 Passport Mode</p>
          <p className="text-xs text-gray-500">Allow international discovery beyond your radius</p>
        </div>
        <button
          onClick={() => onUpdate({ passportMode: !settings.passportMode })}
          disabled={saving}
          className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full
                      border-2 border-transparent transition-colors duration-200 ease-in-out
                      focus:outline-none ${settings.passportMode ? 'bg-pink-600' : 'bg-gray-300'}
                      ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          role="switch"
          aria-checked={settings.passportMode}
          aria-label="Toggle passport mode"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
                        ring-0 transition-transform duration-200 ease-in-out
                        ${settings.passportMode ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// EARN PROFILE EDITOR (preserved from existing page)
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
  const [contentStats, setContentStats] = useState<ContentStatsData>(DEFAULT_CONTENT_STATS);
  const [discoverySettings, setDiscoverySettings] = useState<DiscoverySettingsData>(DEFAULT_DISCOVERY_SETTINGS);
  const [creatorPhotos, setCreatorPhotos] = useState<CreatorPhoto[]>([]);
  const [activeSurfaces, setActiveSurfaces] = useState<Record<string, boolean>>({});
  const [earningsFilters, setEarningsFilters] = useState<EarningsFilterState>(DEFAULT_EARNINGS_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingEarnOn, setSavingEarnOn] = useState(false);
  const [savingSurface, setSavingSurface] = useState<EarnSurfaceKey | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingDiscovery, setSavingDiscovery] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        setLoading(true);

        // 2.10: Read surfaces from users/{uid} on mount (both field names),
        // with earn_settings/{uid} as additional source of truth.
        const userDocSnap = await getDoc(doc(requireDb(), 'users', user.uid));
        const userData = userDocSnap.data();
        const userSurfaces = userData?.earnSurfaces ?? userData?.earn_surfaces ?? {};

        // Also read from earn_settings/{uid} and merge (earn_settings takes priority if present)
        let mergedSurfaces = { ...userSurfaces };
        try {
          const earnSettingsSnap = await getDoc(doc(requireDb(), 'earn_settings', user.uid));
          if (earnSettingsSnap.exists()) {
            const earnData = earnSettingsSnap.data();
            if (earnData?.surfaces) {
              mergedSurfaces = { ...mergedSurfaces, ...earnData.surfaces };
            }
          }
        } catch {
          // Non-critical: fallback to user doc surfaces
        }
        setActiveSurfaces(mergedSurfaces);

        const [earningsData, analyticsData, settingsData, walletData, msgCount, statsData, discData, photosData] =
          await Promise.all([
            getCreatorEarningsSummary(user.uid).catch(() => null),
            getCreatorAnalytics(user.uid, 'week').catch(() => null),
            getEarnerSettings(user.uid),
            getWalletData(user.uid).catch(() => null),
            getCreatorMessageCount(user.uid).catch(() => 0),
            getContentStats(user.uid).catch(() => ({ ...DEFAULT_CONTENT_STATS })),
            getDiscoverySettings(user.uid).catch(() => ({ ...DEFAULT_DISCOVERY_SETTINGS })),
            getCreatorPhotos(user.uid).catch(() => [] as CreatorPhoto[]),
          ]);
        setEarnings(earningsData);
        setAnalytics(analyticsData);
        setEarnerSettings(settingsData);
        setWallet(walletData);
        setMessageCount(msgCount);
        setContentStats(statsData);
        setDiscoverySettings(discData);
        setCreatorPhotos(photosData);
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
        // 2.10: Write to BOTH field names on users/{uid} for backward compat +
        // write to dedicated earn_settings/{uid} for persistence guarantee.
        const userRef = doc(requireDb(), 'users', user.uid);
        await updateDoc(userRef, {
          [`earnSurfaces.${surface}`]: newValue,
          [`earn_surfaces.${surface}`]: newValue,
        });

        // 2.10: Also write to earn_settings/{uid} (dedicated collection)
        const earnSettingsRef = doc(requireDb(), 'earn_settings', user.uid);
        await setDoc(earnSettingsRef, {
          [`surfaces.${surface}`]: newValue,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        setActiveSurfaces((prev) => ({ ...prev, [surface]: newValue }));
        setEarnerSettings((prev) =>
          prev
            ? {
                ...prev,
                earn_surfaces: { ...prev.earn_surfaces, [surface]: newValue },
              }
            : prev
        );
      } catch (err) {
        console.error('[CreatorPage] Failed to toggle surface:', surface, err);
        toast({
          type: 'error',
          title: 'Surface toggle failed',
          description: `Failed to update ${EARN_SURFACE_META[surface]?.label ?? surface}. Please try again.`,
        });
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

  const handleUpdateDiscovery = useCallback(
    async (updates: Partial<DiscoverySettingsData>) => {
      if (!user) return;
      setSavingDiscovery(true);
      try {
        await saveDiscoverySettings(user.uid, updates);
        setDiscoverySettings((prev) => ({ ...prev, ...updates }));
      } catch {
        /* toast */
      } finally {
        setSavingDiscovery(false);
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

  // ── Non-earner CTA — only shown when earn_on was never set (null/undefined) ──
  //    When earn_on === false, show dashboard with toggle OFF instead.
  if (earnerSettings && earnerSettings.earn_on == null) {
    return <StartEarningCTA onEnable={handleEnableEarnOn} saving={savingEarnOn} />;
  }

  // ── Compute today tokens from analytics daily data ───────────────
  const today = new Date().toISOString().slice(0, 10);
  const todayTokens =
    analytics?.dailyEarnings?.find((d) => d.date === today)?.tokens ?? 0;
  const monthTokens = earnings?.totalTokensEarnedThisMonth ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Creator Hub</h1>
        <p className="text-gray-600 mt-1">Manage your earning surfaces, pricing, payouts, and discovery</p>
      </div>

      {/* SECTION 1: Earn Status Card */}
      {earnerSettings && (
        <EarnStatusCard
          earnOn={earnerSettings.earn_on ?? false}
          onToggle={handleToggleEarnOn}
          saving={savingEarnOn}
          todayTokens={todayTokens}
          monthTokens={monthTokens}
        />
      )}

      {/* SECTION 2: Earnings Overview */}
      <EarningsOverview earnings={earnings} wallet={wallet} />

      {/* SECTION 3: Active Surfaces */}
      {earnerSettings && (
        <SurfaceTogglesGrid
          surfaces={earnerSettings.earn_surfaces}
          earnOn={earnerSettings.earn_on ?? false}
          onToggleSurface={handleToggleSurface}
          savingSurface={savingSurface}
        />
      )}

      {/* SECTION 4: Content Stats */}
      <ContentStatsSection stats={contentStats} />

      {/* SECTION 5: Discovery Settings */}
      <DiscoverySettingsSection
        settings={discoverySettings}
        onUpdate={handleUpdateDiscovery}
        saving={savingDiscovery}
      />

      {/* SECTION 6: Media / Photo Management */}
      {user && (
        <CreatorMediaSection
          userId={user.uid}
          photos={creatorPhotos}
          onPhotosChange={setCreatorPhotos}
        />
      )}

      {/* Earn Profile Editor (preserved) */}
      {earnerSettings && (
        <EarnProfileEditor
          profile={earnerSettings.earn_profile}
          onSave={handleSaveProfile}
          saving={savingProfile}
        />
      )}

      {/* Summary Cards (preserved) */}
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

      {/* Actions (preserved) */}
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

      {/* SECTION: My AI Companions */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">My AI Companions</h2>
          <a
            href="/creator/ai"
            className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition text-sm"
          >
            🤖 Manage AI Bots
          </a>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Create and manage AI companions that earn tokens when users chat with them.
        </p>
        <a
          href="/creator/ai"
          className="text-purple-600 hover:text-purple-700 text-sm font-medium"
        >
          View all AI companions →
        </a>
      </div>

      {/* Earnings Breakdown (preserved, with filters) */}
      {analytics && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Earnings Breakdown
          </h2>
          <EarningsFilters
            filters={earningsFilters}
            onFiltersChange={setEarningsFilters}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(
              filterEarningsBySource(analytics.earningsBySource, earningsFilters.surfaceFilter),
            ).map(([source, tokens]) => (
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

      {/* Revenue Split Notice (preserved) */}
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
