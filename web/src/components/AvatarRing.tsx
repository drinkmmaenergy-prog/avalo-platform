'use client';

import React from 'react';
import Image from 'next/image';

/**
 * Avatar Ring Component
 * Avatar with animated gradient ring and subtle drop shadow
 * Reference: Smooth 3s rotation animation
 */

interface AvatarRingProps {
  src: string;
  alt: string;
  size?: number;
  variant?: 'primary' | 'secondary';
  animate?: boolean;
  className?: string;
}

export const AvatarRing: React.FC<AvatarRingProps> = ({
  src,
  alt,
  size = 80,
  variant = 'primary',
  animate = true,
  className = '',
}) => {
  const gradientClass = variant === 'primary' ? 'gradient-primary' : 'gradient-secondary';
  const animateClass = animate ? 'animate-spin-slow' : '';

  const ringSize = size + 8;

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: ringSize, height: ringSize }}
    >
      {/* Animated gradient ring with drop shadow */}
      <div
        className={`
          absolute inset-0
          ${gradientClass}
          ${animateClass}
          rounded-full
          shadow-[0_4px_8px_rgba(0,0,0,0.25)]
        `}
        style={{ padding: 4 }}
      />
      {/* Inner white border */}
      <div
        className="absolute inset-[4px] bg-white dark:bg-gray-900 rounded-full overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
      >
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
};