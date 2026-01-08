/**
 * Trust and Blocklist Hook
 * 
 * React hook for managing trust state and blocklist in components.
 * Provides easy access to trust/risk information and blocking functionality.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTrustState,
  getBlocklist,
  blockUser as blockUserService,
  isUserHighRisk,
  isEarnModeAllowed,
  isUserBlocked as checkUserBlocked,
  TrustState,
  Blocklist
} from '../services/trustService';

interface UseTrustAndBlocklistOptions {
  currentUserId: string;
  targetUserId?: string;
  autoLoad?: boolean;
}

interface UseTrustAndBlocklistReturn {
  // Trust state
  trustState: TrustState | null;
  isHighRisk: boolean;
  canEarnFromChat: boolean;
  
  // Blocklist state
  blocklist: Blocklist | null;
  isBlocked: boolean;
  
  // Loading states
  loadingTrust: boolean;
  loadingBlocklist: boolean;
  
  // Actions
  blockUser: (userId: string) => Promise<void>;
  refreshTrustState: () => Promise<void>;
  refreshBlocklist: () => Promise<void>;
  
  // Error states
  trustError: Error | null;
  blocklistError: Error | null;
}

export function useTrustAndBlocklist(
  options: UseTrustAndBlocklistOptions
): UseTrustAndBlocklistReturn {
  const { currentUserId, targetUserId, autoLoad = true } = options;

  // Trust state
  const [trustState, setTrustState] = useState<TrustState | null>(null);
  const [loadingTrust, setLoadingTrust] = useState(false);
  const [trustError, setTrustError] = useState<Error | null>(null);

  // Blocklist state
  const [blocklist, setBlocklist] = useState<Blocklist | null>(null);
  const [loadingBlocklist, setLoadingBlocklist] = useState(false);
  const [blocklistError, setBlocklistError] = useState<Error | null>(null);

  // Computed values
  const isHighRisk = trustState ? isUserHighRisk(trustState) : false;
  const canEarnFromChat = trustState ? isEarnModeAllowed(trustState) : true;
  const isBlocked = targetUserId && blocklist 
    ? checkUserBlocked(blocklist, targetUserId) 
    : false;

  // Load trust state for target user
  const loadTrustState = useCallback(async () => {
    if (!targetUserId) return;

    setLoadingTrust(true);
    setTrustError(null);

    try {
      const state = await getTrustState(targetUserId);
      setTrustState(state);
    } catch (error) {
      console.error('Error loading trust state:', error);
      setTrustError(error as Error);
    } finally {
      setLoadingTrust(false);
    }
  }, [targetUserId]);

  // Load blocklist for current user
  const loadBlocklist = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingBlocklist(true);
    setBlocklistError(null);

    try {
      const list = await getBlocklist(currentUserId);
      setBlocklist(list);
    } catch (error) {
      console.error('Error loading blocklist:', error);
      setBlocklistError(error as Error);
    } finally {
      setLoadingBlocklist(false);
    }
  }, [currentUserId]);

  // Block a user
  const blockUser = useCallback(async (userId: string) => {
    try {
      await blockUserService(currentUserId, userId);
      // Refresh blocklist after blocking
      await loadBlocklist();
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }, [currentUserId, loadBlocklist]);

  // Refresh functions
  const refreshTrustState = useCallback(async () => {
    await loadTrustState();
  }, [loadTrustState]);

  const refreshBlocklist = useCallback(async () => {
    await loadBlocklist();
  }, [loadBlocklist]);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      if (targetUserId) {
        loadTrustState();
      }
      if (currentUserId) {
        loadBlocklist();
      }
    }
  }, [autoLoad, targetUserId, currentUserId, loadTrustState, loadBlocklist]);

  return {
    // Trust state
    trustState,
    isHighRisk,
    canEarnFromChat,
    
    // Blocklist state
    blocklist,
    isBlocked,
    
    // Loading states
    loadingTrust,
    loadingBlocklist,
    
    // Actions
    blockUser,
    refreshTrustState,
    refreshBlocklist,
    
    // Error states
    trustError,
    blocklistError
  };
}

export default useTrustAndBlocklist;