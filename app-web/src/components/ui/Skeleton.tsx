'use client';

/**
 * Skeleton — FIX 114
 *
 * Skeleton loading screens to replace all "Loading..." text.
 * Provides visual feedback during data fetching with smooth
 * pulse animations that match the component shapes.
 *
 * Components:
 *   - Skeleton              (generic block)
 *   - ProfileCardSkeleton   (discovery grid cards)
 *   - ConversationSkeleton  (chat / message list rows)
 *   - FeedPostSkeleton      (feed post cards)
 *   - MatchCardSkeleton     (match thumbnail cards)
 *   - LeaderboardRowSkeleton (leaderboard rows)
 */

import React from 'react';

/* ─── Base Skeleton ─────────────────────────────────────────────────── */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`} />;
}

/* ─── Discovery / Profile Cards ─────────────────────────────────────── */

export function ProfileCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <Skeleton className="w-full h-48" />
      <div className="p-3">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/* ─── Conversation / Chat List ──────────────────────────────────────── */

export function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-14 h-14 rounded-full flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

/* ─── Feed Post ─────────────────────────────────────────────────────── */

export function FeedPostSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="w-full h-64 rounded-lg mb-3" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/* ─── Match Card ────────────────────────────────────────────────────── */

export function MatchCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1">
      <Skeleton className="w-20 h-20 rounded-full" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

/* ─── Leaderboard Row ───────────────────────────────────────────────── */

export function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <Skeleton className="w-6 h-6 rounded" />
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-28 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-5 w-12 rounded-full" />
    </div>
  );
}

/* ─── Grid Skeleton Helper ──────────────────────────────────────────── */

/**
 * Render a grid of skeleton cards.
 * Usage: <SkeletonGrid count={6} Component={ProfileCardSkeleton} cols={2} />
 */
export function SkeletonGrid({
  count = 6,
  Component = ProfileCardSkeleton,
  cols = 2,
}: {
  count?: number;
  Component?: React.ComponentType;
  cols?: number;
}) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}

/**
 * Render a list of skeleton rows.
 * Usage: <SkeletonList count={8} Component={ConversationSkeleton} />
 */
export function SkeletonList({
  count = 6,
  Component = ConversationSkeleton,
}: {
  count?: number;
  Component?: React.ComponentType;
}) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}
