/**
 * useFtuxMissions Hook - Phase 32-4
 * React hook for managing FTUX mission state
 * Handles loading, updating, and persisting mission progress
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FtuxState,
  FtuxMission,
  initFtuxMissions,
  getUpdatedMissionStateAfterEvent,
  isFtuxExpired,
  loadFtuxState,
  saveFtuxState,
} from '../utils/ftuxMissionEngine';

interface UseFtuxMissionsReturn {
  missions: FtuxMission[];
  isLoading: boolean;
  isExpired: boolean;
  completedCount: number;
  totalCount: number;
  registerEvent: (event: FtuxMissionEvent) => Promise<void>;
  refresh: () => Promise<void>;
}

type FtuxMissionEvent =
  | { type: 'PROFILE_COMPLETED' }
  | { type: 'PHOTOS_UPLOADED'; totalPhotos: number }
  | { type: 'MATCH_CREATED' }
  | { type: 'FIRST_MESSAGE_SENT' }
  | { type: 'AI_BOT_USED' }
  | { type: 'LIVE_TAB_VISITED' }
  | { type: 'CREATOR_FOLLOWED' }
  | { type: 'SAFE_MEET_CONTACT_SET' };

/**
 * Hook to manage FTUX missions with gender-adaptive content
 * @param currentUser - Current user object with gender and createdAt
 */
export function useFtuxMissions(currentUser?: {
  gender?: 'male' | 'female' | 'other';
  createdAt?: string | number | null;
}): UseFtuxMissionsReturn {
  const [state, setState] = useState<FtuxState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Initialize or load FTUX state
   */
  const initializeState = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Try to load existing state
      let loadedState = await loadFtuxState();
      
      // If no state exists, initialize new missions
      if (!loadedState && currentUser) {
        // Convert createdAt to ISO string if it's a timestamp
        let createdAtStr: string | null = null;
        if (currentUser.createdAt) {
          if (typeof currentUser.createdAt === 'number') {
            createdAtStr = new Date(currentUser.createdAt).toISOString();
          } else {
            createdAtStr = currentUser.createdAt;
          }
        }
        
        loadedState = initFtuxMissions({
          gender: currentUser.gender || 'other',
          createdAt: createdAtStr,
        });
        
        // Save initial state
        await saveFtuxState(loadedState);
      }
      
      setState(loadedState);
    } catch (error) {
      console.error('[useFtuxMissions] Error initializing state:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  /**
   * Register a mission event and update state
   */
  const registerEvent = useCallback(async (event: FtuxMissionEvent) => {
    if (!state) return;
    
    try {
      // Get updated state after event
      const updatedState = getUpdatedMissionStateAfterEvent(state, event);
      
      // Save to AsyncStorage
      await saveFtuxState(updatedState);
      
      // Update local state
      setState(updatedState);
    } catch (error) {
      console.error('[useFtuxMissions] Error registering event:', error);
    }
  }, [state]);

  /**
   * Refresh mission state from storage
   */
  const refresh = useCallback(async () => {
    await initializeState();
  }, [initializeState]);

  // Initialize on mount
  useEffect(() => {
    initializeState();
  }, [initializeState]);

  // Calculate derived values
  const missions = state?.missions.sort((a, b) => a.order - b.order) || [];
  const completedCount = missions.filter(m => m.status === 'COMPLETED').length;
  const totalCount = missions.length;
  const isExpired = state ? isFtuxExpired(state) : false;

  return {
    missions,
    isLoading,
    isExpired,
    completedCount,
    totalCount,
    registerEvent,
    refresh,
  };
}