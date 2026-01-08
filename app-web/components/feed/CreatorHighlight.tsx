/**
 * PACK 270 - Creator Highlight Component (Web)
 */

'use client';

import React from 'react';
import type { UserProfile } from '../../../shared/types/feed';

interface CreatorHighlightProps {
  creators: UserProfile[];
}

export function CreatorHighlight({ creators }: CreatorHighlightProps) {
  if (!creators || creators.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4">✨ Featured Creators</h2>
      <div className="flex overflow-x-auto space-x-4 pb-2">
        {creators.map((creator) => (
          <a
            key={creator.id}
            href={`/profile/${creator.id}`}
            className="flex flex-col items-center min-w-[80px] hover:opacity-80 transition"
          >
            <div className="relative mb-2">
              <img
                src={creator.avatar}
                alt={creator.username}
                className="w-16 h-16 rounded-full border-2 border-blue-500"
              />
              {creator.isRoyal && (
                <span className="absolute -top-1 -right-1 text-lg">👑</span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 text-center truncate w-full">
              {creator.username}
            </p>
            {creator.earnModeEnabled && (
              <span className="text-xs mt-1">💰</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}