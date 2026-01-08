/**
 * PACK 80 — Paid Media Hooks
 * React hooks for paid media functionality
 */

import { useState, useEffect, useCallback } from 'react';
import {
  sendPaidMedia,
  unlockPaidMedia,
  checkUnlockStatus,
  getPaidMediaMessage,
  getChatPaidMedia,
  subscribeToUnlockStatus,
  canAffordUnlock,
} from '../services/paidMediaService';
import {
  PaidMediaMessage,
  SendPaidMediaRequest,
  SendPaidMediaResponse,
  UnlockPaidMediaResponse,
  UploadProgress,
  PaidMediaType,
  UsePaidMediaReturn,
  UsePaidMediaAccessReturn,
  UsePaidMediaListReturn,
} from '../types/paidMedia';
import { getAuth } from 'firebase/auth';

// ============================================================================
// MAIN HOOK - usePaidMedia
// ============================================================================

/**
 * Main hook for paid media operations
 */
export function usePaidMedia(chatId: string): UsePaidMediaReturn {
  const auth = getAuth();
  const user = auth.currentUser;
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMedia = useCallback(
    async (params: SendPaidMediaRequest): Promise<SendPaidMediaResponse> => {
      if (!user) {
        return {
          success: false,
          error: 'User not authenticated',
        };
      }

      setIsLoading(true);
      setError(null);
      setUploadProgress({
        mediaId: `temp_${Date.now()}`,
        progress: 0,
        status: 'uploading',
      });

      const tempMediaId = `temp_${Date.now()}`;
      
      try {
        const result = await sendPaidMedia(
          {
            ...params,
            chatId,
            onProgress: (progress) => {
              setUploadProgress({
                mediaId: tempMediaId,
                progress,
                status: progress < 100 ? 'uploading' : 'processing',
              });
            },
          },
          user.uid
        );

        if (result.success) {
          setUploadProgress({
            mediaId: result.mediaId || '',
            progress: 100,
            status: 'complete',
          });
        } else {
          setUploadProgress({
            mediaId: tempMediaId,
            progress: 0,
            status: 'failed',
            error: result.error,
          });
          setError(result.error || 'Failed to send media');
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to send paid media';
        setError(errorMessage);
        setUploadProgress({
          mediaId: tempMediaId,
          progress: 0,
          status: 'failed',
          error: errorMessage,
        });
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [user, chatId]
  );

  const unlockMedia = useCallback(
    async (mediaId: string): Promise<UnlockPaidMediaResponse> => {
      if (!user) {
        return {
          success: false,
          error: 'User not authenticated',
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await unlockPaidMedia(mediaId, chatId, user.uid);

        if (!result.success) {
          setError(result.error || 'Failed to unlock media');
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to unlock media';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [user, chatId]
  );

  const checkAccess = useCallback(
    async (mediaId: string): Promise<boolean> => {
      if (!user) return false;

      try {
        return await checkUnlockStatus(user.uid, mediaId);
      } catch (error) {
        console.error('[usePaidMedia] Error checking unlock status:', error);
        return false;
      }
    },
    [user]
  );

  return {
    sendPaidMedia: sendMedia,
    unlockPaidMedia: unlockMedia,
    checkUnlockStatus: checkAccess,
    uploadProgress,
    isLoading,
    error,
  };
}

// ============================================================================
// HOOK - usePaidMediaAccess
// ============================================================================

/**
 * Hook to check and manage access to a specific paid media
 */
export function usePaidMediaAccess(
  mediaId: string,
  chatId: string
): UsePaidMediaAccessReturn {
  const auth = getAuth();
  const user = auth.currentUser;
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);

  const checkAccess = useCallback(async () => {
    if (!user || !mediaId) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    try {
      const unlocked = await checkUnlockStatus(user.uid, mediaId);
      setIsUnlocked(unlocked);

      // If unlocked, get the media URL
      if (unlocked) {
        const media = await getPaidMediaMessage(mediaId);
        if (media) {
          setMediaUrl(media.mediaUrl);
        }
      }
    } catch (error) {
      console.error('[usePaidMediaAccess] Error checking access:', error);
    } finally {
      setIsChecking(false);
    }
  }, [user, mediaId]);

  // Check access on mount and when dependencies change
  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Subscribe to unlock status changes
  useEffect(() => {
    if (!user || !mediaId) return;

    const unsubscribe = subscribeToUnlockStatus(
      user.uid,
      mediaId,
      (unlocked) => {
        setIsUnlocked(unlocked);
        if (unlocked) {
          // Fetch media URL when unlocked
          getPaidMediaMessage(mediaId).then((media) => {
            if (media) {
              setMediaUrl(media.mediaUrl);
            }
          });
        }
      }
    );

    return () => unsubscribe();
  }, [user, mediaId]);

  return {
    isUnlocked,
    isChecking,
    checkAccess,
    mediaUrl,
  };
}

// ============================================================================
// HOOK - usePaidMediaList
// ============================================================================

/**
 * Hook to get list of paid media in a chat
 */
export function usePaidMediaList(chatId: string): UsePaidMediaListReturn {
  const [paidMediaMessages, setPaidMediaMessages] = useState<PaidMediaMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    if (!chatId) return;

    setIsLoading(true);
    setError(null);

    try {
      const media = await getChatPaidMedia(chatId);
      setPaidMediaMessages(media);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load paid media';
      setError(errorMessage);
      console.error('[usePaidMediaList] Error loading media:', err);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  return {
    paidMediaMessages,
    isLoading,
    error,
    refresh: loadMedia,
  };
}

// ============================================================================
// HOOK - usePaidMediaAffordability
// ============================================================================

/**
 * Hook to check if user can afford to unlock media
 */
export function usePaidMediaAffordability(priceTokens: number) {
  const auth = getAuth();
  const user = auth.currentUser;
  const [canAfford, setCanAfford] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setCanAfford(false);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    canAffordUnlock(user.uid, priceTokens)
      .then((affordable) => {
        setCanAfford(affordable);
      })
      .catch((error) => {
        console.error('[usePaidMediaAffordability] Error checking affordability:', error);
        setCanAfford(false);
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [user, priceTokens]);

  return {
    canAfford,
    isChecking,
  };
}

// ============================================================================
// HOOK - usePaidMediaMessage
// ============================================================================

/**
 * Hook to get a specific paid media message
 */
export function usePaidMediaMessage(mediaId: string) {
  const [message, setMessage] = useState<PaidMediaMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    getPaidMediaMessage(mediaId)
      .then((media) => {
        setMessage(media);
      })
      .catch((err: any) => {
        const errorMessage = err.message || 'Failed to load media';
        setError(errorMessage);
        console.error('[usePaidMediaMessage] Error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [mediaId]);

  return {
    message,
    isLoading,
    error,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  usePaidMedia,
  usePaidMediaAccess,
  usePaidMediaList,
  usePaidMediaAffordability,
  usePaidMediaMessage,
};