'use client';

/**
 * Heart Animation Component
 * Shows a pulsing heart overlay when user double-taps an image (Instagram-style).
 * Automatically hides after the animation completes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';

interface HeartAnimationProps {
  /** Increment this value to trigger a new animation */
  trigger: number;
}

export default function HeartAnimation({ trigger }: HeartAnimationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;

    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <Heart
        className="w-20 h-20 text-red-500 fill-red-500 animate-heart-pop drop-shadow-lg"
      />
      <style jsx>{`
        @keyframes heartPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          15% {
            transform: scale(1.3);
            opacity: 1;
          }
          30% {
            transform: scale(0.95);
            opacity: 1;
          }
          45% {
            transform: scale(1.1);
            opacity: 1;
          }
          80% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        :global(.animate-heart-pop) {
          animation: heartPop 0.9s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
