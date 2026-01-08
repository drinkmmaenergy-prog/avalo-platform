/**
 * PACK 227: Desire Loop Engine
 * 
 * Perpetual return-cycle system designed to keep users emotionally, romantically,
 * and socially drawn back into Avalo — without notifications spam, without addiction
 * patterns, without disrespecting mental health.
 * 
 * Key Features:
 * - 5 desire drivers (curiosity, intimacy, recognition, growth, opportunity)
 * - State-based trigger generation (0-100 scale per driver)
 * - Automatic decay and restoration
 * - Safety-first (respects anxiety mode, breakup recovery, sleep mode)
 * - Integration with all romantic packs (221-226)
 * - No manipulation, just emotional rewards
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type DesireDriver = 'curiosity' | 'intimacy' | 'recognition' | 'growth' | 'opportunity';

export type DesireFrequency = 'low' | 'medium' | 'high';

export type TriggerType = 
  | 'new_profiles'
  | 'chat_start'
  | 'call_suggestion'
  | 'meeting_plan'
  | 'profile_views'
  | 'compliment_received'
  | 'fan_milestone'
  | 'royal_progress'
  | 'level_up'
  | 'event_nearby'
  | 'travel_mode'
  | 'passport_week'
  | 'chemistry_peak'
  | 'journey_milestone';

export interface DesireState {
  userId: string;
  
  // 5 desire drivers (0-100 scale)
  curiosity: number;
  intimacy: number;
  recognition: number;
  growth: number;
  opportunity: number;
  
  // Metadata
  lastUpdated: Timestamp;
  lastActivityAt: Timestamp;
  
  // Settings
  frequency: DesireFrequency;
  enabledDrivers: DesireDriver[];
  
  // Safety flags
  anxietyReliefMode: boolean;
  sleepModeUntil?: Timestamp;
  breakupCooldownUntil?: Timestamp;
  toxicCooldownUntil?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DesireLoopTrigger {
  triggerId: string;
  userId: string;
  driverType: DesireDriver;
  triggerType: TriggerType;
  
  // Content
  title: string;
  description: string;
  actionText: string;
  actionTarget: string; // Route or action to take
  
  // Metadata
  priority: number; // 1-10, higher = more urgent
  createdAt: Timestamp;
  expiresAt: Timestamp;
  
  // User actions
  dismissed: boolean;
  dismissedAt?: Timestamp;
  actioned: boolean;
  actionedAt?: Timestamp;
}

export interface DesireStateHistory {
  historyId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  
  curiosity: number;
  intimacy: number;
  recognition: number;
  growth: number;
  opportunity: number;
  
  triggersShown: number;
  triggersActioned: number;
  
  createdAt: Timestamp;
}

export interface DesireLoopSettings {
  enabled: boolean;
  frequency: DesireFrequency;
  enabledDrivers: DesireDriver[];
  
  // Quiet hours
  quietHoursStart?: number; // 0-23 (hour)
  quietHoursEnd?: number; // 0-23 (hour)
  
  // Limits
  maxTriggersPerDay: number;
}

export interface DesireLoopCooldown {
  cooldownId: string;
  userId: string;
  driverType: DesireDriver;
  expiresAt: Timestamp;
  reason: string;
  createdAt: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DESIRE_STATE: Omit<DesireState, 'userId' | 'createdAt' | 'updatedAt'> = {
  curiosity: 50,
  intimacy: 50,
  recognition: 50,
  growth: 50,
  opportunity: 50,
  lastUpdated: null as any,
  lastActivityAt: null as any,
  frequency: 'medium',
  enabledDrivers: ['curiosity', 'intimacy', 'recognition', 'growth', 'opportunity'],
  anxietyReliefMode: false,
};

const DECAY_RATES: Record<DesireFrequency, number> = {
  low: 2,    // -2 per day
  medium: 3, // -3 per day
  high: 4,   // -4 per day
};

const RESTORATION_RATES: Record<DesireDriver, number> = {
  curiosity: 5,     // +5 per new profile view
  intimacy: 8,      // +8 per chat/call/meeting
  recognition: 6,   // +6 per compliment/view
  growth: 10,       // +10 per milestone/level
  opportunity: 7,   // +7 per event/travel suggestion
};

const TRIGGER_THRESHOLD = 30; // Show trigger when driver < 30

const MAX_TRIGGERS_PER_DAY: Record<DesireFrequency, number> = {
  low: 2,
  medium: 4,
  high: 6,
};

const TRIGGER_EXPIRY_HOURS = 24;

const COOLDOWN_HOURS: Record<DesireDriver, number> = {
  curiosity: 12,
  intimacy: 24,
  recognition: 12,
  growth: 48,
  opportunity: 24,
};

// ============================================================================
// DESIRE STATE MANAGEMENT
// ============================================================================

/**
 * Get or create user's desire state
 */
export async function getDesireState(userId: string): Promise<DesireState> {
  const stateRef = db.collection('desire_states').doc(userId);
  const stateSnap = await stateRef.get();
  
  if (stateSnap.exists) {
    return stateSnap.data() as DesireState;
  }
  
  // Create new state
  const newState: DesireState = {
    userId,
    ...DEFAULT_DESIRE_STATE,
    lastUpdated: serverTimestamp() as any,
    lastActivityAt: serverTimestamp() as any,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  
  await stateRef.set(newState);
  return newState;
}

/**
 * Update a specific desire driver
 */
export async function updateDesireDriver(
  userId: string,
  driver: DesireDriver,
  change: number,
  reason?: string
): Promise<{ oldValue: number; newValue: number }> {
  const state = await getDesireState(userId);
  const oldValue = state[driver];
  const newValue = Math.min(100, Math.max(0, oldValue + change));
  
  await db.collection('desire_states').doc(userId).update({
    [driver]: newValue,
    lastUpdated: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Check if we should generate a new trigger
  if (newValue < TRIGGER_THRESHOLD && oldValue >= TRIGGER_THRESHOLD) {
    await generateTriggerForDriver(userId, driver);
  }
  
  return { oldValue, newValue };
}

/**
 * Restore desire driver (positive action)
 */
export async function restoreDesireDriver(
  userId: string,
  driver: DesireDriver,
  actionType: string
): Promise<void> {
  const restorationAmount = RESTORATION_RATES[driver];
  await updateDesireDriver(userId, driver, restorationAmount, `Restored from ${actionType}`);
}

/**
 * Apply daily decay to all drivers
 */
export async function applyDailyDecay(userId: string): Promise<void> {
  const state = await getDesireState(userId);
  
  // Check safety flags - pause decay if in special mode
  if (state.anxietyReliefMode) {
    return; // No decay during anxiety relief
  }
  
  if (state.sleepModeUntil && state.sleepModeUntil.toMillis() > Date.now()) {
    return; // No decay during sleep mode
  }
  
  if (state.breakupCooldownUntil && state.breakupCooldownUntil.toMillis() > Date.now()) {
    return; // No decay during breakup recovery
  }
  
  const decayRate = DECAY_RATES[state.frequency];
  
  // Apply decay to each enabled driver
  for (const driver of state.enabledDrivers) {
    await updateDesireDriver(userId, driver, -decayRate, 'Daily decay');
  }
}

// ============================================================================
// TRIGGER GENERATION
// ============================================================================

/**
 * Generate a trigger for a specific driver that's running low
 */
export async function generateTriggerForDriver(
  userId: string,
  driver: DesireDriver
): Promise<DesireLoopTrigger | null> {
  const state = await getDesireState(userId);
  
  // Check if user has triggers enabled
  const settings = await getDesireLoopSettings(userId);
  if (!settings.enabled || !settings.enabledDrivers.includes(driver)) {
    return null;
  }
  
  // Check safety flags
  if (await shouldSkipTriggers(userId, state)) {
    return null;
  }
  
  // Check cooldown
  if (await isDriverOnCooldown(userId, driver)) {
    return null;
  }
  
  // Check daily limit
  const todayTriggers = await getTodayTriggerCount(userId);
  if (todayTriggers >= settings.maxTriggersPerDay) {
    return null;
  }
  
  // Check quiet hours
  if (isQuietHours(settings)) {
    return null;
  }
  
  // Generate appropriate trigger based on driver
  const trigger = await createTriggerContent(userId, driver, state);
  if (!trigger) {
    return null;
  }
  
  // Save trigger
  await db.collection('desire_loop_triggers').doc(trigger.triggerId).set(trigger);
  
  // Set cooldown
  await setDriverCooldown(userId, driver);
  
  return trigger;
}

/**
 * Create trigger content based on driver type and user context
 */
async function createTriggerContent(
  userId: string,
  driver: DesireDriver,
  state: DesireState
): Promise<DesireLoopTrigger | null> {
  const triggerId = generateId();
  const now = Date.now();
  const expiresAt = new Date(now + TRIGGER_EXPIRY_HOURS * 60 * 60 * 1000);
  
  let triggerType: TriggerType;
  let title: string;
  let description: string;
  let actionText: string;
  let actionTarget: string;
  let priority: number;
  
  switch (driver) {
    case 'curiosity':
      // Check if there are new profiles nearby
      const hasNewProfiles = await checkNewProfiles(userId);
      if (hasNewProfiles) {
        triggerType = 'new_profiles';
        title = 'New profiles nearby';
        description = 'Fresh connections who match your vibe just joined';
        actionText = 'Explore';
        actionTarget = '/discover';
        priority = 7;
      } else {
        // Fallback to general discovery
        triggerType = 'new_profiles';
        title = 'Discover new connections';
        description = "See who's active right now";
        actionText = 'Browse';
        actionTarget = '/discover';
        priority = 5;
      }
      break;
      
    case 'intimacy':
      // Check for active chats or chemistry peaks
      const hasPendingChats = await checkActiveCommunications(userId);
      if (hasPendingChats.hasChemistryPeak) {
        triggerType = 'chemistry_peak';
        title = 'Chemistry detected 🔥';
        description = `Someone you're vibing with wants to connect`;
        actionText = 'See who';
        actionTarget = `/chat/${hasPendingChats.chatId}`;
        priority = 9;
      } else if (hasPendingChats.hasPendingMessage) {
        triggerType = 'chat_start';
        title = 'New conversation started';
        description = 'Someone interesting just messaged you';
        actionText = 'Reply';
        actionTarget = `/chat/${hasPendingChats.chatId}`;
        priority = 8;
      } else {
        // Suggest call or meeting
        triggerType = 'call_suggestion';
        title = 'Ready for something deeper?';
        description = 'Voice or video calls create real connection';
        actionText = 'Start call';
        actionTarget = '/calls';
        priority = 6;
      }
      break;
      
    case 'recognition':
      // Check for new profile views or compliments
      const recognitionData = await checkRecognition(userId);
      if (recognitionData.newViews > 0) {
        triggerType = 'profile_views';
        title = `${recognitionData.newViews} people viewed your profile`;
        description = 'Your profile is getting attention';
        actionText = 'See who';
        actionTarget = '/profile/views';
        priority = 7;
      } else if (recognitionData.newCompliments > 0) {
        triggerType = 'compliment_received';
        title = 'New compliment received';
        description = 'Someone appreciates your vibe';
        actionText = 'View';
        actionTarget = '/profile/compliments';
        priority = 8;
      } else {
        return null; // No recognition data available
      }
      break;
      
    case 'growth':
      // Check Royal progress or level-up opportunities
      const growthData = await checkGrowthProgress(userId);
      if (growthData.nearRoyalMilestone) {
        triggerType = 'royal_progress';
        title = `${growthData.stepsToRoyal} steps to Royal`;
        description = 'Unlock exclusive perks and priority matching';
        actionText = 'See progress';
        actionTarget = '/royal';
        priority = 8;
      } else if (growthData.canLevelUp) {
        triggerType = 'level_up';
        title = 'Level up available!';
        description = 'Claim your next level rewards';
        actionText = 'Level up';
        actionTarget = '/profile/levels';
        priority = 7;
      } else {
        return null; // No growth opportunities
      }
      break;
      
    case 'opportunity':
      // Check for events or travel mode suggestions
      const opportunityData = await checkOpportunities(userId);
      if (opportunityData.hasNearbyEvents) {
        triggerType = 'event_nearby';
        title = `${opportunityData.eventCount} events near you`;
        description = 'This weekend — meet people in real life';
        actionText = 'Browse events';
        actionTarget = '/events';
        priority = 9;
      } else if (opportunityData.shouldTravelMode) {
        triggerType = 'travel_mode';
        title = 'Traveling soon?';
        description = 'Enable Travel Mode to meet people at your destination';
        actionText = 'Activate';
        actionTarget = '/profile/settings/passport';
        priority = 6;
      } else if (opportunityData.isDestinyWeek) {
        triggerType = 'passport_week';
        title = 'Destiny Week active';
        description = 'Special matchmaking multipliers this week';
        actionText = 'Join';
        actionTarget = '/destiny';
        priority = 8;
      } else {
        return null; // No opportunities
      }
      break;
      
    default:
      return null;
  }
  
  return {
    triggerId,
    userId,
    driverType: driver,
    triggerType,
    title,
    description,
    actionText,
    actionTarget,
    priority,
    createdAt: serverTimestamp() as any,
    expiresAt: expiresAt as any,
    dismissed: false,
    actioned: false,
  };
}

// ============================================================================
// SAFETY CHECKS
// ============================================================================

/**
 * Check if we should skip showing triggers for this user
 */
async function shouldSkipTriggers(userId: string, state: DesireState): Promise<boolean> {
  // Anxiety relief mode
  if (state.anxietyReliefMode) {
    return true;
  }
  
  // Sleep mode
  if (state.sleepModeUntil && state.sleepModeUntil.toMillis() > Date.now()) {
    return true;
  }
  
  // Breakup recovery cooldown
  if (state.breakupCooldownUntil && state.breakupCooldownUntil.toMillis() > Date.now()) {
    return true;
  }
  
  // Toxic contact cooldown
  if (state.toxicCooldownUntil && state.toxicCooldownUntil.toMillis() > Date.now()) {
    return true;
  }
  
  // Check for active safety incidents
  const safetyIncidents = await db.collection('trust_safety_incidents')
    .where('userId', '==', userId)
    .where('resolved', '==', false)
    .where('severity', 'in', ['HIGH', 'CRITICAL'])
    .limit(1)
    .get();
  
  if (!safetyIncidents.empty) {
    return true;
  }
  
  // Check romantic momentum exhaustion (PACK 224)
  try {
    const momentumSnap = await db.collection('romantic_momentum_states').doc(userId).get();
    if (momentumSnap.exists) {
      const momentum = momentumSnap.data();
      if (momentum.score < 10) {
        // User is exhausted, give them a break
        return true;
      }
    }
  } catch (error) {
    // Non-blocking
  }
  
  return false;
}

/**
 * Check if it's quiet hours
 */
function isQuietHours(settings: DesireLoopSettings): boolean {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) {
    return false;
  }
  
  const now = new Date();
  const currentHour = now.getHours();
  
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;
  
  if (start < end) {
    return currentHour >= start && currentHour < end;
  } else {
    // Quiet hours cross midnight
    return currentHour >= start || currentHour < end;
  }
}

// ============================================================================
// COOLDOWN MANAGEMENT
// ============================================================================

/**
 * Check if driver is on cooldown
 */
async function isDriverOnCooldown(userId: string, driver: DesireDriver): Promise<boolean> {
  const cooldownSnap = await db.collection('desire_loop_cooldowns')
    .where('userId', '==', userId)
    .where('driverType', '==', driver)
    .where('expiresAt', '>', new Date())
    .limit(1)
    .get();
  
  return !cooldownSnap.empty;
}

/**
 * Set cooldown for a driver
 */
async function setDriverCooldown(userId: string, driver: DesireDriver): Promise<void> {
  const cooldownHours = COOLDOWN_HOURS[driver];
  const expiresAt = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);
  
  await db.collection('desire_loop_cooldowns').doc(generateId()).set({
    cooldownId: generateId(),
    userId,
    driverType: driver,
    expiresAt,
    reason: 'Trigger shown',
    createdAt: serverTimestamp(),
  });
}

// ============================================================================
// CONTEXT CHECKS (Integration with other systems)
// ============================================================================

async function checkNewProfiles(userId: string): Promise<boolean> {
  try {
    // Check if there are profiles the user hasn't seen yet
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const lastViewedAt = userData?.lastDiscoveryViewAt || new Date(0);
    
    // Check for profiles created after last view
    const newProfilesSnap = await db.collection('users')
      .where('createdAt', '>', lastViewedAt)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    
    return !newProfilesSnap.empty;
  } catch (error) {
    return true; // Default to showing trigger
  }
}

async function checkActiveCommunications(userId: string): Promise<{
  hasChemistryPeak: boolean;
  hasPendingMessage: boolean;
  chatId?: string;
}> {
  try {
    // Check for chemistry lock-in (PACK 226)
    const chemistrySnap = await db.collection('conversations')
      .where('participants', 'array-contains', userId)
      .where('chemistryLockIn.isActive', '==', true)
      .limit(1)
      .get();
    
    if (!chemistrySnap.empty) {
      return {
        hasChemistryPeak: true,
        hasPendingMessage: false,
        chatId: chemistrySnap.docs[0].id,
      };
    }
    
    // Check for pending messages
    const chatsSnap = await db.collection('chats')
      .where('participants', 'array-contains', userId)
      .where('lastMessageAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .orderBy('lastMessageAt', 'desc')
      .limit(1)
      .get();
    
    if (!chatsSnap.empty) {
      const chat = chatsSnap.docs[0].data();
      const lastSender = chat.lastMessageSenderId;
      
      return {
        hasChemistryPeak: false,
        hasPendingMessage: lastSender !== userId,
        chatId: chatsSnap.docs[0].id,
      };
    }
    
    return { hasChemistryPeak: false, hasPendingMessage: false };
  } catch (error) {
    return { hasChemistryPeak: false, hasPendingMessage: false };
  }
}

async function checkRecognition(userId: string): Promise<{
  newViews: number;
  newCompliments: number;
}> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const lastChecked = userData?.lastRecognitionCheck || new Date(0);
    
    // Check profile views
    const viewsSnap = await db.collection('profile_views')
      .where('profileUserId', '==', userId)
      .where('viewedAt', '>', lastChecked)
      .get();
    
    // Check compliments
    const complimentsSnap = await db.collection('compliments')
      .where('recipientId', '==', userId)
      .where('createdAt', '>', lastChecked)
      .get();
    
    return {
      newViews: viewsSnap.size,
      newCompliments: complimentsSnap.size,
    };
  } catch (error) {
    return { newViews: 0, newCompliments: 0 };
  }
}

async function checkGrowthProgress(userId: string): Promise<{
  nearRoyalMilestone: boolean;
  canLevelUp: boolean;
  stepsToRoyal?: number;
}> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Check Royal tier progress
    if (userData?.tier !== 'royal') {
      // Check if close to Royal
      const royalProgress = userData?.royalProgress || 0;
      if (royalProgress > 70) {
        return {
          nearRoyalMilestone: true,
          canLevelUp: false,
          stepsToRoyal: Math.ceil((100 - royalProgress) / 10),
        };
      }
    }
    
    // Check level progress
    const currentLevel = userData?.level || 1;
    const currentXP = userData?.experience || 0;
    const nextLevelXP = currentLevel * 1000; // Simple calculation
    
    if (currentXP >= nextLevelXP) {
      return {
        nearRoyalMilestone: false,
        canLevelUp: true,
      };
    }
    
    return {
      nearRoyalMilestone: false,
      canLevelUp: false,
    };
  } catch (error) {
    return {
      nearRoyalMilestone: false,
      canLevelUp: false,
    };
  }
}

async function checkOpportunities(userId: string): Promise<{
  hasNearbyEvents: boolean;
  shouldTravelMode: boolean;
  isDestinyWeek: boolean;
  eventCount?: number;
}> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userLocation = userData?.location;
    
    // Check destiny weeks (PACK 223)
    const destinySnap = await db.collection('destiny_user_states')
      .doc(userId)
      .get();
    
    const isDestinyWeek = destinySnap.exists && destinySnap.data()?.isActive;
    
    // Check nearby events
    if (userLocation) {
      const nearbyEvents = await db.collection('events')
        .where('status', '==', 'upcoming')
        .where('location.city', '==', userLocation.city)
        .where('startDate', '>', new Date())
        .where('startDate', '<', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        .limit(5)
        .get();
      
      if (!nearbyEvents.empty) {
        return {
          hasNearbyEvents: true,
          shouldTravelMode: false,
          isDestinyWeek,
          eventCount: nearbyEvents.size,
        };
      }
    }
    
    // Check if user should activate travel mode
    const hasPassport = userData?.features?.passport === true;
    const travelModeActive = userData?.travelMode?.active === true;
    
    return {
      hasNearbyEvents: false,
      shouldTravelMode: hasPassport && !travelModeActive,
      isDestinyWeek,
    };
  } catch (error) {
    return {
      hasNearbyEvents: false,
      shouldTravelMode: false,
      isDestinyWeek: false,
    };
  }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get user's desire loop settings
 */
export async function getDesireLoopSettings(userId: string): Promise<DesireLoopSettings> {
  const settingsSnap = await db.collection('users').doc(userId)
    .collection('settings').doc('desire_loop').get();
  
  if (settingsSnap.exists) {
    return settingsSnap.data() as DesireLoopSettings;
  }
  
  // Default settings
  const state = await getDesireState(userId);
  return {
    enabled: true,
    frequency: state.frequency,
    enabledDrivers: state.enabledDrivers,
    maxTriggersPerDay: MAX_TRIGGERS_PER_DAY[state.frequency],
  };
}

/**
 * Update user's desire loop settings
 */
export async function updateDesireLoopSettings(
  userId: string,
  settings: Partial<DesireLoopSettings>
): Promise<void> {
  await db.collection('users').doc(userId)
    .collection('settings').doc('desire_loop')
    .set(settings, { merge: true });
  
  // Update main state if frequency changed
  if (settings.frequency) {
    await db.collection('desire_states').doc(userId).update({
      frequency: settings.frequency,
      updatedAt: serverTimestamp(),
    });
  }
  
  if (settings.enabledDrivers) {
    await db.collection('desire_states').doc(userId).update({
      enabledDrivers: settings.enabledDrivers,
      updatedAt: serverTimestamp(),
    });
  }
}

// ============================================================================
// TRIGGER MANAGEMENT
// ============================================================================

/**
 * Get today's trigger count for user
 */
async function getTodayTriggerCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const triggersSnap = await db.collection('desire_loop_triggers')
    .where('userId', '==', userId)
    .where('createdAt', '>=', today)
    .get();
  
  return triggersSnap.size;
}

/**
 * Get active triggers for user
 */
export async function getActiveTriggers(userId: string): Promise<DesireLoopTrigger[]> {
  const now = new Date();
  
  const triggersSnap = await db.collection('desire_loop_triggers')
    .where('userId', '==', userId)
    .where('dismissed', '==', false)
    .where('actioned', '==', false)
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'desc')
    .orderBy('priority', 'desc')
    .limit(1)
    .get();
  
  return triggersSnap.docs.map(doc => doc.data() as DesireLoopTrigger);
}

/**
 * Dismiss a trigger
 */
export async function dismissTrigger(triggerId: string): Promise<void> {
  await db.collection('desire_loop_triggers').doc(triggerId).update({
    dismissed: true,
    dismissedAt: serverTimestamp(),
  });
}

/**
 * Mark trigger as actioned
 */
export async function actionTrigger(triggerId: string): Promise<void> {
  await db.collection('desire_loop_triggers').doc(triggerId).update({
    actioned: true,
    actionedAt: serverTimestamp(),
  });
  
  // Get trigger to restore appropriate driver
  const triggerSnap = await db.collection('desire_loop_triggers').doc(triggerId).get();
  if (triggerSnap.exists) {
    const trigger = triggerSnap.data() as DesireLoopTrigger;
    await restoreDesireDriver(trigger.userId, trigger.driverType, trigger.triggerType);
  }
}

// ============================================================================
// ANALYTICS & HISTORY
// ============================================================================

/**
 * Create daily desire state snapshot
 */
export async function createDailyDesireSnapshot(): Promise<void> {
  const statesSnap = await db.collection('desire_states').limit(1000).get();
  const date = new Date().toISOString().split('T')[0];
  
  for (const stateDoc of statesSnap.docs) {
    const state = stateDoc.data() as DesireState;
    
    // Get today's trigger stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const triggersSnap = await db.collection('desire_loop_triggers')
      .where('userId', '==', state.userId)
      .where('createdAt', '>=', today)
      .get();
    
    const triggersActioned = triggersSnap.docs.filter(
      doc => doc.data().actioned === true
    ).length;
    
    await db.collection('desire_state_history').add({
      historyId: generateId(),
      userId: state.userId,
      date,
      curiosity: state.curiosity,
      intimacy: state.intimacy,
      recognition: state.recognition,
      growth: state.growth,
      opportunity: state.opportunity,
      triggersShown: triggersSnap.size,
      triggersActioned,
      createdAt: serverTimestamp(),
    });
  }
}

/**
 * Clean up expired triggers and cooldowns
 */
export async function cleanupExpiredData(): Promise<{ triggers: number; cooldowns: number }> {
  const now = new Date();
  
  // Clean expired triggers
  const expiredTriggersSnap = await db.collection('desire_loop_triggers')
    .where('expiresAt', '<', now)
    .limit(500)
    .get();
  
  const triggerBatch = db.batch();
  expiredTriggersSnap.docs.forEach(doc => triggerBatch.delete(doc.ref));
  await triggerBatch.commit();
  
  // Clean expired cooldowns
  const expiredCooldownsSnap = await db.collection('desire_loop_cooldowns')
    .where('expiresAt', '<', now)
    .limit(500)
    .get();
  
  const cooldownBatch = db.batch();
  expiredCooldownsSnap.docs.forEach(doc => cooldownBatch.delete(doc.ref));
  await cooldownBatch.commit();
  
  return {
    triggers: expiredTriggersSnap.size,
    cooldowns: expiredCooldownsSnap.size,
  };
}

// ============================================================================
// SAFETY INTEGRATION
// ============================================================================

/**
 * Activate anxiety relief mode (pauses all triggers)
 */
export async function activateAnxietyReliefMode(userId: string): Promise<void> {
  await db.collection('desire_states').doc(userId).update({
    anxietyReliefMode: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deactivate anxiety relief mode
 */
export async function deactivateAnxietyReliefMode(userId: string): Promise<void> {
  await db.collection('desire_states').doc(userId).update({
    anxietyReliefMode: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set sleep mode (pauses triggers until specified time)
 */
export async function setSleepMode(userId: string, untilTimestamp: Date): Promise<void> {
  await db.collection('desire_states').doc(userId).update({
    sleepModeUntil: untilTimestamp,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set breakup cooldown (from PACK 222)
 */
export async function setBreakupCooldown(userId: string, durationDays: number): Promise<void> {
  const cooldownUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await db.collection('desire_states').doc(userId).update({
    breakupCooldownUntil: cooldownUntil,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set toxic contact cooldown
 */
export async function setToxicCooldown(userId: string, durationDays: number): Promise<void> {
  const cooldownUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await db.collection('desire_states').doc(userId).update({
    toxicCooldownUntil: cooldownUntil,
    updatedAt: serverTimestamp(),
  });
}