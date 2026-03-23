'use client';

/**
 * Avatar — FIX 113
 *
 * Optimised avatar component using next/image for:
 *   - Automatic WebP conversion
 *   - Responsive sizing
 *   - Lazy loading
 *   - Blur placeholder
 *   - Fallback initial when no image is available
 *
 * Use <Avatar /> everywhere instead of raw <img> for user photos.
 */

import Image from 'next/image';
import React, { useState } from 'react';

/** Tiny SVG placeholder for blur effect while image loads. */
const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZTVlN2ViIi8+PC9zdmc+';

interface AvatarProps {
  /** Image URL (Firebase Storage or CDN). */
  src?: string | null;
  /** User display name — first character used as fallback initial. */
  name?: string | null;
  /** Pixel size (width & height). Default 40. */
  size?: number;
  /** Additional CSS classes appended to the wrapper. */
  className?: string;
}

export function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <Image
        src={src}
        alt={name || ''}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        loading="lazy"
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: gradient circle with user initial
  return (
    <div
      className={`rounded-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

/**
 * OptimizedImage — FIX 113
 *
 * General-purpose next/image wrapper for non-avatar images
 * (feed posts, profile covers, media, thumbnails).
 * Provides lazy loading, blur placeholder, and WebP conversion.
 */
interface OptimizedImageProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  /** If true, the image fills its parent container. */
  fill?: boolean;
  style?: React.CSSProperties;
}

export function OptimizedImage({
  src,
  alt = '',
  width,
  height,
  className = '',
  priority = false,
  fill = false,
  style,
}: OptimizedImageProps) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center text-gray-400 ${className}`}
        style={fill ? { width: '100%', height: '100%', ...style } : { width, height, ...style }}
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover ${className}`}
        loading={priority ? 'eager' : 'lazy'}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        onError={() => setImgError(true)}
        style={style}
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      placeholder="blur"
      blurDataURL={BLUR_DATA_URL}
      onError={() => setImgError(true)}
      style={style}
    />
  );
}
