"use client";

/**
 * WebRTC Configuration Layer
 * PACK 124.4 - Secure TURN/STUN configuration
 * 
 * Features:
 * - Secure credential management
 * - Backend-fetched TURN credentials
 * - Fallback to public STUN servers
 * - Configuration caching
 */

import { httpsCallable } from 'firebase/functions';
import { requireFunctions } from './firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface WebRTCConfig {
  iceServers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[];
}

interface CachedConfig {
  config: WebRTCConfig;
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// CONFIGURATION CACHE
// ============================================================================

const CONFIG_CACHE_KEY = 'avalo_webrtc_config';
const CONFIG_CACHE_DURATION = 3600000; // 1 hour

let memoryCache: CachedConfig | null = null;

/**
 * Get cached configuration from memory or localStorage
 */
function getCachedConfig(): WebRTCConfig | null {
  // Check memory cache first
  if (memoryCache && Date.now() < memoryCache.expiresAt) {
    return memoryCache.config;
  }

  // Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CONFIG_CACHE_KEY);
      if (cached) {
        const parsed: CachedConfig = JSON.parse(cached);
        if (Date.now() < parsed.expiresAt) {
          memoryCache = parsed;
          return parsed.config;
        }
        // Expired, remove it
        localStorage.removeItem(CONFIG_CACHE_KEY);
      }
    } catch (error) {
      console.warn('Failed to read cached WebRTC config:', error);
    }
  }

  return null;
}

/**
 * Cache configuration in memory and localStorage
 */
function cacheConfig(config: WebRTCConfig): void {
  const now = Date.now();
  const cached: CachedConfig = {
    config,
    timestamp: now,
    expiresAt: now + CONFIG_CACHE_DURATION,
  };

  memoryCache = cached;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.warn('Failed to cache WebRTC config:', error);
    }
  }
}

// ============================================================================
// FALLBACK CONFIGURATION
// ============================================================================

/**
 * Fallback to public STUN servers
 */
function getFallbackConfig(): WebRTCConfig {
  return {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] },
      { urls: ['stun:stun2.l.google.com:19302'] },
      { urls: ['stun:stun3.l.google.com:19302'] },
    ],
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get WebRTC configuration with TURN/STUN servers
 * 
 * Priority:
 * 1. Cached configuration (if valid)
 * 2. Backend-provided configuration (with TURN credentials)
 * 3. Fallback to public STUN servers
 */
export async function getWebRTCConfig(): Promise<WebRTCConfig> {
  // Check cache first
  const cached = getCachedConfig();
  if (cached) {
    return cached;
  }

  // Fetch from backend
  try {
    const getConfig = httpsCallable<void, WebRTCConfig>(requireFunctions(),
      'getWebRTCConfig'
    );

    const result = await getConfig();
    const config = result.data;

    // Validate configuration
    if (!config.iceServers || config.iceServers.length === 0) {
      throw new Error('Invalid WebRTC configuration received');
    }

    // Cache the configuration
    cacheConfig(config);

    return config;
  } catch (error) {
    console.error('Error fetching WebRTC config from backend:', error);
    console.warn('Using fallback STUN servers');

    // Return fallback configuration
    const fallback = getFallbackConfig();
    cacheConfig(fallback);
    return fallback;
  }
}

/**
 * Clear cached configuration (useful for testing or forcing refresh)
 */
export function clearWebRTCConfigCache(): void {
  memoryCache = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CONFIG_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear WebRTC config cache:', error);
    }
  }
}

/**
 * Validate if WebRTC is supported in the current browser
 */
export function isWebRTCSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    window.RTCPeerConnection
  );
}

/**
 * Get detailed browser WebRTC capabilities
 */
export function getWebRTCCapabilities(): {
  supported: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  peerConnection: boolean;
  errorMessage?: string;
} {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      mediaDevices: false,
      getUserMedia: false,
      peerConnection: false,
      errorMessage: 'Not in browser environment',
    };
  }

  const hasMediaDevices = !!navigator.mediaDevices;
  const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  const hasPeerConnection = !!window.RTCPeerConnection;

  const supported = hasMediaDevices && hasGetUserMedia && hasPeerConnection;

  let errorMessage: string | undefined;
  if (!supported) {
    if (!hasMediaDevices) {
      errorMessage = 'Your browser does not support media devices. Please update your browser.';
    } else if (!hasGetUserMedia) {
      errorMessage = 'Your browser does not support getUserMedia. Please update your browser.';
    } else if (!hasPeerConnection) {
      errorMessage = 'Your browser does not support WebRTC peer connections. Please update your browser.';
    } else {
      errorMessage = 'Your browser does not support secure calling. Please update or use a different browser.';
    }
  }

  return {
    supported,
    mediaDevices: hasMediaDevices,
    getUserMedia: hasGetUserMedia,
    peerConnection: hasPeerConnection,
    errorMessage,
  };
}
