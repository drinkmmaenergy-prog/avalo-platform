'use client';

/**
 * Stories Viewer Component
 * Horizontal carousel of active stories with full-screen viewer on click.
 * Reads from 'stories' collection via feedService.
 *
 * Extended: "+" button for user's own story → navigates to /create/story.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, ChevronLeft, ChevronRight, Lock, Plus } from 'lucide-react';
import { Story } from '@/lib/types';
import { FeedUserProfile, incrementStoryViews } from '@/lib/services/feedService';

interface StoriesViewerProps {
  stories: Story[];
  profiles: Record<string, FeedUserProfile>;
  currentUserId?: string | null;
}

export default function StoriesViewer({
  stories,
  profiles,
  currentUserId,
}: StoriesViewerProps) {
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStory = activeStoryIndex !== null ? stories[activeStoryIndex] : null;

  const openStory = useCallback(
    (index: number) => {
      setActiveStoryIndex(index);
      setProgress(0);

      const story = stories[index];
      if (story) {
        incrementStoryViews(story.id).catch(() => {});
      }
    },
    [stories]
  );

  const closeStory = useCallback(() => {
    setActiveStoryIndex(null);
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const goNext = useCallback(() => {
    if (activeStoryIndex === null) return;
    if (activeStoryIndex < stories.length - 1) {
      openStory(activeStoryIndex + 1);
    } else {
      closeStory();
    }
  }, [activeStoryIndex, stories.length, openStory, closeStory]);

  const goPrev = useCallback(() => {
    if (activeStoryIndex === null) return;
    if (activeStoryIndex > 0) {
      openStory(activeStoryIndex - 1);
    }
  }, [activeStoryIndex, openStory]);

  // Auto-advance timer
  useEffect(() => {
    if (activeStory === null) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const duration = (activeStory?.duration || 5) * 1000;
    const interval = 50;
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      elapsed += interval;
      setProgress((elapsed / duration) * 100);
      if (elapsed >= duration) {
        goNext();
      }
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeStory, goNext]);

  // Keyboard navigation
  useEffect(() => {
    if (activeStoryIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') closeStory();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStoryIndex, goNext, goPrev, closeStory]);

  // Group stories by userId for the carousel
  const storyUserIds = [...new Set(stories.map((s) => s.userId))];

  return (
    <>
      {/* Stories Carousel */}
      <div className="relative mb-6">
        <div className="flex gap-4 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          {/* "+" Button for own story */}
          {currentUserId && (
            <Link
              href="/create/story"
              className="flex-shrink-0 flex flex-col items-center gap-1 group"
            >
              <div className="w-16 h-16 rounded-full ring-2 ring-dashed ring-purple-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 overflow-hidden group-hover:scale-105 transition-transform flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30">
                <Plus className="w-7 h-7 text-purple-500" />
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[4rem]">
                Your Story
              </span>
            </Link>
          )}

          {/* User story avatars */}
          {storyUserIds.map((userId) => {
            const userStories = stories.filter((s) => s.userId === userId);
            const firstStory = userStories[0];
            const profile = profiles[userId];
            const firstIndex = stories.findIndex((s) => s.id === firstStory.id);

            return (
              <button
                key={userId}
                onClick={() => openStory(firstIndex)}
                className="flex-shrink-0 flex flex-col items-center gap-1 group"
              >
                <div className="w-16 h-16 rounded-full ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 overflow-hidden group-hover:scale-105 transition-transform">
                  {profile?.photoURL ? (
                    <Image
                      src={profile.photoURL}
                      alt={profile.displayName || 'Story'}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                      {(profile?.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[4rem]">
                  {profile?.displayName || 'User'}
                </span>
              </button>
            );
          })}

          {/* Show "+" even if no stories exist, to encourage creation */}
          {stories.length === 0 && !currentUserId && null}
        </div>
      </div>

      {/* Full-screen Story Viewer */}
      {activeStory && activeStoryIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
            {stories.map((_, idx) => (
              <div
                key={idx}
                className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear"
                  style={{
                    width:
                      idx < activeStoryIndex
                        ? '100%'
                        : idx === activeStoryIndex
                        ? `${progress}%`
                        : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={closeStory}
            className="absolute top-8 right-4 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Story Author */}
          <div className="absolute top-8 left-4 z-10 flex items-center gap-2">
            {profiles[activeStory.userId]?.photoURL && (
              <Image
                src={profiles[activeStory.userId].photoURL!}
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
            <span className="text-white text-sm font-medium">
              {profiles[activeStory.userId]?.displayName || 'User'}
            </span>
          </div>

          {/* Navigation areas */}
          <button
            onClick={goPrev}
            className="absolute left-0 top-0 bottom-0 w-1/3 z-[5]"
            aria-label="Previous story"
          />
          <button
            onClick={goNext}
            className="absolute right-0 top-0 bottom-0 w-1/3 z-[5]"
            aria-label="Next story"
          />

          {/* Story Content */}
          <div className="relative w-full max-w-md aspect-[9/16]">
            {activeStory.isPremium && currentUserId === null ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                <Lock className="w-12 h-12 text-white mb-4" />
                <p className="text-white text-lg font-semibold">Premium Story</p>
                <p className="text-gray-400 text-sm mt-1">
                  Unlock for {activeStory.unlockPrice || 0} tokens
                </p>
              </div>
            ) : activeStory.mediaType === 'video' ? (
              <video
                src={activeStory.mediaUrl}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <Image
                src={activeStory.mediaUrl}
                alt="Story"
                fill
                className="object-cover"
              />
            )}
          </div>

          {/* Arrow indicators */}
          {activeStoryIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 md:flex hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {activeStoryIndex < stories.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 md:flex hidden"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
