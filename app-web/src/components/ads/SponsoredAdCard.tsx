'use client';

/**
 * FIX 74D: SponsoredAdCard — Reusable sponsored ad card with IntersectionObserver
 * viewability tracking.
 *
 * Props:
 *   - ad: Ad campaign data (title, description, imageUrl, targetUrl, id)
 *   - variant: 'feed' | 'discover' — controls card styling
 *   - onImpression: Called once when ad becomes visible in viewport
 *   - onClick: Called when user clicks the CTA
 *
 * Revenue: Ads = 100% Avalo
 */

import React, { useRef, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface SponsoredAd {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  targetUrl?: string;
  advertiserId?: string;
  budgetTokens?: number;
  spentTokens?: number;
  impressions?: number;
  clicks?: number;
  status?: string;
}

interface SponsoredAdCardProps {
  ad: SponsoredAd;
  variant?: 'feed' | 'discover';
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SponsoredAdCard({ ad, variant = 'feed' }: SponsoredAdCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [impressionRecorded, setImpressionRecorded] = useState(false);

  // ── IntersectionObserver for viewability tracking ──────────────────
  useEffect(() => {
    if (!ad.id || impressionRecorded) return;

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !impressionRecorded) {
          setImpressionRecorded(true);
          // Record ad view via Cloud Function
          httpsCallable(functions, 'recordAdView')({ adId: ad.id }).catch(() => {});
        }
      },
      { threshold: 0.5 } // At least 50% visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ad.id, impressionRecorded]);

  // ── Click handler — records ad click ──────────────────────────────
  const handleClick = () => {
    if (ad.id) {
      httpsCallable(functions, 'recordAdClick')({ adId: ad.id }).catch(() => {});
    }
  };

  // ── Feed variant — full-width card between posts ──────────────────
  if (variant === 'feed') {
    return (
      <div
        ref={cardRef}
        className="border rounded-xl p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 mb-4"
      >
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
          Sponsored
        </p>
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt=""
            className="w-full h-40 object-cover rounded-lg mb-2"
          />
        )}
        <p className="font-semibold text-sm text-gray-900 dark:text-white">
          {ad.title}
        </p>
        {ad.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {ad.description}
          </p>
        )}
        {ad.targetUrl && (
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="inline-block mt-2 px-4 py-1.5 bg-[#E4458F] text-white rounded-full text-xs font-medium hover:bg-[#d1377d] transition-colors"
          >
            Learn More →
          </a>
        )}
      </div>
    );
  }

  // ── Discover variant — card in profile grid ───────────────────────
  return (
    <div
      ref={cardRef}
      className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 shadow-sm border border-gray-200 dark:border-gray-700"
    >
      {ad.imageUrl ? (
        <img
          src={ad.imageUrl}
          alt=""
          className="w-full aspect-[3/4] object-cover"
        />
      ) : (
        <div className="w-full aspect-[3/4] bg-gradient-to-br from-[#E4458F]/10 to-[#8B5CF6]/10 flex items-center justify-center">
          <span className="text-4xl">📢</span>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* Sponsored badge */}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-0.5 bg-white/90 dark:bg-gray-900/90 text-[10px] font-medium text-gray-500 rounded-full uppercase tracking-wider">
          Sponsored
        </span>
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white font-semibold text-sm truncate">{ad.title}</p>
        {ad.description && (
          <p className="text-white/70 text-xs mt-0.5 line-clamp-2">
            {ad.description}
          </p>
        )}
        {ad.targetUrl && (
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="inline-block mt-1.5 px-3 py-1 bg-[#E4458F] text-white rounded-full text-[10px] font-medium"
          >
            Learn More →
          </a>
        )}
      </div>
    </div>
  );
}
