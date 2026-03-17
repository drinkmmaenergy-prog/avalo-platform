'use client';

/**
 * PACK 323 - Reel Viewer Page (Web)
 * Full-screen reel player with auto-play, reads from 'reels' collection.
 * Like writes to post_likes/{reelId}/users/{uid}.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MessageCircle, Share2, X, Loader2, Lock } from 'lucide-react';

import { requireDb } from '@/lib/firebase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Reel } from '@/lib/types';
import {
  togglePostLike,
  checkPostLiked,
  fetchUserProfiles,
  incrementReelViews,
  unlockPPVContent,
  checkContentUnlocked,
  FeedUserProfile,
} from '@/lib/services/feedService';

export default function ReelViewerPage() {
  const params = useParams()!;
  const router = useRouter();
  const reelId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);
  const { firebaseUser } = useAuth();
  const currentUserId = firebaseUser?.uid || null;

  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<FeedUserProfile | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // ========================================================================
  // Load reel
  // ========================================================================
  useEffect(() => {
    loadReel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelId]);

  useEffect(() => {
    if (currentUserId && reelId) {
      checkPostLiked(reelId, currentUserId).then(setLiked).catch(() => {});
    }
  }, [currentUserId, reelId]);

  const loadReel = async () => {
    try {
      setLoading(true);
      const reelDoc = await getDoc(doc(requireDb(), 'reels', reelId));

      if (reelDoc.exists()) {
        const reelData = { id: reelDoc.id, ...reelDoc.data() } as Reel;
        setReel(reelData);
        setLikeCount(reelData.likes || 0);

        // Track view
        incrementReelViews(reelId).catch(() => {});

        // Fetch author profile
        const profiles = await fetchUserProfiles([reelData.userId]);
        setAuthorProfile(profiles[reelData.userId] || null);

        // Check unlock status for PPV
        if (reelData.isPremium && currentUserId) {
          const isUnlocked = await checkContentUnlocked(reelId, 'reel', currentUserId);
          setUnlocked(isUnlocked);
        }
      }
    } catch (error) {
      console.error('Error loading reel:', error);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // Like
  // ========================================================================
  const handleLike = useCallback(async () => {
    if (!currentUserId) return;

    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await togglePostLike(reelId, currentUserId);
    } catch (error) {
      console.error('Error liking reel:', error);
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  }, [currentUserId, liked, reelId]);

  // ========================================================================
  // Unlock PPV
  // ========================================================================
  const handleUnlock = useCallback(async () => {
    if (!currentUserId) return;
    setUnlocking(true);
    setUnlockError(null);

    try {
      const result = await unlockPPVContent(reelId, 'reel', currentUserId);
      if (result.success) {
        setUnlocked(true);
        // Reload to get the video URL
        loadReel();
      } else {
        setUnlockError(result.error || 'Failed to unlock');
      }
    } catch (error: any) {
      setUnlockError(error?.message || 'Failed to unlock');
    } finally {
      setUnlocking(false);
    }
  }, [currentUserId, reelId]);

  // ========================================================================
  // Playback
  // ========================================================================
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (!reel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
        <p className="mb-4">Reel not found</p>
        <button
          onClick={() => router.push('/feed')}
          className="px-6 py-2 bg-purple-600 rounded-lg hover:bg-purple-700"
        >
          Back to Feed
        </button>
      </div>
    );
  }

  const isPPV = reel.isPremium && !unlocked;
  const authorName = authorProfile?.displayName || 'User';

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center">
      {/* Video Player */}
      <div className="relative w-full max-w-md aspect-[9/16]">
        {isPPV ? (
          <>
            {reel.thumbnailUrl && (
              <Image
                src={reel.thumbnailUrl}
                alt="Locked reel"
                fill
                className="object-cover blur-xl scale-110"
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
              <Lock className="w-14 h-14 text-white mb-4" />
              <p className="text-white text-lg font-semibold mb-3">Premium Reel</p>
              <button
                onClick={handleUnlock}
                disabled={unlocking || !currentUserId}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 shadow-lg"
              >
                {unlocking
                  ? 'Unlocking...'
                  : `Unlock for ${reel.unlockPrice || 0} tokens`}
              </button>
              {unlockError && (
                <p className="mt-2 text-xs text-red-300">{unlockError}</p>
              )}
            </div>
          </>
        ) : (
          <video
            ref={videoRef}
            src={reel.videoUrl}
            className="w-full h-full object-cover"
            loop
            autoPlay
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlayPause}
          />
        )}

        {/* Overlay UI */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center pointer-events-auto">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
            {/* Author Info */}
            <div className="flex items-center gap-2 mb-3">
              <Link
                href={`/profile/${reel.userId}`}
                className="flex items-center gap-2"
              >
                {authorProfile?.photoURL ? (
                  <Image
                    src={authorProfile.photoURL}
                    alt={authorName}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                    {authorName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-white text-sm font-medium">
                  {authorName}
                  {authorProfile?.isVerified && (
                    <span className="ml-1 text-blue-400">✓</span>
                  )}
                </span>
              </Link>
            </div>

            {reel.caption && (
              <p className="text-white text-sm mb-4">{reel.caption}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-6 text-white">
              <button
                onClick={handleLike}
                disabled={!currentUserId}
                className="flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-50"
              >
                <Heart
                  className={`w-7 h-7 ${liked ? 'fill-red-500 text-red-500' : ''}`}
                />
                <span className="text-sm">{likeCount}</span>
              </button>
              <Link
                href={`/feed/post/${reel.id}`}
                className="flex items-center gap-2 hover:scale-110 transition-transform"
              >
                <MessageCircle className="w-7 h-7" />
                <span className="text-sm">{reel.comments || 0}</span>
              </Link>
              <button className="flex items-center gap-2 hover:scale-110 transition-transform">
                <Share2 className="w-7 h-7" />
              </button>
            </div>
          </div>

          {/* Play/Pause Overlay */}
          {!isPlaying && !isPPV && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-auto">
              <button
                onClick={togglePlayPause}
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-transform"
              >
                <span className="text-white text-3xl ml-1">▶</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
