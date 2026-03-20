/**
 * AI Economy Configuration — Canonical AI companion pricing & word-per-token constants.
 *
 * INVARIANTS:
 *   - These values MUST match backend config exactly.
 *   - Do NOT change pricing without backend coordination.
 *   - AI_WORDS_PER_TOKEN is the canonical conversion rate for user-created bots.
 */

/** Words generated per 1 token for user-created AI bots. */
export const AI_WORDS_PER_TOKEN = 30;

/** Number of free messages before token billing begins. */
export const AI_FREE_MESSAGES = 3;

/** Cost per message in tokens (after free messages). */
export const AI_COST_PER_MESSAGE = 1;

/** Personality trait options for AI companions. */
export const AI_PERSONALITY_TRAITS = [
  'Friendly',
  'Romantic',
  'Intellectual',
  'Playful',
  'Mysterious',
  'Caring',
  'Adventurous',
  'Flirty',
  'Supportive',
  'Witty',
  'Confident',
  'Calm',
  'Energetic',
  'Creative',
  'Empathetic',
] as const;

export type AIPersonalityTrait = (typeof AI_PERSONALITY_TRAITS)[number];

/** Ethnicity options for AI companions. */
export const AI_ETHNICITY_OPTIONS = [
  'Asian',
  'Black',
  'Caucasian',
  'Hispanic/Latino',
  'Middle Eastern',
  'Mixed',
  'South Asian',
  'Other',
] as const;

export type AIEthnicity = (typeof AI_ETHNICITY_OPTIONS)[number];

/** Body type options for AI companions. */
export const AI_BODY_TYPE_OPTIONS = [
  'Slim',
  'Athletic',
  'Average',
  'Curvy',
  'Plus Size',
] as const;

export type AIBodyType = (typeof AI_BODY_TYPE_OPTIONS)[number];

/** Hair color options for AI companions. */
export const AI_HAIR_COLOR_OPTIONS = [
  'Blonde',
  'Brown',
  'Black',
  'Red',
  'Gray',
  'White',
  'Auburn',
  'Other',
] as const;

export type AIHairColor = (typeof AI_HAIR_COLOR_OPTIONS)[number];

/** Eye color options for AI companions. */
export const AI_EYE_COLOR_OPTIONS = [
  'Brown',
  'Blue',
  'Green',
  'Hazel',
  'Gray',
  'Amber',
  'Other',
] as const;

export type AIEyeColor = (typeof AI_EYE_COLOR_OPTIONS)[number];

/** Interest / hobby categories for AI companions. */
export const AI_INTEREST_OPTIONS = [
  'Travel',
  'Music',
  'Fitness',
  'Photography',
  'Cooking',
  'Reading',
  'Gaming',
  'Art',
  'Dancing',
  'Movies',
  'Fashion',
  'Sports',
  'Nature',
  'Yoga',
  'Hiking',
  'Tech',
  'Animals',
  'Nightlife',
  'Foodie',
  'Volunteering',
] as const;

export type AIInterest = (typeof AI_INTEREST_OPTIONS)[number];
