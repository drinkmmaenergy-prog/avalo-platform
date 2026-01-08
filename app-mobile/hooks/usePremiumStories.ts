/**
 * Premium Stories Hooks
 * React hooks for managing premium story state and interactions
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  fetchPremiumStories, 
  fetchMyPremiumStories,
  fetchUnlockedStories,
  unlockPremiumStory,
  checkStoryAccess,
  uploadPremiumStory,
  getStoryAnalytics,
} from '../services/premiumStoryService';
import type { 
  PremiumStoryFeedItem, 
  PremiumStory, 
  UnlockAccessInfo,
  PremiumStoryUploadData,
  UploadProgress,
} from '../types/premiumStories';

// ============================================================================
// FEED HOOK
// ============================================================================

export function usePremiumStories(userId: string) {
  const [stories, setStories] = useState<PremiumStoryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStories = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPremiumStories(userId);
      setStories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stories');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadStories();
  }, [loadStories]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  return {
    stories,
    loading,
    error,
    refreshing,
    refresh,
  };
}

// ============================================================================
// MY STORIES HOOK
// ============================================================================

export function useMyPremiumStories(userId: string) {
  const [stories, setStories] = useState<PremiumStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMyPremiumStories(userId);
      setStories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stories');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  return {
    stories,
    loading,
    error,
    reload: loadStories,
  };
}

// ============================================================================
// UNLOCKED STORIES HOOK
// ============================================================================

export function useUnlockedStories(userId: string) {
  const [stories, setStories] = useState<PremiumStoryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUnlockedStories(userId);
      setStories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load unlocked stories');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  return {
    stories,
    loading,
    error,
    reload: loadStories,
  };
}

// ============================================================================
// STORY ACCESS HOOK
// ============================================================================

export function usePremiumStoryAccess(userId: string, storyId: string) {
  const [access, setAccess] = useState<UnlockAccessInfo>({ hasAccess: false });
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number>(0);

  const checkAccess = useCallback(async () => {
    try {
      setLoading(true);
      const accessInfo = await checkStoryAccess(userId, storyId);
      setAccess(accessInfo);
      setCountdown(accessInfo.remainingSeconds || 0);
    } catch (err) {
      console.error('Failed to check access:', err);
      setAccess({ hasAccess: false });
    } finally {
      setLoading(false);
    }
  }, [userId, storyId]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Countdown timer
  useEffect(() => {
    if (!access.hasAccess || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setAccess({ hasAccess: false });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [access.hasAccess, countdown]);

  return {
    ...access,
    loading,
    countdown,
    refresh: checkAccess,
  };
}

// ============================================================================
// UNLOCK HOOK
// ============================================================================

export function useUnlockPremiumStory() {
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async (storyId: string) => {
    try {
      setUnlocking(true);
      setError(null);
      
      const result = await unlockPremiumStory(storyId);
      
      if (!result.success) {
        setError(result.error || 'Failed to unlock story');
        return false;
      }
      
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to unlock story');
      return false;
    } finally {
      setUnlocking(false);
    }
  }, []);

  return {
    unlock,
    unlocking,
    error,
    clearError: () => setError(null),
  };
}

// ============================================================================
// UPLOAD HOOK
// ============================================================================

export function useUploadPremiumStory() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (
    userId: string,
    data: PremiumStoryUploadData
  ): Promise<string | null> => {
    try {
      setUploading(true);
      setError(null);
      setProgress({
        progress: 0,
        stage: 'compressing',
        message: 'Preparing upload...',
      });
      
      const storyId = await uploadPremiumStory(userId, data, setProgress);
      
      setProgress({
        progress: 100,
        stage: 'complete',
        message: 'Story published!',
      });
      
      return storyId;
    } catch (err: any) {
      setError(err.message || 'Failed to upload story');
      setProgress(null);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(null);
    setError(null);
  }, []);

  return {
    upload,
    uploading,
    progress,
    error,
    reset,
  };
}

// ============================================================================
// ANALYTICS HOOK
// ============================================================================

export function useStoryAnalytics(storyId: string) {
  const [analytics, setAnalytics] = useState({
    viewCount: 0,
    unlockCount: 0,
    totalEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getStoryAnalytics(storyId);
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return {
    ...analytics,
    loading,
    error,
    reload: loadAnalytics,
  };
}

// ============================================================================
// COUNTDOWN TIMER FORMATTING
// ============================================================================

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s remaining`;
  } else {
    return `${secs}s remaining`;
  }
}