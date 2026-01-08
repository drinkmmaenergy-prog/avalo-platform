/**
 * useFanIdentity Hook
 * Pack 33-13: Unified Fan Identity Engine
 * 
 * React hook for consuming fan identity data in UI components
 * Provides localized labels and descriptions for relationship tags
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../lib/firebase';
import { useTranslation } from './useTranslation';
import {
  FanIdentityRecord,
  RelationshipTag,
  getFanIdentity,
} from '../services/fanIdentityService';

export interface UseFanIdentityResult {
  loading: boolean;
  error?: Error;

  fanIdentity: FanIdentityRecord | null;

  relationshipTag: RelationshipTag;
  relationshipLabel: string;          // localized "New", "Loyal fan", etc.
  relationshipDescription: string;    // short localized, safe text

  emotionalScore: number;

  // high-level "insight" copy like:
  // "You often visit this profile and reply quickly."
  highlightText: string;

  refresh: () => Promise<void>;
}

/**
 * Hook to get fan identity for a target user
 * @param targetUserId - The user being viewed (creator/other user)
 * @returns Fan identity data and metadata
 */
export function useFanIdentity(targetUserId: string | null): UseFanIdentityResult {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [fanIdentity, setFanIdentity] = useState<FanIdentityRecord | null>(null);

  /**
   * Load fan identity from storage
   */
  const loadFanIdentity = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      setFanIdentity(null);
      return;
    }

    // Get current user ID from Firebase auth
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      setFanIdentity(null);
      return;
    }

    const viewerId = currentUser.uid;

    // Don't load fan identity for viewing own profile
    if (viewerId === targetUserId) {
      setLoading(false);
      setFanIdentity(null);
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      const identity = await getFanIdentity(viewerId, targetUserId);
      setFanIdentity(identity);
    } catch (err) {
      console.error('[useFanIdentity] Error loading fan identity:', err);
      setError(err instanceof Error ? err : new Error('Failed to load fan identity'));
      setFanIdentity(null);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  /**
   * Refresh fan identity data
   */
  const refresh = useCallback(async () => {
    await loadFanIdentity();
  }, [loadFanIdentity]);

  // Load on mount and when targetUserId changes
  useEffect(() => {
    loadFanIdentity();
  }, [loadFanIdentity]);

  // Derive relationship tag (default to NEW if no data)
  const relationshipTag: RelationshipTag = fanIdentity?.relationshipTag || 'NEW';

  // Get localized relationship label
  const relationshipLabel = t(`fanIdentity.badge.${relationshipTag}`);

  // Get localized relationship description
  const relationshipDescription = t(`fanIdentity.desc.${relationshipTag}`);

  // Get emotional score (default to 0 if no data)
  const emotionalScore = fanIdentity?.emotionalScore || 0;

  // Generate highlight text based on activity patterns
  const highlightText = generateHighlightText(fanIdentity, t);

  return {
    loading,
    error,
    fanIdentity,
    relationshipTag,
    relationshipLabel,
    relationshipDescription,
    emotionalScore,
    highlightText,
    refresh,
  };
}

/**
 * Generate contextual highlight text based on fan activity
 */
function generateHighlightText(
  fanIdentity: FanIdentityRecord | null,
  t: (key: string) => string
): string {
  if (!fanIdentity) {
    return t('fanIdentity.highlight.newConnection');
  }

  const {
    totalChatMessagesSent,
    totalProfileViews,
    totalLiveJoins,
    totalPPVPurchases,
    totalAiCompanionSessions,
  } = fanIdentity;

  // Prioritize by engagement type

  // High engagement: LIVE + PPV
  if (totalLiveJoins >= 3 || totalPPVPurchases >= 2) {
    return t('fanIdentity.highlight.livesAndPpv');
  }

  // Regular engagement: chats + views
  if (totalChatMessagesSent >= 5 || totalProfileViews >= 10) {
    return t('fanIdentity.highlight.chatsAndViews');
  }

  // Quiet but consistent: views without many messages
  if (totalProfileViews >= 5 && totalChatMessagesSent < 3) {
    return t('fanIdentity.highlight.quietButPresent');
  }

  // AI companion users
  if (totalAiCompanionSessions >= 2) {
    return t('fanIdentity.highlight.chatsAndViews');
  }

  // New or minimal engagement
  return t('fanIdentity.highlight.newConnection');
}