'use client';

/**
 * Follow / Unfollow Button Component
 * Pink "Follow" when not following, grey "Following" when following.
 * Writes to Firestore `follows` collection.
 */

import React, { useState, useCallback } from 'react';
import {
  followUser,
  unfollowUser,
} from '@/lib/services/feedInteractionService';

interface FollowButtonProps {
  currentUserId: string | null;
  targetUserId: string;
  initialFollowing: boolean;
  onFollowChange?: (targetUserId: string, isFollowing: boolean) => void;
}

export default function FollowButton({
  currentUserId,
  targetUserId,
  initialFollowing,
  onFollowChange,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  // Don't render follow button for own profile or when not logged in
  if (!currentUserId || currentUserId === targetUserId) {
    return null;
  }

  const handleToggle = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);

    try {
      if (wasFollowing) {
        await unfollowUser(currentUserId!, targetUserId);
      } else {
        await followUser(currentUserId!, targetUserId);
      }
      onFollowChange?.(targetUserId, !wasFollowing);
    } catch (error) {
      // Revert on failure
      console.error('[FollowButton] Toggle failed:', error);
      setIsFollowing(wasFollowing);
    } finally {
      setLoading(false);
    }
  }, [loading, isFollowing, currentUserId, targetUserId, onFollowChange]);

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`
        px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed
        ${
          isFollowing
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            : 'bg-gradient-to-r from-pink-500 to-pink-600 text-white hover:from-pink-600 hover:to-pink-700 shadow-sm'
        }
      `}
    >
      {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
