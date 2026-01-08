/**
 * FTUX Mission Engine - Phase 32-4
 * Manages first-week onboarding missions with gender-adaptive content
 * ZERO backend calls, AsyncStorage only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const FTUX_ASYNC_STORAGE_KEY = 'ftux_missions_state_v1';

export type FtuxMissionId =
  | 'COMPLETE_PROFILE'
  | 'UPLOAD_3_PHOTOS'
  | 'MAKE_FIRST_MATCH'
  | 'SEND_FIRST_MESSAGE'
  | 'TRY_AI_BOT'
  | 'VISIT_LIVE_TAB'
  | 'FOLLOW_CREATOR'
  | 'SET_SAFE_MEET_CONTACT';

export type FtuxMissionStatus = 'LOCKED' | 'ACTIVE' | 'COMPLETED';

export interface FtuxMission {
  id: FtuxMissionId;
  status: FtuxMissionStatus;
  titleKey: string;        // i18n key
  subtitleKey: string;     // i18n key
  icon: string;            // emoji
  order: number;           // sort order
}

export interface FtuxState {
  missions: FtuxMission[];
  completedAt?: string | null; // ISO string or null
  createdAt?: string | null;   // ISO string when missions were first created
}

/**
 * Initialize FTUX missions based on user gender
 */
export function initFtuxMissions(opts: {
  gender?: 'male' | 'female' | 'other';
  createdAt?: string | null;
}): FtuxState {
  const { gender = 'other', createdAt } = opts;
  
  // Determine i18n suffix based on gender
  const genderSuffix = gender === 'male' ? '_male' : gender === 'female' ? '_female' : '_other';
  
  const missions: FtuxMission[] = [
    {
      id: 'COMPLETE_PROFILE',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_completeProfile_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_completeProfile_subtitle${genderSuffix}`,
      icon: '⭐',
      order: 1,
    },
    {
      id: 'UPLOAD_3_PHOTOS',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_uploadPhotos_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_uploadPhotos_subtitle${genderSuffix}`,
      icon: '📸',
      order: 2,
    },
    {
      id: 'MAKE_FIRST_MATCH',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_firstMatch_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_firstMatch_subtitle${genderSuffix}`,
      icon: '💖',
      order: 3,
    },
    {
      id: 'SEND_FIRST_MESSAGE',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_firstMessage_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_firstMessage_subtitle${genderSuffix}`,
      icon: '💬',
      order: 4,
    },
    {
      id: 'TRY_AI_BOT',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_tryAI_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_tryAI_subtitle${genderSuffix}`,
      icon: '🤖',
      order: 5,
    },
    {
      id: 'VISIT_LIVE_TAB',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_visitLive_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_visitLive_subtitle${genderSuffix}`,
      icon: '🎥',
      order: 6,
    },
    {
      id: 'FOLLOW_CREATOR',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_followCreator_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_followCreator_subtitle${genderSuffix}`,
      icon: '👤',
      order: 7,
    },
    {
      id: 'SET_SAFE_MEET_CONTACT',
      status: 'ACTIVE',
      titleKey: `ftuxMissions.mission_safeMeet_title${genderSuffix}`,
      subtitleKey: `ftuxMissions.mission_safeMeet_subtitle${genderSuffix}`,
      icon: '🛡️',
      order: 8,
    },
  ];
  
  return {
    missions,
    completedAt: null,
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * Update mission state after an event
 */
export function getUpdatedMissionStateAfterEvent(
  state: FtuxState,
  event:
    | { type: 'PROFILE_COMPLETED' }
    | { type: 'PHOTOS_UPLOADED'; totalPhotos: number }
    | { type: 'MATCH_CREATED' }
    | { type: 'FIRST_MESSAGE_SENT' }
    | { type: 'AI_BOT_USED' }
    | { type: 'LIVE_TAB_VISITED' }
    | { type: 'CREATOR_FOLLOWED' }
    | { type: 'SAFE_MEET_CONTACT_SET' }
): FtuxState {
  const newMissions = [...state.missions];
  let missionUpdated = false;
  
  switch (event.type) {
    case 'PROFILE_COMPLETED':
      const profileMission = newMissions.find(m => m.id === 'COMPLETE_PROFILE');
      if (profileMission && profileMission.status !== 'COMPLETED') {
        profileMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'PHOTOS_UPLOADED':
      if (event.totalPhotos >= 3) {
        const photosMission = newMissions.find(m => m.id === 'UPLOAD_3_PHOTOS');
        if (photosMission && photosMission.status !== 'COMPLETED') {
          photosMission.status = 'COMPLETED';
          missionUpdated = true;
        }
      }
      break;
      
    case 'MATCH_CREATED':
      const matchMission = newMissions.find(m => m.id === 'MAKE_FIRST_MATCH');
      if (matchMission && matchMission.status !== 'COMPLETED') {
        matchMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'FIRST_MESSAGE_SENT':
      const messageMission = newMissions.find(m => m.id === 'SEND_FIRST_MESSAGE');
      if (messageMission && messageMission.status !== 'COMPLETED') {
        messageMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'AI_BOT_USED':
      const aiMission = newMissions.find(m => m.id === 'TRY_AI_BOT');
      if (aiMission && aiMission.status !== 'COMPLETED') {
        aiMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'LIVE_TAB_VISITED':
      const liveMission = newMissions.find(m => m.id === 'VISIT_LIVE_TAB');
      if (liveMission && liveMission.status !== 'COMPLETED') {
        liveMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'CREATOR_FOLLOWED':
      const followMission = newMissions.find(m => m.id === 'FOLLOW_CREATOR');
      if (followMission && followMission.status !== 'COMPLETED') {
        followMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
      
    case 'SAFE_MEET_CONTACT_SET':
      const safeMeetMission = newMissions.find(m => m.id === 'SET_SAFE_MEET_CONTACT');
      if (safeMeetMission && safeMeetMission.status !== 'COMPLETED') {
        safeMeetMission.status = 'COMPLETED';
        missionUpdated = true;
      }
      break;
  }
  
  // Check if all missions are completed
  const allCompleted = newMissions.every(m => m.status === 'COMPLETED');
  const completedAt = allCompleted && missionUpdated ? new Date().toISOString() : state.completedAt;
  
  return {
    ...state,
    missions: newMissions,
    completedAt,
  };
}

/**
 * Check if FTUX missions have expired
 */
export function isFtuxExpired(state: FtuxState, now: Date = new Date()): boolean {
  // If all missions are completed, consider expired for display purposes
  if (state.completedAt) {
    return true;
  }
  
  // Check if more than 7 days have passed since creation
  if (state.createdAt) {
    const createdDate = new Date(state.createdAt);
    const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation > 7;
  }
  
  return false;
}

/**
 * Load FTUX state from AsyncStorage
 */
export async function loadFtuxState(): Promise<FtuxState | null> {
  try {
    const stateStr = await AsyncStorage.getItem(FTUX_ASYNC_STORAGE_KEY);
    if (!stateStr) return null;
    
    const state: FtuxState = JSON.parse(stateStr);
    return state;
  } catch (error) {
    console.error('[FTUX Engine] Error loading state:', error);
    return null;
  }
}

/**
 * Save FTUX state to AsyncStorage
 */
export async function saveFtuxState(state: FtuxState): Promise<void> {
  try {
    await AsyncStorage.setItem(FTUX_ASYNC_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[FTUX Engine] Error saving state:', error);
    throw error;
  }
}

/**
 * Reset FTUX missions (for testing)
 */
export async function resetFtuxMissions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FTUX_ASYNC_STORAGE_KEY);
  } catch (error) {
    console.error('[FTUX Engine] Error resetting missions:', error);
    throw error;
  }
}