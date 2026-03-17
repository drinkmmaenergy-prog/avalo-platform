"use client";

/**
 * Earner Service — Canonical "Earn with Avalo" Service Layer
 *
 * earn_on is a GLOBAL flag — not just for chat.
 * earn_on = true means user can earn on ALL monetization surfaces they activate.
 * earner != creator only — ANY user can be an earner.
 *
 * Firestore data model (users/{uid}):
 *   earn_on: boolean              — master toggle
 *   earn_surfaces: EarnSurfaces   — per-surface toggles
 *   earn_profile: EarnProfile     — earner display + pricing
 *
 * Backward compatibility:
 *   - Writes modes.earnFromChat alongside earn_on for chat compat
 *   - Writes earnOn (legacy field) alongside earn_on
 */

import { requireDb } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ============================================================================
// TYPES — Canonical earn_on data structure
// ============================================================================

/**
 * Surfaces covered by earn_on:
 * CHAT, CALL, VIDEO_CALL, TIPS, UNLOCK_MEDIA, LIVE_GIFTS,
 * SUBSCRIPTION, CALENDAR_MEETING, EVENT_TICKET
 */
export interface EarnSurfaces {
  chat: boolean;           // earn from chat messages
  calls: boolean;          // earn from voice/video calls
  tips: boolean;           // accept tips
  media: boolean;          // sell locked media/PPV
  live: boolean;           // earn from live gifts
  subscription: boolean;   // sell subscriptions
  meetings: boolean;       // sell calendar meetings
  events: boolean;         // sell event tickets
}

export interface EarnProfile {
  displayName: string;        // how they appear as earner
  bio: string;
  chatPriceTokens: number;    // tokens per deposit (min 100)
  callRatePerMin: number;     // tokens per minute on calls
  subscriptionPrice: number;  // monthly subscription tokens
}

export interface EarnerSettings {
  earn_on: boolean;
  earn_surfaces: EarnSurfaces;
  earn_profile: EarnProfile;
}

/**
 * Surface key type for programmatic access
 */
export type EarnSurfaceKey = keyof EarnSurfaces;

/**
 * Human-readable surface metadata for UI rendering
 */
export const EARN_SURFACE_META: Record<EarnSurfaceKey, {
  label: string;
  icon: string;
  splitSurface: string;
  description: string;
}> = {
  chat:         { label: 'Chat',          icon: '💬', splitSurface: 'CHAT',             description: 'Earn from paid messages' },
  calls:        { label: 'Calls',         icon: '📞', splitSurface: 'CALL',             description: 'Earn from voice & video calls' },
  tips:         { label: 'Tips',          icon: '💝', splitSurface: 'TIPS',             description: 'Accept tips from fans' },
  media:        { label: 'Media',         icon: '🔓', splitSurface: 'UNLOCK_MEDIA',     description: 'Sell locked media / PPV' },
  live:         { label: 'Live',          icon: '🎥', splitSurface: 'LIVE_GIFTS',       description: 'Earn from live stream gifts' },
  subscription: { label: 'Subscriptions', icon: '⭐', splitSurface: 'SUBSCRIPTION',     description: 'Sell monthly subscriptions' },
  meetings:     { label: 'Meetings',      icon: '📅', splitSurface: 'CALENDAR_MEETING', description: 'Sell calendar meetings' },
  events:       { label: 'Events',        icon: '🎫', splitSurface: 'EVENT_TICKET',     description: 'Sell event tickets' },
};

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_EARN_SURFACES: EarnSurfaces = {
  chat: true,
  calls: false,
  tips: true,
  media: false,
  live: false,
  subscription: false,
  meetings: false,
  events: false,
};

const DEFAULT_EARN_PROFILE: EarnProfile = {
  displayName: '',
  bio: '',
  chatPriceTokens: 100,
  callRatePerMin: 50,
  subscriptionPrice: 500,
};

// ============================================================================
// READ
// ============================================================================

/**
 * Get full earner settings from users/{uid}.
 * Returns earn_on, earn_surfaces, and earn_profile with defaults for missing fields.
 */
export async function getEarnerSettings(userId: string): Promise<EarnerSettings> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return {
        earn_on: false,
        earn_surfaces: { ...DEFAULT_EARN_SURFACES },
        earn_profile: { ...DEFAULT_EARN_PROFILE },
      };
    }

    const data = userSnap.data();

    // Read earn_on with fallback to legacy earnOn field
    const earn_on: boolean = data.earn_on ?? data.earnOn ?? false;

    // Read earn_surfaces with defaults
    const storedSurfaces = data.earn_surfaces ?? {};
    const earn_surfaces: EarnSurfaces = {
      chat:         storedSurfaces.chat ?? DEFAULT_EARN_SURFACES.chat,
      calls:        storedSurfaces.calls ?? DEFAULT_EARN_SURFACES.calls,
      tips:         storedSurfaces.tips ?? DEFAULT_EARN_SURFACES.tips,
      media:        storedSurfaces.media ?? DEFAULT_EARN_SURFACES.media,
      live:         storedSurfaces.live ?? DEFAULT_EARN_SURFACES.live,
      subscription: storedSurfaces.subscription ?? DEFAULT_EARN_SURFACES.subscription,
      meetings:     storedSurfaces.meetings ?? DEFAULT_EARN_SURFACES.meetings,
      events:       storedSurfaces.events ?? DEFAULT_EARN_SURFACES.events,
    };

    // Read earn_profile with defaults
    const storedProfile = data.earn_profile ?? {};
    const earn_profile: EarnProfile = {
      displayName:      storedProfile.displayName ?? data.displayName ?? DEFAULT_EARN_PROFILE.displayName,
      bio:              storedProfile.bio ?? data.bio ?? DEFAULT_EARN_PROFILE.bio,
      chatPriceTokens:  storedProfile.chatPriceTokens ?? data.chatPricePerToken ?? DEFAULT_EARN_PROFILE.chatPriceTokens,
      callRatePerMin:   storedProfile.callRatePerMin ?? DEFAULT_EARN_PROFILE.callRatePerMin,
      subscriptionPrice: storedProfile.subscriptionPrice ?? DEFAULT_EARN_PROFILE.subscriptionPrice,
    };

    return { earn_on, earn_surfaces, earn_profile };
  } catch (error) {
    console.error('Error getting earner settings:', error);
    throw error;
  }
}

// ============================================================================
// WRITE — Master Toggle
// ============================================================================

/**
 * Set earn_on master toggle.
 * Also writes backward-compatible fields:
 *   - earnOn (legacy)
 *   - modes.earnFromChat (chat engine compat)
 */
export async function setEarnOn(userId: string, enabled: boolean): Promise<void> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    await setDoc(userRef, {
      // Canonical field
      earn_on: enabled,
      // Backward-compatible fields
      earnOn: enabled,
      'modes.earnFromChat': enabled,
      updatedAt: serverTimestamp(),
    } as any, { merge: true });
  } catch (error) {
    console.error('Error setting earn_on:', error);
    throw error;
  }
}

// ============================================================================
// WRITE — Individual Surface Toggle
// ============================================================================

/**
 * Toggle individual surface on/off within earn_on=true.
 * If surface is 'chat', also writes modes.earnFromChat for backward compat.
 */
export async function setEarnSurface(
  userId: string,
  surface: EarnSurfaceKey,
  enabled: boolean
): Promise<void> {
  try {
    const userRef = doc(requireDb(), 'users', userId);

    const updatePayload: Record<string, any> = {
      [`earn_surfaces.${surface}`]: enabled,
      updatedAt: serverTimestamp(),
    };

    // Chat backward compat
    if (surface === 'chat') {
      updatePayload['modes.earnFromChat'] = enabled;
    }

    await setDoc(userRef, updatePayload as any, { merge: true });
  } catch (error) {
    console.error('Error setting earn surface:', error);
    throw error;
  }
}

// ============================================================================
// WRITE — Earn Profile
// ============================================================================

/**
 * Update earn profile fields.
 * Validates chatPriceTokens >= 100.
 * Also writes chatPricePerToken (legacy) for backward compatibility.
 */
export async function setEarnProfile(
  userId: string,
  profile: Partial<EarnProfile>
): Promise<void> {
  if (profile.chatPriceTokens !== undefined && profile.chatPriceTokens < 100) {
    throw new Error('Chat price must be at least 100 tokens');
  }

  try {
    const userRef = doc(requireDb(), 'users', userId);

    const updatePayload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    // Write each provided field under earn_profile
    if (profile.displayName !== undefined) {
      updatePayload['earn_profile.displayName'] = profile.displayName;
    }
    if (profile.bio !== undefined) {
      updatePayload['earn_profile.bio'] = profile.bio;
    }
    if (profile.chatPriceTokens !== undefined) {
      updatePayload['earn_profile.chatPriceTokens'] = profile.chatPriceTokens;
      // Backward compat
      updatePayload['chatPricePerToken'] = profile.chatPriceTokens;
    }
    if (profile.callRatePerMin !== undefined) {
      updatePayload['earn_profile.callRatePerMin'] = profile.callRatePerMin;
    }
    if (profile.subscriptionPrice !== undefined) {
      updatePayload['earn_profile.subscriptionPrice'] = profile.subscriptionPrice;
    }

    await setDoc(userRef, updatePayload as any, { merge: true });
  } catch (error) {
    console.error('Error setting earn profile:', error);
    throw error;
  }
}

// ============================================================================
// READ — Quick Check
// ============================================================================

/**
 * Check if user has earn_on === true.
 * Falls back to legacy earnOn field.
 */
export async function isEarner(userId: string): Promise<boolean> {
  try {
    const userRef = doc(requireDb(), 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return false;
    }

    const data = userSnap.data();
    return data.earn_on ?? data.earnOn ?? false;
  } catch (error) {
    console.error('Error checking earner status:', error);
    return false;
  }
}

// ============================================================================
// BULK WRITE — Set Multiple Surfaces at Once
// ============================================================================

/**
 * Set multiple surfaces at once (e.g., during onboarding).
 * Writes earn_on + earn_surfaces + backward-compat fields atomically.
 */
export async function setEarnOnWithSurfaces(
  userId: string,
  enabled: boolean,
  surfaces: Partial<EarnSurfaces>
): Promise<void> {
  try {
    const userRef = doc(requireDb(), 'users', userId);

    const updatePayload: Record<string, any> = {
      earn_on: enabled,
      earnOn: enabled,
      'modes.earnFromChat': enabled && (surfaces.chat ?? true),
      updatedAt: serverTimestamp(),
    };

    // Write each surface
    for (const [key, value] of Object.entries(surfaces)) {
      if (value !== undefined) {
        updatePayload[`earn_surfaces.${key}`] = value;
      }
    }

    await setDoc(userRef, updatePayload as any, { merge: true });
  } catch (error) {
    console.error('Error setting earn_on with surfaces:', error);
    throw error;
  }
}




