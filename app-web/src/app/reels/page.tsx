'use client';

/**
 * FIX 64B — Reels Viewer Page
 * Full-screen vertical scroll reel viewer with snap scrolling.
 * Fetches reels from Firestore 'reels' collection, auto-plays on visibility,
 * and tracks view counts.
 *
 * Supports optional ?user= query param to filter reels by user.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';
import Image from 'next/image';
import { Heart, MessageCircle, Share2, Plus, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Reel } from '@/lib/types';
import {
  fetchReels,
  incrementReelViews,
  toggleLike,
  FeedFilters,
  PaginatedResult,
} from '@/lib/services/feedService';
import type { DocumentSnapshot } from 'firebase/firestore';

export default function ReelsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const filterUserId = searchParams?.get('user') ?? null;

  const [reels, setReels] = useState<Reel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewedReels = useRef<Set<string>>(new Set());

  // Load reels
  const loadReels = useCallback(async (append = false) => {
    try {
      const filters: FeedFilters = {};
      if (filterUserId) {
        filters.userId = filterUserId;
      }

      const result: PaginatedResult<Reel> = await fetchReels(
        append ? lastDoc : null,
        filters
      );

      if (append) {
        setReels((prev) => [...prev, ...result.items]);
      } else {
        setReels(result.items);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load reels:', error);
    } finally {
      setLoading(false);
    }
  }, [filterUserId, lastDoc]);

  useEffect(() => {
    loadReels(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId]);

  // Track views when currentIndex changes
  useEffect(() => {
    const reel = reels[currentIndex];
    if (reel?.id && !viewedReels.current.has(reel.id)) {
      viewedReels.current.add(reel.id);
      incrementReelViews(reel.id).catch(() => {});
    }
  }, [currentIndex, reels]);

  // Load more reels when near the end
  useEffect(() => {
    if (currentIndex >= reels.length - 3 && hasMore && !loading) {
      loadReels(true);
    }
  }, [currentIndex, reels.length, hasMore, loading, loadReels]);

  // Scroll snap detection
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const newIndex = Math.round(scrollTop / height);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reels.length) {
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, reels.length]);

  if (loading && reels.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🎬</div>
          <p>Loading reels...</p>
        </div>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <EmptyState
          icon="🎬"
          title="No reels yet"
          description="Create short videos to attract more followers!"
          actionLabel="Create Reel"
          actionHref="/create/reel"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-screen overflow-y-auto bg-black"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {reels.map((reel, i) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          isActive={i === currentIndex}
          currentUserId={user?.uid || null}
        />
      ))}

      {/* Create reel FAB */}
      <Link
        href="/create/reel"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
      >
        <Plus className="w-7 h-7 text-white" />
      </Link>
    </div>
  );
}

// ============================================================================
// Individual Reel Slide
// ============================================================================

interface ReelSlideProps {
  reel: Reel;
  isActive: boolean;
  currentUserId: string | null;
}

function ReelSlide({ reel, isActive, currentUserId }: ReelSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(reel.likes || 0);
  const [muted, setMuted] = useState(true);

  // Auto-play/pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isActive]);

  const handleLike = useCallback(async () => {
    if (!currentUserId) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await toggleLike(reel.id, currentUserId, 'reel');
    } catch {
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  }, [currentUserId, liked, reel.id]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/feed/reel/${reel.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Avalo', url });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [reel.id]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  }, [muted]);

  return (
    <div
      className="h-screen relative flex items-center justify-center bg-black"
      style={{ scrollSnapAlign: 'start' }}
    >
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="w-full h-full object-contain"
        loop
        muted={muted}
        playsInline
        preload="metadata"
        poster={reel.thumbnailUrl || undefined}
      />

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        className="absolute top-6 right-4 z-20 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Bottom overlay info */}
      <div className="absolute bottom-20 left-4 right-16 z-10">
        <Link
          href={`/profile/${reel.userId}`}
          className="flex items-center gap-2 mb-2"
        >
          {(reel as any).authorPhotoURL ? (
            <Image
              src={(reel as any).authorPhotoURL}
              alt=""
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">
              {((reel as any).authorName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-sm text-white drop-shadow">
            @{(reel as any).authorName || 'User'}
          </span>
        </Link>
        {reel.caption && (
          <p className="text-sm text-white drop-shadow line-clamp-3">
            {reel.caption}
          </p>
        )}
      </div>

      {/* Side action buttons */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <button onClick={handleLike} className="flex flex-col items-center">
          <Heart
            className={`w-7 h-7 ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`}
          />
          <span className="text-white text-xs mt-1">{likeCount}</span>
        </button>

        <Link href={`/feed/reel/${reel.id}`} className="flex flex-col items-center">
          <MessageCircle className="w-7 h-7 text-white" />
          <span className="text-white text-xs mt-1">{reel.comments || 0}</span>
        </Link>

        <button onClick={handleShare} className="flex flex-col items-center">
          <Share2 className="w-7 h-7 text-white" />
          <span className="text-white text-xs mt-1">Share</span>
        </button>
      </div>
    </div>
  );
}
