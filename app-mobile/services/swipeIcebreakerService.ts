/**
 * Swipe Icebreaker Service
 * PACK 38: Deterministic, profile-aware icebreaker template engine
 * No backend, no AI, no network calls - pure TypeScript logic
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type SwipeIcebreakerStyle = 'ELEGANT' | 'PLAYFUL' | 'CONFIDENT';

export interface SwipeIcebreakerSettings {
  userId: string;
  preferredStyle: SwipeIcebreakerStyle;
  autoSendOnSwipe: boolean;
  lastUpdatedAt: number;
}

export interface SwipeIcebreakerContext {
  viewerId: string;
  targetId: string;
  viewerDisplayName?: string | null;
  targetDisplayName?: string | null;
  targetCity?: string | null;
  targetInterests?: string[];
  viewerGender?: string | null;
  targetGender?: string | null;
}

interface SwipeIcebreakerTemplate {
  template: string;
  requiresInterest?: boolean;
  requiresCity?: boolean;
}

// Storage keys
const STORAGE_KEY_PREFIX = 'swipe_icebreakers_settings_v1_';

// Template library organized by style
const TEMPLATES: Record<SwipeIcebreakerStyle, SwipeIcebreakerTemplate[]> = {
  ELEGANT: [
    {
      template: 'Hi {{targetName}}, your profile caught my eye. How has your week been treating you?',
      requiresInterest: false,
    },
    {
      template: 'Hello {{targetName}}, I noticed we share an interest in {{interest}}. What drew you to it?',
      requiresInterest: true,
    },
    {
      template: 'Hi {{targetName}}, your profile stands out. I would love to know more about you.',
      requiresInterest: false,
    },
    {
      template: 'Hello {{targetName}}, I see you are passionate about {{interest}}. That is something I truly appreciate.',
      requiresInterest: true,
    },
    {
      template: 'Hi {{targetName}} from {{targetCity}}, your vibe really resonates with me. What is inspiring you lately?',
      requiresCity: true,
    },
    {
      template: 'Hello {{targetName}}, I find your profile quite intriguing. What matters most to you right now?',
      requiresInterest: false,
    },
  ],
  PLAYFUL: [
    {
      template: 'Hey {{targetName}}! Your profile made me smile. What is the best thing that happened to you today?',
      requiresInterest: false,
    },
    {
      template: 'Hi {{targetName}}! I saw {{interest}} on your profile and had to swipe. What is your favorite story about it?',
      requiresInterest: true,
    },
    {
      template: 'Hey {{targetName}}! Quick question: coffee or tea? (This is very important) ☕',
      requiresInterest: false,
    },
    {
      template: 'Hi {{targetName}}! So {{interest}} caught my attention... are you the expert or still learning?',
      requiresInterest: true,
    },
    {
      template: 'Hey {{targetName}}! {{targetCity}} seems cool. What is the one thing everyone should try there?',
      requiresCity: true,
    },
    {
      template: 'Hi {{targetName}}! Your energy is great. If we grabbed a drink, what would be your go-to order?',
      requiresInterest: false,
    },
  ],
  CONFIDENT: [
    {
      template: 'Hi {{targetName}}, I like your vibe. What are you looking for here?',
      requiresInterest: false,
    },
    {
      template: 'Hey {{targetName}}, {{interest}} on your profile resonated with me. Let us talk about it.',
      requiresInterest: true,
    },
    {
      template: 'Hi {{targetName}}, straight up - your profile is genuine. What is your story?',
      requiresInterest: false,
    },
    {
      template: 'Hey {{targetName}}, I noticed {{interest}}. That shows good taste. What else defines you?',
      requiresInterest: true,
    },
    {
      template: 'Hi {{targetName}}, if we met in {{targetCity}} for coffee, what would we talk about first?',
      requiresCity: true,
    },
    {
      template: 'Hey {{targetName}}, I appreciate authenticity. Your profile feels real. What drives you?',
      requiresInterest: false,
    },
  ],
};

// Fallback templates when specific data is unavailable
const FALLBACK_TEMPLATES: Record<SwipeIcebreakerStyle, string> = {
  ELEGANT: 'Hello, your profile caught my attention. I would love to get to know you better.',
  PLAYFUL: 'Hey there! Your profile made me smile. What is your story?',
  CONFIDENT: 'Hi, I like your energy. Let us chat and see where this goes.',
};

/**
 * Get swipe icebreaker settings for a user
 */
export async function getSwipeIcebreakerSettings(
  userId: string
): Promise<SwipeIcebreakerSettings> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    const data = await AsyncStorage.getItem(key);

    if (data) {
      return JSON.parse(data);
    }

    // Return defaults if no settings exist
    return {
      userId,
      preferredStyle: 'ELEGANT',
      autoSendOnSwipe: true,
      lastUpdatedAt: Date.now(),
    };
  } catch (error) {
    console.error('[SwipeIcebreaker] Error loading settings:', error);
    // Return defaults on error
    return {
      userId,
      preferredStyle: 'ELEGANT',
      autoSendOnSwipe: true,
      lastUpdatedAt: Date.now(),
    };
  }
}

/**
 * Update swipe icebreaker settings for a user
 */
export async function updateSwipeIcebreakerSettings(
  userId: string,
  partial: Partial<Omit<SwipeIcebreakerSettings, 'userId' | 'lastUpdatedAt'>>
): Promise<SwipeIcebreakerSettings> {
  try {
    const current = await getSwipeIcebreakerSettings(userId);

    const updated: SwipeIcebreakerSettings = {
      ...current,
      ...partial,
      userId,
      lastUpdatedAt: Date.now(),
    };

    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(updated));

    return updated;
  } catch (error) {
    console.error('[SwipeIcebreaker] Error updating settings:', error);
    throw error;
  }
}

/**
 * Generate a deterministic hash from two user IDs
 * Used to select template consistently for the same pair
 */
function generatePairHash(viewerId: string, targetId: string): number {
  const combined = `${viewerId}_${targetId}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

/**
 * Select an appropriate interest from the target's interests
 */
function selectInterest(
  interests: string[] | undefined,
  hash: number
): string | null {
  if (!interests || interests.length === 0) {
    return null;
  }

  // Use hash to deterministically select an interest
  const index = hash % interests.length;
  return interests[index];
}

/**
 * Replace template tokens with actual data
 */
function fillTemplate(
  template: string,
  context: SwipeIcebreakerContext,
  selectedInterest: string | null
): string {
  let message = template;

  // Replace target name (required)
  message = message.replace(
    /\{\{targetName\}\}/g,
    context.targetDisplayName || 'there'
  );

  // Replace interest if available
  if (selectedInterest) {
    message = message.replace(/\{\{interest\}\}/g, selectedInterest);
  }

  // Replace city if available
  if (context.targetCity) {
    message = message.replace(/\{\{targetCity\}\}/g, context.targetCity);
  }

  return message;
}

/**
 * Generate a swipe icebreaker message
 * Core deterministic template selection and personalization logic
 */
export function generateSwipeIcebreaker(
  settings: SwipeIcebreakerSettings,
  context: SwipeIcebreakerContext
): string {
  const style = settings.preferredStyle;
  const templates = TEMPLATES[style];

  // Generate deterministic hash for this viewer-target pair
  const pairHash = generatePairHash(context.viewerId, context.targetId);

  // Select an interest if available
  const selectedInterest = selectInterest(context.targetInterests, pairHash);

  // Filter templates based on available data
  let eligibleTemplates = templates.filter((t) => {
    if (t.requiresInterest && !selectedInterest) return false;
    if (t.requiresCity && !context.targetCity) return false;
    return true;
  });

  // If no eligible templates (shouldn't happen), use all templates
  if (eligibleTemplates.length === 0) {
    eligibleTemplates = templates;
  }

  // Select template deterministically based on hash
  const templateIndex = pairHash % eligibleTemplates.length;
  const selectedTemplate = eligibleTemplates[templateIndex];

  // If we have a template, fill it
  if (selectedTemplate) {
    return fillTemplate(selectedTemplate.template, context, selectedInterest);
  }

  // Ultimate fallback (should never reach here)
  return FALLBACK_TEMPLATES[style];
}

/**
 * Generate multiple icebreaker variations for picker UI
 * Returns 3-5 different messages to choose from
 */
export function generateIcebreakerVariations(
  settings: SwipeIcebreakerSettings,
  context: SwipeIcebreakerContext,
  count: number = 4
): string[] {
  const style = settings.preferredStyle;
  const templates = TEMPLATES[style];
  const variations: string[] = [];

  // Generate base hash
  const baseHash = generatePairHash(context.viewerId, context.targetId);
  const selectedInterest = selectInterest(context.targetInterests, baseHash);

  // Filter eligible templates
  let eligibleTemplates = templates.filter((t) => {
    if (t.requiresInterest && !selectedInterest) return false;
    if (t.requiresCity && !context.targetCity) return false;
    return true;
  });

  if (eligibleTemplates.length === 0) {
    eligibleTemplates = templates;
  }

  // Generate variations using different template indices
  const maxVariations = Math.min(count, eligibleTemplates.length);
  const indices = new Set<number>();

  // Ensure we get unique template selections
  while (indices.size < maxVariations && indices.size < eligibleTemplates.length) {
    const index = (baseHash + indices.size) % eligibleTemplates.length;
    indices.add(index);
  }

  // Create messages from selected templates
  Array.from(indices).forEach((index) => {
    const template = eligibleTemplates[index];
    const message = fillTemplate(template.template, context, selectedInterest);
    variations.push(message);
  });

  // If we still don't have enough, add fallback
  if (variations.length === 0) {
    variations.push(FALLBACK_TEMPLATES[style]);
  }

  return variations;
}

/**
 * Helper function to get or create icebreaker for a swipe
 * Combines settings fetch and message generation
 */
export async function getOrCreateIcebreakerForSwipe(
  viewerId: string,
  context: SwipeIcebreakerContext
): Promise<{ message: string; settings: SwipeIcebreakerSettings }> {
  try {
    const settings = await getSwipeIcebreakerSettings(viewerId);
    const message = generateSwipeIcebreaker(settings, context);

    return { message, settings };
  } catch (error) {
    console.error('[SwipeIcebreaker] Error creating icebreaker:', error);

    // Fallback to safe defaults
    const fallbackSettings: SwipeIcebreakerSettings = {
      userId: viewerId,
      preferredStyle: 'ELEGANT',
      autoSendOnSwipe: true,
      lastUpdatedAt: Date.now(),
    };

    return {
      message: 'Hi, your profile caught my attention. I would love to get to know you better.',
      settings: fallbackSettings,
    };
  }
}