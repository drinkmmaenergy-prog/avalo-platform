'use client';

/**
 * PACK 416 — Web Feature Flags Integration
 * 
 * Next.js server-side and client-side feature flag utilities
 * Supports:
 * - Server Component access
 * - API Route access
 * - Client-side React hooks
 * - Edge runtime compatibility
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  onSnapshot 
} from 'firebase/firestore';
import {
  FeatureFlagKey,
  FeatureFlagConfig,
  FeatureFlagUserContext,
  isFeatureEnabled as checkFeatureEnabled,
  calculateRolloutBucket,
  SAFE_DEFAULTS,
} from './types/featureFlags';

// Note: Import from your Firebase config
// import { db } from './firebase';

// In-memory cache for feature flags (shared across requests)
const cachedFlags = new Map<string, { config: FeatureFlagConfig; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Client-side hook to check if a specific feature is enabled
 * 
 * @param key Feature flag key to check
 * @returns Object with enabled status, rollout %, and loading state
 */
export function useFeatureFlag(key: FeatureFlagKey) {
  const [enabled, setEnabled] = useState<boolean>(() => SAFE_DEFAULTS[key] ?? false);
  const [rollout, setRollout] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    
    const initializeFlag = async () => {
      try {
        // Import db dynamically to avoid SSR issues
        const { requireDb } = await import('./firebase');
        
        // Get initial value from cache or Firestore
        const cached = cachedFlags.get(key);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          const userContext = getUserContext();
          const isEnabled = checkFeatureEnabled(cached.config, userContext);
          if (mounted) {
            setEnabled(isEnabled);
            setRollout(cached.config.rollout);
            setLoading(false);
          }
        } else {
          const flagRef = doc(requireDb(), 'featureFlags', key);
          const snapshot = await getDoc(flagRef);
          
          if (snapshot.exists() && mounted) {
            const config = snapshot.data() as FeatureFlagConfig;
            const userContext = getUserContext();
            const isEnabled = checkFeatureEnabled(config, userContext);
            
            setEnabled(isEnabled);
            setRollout(config.rollout);
            setLoading(false);
            
            // Update cache
            cachedFlags.set(key, { config, timestamp: Date.now() });
          } else if (mounted) {
            setEnabled(SAFE_DEFAULTS[key] ?? false);
            setLoading(false);
          }
        }
        
        // Set up real-time listener
        const flagRef = doc(requireDb(), 'featureFlags', key);
        unsubscribe = onSnapshot(
          flagRef,
          (snapshot) => {
            if (mounted) {
              if (snapshot.exists()) {
                const config = snapshot.data() as FeatureFlagConfig;
                const userContext = getUserContext();
                const isEnabled = checkFeatureEnabled(config, userContext);
                
                setEnabled(isEnabled);
                setRollout(config.rollout);
                
                // Update cache
                cachedFlags.set(key, { config, timestamp: Date.now() });
              } else {
                setEnabled(SAFE_DEFAULTS[key] ?? false);
                setRollout(100);
              }
              setLoading(false);
              setError(null);
            }
          },
          (err) => {
            console.error(`[FeatureFlags] Error listening to ${key}:`, err);
            if (mounted) {
              setError(err as Error);
              setLoading(false);
              setEnabled(SAFE_DEFAULTS[key] ?? false);
            }
          }
        );
      } catch (err) {
        console.error(`[FeatureFlags] Error initializing ${key}:`, err);
        if (mounted) {
          setError(err as Error);
          setLoading(false);
          setEnabled(SAFE_DEFAULTS[key] ?? false);
        }
      }
    };
    
    initializeFlag();
    
    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [key]);
  
  return { enabled, rollout, loading, error };
}

/**
 * Client-side hook to check multiple feature flags at once
 * 
 * @param keys Array of feature flag keys to check
 * @returns Object mapping each key to its enabled status
 */
export function useFeatureFlags(keys: FeatureFlagKey[]) {
  const [flags, setFlags] = useState<Record<FeatureFlagKey, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    keys.forEach(key => {
      initial[key] = SAFE_DEFAULTS[key] ?? false;
    });
    return initial as Record<FeatureFlagKey, boolean>;
  });
  const [loading, setLoading] = useState<boolean>(true);
  
  useEffect(() => {
    let mounted = true;
    const unsubscribers: Array<() => void> = [];
    
    const initializeFlags = async () => {
      try {
        const { requireDb } = await import('./firebase');
        const userContext = getUserContext();
        
        // Load initial values
        const flagStates: Record<string, boolean> = {};
        
        await Promise.all(
          keys.map(async (key) => {
            const cached = cachedFlags.get(key);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
              flagStates[key] = checkFeatureEnabled(cached.config, userContext);
            } else {
              const flagRef = doc(requireDb(), 'featureFlags', key);
              const snapshot = await getDoc(flagRef);
              
              if (snapshot.exists()) {
                const config = snapshot.data() as FeatureFlagConfig;
                flagStates[key] = checkFeatureEnabled(config, userContext);
                cachedFlags.set(key, { config, timestamp: Date.now() });
              } else {
                flagStates[key] = SAFE_DEFAULTS[key] ?? false;
              }
            }
          })
        );
        
        if (mounted) {
          setFlags(flagStates as Record<FeatureFlagKey, boolean>);
          setLoading(false);
        }
        
        // Set up real-time listeners
        keys.forEach(key => {
          const flagRef = doc(requireDb(), 'featureFlags', key);
          const unsubscribe = onSnapshot(
            flagRef,
            (snapshot) => {
              if (mounted) {
                if (snapshot.exists()) {
                  const config = snapshot.data() as FeatureFlagConfig;
                  const isEnabled = checkFeatureEnabled(config, userContext);
                  setFlags(prev => ({ ...prev, [key]: isEnabled }));
                  cachedFlags.set(key, { config, timestamp: Date.now() });
                } else {
                  setFlags(prev => ({ ...prev, [key]: SAFE_DEFAULTS[key] ?? false }));
                }
              }
            },
            (err) => {
              console.error(`[FeatureFlags] Error listening to ${key}:`, err);
              if (mounted) {
                setFlags(prev => ({ ...prev, [key]: SAFE_DEFAULTS[key] ?? false }));
              }
            }
          );
          unsubscribers.push(unsubscribe);
        });
      } catch (err) {
        console.error('[FeatureFlags] Error initializing flags:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    initializeFlags();
    
    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [keys.join(',')]);
  
  return { flags, loading };
}

/**
 * Get current user context for feature evaluation (client-side)
 * TODO: Integrate with your auth/user context
 */
function getUserContext(): FeatureFlagUserContext {
  // In production, this should pull from your auth context
  // For now, return a basic context
  return {
    userId: undefined,
    rolloutBucket: Math.floor(Math.random() * 100),
    country: undefined,
    isVip: false,
    isRoyal: false,
    isCreator: false,
    isAdmin: false,
  };
}

/**
 * Clear feature flags cache
 */
export function clearFeatureFlagsCache(): void {
  cachedFlags.clear();
}


