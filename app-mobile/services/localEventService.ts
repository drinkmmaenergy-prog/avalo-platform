/**
 * Local Event Service - Creator Local Events System
 * Phase 34: Local Fan Events & Meet-Ups
 * 
 * UI-only implementation with AsyncStorage persistence.
 * NO backend changes, NO token giveaways, NO monetization changes.
 * 
 * Access unlocked by existing actions:
 * - Active subscription
 * - Joined LIVE
 * - Unlocked PPV
 * - AI companion session
 * - Season Pass Tier 2+
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSubscribed } from './subscriptionService';
import { checkAccess as checkLiveAccess } from './liveService';
import { getUserUnlocks } from './ppvService';
import { getConversation } from './creatorAICompanionService';
import { getUserProgress } from './seasonPassService';

// Storage keys
const STORAGE_KEYS = {
  EVENTS: '@avalo_local_events_v1',
  PARTICIPANTS: '@avalo_local_event_participants_v1',
};

// Types
export type LocalEventId = string;

export type UnlockCondition = 
  | 'SUBSCRIPTION' 
  | 'LIVE' 
  | 'PPV' 
  | 'AI' 
  | 'SEASON_TIER_2';

export type EventStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED';

export interface LocalFanEvent {
  id: LocalEventId;
  creatorId: string;
  title: string;
  description?: string;
  city: string;
  countryCode?: string;
  dateTimestamp: number; // ms since epoch
  createdAt: number; // ms
  maxSeats: number; // 5-25
  status: EventStatus;
  unlockCondition: UnlockCondition;
  roughLocation: string; // e.g., "Centrum / Śródmieście"
  exactLocation?: string | null; // revealed <24h before event
}

export interface LocalEventParticipant {
  eventId: LocalEventId;
  userId: string;
  unlockedAt: number; // ms
  joinedAt?: number | null;
}

interface EventsStorage {
  [eventId: string]: LocalFanEvent;
}

interface ParticipantsStorage {
  [eventId: string]: LocalEventParticipant[];
}

/**
 * Generate unique event ID
 */
function generateEventId(creatorId: string): LocalEventId {
  return `event_${creatorId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new local event
 * Only allows 1 ACTIVE event per creator at a time
 */
export async function createEvent(
  creatorId: string,
  payload: {
    title: string;
    description?: string;
    city: string;
    countryCode?: string;
    roughLocation: string;
    exactLocation?: string | null;
    dateTimestamp: number;
    maxSeats: number;
    unlockCondition: UnlockCondition;
  }
): Promise<LocalFanEvent> {
  try {
    // Check if creator already has an active event
    const existingEvent = await getActiveEventForCreator(creatorId);
    if (existingEvent) {
      throw new Error('Creator already has an active event');
    }

    // Validate maxSeats
    if (payload.maxSeats < 5 || payload.maxSeats > 25) {
      throw new Error('Max seats must be between 5 and 25');
    }

    // Validate date is in the future
    if (payload.dateTimestamp <= Date.now()) {
      throw new Error('Event date must be in the future');
    }

    const eventId = generateEventId(creatorId);
    const now = Date.now();

    const event: LocalFanEvent = {
      id: eventId,
      creatorId,
      title: payload.title,
      description: payload.description,
      city: payload.city,
      countryCode: payload.countryCode,
      dateTimestamp: payload.dateTimestamp,
      createdAt: now,
      maxSeats: payload.maxSeats,
      status: 'ACTIVE',
      unlockCondition: payload.unlockCondition,
      roughLocation: payload.roughLocation,
      exactLocation: payload.exactLocation,
    };

    // Save to storage
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    const events: EventsStorage = eventsData ? JSON.parse(eventsData) : {};
    events[eventId] = event;
    await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));

    // Initialize empty participants list
    const participantsData = await AsyncStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
    const participants: ParticipantsStorage = participantsData ? JSON.parse(participantsData) : {};
    participants[eventId] = [];
    await AsyncStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));

    return event;
  } catch (error) {
    console.error('Error creating local event:', error);
    throw error;
  }
}

/**
 * Get active event for a creator
 */
export async function getActiveEventForCreator(
  creatorId: string
): Promise<LocalFanEvent | null> {
  try {
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!eventsData) return null;

    const events: EventsStorage = JSON.parse(eventsData);
    
    // Find active event for this creator
    const activeEvent = Object.values(events).find(
      event => event.creatorId === creatorId && event.status === 'ACTIVE'
    );

    if (!activeEvent) return null;

    // Check if expired
    const twoHoursAfterEvent = activeEvent.dateTimestamp + (2 * 60 * 60 * 1000);
    if (Date.now() > twoHoursAfterEvent) {
      activeEvent.status = 'EXPIRED';
      events[activeEvent.id] = activeEvent;
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      return activeEvent;
    }

    return activeEvent;
  } catch (error) {
    console.error('Error getting active event:', error);
    return null;
  }
}

/**
 * Get event by ID
 */
export async function getEventById(
  eventId: LocalEventId
): Promise<LocalFanEvent | null> {
  try {
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!eventsData) return null;

    const events: EventsStorage = JSON.parse(eventsData);
    const event = events[eventId];

    if (!event) return null;

    // Check if expired
    const twoHoursAfterEvent = event.dateTimestamp + (2 * 60 * 60 * 1000);
    if (event.status === 'ACTIVE' && Date.now() > twoHoursAfterEvent) {
      event.status = 'EXPIRED';
      events[eventId] = event;
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    }

    return event;
  } catch (error) {
    console.error('Error getting event by ID:', error);
    return null;
  }
}

/**
 * Close an event manually
 */
export async function closeEvent(eventId: LocalEventId): Promise<void> {
  try {
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!eventsData) throw new Error('Event not found');

    const events: EventsStorage = JSON.parse(eventsData);
    const event = events[eventId];

    if (!event) throw new Error('Event not found');
    
    event.status = 'CLOSED';
    events[eventId] = event;
    await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  } catch (error) {
    console.error('Error closing event:', error);
    throw error;
  }
}

/**
 * Get participants for an event
 */
export async function getParticipants(
  eventId: LocalEventId
): Promise<LocalEventParticipant[]> {
  try {
    const participantsData = await AsyncStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
    if (!participantsData) return [];

    const participants: ParticipantsStorage = JSON.parse(participantsData);
    return participants[eventId] || [];
  } catch (error) {
    console.error('Error getting participants:', error);
    return [];
  }
}

/**
 * Check if user satisfies unlock condition
 */
async function checkUnlockCondition(
  creatorId: string,
  userId: string,
  condition: UnlockCondition
): Promise<boolean> {
  try {
    switch (condition) {
      case 'SUBSCRIPTION': {
        return await isSubscribed(userId, creatorId);
      }

      case 'LIVE': {
        // Check if user has ever joined a LIVE by this creator
        const participantsData = await AsyncStorage.getItem('@avalo_live_unlocks');
        if (!participantsData) return false;
        const unlocks = JSON.parse(participantsData);
        // Need to find if any LIVE by this creator was joined by this user
        const eventsData = await AsyncStorage.getItem('@avalo_live_sessions');
        if (!eventsData) return false;
        const sessions = JSON.parse(eventsData);
        const creatorLives = Object.values(sessions).filter((s: any) => s.creatorId === creatorId);
        const hasJoined = unlocks.some((u: any) => 
          creatorLives.some((l: any) => l.liveId === u.liveId) && u.userId === userId
        );
        return hasJoined;
      }

      case 'PPV': {
        const unlocks = await getUserUnlocks(userId);
        return unlocks.some(unlock => unlock.creatorId === creatorId);
      }

      case 'AI': {
        const conversation = await getConversation(userId, creatorId);
        return conversation !== null && conversation.messages.length > 0;
      }

      case 'SEASON_TIER_2': {
        const progress = await getUserProgress(creatorId, userId);
        return progress !== null && progress.currentTier >= 2;
      }

      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking unlock condition:', error);
    return false;
  }
}

/**
 * Unlock event access for a user
 */
export async function unlockEventAccess(
  eventId: LocalEventId,
  userId: string,
  reason: 'SUBSCRIPTION' | 'LIVE' | 'PPV' | 'AI' | 'SEASON'
): Promise<{ success: boolean; reason?: string }> {
  try {
    // Get event
    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, reason: 'NO_EVENT' };
    }

    if (event.status !== 'ACTIVE') {
      if (event.status === 'EXPIRED') {
        return { success: false, reason: 'EXPIRED' };
      } else {
        return { success: false, reason: 'CLOSED' };
      }
    }

    // Check if already unlocked
    const existingParticipation = await getUserParticipation(eventId, userId);
    if (existingParticipation) {
      return { success: true }; // Already unlocked
    }

    // Check capacity
    const participants = await getParticipants(eventId);
    if (participants.length >= event.maxSeats) {
      return { success: false, reason: 'FULL' };
    }

    // Map reason to unlock condition
    const conditionMap: Record<typeof reason, UnlockCondition> = {
      'SUBSCRIPTION': 'SUBSCRIPTION',
      'LIVE': 'LIVE',
      'PPV': 'PPV',
      'AI': 'AI',
      'SEASON': 'SEASON_TIER_2',
    };
    
    const condition = conditionMap[reason];

    // Verify condition is met
    const conditionMet = await checkUnlockCondition(event.creatorId, userId, condition);
    if (!conditionMet) {
      return { success: false, reason: 'NO_CONDITION_MET' };
    }

    // Add participant
    const participant: LocalEventParticipant = {
      eventId,
      userId,
      unlockedAt: Date.now(),
      joinedAt: Date.now(),
    };

    const participantsData = await AsyncStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
    const allParticipants: ParticipantsStorage = participantsData ? JSON.parse(participantsData) : {};
    
    if (!allParticipants[eventId]) {
      allParticipants[eventId] = [];
    }
    
    allParticipants[eventId].push(participant);
    await AsyncStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(allParticipants));

    return { success: true };
  } catch (error) {
    console.error('Error unlocking event access:', error);
    return { success: false, reason: 'ERROR' };
  }
}

/**
 * Get user's participation status for an event
 */
export async function getUserParticipation(
  eventId: LocalEventId,
  userId: string
): Promise<LocalEventParticipant | null> {
  try {
    const participants = await getParticipants(eventId);
    return participants.find(p => p.userId === userId) || null;
  } catch (error) {
    console.error('Error getting user participation:', error);
    return null;
  }
}

/**
 * Refresh event statuses (mark as expired if time passed)
 */
export async function refreshEventStatuses(): Promise<void> {
  try {
    const eventsData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!eventsData) return;

    const events: EventsStorage = JSON.parse(eventsData);
    let updated = false;

    for (const eventId in events) {
      const event = events[eventId];
      
      if (event.status === 'ACTIVE') {
        const twoHoursAfterEvent = event.dateTimestamp + (2 * 60 * 60 * 1000);
        if (Date.now() > twoHoursAfterEvent) {
          event.status = 'EXPIRED';
          events[eventId] = event;
          updated = true;
        }
      }
    }

    if (updated) {
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    }
  } catch (error) {
    console.error('Error refreshing event statuses:', error);
  }
}

/**
 * Check if exact location should be visible
 * Only visible when user has unlocked AND event is <24h away
 */
export function shouldShowExactLocation(
  event: LocalFanEvent,
  isUnlocked: boolean
): boolean {
  if (!isUnlocked) return false;
  if (!event.exactLocation) return false;

  const twentyFourHoursBeforeEvent = event.dateTimestamp - (24 * 60 * 60 * 1000);
  return Date.now() >= twentyFourHoursBeforeEvent;
}

/**
 * Check if user can unlock based on any condition
 */
export async function checkUnlockEligibility(
  creatorId: string,
  userId: string
): Promise<{
  canUnlock: boolean;
  satisfiedConditions: UnlockCondition[];
}> {
  try {
    const conditions: UnlockCondition[] = ['SUBSCRIPTION', 'LIVE', 'PPV', 'AI', 'SEASON_TIER_2'];
    const satisfiedConditions: UnlockCondition[] = [];

    for (const condition of conditions) {
      const met = await checkUnlockCondition(creatorId, userId, condition);
      if (met) {
        satisfiedConditions.push(condition);
      }
    }

    return {
      canUnlock: satisfiedConditions.length > 0,
      satisfiedConditions,
    };
  } catch (error) {
    console.error('Error checking unlock eligibility:', error);
    return {
      canUnlock: false,
      satisfiedConditions: [],
    };
  }
}

/**
 * Get time until event starts
 */
export function getTimeUntilEvent(event: LocalFanEvent): {
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
} {
  const now = Date.now();
  const diff = event.dateTimestamp - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isPast: true };
  }

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  return { days, hours, minutes, isPast: false };
}

/**
 * Clear all local event data (for testing)
 */
export async function clearAllEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.EVENTS);
    await AsyncStorage.removeItem(STORAGE_KEYS.PARTICIPANTS);
  } catch (error) {
    console.error('Error clearing local events:', error);
  }
}

export default {
  createEvent,
  getActiveEventForCreator,
  getEventById,
  closeEvent,
  getParticipants,
  unlockEventAccess,
  getUserParticipation,
  refreshEventStatuses,
  shouldShowExactLocation,
  checkUnlockEligibility,
  getTimeUntilEvent,
  clearAllEvents,
};