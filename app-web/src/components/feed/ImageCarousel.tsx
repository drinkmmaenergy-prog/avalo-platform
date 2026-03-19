'use client';

/**
 * Image Carousel Component
 * Swipeable carousel for posts with multiple images.
 * Supports single image pass-through and touch/drag navigation.
 * Full width, max-height 600px, object-cover per spec.
 */

import React, { useState, useRef, useCallback } from 'react';
import Image from 'next/image';

interface ImageCarouselProps {
  images: string[];
  alt?: string;
  isPPV?: boolean;
  onDoubleTap?: () => void;
}

export default function ImageCarousel({
  images,
  alt = 'Post media',
  isPPV = false,
  onDoubleTap,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const lastTap = useRef(0);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < images.length) {
        setCurrentIndex(index);
      }
    },
    [images.length]
  );

  const goNext = useCallback(() => {
    goTo(currentIndex + 1);
  }, [currentIndex, goTo]);

  const goPrev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      touchEndX.current = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX.current;

      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    },
    [goNext, goPrev]
  );

  // Double-tap detection for like
  const handleClick = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      onDoubleTap?.();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [onDoubleTap]);

  if (images.length === 0) return null;

  return (
    <div className="relative w-full">
      {/* Image Container */}
      <div
        className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-800"
        style={{ maxHeight: '600px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((src, idx) => (
            <div
              key={idx}
              className="w-full flex-shrink-0 relative"
              style={{ maxHeight: '600px' }}
            >
              <Image
                src={src}
                alt={`${alt} ${idx + 1}`}
                width={800}
                height={600}
                className={`w-full h-auto object-cover ${
                  isPPV ? 'blur-xl scale-110' : ''
                }`}
                style={{ maxHeight: '600px' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators (only if multiple images) */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                goTo(idx);
              }}
              className={`
                w-2 h-2 rounded-full transition-all duration-200
                ${
                  idx === currentIndex
                    ? 'bg-white w-4 shadow-md'
                    : 'bg-white/50 hover:bg-white/75'
                }
              `}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* Counter (top right, only if multiple) */}
      {images.length > 1 && (
        <div className="absolute top-3 right-3 z-10 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {currentIndex + 1}/{images.length}
        </div>
      )}
    </div>
  );
}
