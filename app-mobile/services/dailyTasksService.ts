/**
 * Daily Smart Tasks Engine - Local-Only Task Management
 * PACK 37: Open-Contact Model, No Matchmaking, Pure Client-Side
 * 
 * Core Features:
 * - AsyncStorage-only persistence
 * - Max 3 tasks per day
 * - No backend/Firestore integration
 * - Open-contact model (no "matches" concept)
 * - Deterministic daily task generation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for daily tasks state
const STORAGE_KEY_PREFIX = 'daily_tasks_state_v1';

/**
 * Task types aligned with open-contact model
 * NO "matches" or matchmaking concepts
 */
export type DailyTaskType =
  | 'ADD_PHOTO'
  | 'SEND_MESSAGE_PROFILE_VISITED'
  | 'REPLY_UNREAD'
  | 'DO_10_SWIPES'
  | 'OPEN_SMART_SUGGESTIONS'
  | 'OPEN_LIVE_TAB'
  | 'BROWSE_PPV_GALLERY'
  | 'OPEN_AI_COMPANION'
  | 'VISIT_PROFILE_WHO_VISITED_YOU'
  | 'EDIT_PROFILE_SECTION'
  | 'OPEN_EXPLORE_TRENDING'
  | 'SET_MOOD_STATUS';

/**
 * Individual task definition
 */
export interface DailyTask {
  id: string;
  type: DailyTaskType;
  titleKey: string;       // i18n key for title
  descriptionKey: string; // i18n key for description
  completed: boolean;
}

/**
 * Daily tasks state structure
 */
export interface DailyTasksState {
  date: string; // 'YYYY-MM-DD' format
  tasks: DailyTask[];
}

/**
 * Task template definition with metadata
 */
interface TaskTemplate {
  type: DailyTaskType;
  titleKey: string;
  descriptionKey: string;
  weight: number; // Higher weight = higher priority
  eligibilityCheck?: (userId: string) => Promise<boolean>;
}

/**
 * All available task templates (12 types as per spec)
 */
const TASK_TEMPLATES: TaskTemplate[] = [
  {
    type: 'ADD_PHOTO',
    titleKey: 'dailyTasks.ADD_PHOTO.title',
    descriptionKey: 'dailyTasks.ADD_PHOTO.description',
    weight: 10,
    eligibilityCheck: async (userId: string) => {
      // Check if user has few photos
      try {
        const profileKey = `profile_${userId}`;
        const profileData = await AsyncStorage.getItem(profileKey);
        if (profileData) {
          const profile = JSON.parse(profileData);
          return !profile.photos || profile.photos.length < 3;
        }
      } catch (error) {
        console.error('Error checking photo eligibility:', error);
      }
      return true;
    },
  },
  {
    type: 'SEND_MESSAGE_PROFILE_VISITED',
    titleKey: 'dailyTasks.SEND_MESSAGE_PROFILE_VISITED.title',
    descriptionKey: 'dailyTasks.SEND_MESSAGE_PROFILE_VISITED.description',
    weight: 8,
  },
  {
    type: 'REPLY_UNREAD',
    titleKey: 'dailyTasks.REPLY_UNREAD.title',
    descriptionKey: 'dailyTasks.REPLY_UNREAD.description',
    weight: 9,
  },
  {
    type: 'DO_10_SWIPES',
    titleKey: 'dailyTasks.DO_10_SWIPES.title',
    descriptionKey: 'dailyTasks.DO_10_SWIPES.description',
    weight: 7,
  },
  {
    type: 'OPEN_SMART_SUGGESTIONS',
    titleKey: 'dailyTasks.OPEN_SMART_SUGGESTIONS.title',
    descriptionKey: 'dailyTasks.OPEN_SMART_SUGGESTIONS.description',
    weight: 6,
  },
  {
    type: 'OPEN_LIVE_TAB',
    titleKey: 'dailyTasks.OPEN_LIVE_TAB.title',
    descriptionKey: 'dailyTasks.OPEN_LIVE_TAB.description',
    weight: 5,
  },
  {
    type: 'BROWSE_PPV_GALLERY',
    titleKey: 'dailyTasks.BROWSE_PPV_GALLERY.title',
    descriptionKey: 'dailyTasks.BROWSE_PPV_GALLERY.description',
    weight: 4,
  },
  {
    type: 'OPEN_AI_COMPANION',
    titleKey: 'dailyTasks.OPEN_AI_COMPANION.title',
    descriptionKey: 'dailyTasks.OPEN_AI_COMPANION.description',
    weight: 5,
  },
  {
    type: 'VISIT_PROFILE_WHO_VISITED_YOU',
    titleKey: 'dailyTasks.VISIT_PROFILE_WHO_VISITED_YOU.title',
    descriptionKey: 'dailyTasks.VISIT_PROFILE_WHO_VISITED_YOU.description',
    weight: 6,
  },
  {
    type: 'EDIT_PROFILE_SECTION',
    titleKey: 'dailyTasks.EDIT_PROFILE_SECTION.title',
    descriptionKey: 'dailyTasks.EDIT_PROFILE_SECTION.description',
    weight: 7,
  },
  {
    type: 'OPEN_EXPLORE_TRENDING',
    titleKey: 'dailyTasks.OPEN_EXPLORE_TRENDING.title',
    descriptionKey: 'dailyTasks.OPEN_EXPLORE_TRENDING.description',
    weight: 5,
  },
  {
    type: 'SET_MOOD_STATUS',
    titleKey: 'dailyTasks.SET_MOOD_STATUS.title',
    descriptionKey: 'dailyTasks.SET_MOOD_STATUS.description',
    weight: 4,
  },
];

/**
 * Get current date in YYYY-MM-DD format (local timezone)
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate a deterministic seed from userId and date
 * This ensures same tasks for same user on same day
 */
function generateSeed(userId: string, date: string): number {
  const str = `${userId}_${date}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator (for deterministic task selection)
 */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/**
 * Generate tasks for today based on user context
 */
async function generateTasksForToday(userId: string): Promise<DailyTask[]> {
  const today = getTodayDateString();
  const seed = generateSeed(userId, today);
  const random = seededRandom(seed);
  
  // Filter eligible tasks
  const eligibleTemplates: TaskTemplate[] = [];
  
  for (const template of TASK_TEMPLATES) {
    if (template.eligibilityCheck) {
      const isEligible = await template.eligibilityCheck(userId);
      if (isEligible) {
        eligibleTemplates.push(template);
      }
    } else {
      eligibleTemplates.push(template);
    }
  }
  
  // If no eligible tasks, use all templates
  const availableTemplates = eligibleTemplates.length > 0 ? eligibleTemplates : TASK_TEMPLATES;
  
  // Weighted random selection (max 3 tasks)
  const selectedTemplates: TaskTemplate[] = [];
  const tempTemplates = [...availableTemplates];
  
  const numTasks = Math.min(3, tempTemplates.length);
  
  for (let i = 0; i < numTasks; i++) {
    if (tempTemplates.length === 0) break;
    
    // Calculate total weight
    const totalWeight = tempTemplates.reduce((sum, t) => sum + t.weight, 0);
    
    // Select based on weight
    let randomValue = random() * totalWeight;
    let selectedIndex = 0;
    
    for (let j = 0; j < tempTemplates.length; j++) {
      randomValue -= tempTemplates[j].weight;
      if (randomValue <= 0) {
        selectedIndex = j;
        break;
      }
    }
    
    selectedTemplates.push(tempTemplates[selectedIndex]);
    tempTemplates.splice(selectedIndex, 1);
  }
  
  // Convert templates to tasks
  const tasks: DailyTask[] = selectedTemplates.map((template, index) => ({
    id: `${today}_${template.type}_${index}`,
    type: template.type,
    titleKey: template.titleKey,
    descriptionKey: template.descriptionKey,
    completed: false,
  }));
  
  return tasks;
}

/**
 * Get storage key for user's daily tasks
 */
function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}_${userId}`;
}

/**
 * Load daily tasks state from AsyncStorage
 */
async function loadTasksState(userId: string): Promise<DailyTasksState | null> {
  try {
    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading daily tasks state:', error);
  }
  return null;
}

/**
 * Save daily tasks state to AsyncStorage
 */
async function saveTasksState(userId: string, state: DailyTasksState): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving daily tasks state:', error);
    throw error;
  }
}

/**
 * PUBLIC API: Get daily tasks for user
 * Automatically regenerates if date has changed
 */
export async function getDailyTasks(userId: string): Promise<DailyTasksState> {
  const today = getTodayDateString();
  
  // Load existing state
  const existingState = await loadTasksState(userId);
  
  // Check if we need to regenerate
  if (!existingState || existingState.date !== today) {
    // Generate new tasks for today
    const newTasks = await generateTasksForToday(userId);
    const newState: DailyTasksState = {
      date: today,
      tasks: newTasks,
    };
    
    // Save and return
    await saveTasksState(userId, newState);
    return newState;
  }
  
  // Return existing state
  return existingState;
}

/**
 * PUBLIC API: Mark a task as completed
 */
export async function markTaskCompleted(userId: string, taskId: string): Promise<void> {
  const state = await loadTasksState(userId);
  
  if (!state) {
    console.error('No daily tasks state found');
    return;
  }
  
  // Find and mark task as completed
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = true;
    await saveTasksState(userId, state);
  }
}

/**
 * PUBLIC API: Reset tasks for today (useful for testing or manual refresh)
 */
export async function resetTasksForToday(userId: string): Promise<DailyTasksState> {
  const today = getTodayDateString();
  
  // Generate fresh tasks
  const newTasks = await generateTasksForToday(userId);
  const newState: DailyTasksState = {
    date: today,
    tasks: newTasks,
  };
  
  // Save and return
  await saveTasksState(userId, newState);
  return newState;
}