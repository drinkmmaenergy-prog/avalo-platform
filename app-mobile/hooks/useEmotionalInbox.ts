import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getEmotionalInboxSummaries,
  refreshEmotionalInbox,
  EmotionalSummary,
} from '../services/emotionalInboxService';

interface UseEmotionalInboxReturn {
  loading: boolean;
  summaries: EmotionalSummary[];
  refresh: () => Promise<void>;
}

/**
 * Hook to manage emotional inbox data
 */
export function useEmotionalInbox(chats: any[]): UseEmotionalInboxReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<EmotionalSummary[]>([]);

  const loadSummaries = useCallback(async () => {
    if (!user?.uid || chats.length === 0) {
      setLoading(false);
      setSummaries([]);
      return;
    }

    try {
      setLoading(true);
      const data = await getEmotionalInboxSummaries(user.uid, chats);
      setSummaries(data);
    } catch (error) {
      console.error('Error loading emotional inbox summaries:', error);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, chats]);

  const refresh = useCallback(async () => {
    if (!user?.uid || chats.length === 0) {
      return;
    }

    try {
      setLoading(true);
      const data = await refreshEmotionalInbox(user.uid, chats);
      setSummaries(data);
    } catch (error) {
      console.error('Error refreshing emotional inbox:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, chats]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  return {
    loading,
    summaries,
    refresh,
  };
}