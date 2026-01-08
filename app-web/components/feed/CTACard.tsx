/**
 * PACK 270 - CTA Card Component (Web)
 */

'use client';

import React from 'react';
import type { CTAFeedItem } from '../../../shared/types/feed';

interface CTACardProps {
  item: CTAFeedItem;
}

export function CTACard({ item }: CTACardProps) {
  return (
    <a
      href={item.actionRoute}
      className="block bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mb-4 border-2 border-dashed border-blue-300 hover:border-blue-400 transition"
    >
      <div className="flex items-center mb-4">
        <span className="text-4xl mr-4">{item.icon || '✨'}</span>
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-gray-900 mb-1">{item.title}</h3>
          <p className="text-gray-700">{item.description}</p>
        </div>
      </div>
      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition">
        {item.actionText}
      </button>
    </a>
  );
}