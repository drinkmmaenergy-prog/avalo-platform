'use client';

/**
 * Reels Player Component
 * Vertical scroll player for short-form video reels.
 * Uses IntersectionObserver for auto-play/pause on scroll.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MessageCircle, Eye, Lock, Volume2, VolumeX } from 'lucide-react';
import { Reel } from '@/lib/types';
import { FeedUserProfile, togglePostLike, unlockPPVContent } from '@/lib/services/feedService';

interface ReelsPlayerProps {
  reels: Reel[];
  profiles: Record<string, FeedUserProfile>;
  currentUserId?: string | null;
}

export default function ReelsPlayer({
  reels,
  profiles,
  currentUserId,
}: ReelsPlayerProps) {
  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-black text-white rounded-lg">
        <div className="text-6xl mb-4">🎬</div>
        <h2 className="text-xl font-semibold">Reels</h2>
        <p className="text-gray-400 mt-2">No reels yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 px-1">
        Reels
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {reels.map((reel) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            profile={profiles[reel.userId] || null}
            currentUserId={currentUserId || null}
          />
        ))}
      </div>
    </div>
  );
}

interface ReelCardProps {
  reel: Reel;
  profile: FeedUserProfile | null;
  currentUserId: string | null;
}

function ReelCard({ reel, profile, currentUserId }: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(reel.likes || 0);

  const isPPV = reel.isPremium;

  // Auto-play/pause on visibility
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoRef.current?.play().catch(() => {});
          } else {
            videoRef.current?.pause();
          }
        });
      },
      { threshold: 0.6 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleLike = useCallback(async () => {
    if (!currentUserId) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await togglePostLike(reel.id, currentUserId);
    } catch {
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  }, [currentUserId, liked, reel.id]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  }, [muted]);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 relative w-48 aspect-[9/16] rounded-xl overflow-hidden bg-black group"
    >
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
            <Lock className="w-8 h-8 text-white mb-2" />
            <p className="text-white text-xs font-semibold">
              {reel.unlockPrice || 0} tokens
            </p>
          </div>
        </>
      ) : (
        <Link href={`/feed/reel/${reel.id}`} className="block w-full h-full">
          <video
            ref={videoRef}
            src={reel.videoUrl}
            poster={reel.thumbnailUrl || undefined}
            className="w-full h-full object-cover"
            loop
            muted={muted}
            playsInline
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </Link>
      )}

      {/* Overlay controls */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent z-10">
        {/* Author */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {profile?.photoURL ? (
            <Image
              src={profile.photoURL}
              alt=""
              width={20}
              height={20}
              className="w-5 h-5 rounded-full object-cover"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[8px] font-bold">
              {(profile?.displayName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-white text-[10px] font-medium truncate">
            {profile?.displayName || 'User'}
          </span>
        </div>

        {reel.caption && (
          <p className="text-white text-[10px] mb-1.5 line-clamp-2">
            {reel.caption}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-white/80 text-[10px]">
          <button
            onClick={(e) => {
              e.preventDefault();
              handleLike();
            }}
            className="flex items-center gap-0.5 hover:text-red-400 transition-colors"
          >
            <Heart
              className={`w-3 h-3 ${liked ? 'fill-red-500 text-red-500' : ''}`}
            />
            {likeCount}
          </button>
          <span className="flex items-center gap-0.5">
            <Eye className="w-3 h-3" />
            {reel.views || 0}
          </span>
          {!isPPV && (
            <button
              onClick={(e) => {
                e.preventDefault();
                toggleMute();
              }}
              className="ml-auto"
            >
              {muted ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
