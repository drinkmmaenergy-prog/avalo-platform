'use client';

/**
 * AI Companion Profile Page — /ai/profile/[avatarId]
 *
 * Layout identical to /profile/[userId] human profile page:
 *   - Full-width cover photo 300px height (first from gallery)
 *   - Avatar overlapping cover photo, bottom-left, 80px, white border
 *   - Name, AI badge, age
 *   - Body type, ethnicity, personality traits as tags
 *   - Photo gallery grid (3 columns, all photos)
 *   - Bio and backstory section
 *   - Stats: total conversations, average rating
 *   - "Start Chat" button → /ai/chat/[avatarId]
 *   - "First 3 messages FREE" badge, then token cost per message
 *
 * Data source: Firestore 'ai_avatars/{avatarId}'
 */

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { AI_FREE_MESSAGES, AI_COST_PER_MESSAGE } from '@/lib/aiEconomyConfig';
import type { AIAvatar } from '@/lib/types/aiAvatar';
import {
  ArrowLeft,
  Bot,
  MessageCircle,
  Star,
  Users,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

// ============================================================================
// HELPER
// ============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-full h-[300px] bg-gray-200 dark:bg-gray-700" />
      <div className="max-w-4xl mx-auto px-4">
        <div className="-mt-10 flex items-end gap-4 mb-4">
          <div className="w-20 h-20 rounded-full bg-gray-300 dark:bg-gray-600 border-4 border-white dark:border-gray-900 flex-shrink-0" />
          <div className="flex-1 pt-12">
            <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
      </div>
    </div>
  );
}

// ============================================================================
// NOT FOUND STATE
// ============================================================================

function ProfileNotFound() {
  const router = useRouter();
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto mb-4 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        AI Companion not found
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        This AI companion doesn't exist or has been removed.
      </p>
      <button
        onClick={() => router.push('/ai')}
        className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700 transition-colors"
      >
        Back to AI Discovery
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIProfilePage() {
  const router = useRouter();
  const params = useParams()!;
  const avatarId = params.avatarId as string;

  const [avatar, setAvatar] = useState<AIAvatar | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Fetch avatar profile ─────────────────────────────────────────────
  useEffect(() => {
    if (!avatarId) return;
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setNotFound(false);

        const avatarRef = doc(requireDb(), 'ai_avatars', avatarId);
        const snap = await getDoc(avatarRef);

        if (!active) return;

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const d = snap.data();
        const profile: AIAvatar = {
          id: snap.id,
          name: d.name || 'AI Companion',
          age: d.age || 0,
          gender: d.gender || 'other',
          ethnicity: d.ethnicity || '',
          bodyType: d.bodyType || '',
          hairColor: d.hairColor || '',
          eyeColor: d.eyeColor || '',
          personalityTraits: d.personalityTraits || [],
          bio: d.bio || '',
          backstory: d.backstory || '',
          interests: d.interests || [],
          photos: d.photos || [],
          voiceType: d.voiceType || '',
          creatorId: d.creatorId || null,
          creatorDisplayName: d.creatorDisplayName || null,
          isAvaloPlatform: d.isAvaloPlatform === true,
          totalConversations: d.totalConversations || 0,
          averageRating: d.averageRating || 0,
          ratingCount: d.ratingCount || 0,
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        };

        setAvatar(profile);
      } catch (err) {
        console.error('[AIProfilePage] Load error:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [avatarId]);

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) return <ProfileSkeleton />;
  if (notFound || !avatar) return <ProfileNotFound />;

  const coverPhoto =
    avatar.photos && avatar.photos.length > 0 ? avatar.photos[0] : null;

  const allGalleryPhotos = avatar.photos || [];

  const initials = avatar.name
    ? avatar.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'AI';

  return (
    <>
      {/* ================================================================
          HEADER SECTION — Cover photo + avatar overlap
          ================================================================ */}
      <div className="relative">
        {/* Cover Photo — 300px height */}
        <div className="w-full h-[300px] bg-gradient-to-br from-purple-400 via-violet-500 to-indigo-600 overflow-hidden">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={`${avatar.name} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Bot className="w-24 h-24 text-white/30" />
            </div>
          )}
        </div>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors z-10"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Info Container */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar overlapping cover — 80px, white border */}
        <div className="-mt-10 flex items-end gap-4">
          {coverPhoto ? (
            <img
              src={avatar.photos[0]}
              alt={avatar.name}
              className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-gray-900 flex-shrink-0 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 border-4 border-white dark:border-gray-900 flex-shrink-0 shadow-lg flex items-center justify-center text-white text-2xl font-bold">
              {initials}
            </div>
          )}

          {/* Name row */}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                {avatar.name}
              </h1>
              {/* Purple AI badge */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full flex-shrink-0">
                <Bot className="w-3 h-3" />
                AI
              </span>
              {avatar.age > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {avatar.age}
                </span>
              )}
            </div>

            {/* Creator attribution */}
            {!avatar.isAvaloPlatform && avatar.creatorDisplayName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                by {avatar.creatorDisplayName}
              </p>
            )}
            {avatar.isAvaloPlatform && (
              <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
                Avalo Official
              </p>
            )}
          </div>
        </div>

        {/* Body type, ethnicity, personality traits tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {avatar.bodyType && (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-full">
              {avatar.bodyType}
            </span>
          )}
          {avatar.ethnicity && (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-full">
              {avatar.ethnicity}
            </span>
          )}
          {avatar.personalityTraits.map((trait) => (
            <span
              key={trait}
              className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full"
            >
              {trait}
            </span>
          ))}
        </div>

        {/* Bio */}
        {avatar.bio && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {avatar.bio}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCount(avatar.totalConversations)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Conversations
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {avatar.averageRating > 0 ? avatar.averageRating.toFixed(1) : '—'}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Avg Rating ({avatar.ratingCount})
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-5 flex-wrap">
          {/* Start Chat */}
          <button
            onClick={() => router.push(`/ai/chat/${avatar.id}`)}
            className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm text-center flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Start Chat
          </button>
        </div>

        {/* Free messages badge + token cost */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
            <Sparkles className="w-3 h-3" />
            First {AI_FREE_MESSAGES} messages FREE
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            then {AI_COST_PER_MESSAGE} token per message
          </span>
        </div>

        {/* ================================================================
            BACKSTORY SECTION
            ================================================================ */}
        {avatar.backstory && (
          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Backstory
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
              {avatar.backstory}
            </p>
          </div>
        )}

        {/* ================================================================
            DETAILS SECTION — hair, eyes, interests
            ================================================================ */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
            Details
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {avatar.gender && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Gender:</span>{' '}
                <span className="text-gray-900 dark:text-white capitalize">
                  {avatar.gender}
                </span>
              </div>
            )}
            {avatar.hairColor && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Hair:</span>{' '}
                <span className="text-gray-900 dark:text-white">{avatar.hairColor}</span>
              </div>
            )}
            {avatar.eyeColor && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Eyes:</span>{' '}
                <span className="text-gray-900 dark:text-white">{avatar.eyeColor}</span>
              </div>
            )}
            {avatar.bodyType && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Body:</span>{' '}
                <span className="text-gray-900 dark:text-white">{avatar.bodyType}</span>
              </div>
            )}
          </div>

          {/* Interests */}
          {avatar.interests && avatar.interests.length > 0 && (
            <div className="mt-4">
              <span className="text-sm text-gray-500 dark:text-gray-400 block mb-2">
                Interests
              </span>
              <div className="flex flex-wrap gap-1.5">
                {avatar.interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================
            PHOTO GALLERY — 3 column grid
            ================================================================ */}
        {allGalleryPhotos.length > 0 && (
          <div className="mt-8 mb-12">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Gallery
            </h2>
            <div className="grid grid-cols-3 gap-1">
              {allGalleryPhotos.map((photo, index) => (
                <div
                  key={index}
                  className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800"
                >
                  <img
                    src={photo}
                    alt={`${avatar.name} photo ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
