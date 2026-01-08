/**
 * PACK 270 - Feed Post Component (Web)
 */

'use client';

import React from 'react';
import type { Post, ReportReason } from '../../../shared/types/feed';

interface FeedPostProps {
  post: Post;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onShare: (postId: string) => void;
  onSave: (postId: string) => void;
  onReport: (postId: string, reason: ReportReason) => void;
}

export function FeedPost({ post, onLike, onComment, onShare, onSave }: FeedPostProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src={post.author?.avatar || 'https://via.placeholder.com/40'}
            alt={post.author?.username}
            className="w-10 h-10 rounded-full mr-3"
          />
          <div>
            <p className="font-semibold text-gray-900">
              {post.author?.username || 'Unknown'}
              {post.author?.isVerified && <span className="ml-1 text-blue-500">✓</span>}
              {post.author?.isRoyal && <span className="ml-1">👑</span>}
            </p>
            <p className="text-sm text-gray-500">{new Date(post.timestamp).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Media */}
      {post.mediaURLs.length > 0 && (
        <img
          src={post.mediaURLs[0].url}
          alt="Post media"
          className="w-full h-96 object-cover"
        />
      )}

      {/* Actions */}
      <div className="p-4 flex items-center space-x-4">
        <button
          onClick={() => onLike(post.id)}
          className="text-2xl hover:scale-110 transition"
        >
          {post.engagement.hasLiked ? '❤️' : '🤍'}
        </button>
        <button onClick={() => onComment(post.id)} className="text-2xl hover:scale-110 transition">
          💬
        </button>
        <button onClick={() => onShare(post.id)} className="text-2xl hover:scale-110 transition">
          📤
        </button>
        <button
          onClick={() => onSave(post.id)}
          className="text-2xl hover:scale-110 transition ml-auto"
        >
          {post.engagement.hasSaved ? '🔖' : '📑'}
        </button>
      </div>

      {/* Engagement */}
      <div className="px-4 pb-2">
        <p className="font-semibold text-sm text-gray-900">
          {post.engagement.likes} {post.engagement.likes === 1 ? 'like' : 'likes'}
        </p>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pb-4">
          <p className="text-gray-900">
            <span className="font-semibold mr-2">{post.author?.username}</span>
            {post.caption}
          </p>
        </div>
      )}
    </div>
  );
}