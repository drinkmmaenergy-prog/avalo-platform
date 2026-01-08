/**
 * PACK 239: Two Truths & One Lie Micro-Game
 * Type definitions and interfaces
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// GAME TYPES
// ============================================================================

export type MicroGameType = 'twoTruthsOneLie' | 'truthOrDare';

export type GameStatus = 
  | 'idle'              // Game created but not started
  | 'active'            // Player is writing statements
  | 'waitingForGuess'   // Waiting for opponent to guess
  | 'revealing'         // Showing the reveal
  | 'switching'         // Switching to next player
  | 'complete';         // Game finished

// ============================================================================
// TOPIC PRESETS (flirting-optimized)
// ============================================================================

export type TopicPreset =
  | 'things_you_do_when_you_like_someone'
  | 'unexpected_habits'
  | 'moments_youll_never_forget'
  | 'guilty_pleasures'
  | 'what_makes_you_attracted'
  | 'things_that_make_you_blush';

export interface TopicPresetConfig {
  id: TopicPreset;
  title: string;
  description: string;
  flirtLevel: 'mild' | 'medium' | 'spicy';
}

export const TOPIC_PRESETS: TopicPresetConfig[] = [
  {
    id: 'things_you_do_when_you_like_someone',
    title: 'Things you do when you like someone',
    description: 'Your secret moves when crushing',
    flirtLevel: 'medium',
  },
  {
    id: 'unexpected_habits',
    title: 'Unexpected habits',
    description: 'The quirks that make you unique',
    flirtLevel: 'mild',
  },
  {
    id: 'moments_youll_never_forget',
    title: "Moments you'll never forget",
    description: 'Unforgettable experiences',
    flirtLevel: 'medium',
  },
  {
    id: 'guilty_pleasures',
    title: 'Guilty pleasures',
    description: 'Things you secretly love',
    flirtLevel: 'medium',
  },
  {
    id: 'what_makes_you_attracted',
    title: 'What makes you attracted to someone',
    description: 'Your secret turn-ons',
    flirtLevel: 'spicy',
  },
  {
    id: 'things_that_make_you_blush',
    title: 'Things that make you blush',
    description: 'What gets you flustered',
    flirtLevel: 'spicy',
  },
];

// ============================================================================
// PACK 240: TRUTH OR DARE - PREMIUM MODE
// ============================================================================

export type TruthOrDareChoice = 'truth' | 'dare';

export type TruthOrDareCategory =
  | 'romantic'
  | 'emotional'
  | 'playful'
  | 'date_focused'
  | 'attraction_energy';

export interface TruthOrDarePrompt {
  id: string;
  type: TruthOrDareChoice;
  category: TruthOrDareCategory;
  intensity: 1 | 2 | 3; // Matches chemistry tier intensity
  prompt: string;
  monetizationTarget: 'chat' | 'voice_call' | 'video_call' | 'calendar' | 'gift';
}

// App-Store compliant prompts - NO explicit content
export const TRUTH_PROMPTS: TruthOrDarePrompt[] = [
  // ROMANTIC - Intensity 1-2
  {
    id: 'truth_romantic_1',
    type: 'truth',
    category: 'romantic',
    intensity: 1,
    prompt: 'What is the most surprising thing someone finds attractive about you?',
    monetizationTarget: 'chat',
  },
  {
    id: 'truth_romantic_2',
    type: 'truth',
    category: 'romantic',
    intensity: 2,
    prompt: "What's a moment that recently made your heart race?",
    monetizationTarget: 'chat',
  },
  {
    id: 'truth_romantic_3',
    type: 'truth',
    category: 'romantic',
    intensity: 2,
    prompt: 'What can someone do on a date that instantly impresses you?',
    monetizationTarget: 'calendar',
  },
  {
    id: 'truth_romantic_4',
    type: 'truth',
    category: 'romantic',
    intensity: 3,
    prompt: 'What makes you weak in the knees when someone does it?',
    monetizationTarget: 'video_call',
  },
  
  // EMOTIONAL - Intensity 1-2
  {
    id: 'truth_emotional_1',
    type: 'truth',
    category: 'emotional',
    intensity: 1,
    prompt: 'What quality do you value most in a romantic connection?',
    monetizationTarget: 'chat',
  },
  {
    id: 'truth_emotional_2',
    type: 'truth',
    category: 'emotional',
    intensity: 2,
    prompt: "What's a vulnerable moment that brought you closer to someone?",
    monetizationTarget: 'voice_call',
  },
  {
    id: 'truth_emotional_3',
    type: 'truth',
    category: 'emotional',
    intensity: 2,
    prompt: 'When was the last time someone made you feel truly special?',
    monetizationTarget: 'chat',
  },
  
  // PLAYFUL - Intensity 1-3
  {
    id: 'truth_playful_1',
    type: 'truth',
    category: 'playful',
    intensity: 1,
    prompt: 'What is your go-to move when you want to impress someone?',
    monetizationTarget: 'chat',
  },
  {
    id: 'truth_playful_2',
    type: 'truth',
    category: 'playful',
    intensity: 2,
    prompt: "What's the most adventurous thing on your date bucket list?",
    monetizationTarget: 'calendar',
  },
  {
    id: 'truth_playful_3',
    type: 'truth',
    category: 'playful',
    intensity: 3,
    prompt: 'What unexpectedly turns you on about someone?',
    monetizationTarget: 'video_call',
  },
  
  // DATE FOCUSED - Intensity 1-2
  {
    id: 'truth_date_1',
    type: 'truth',
    category: 'date_focused',
    intensity: 1,
    prompt: "What's your dream date scenario?",
    monetizationTarget: 'calendar',
  },
  {
    id: 'truth_date_2',
    type: 'truth',
    category: 'date_focused',
    intensity: 2,
    prompt: 'What would make a date unforgettable for you?',
    monetizationTarget: 'calendar',
  },
  
  // ATTRACTION ENERGY - Intensity 2-3
  {
    id: 'truth_attraction_1',
    type: 'truth',
    category: 'attraction_energy',
    intensity: 2,
    prompt: 'What physical feature do you notice first about someone?',
    monetizationTarget: 'video_call',
  },
  {
    id: 'truth_attraction_2',
    type: 'truth',
    category: 'attraction_energy',
    intensity: 3,
    prompt: 'What type of energy makes you instantly attracted to someone?',
    monetizationTarget: 'video_call',
  },
];

export const DARE_PROMPTS: TruthOrDarePrompt[] = [
  // ROMANTIC - Intensity 1-2
  {
    id: 'dare_romantic_1',
    type: 'dare',
    category: 'romantic',
    intensity: 1,
    prompt: 'Send a voice note describing your perfect date.',
    monetizationTarget: 'voice_call',
  },
  {
    id: 'dare_romantic_2',
    type: 'dare',
    category: 'romantic',
    intensity: 2,
    prompt: 'Share a photo of something you associate with comfort.',
    monetizationTarget: 'chat',
  },
  {
    id: 'dare_romantic_3',
    type: 'dare',
    category: 'romantic',
    intensity: 2,
    prompt: 'Say the most romantic compliment you can think of.',
    monetizationTarget: 'chat',
  },
  {
    id: 'dare_romantic_4',
    type: 'dare',
    category: 'romantic',
    intensity: 3,
    prompt: 'Record a voice note saying what you find most attractive about me.',
    monetizationTarget: 'voice_call',
  },
  
  // EMOTIONAL - Intensity 1-2
  {
    id: 'dare_emotional_1',
    type: 'dare',
    category: 'emotional',
    intensity: 1,
    prompt: 'Share a moment when you felt most alive.',
    monetizationTarget: 'chat',
  },
  {
    id: 'dare_emotional_2',
    type: 'dare',
    category: 'emotional',
    intensity: 2,
    prompt: 'Send a voice message describing a cherished memory.',
    monetizationTarget: 'voice_call',
  },
  
  // PLAYFUL - Intensity 1-3
  {
    id: 'dare_playful_1',
    type: 'dare',
    category: 'playful',
    intensity: 1,
    prompt: 'Share your most embarrassing flirting attempt.',
    monetizationTarget: 'chat',
  },
  {
    id: 'dare_playful_2',
    type: 'dare',
    category: 'playful',
    intensity: 2,
    prompt: 'Describe what you would wear on a dream date with me.',
    monetizationTarget: 'chat',
  },
  {
    id: 'dare_playful_3',
    type: 'dare',
    category: 'playful',
    intensity: 3,
    prompt: 'Send a voice note with your most charming laugh.',
    monetizationTarget: 'voice_call',
  },
  
  // DATE FOCUSED - Intensity 1-2
  {
    id: 'dare_date_1',
    type: 'dare',
    category: 'date_focused',
    intensity: 1,
    prompt: 'Suggest a specific date idea for us.',
    monetizationTarget: 'calendar',
  },
  {
    id: 'dare_date_2',
    type: 'dare',
    category: 'date_focused',
    intensity: 2,
    prompt: 'Plan out our ideal weekend together in detail.',
    monetizationTarget: 'calendar',
  },
  
  // ATTRACTION ENERGY - Intensity 2-3
  {
    id: 'dare_attraction_1',
    type: 'dare',
    category: 'attraction_energy',
    intensity: 2,
    prompt: 'Send a photo that best represents your vibe.',
    monetizationTarget: 'video_call',
  },
  {
    id: 'dare_attraction_2',
    type: 'dare',
    category: 'attraction_energy',
    intensity: 3,
    prompt: 'Describe in detail what attracts you to me.',
    monetizationTarget: 'video_call',
  },
];

// ============================================================================
// TRUTH OR DARE ELIGIBILITY
// ============================================================================

export interface TruthOrDareEligibility {
  isEligible: boolean;
  paidWordsExchanged: number;
  chemistryBoostersTriggered: number;
  hasSafetyFlags: boolean;
  bothUsersConsented: boolean;
  chemistryTier: number; // 0-10
  reasons: string[];
}

export function checkTruthOrDareEligibility(
  paidWordsExchanged: number,
  chemistryBoostersTriggered: number,
  hasSafetyFlags: boolean,
  bothUsersConsented: boolean,
  chemistryTier: number
): TruthOrDareEligibility {
  const reasons: string[] = [];
  
  if (paidWordsExchanged < 400) {
    reasons.push(`Need 400+ paid words (current: ${paidWordsExchanged})`);
  }
  
  if (chemistryBoostersTriggered < 2) {
    reasons.push(`Need 2+ chemistry boosters (current: ${chemistryBoostersTriggered})`);
  }
  
  if (hasSafetyFlags) {
    reasons.push('Safety flags present');
  }
  
  if (!bothUsersConsented) {
    reasons.push('Both users must enable Truth or Dare');
  }
  
  if (chemistryTier < 5) {
    reasons.push('Chemistry tier must be 5+');
  }
  
  const isEligible =
    paidWordsExchanged >= 400 &&
    chemistryBoostersTriggered >= 2 &&
    !hasSafetyFlags &&
    bothUsersConsented &&
    chemistryTier >= 5;
  
  return {
    isEligible,
    paidWordsExchanged,
    chemistryBoostersTriggered,
    hasSafetyFlags,
    bothUsersConsented,
    chemistryTier,
    reasons,
  };
}

export function getIntensityForChemistryTier(chemistryTier: number): 1 | 2 | 3 {
  if (chemistryTier >= 8) return 3;
  if (chemistryTier >= 5) return 2;
  return 1;
}

export function getAvailablePrompts(
  choice: TruthOrDareChoice,
  intensity: 1 | 2 | 3
): TruthOrDarePrompt[] {
  const prompts = choice === 'truth' ? TRUTH_PROMPTS : DARE_PROMPTS;
  return prompts.filter(p => p.intensity <= intensity);
}

export function selectRandomPrompt(
  choice: TruthOrDareChoice,
  intensity: 1 | 2 | 3,
  excludeIds: string[] = []
): TruthOrDarePrompt | null {
  const available = getAvailablePrompts(choice, intensity)
    .filter(p => !excludeIds.includes(p.id));
  
  if (available.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * available.length);
  return available[randomIndex];
}

// ============================================================================
// TRUTH OR DARE GAME DATA
// ============================================================================

export interface TruthOrDareRound {
  roundNumber: number;
  playerId: string;
  choice: TruthOrDareChoice;
  prompt: TruthOrDarePrompt;
  response?: string;
  responseType?: 'text' | 'voice' | 'photo';
  completedAt?: Timestamp;
  skipped?: boolean;
}

export interface TruthOrDareGameData extends Omit<MicroGameData, 'gameType' | 'rounds'> {
  gameType: 'truthOrDare';
  rounds: TruthOrDareRound[];
  
  // Truth or Dare specific
  intensity: 1 | 2 | 3;
  autoShutoffAt?: Timestamp; // 20 min without reply
  totalResponseTime: number; // seconds
  
  // Eligibility data (stored at game creation)
  eligibilitySnapshot: {
    paidWordsExchanged: number;
    chemistryBoostersTriggered: number;
    chemistryTier: number;
  };
}

// ============================================================================
// TRUTH OR DARE USER CONSENT
// ============================================================================

export interface TruthOrDareConsent {
  userId: string;
  enabled: boolean;
  enabledAt?: Timestamp;
  disabledAt?: Timestamp;
}

// ============================================================================
// STATEMENT DATA
// ============================================================================

export interface GameStatement {
  id: string;
  text: string;
  isLie: boolean;
  order: number; // 1, 2, or 3
}

export interface PlayerRound {
  playerId: string;
  statements: GameStatement[];
  selectedTopic?: TopicPreset;
  submittedAt?: Timestamp;
  guessedLieId?: string;
  guessedBy?: string;
  guessedAt?: Timestamp;
  wasCorrect?: boolean;
}

// ============================================================================
// MICRO-GAME DOCUMENT
// ============================================================================

export interface MicroGameData {
  gameId: string;
  chatId: string;
  gameType: MicroGameType;
  status: GameStatus;
  
  // Participants
  participants: string[];
  initiatorId: string;
  currentPlayerId: string;
  
  // Game state
  roundCount: number;
  rounds: PlayerRound[];
  
  // Spark chemistry tracking
  correctGuessStreak: number; // Both players guess correctly in sequence
  sparkThemeUnlocked: boolean;
  sparkThemeExpiresAt?: Timestamp;
  
  // Monetization triggers
  voiceCallSuggested: boolean;
  videoCallSuggested: boolean;
  calendarEventSuggested: boolean;
  
  // Timing
  createdAt: Timestamp;
  lastPlayed: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// SPARK THEME (cosmetic bonus)
// ============================================================================

export interface SparkTheme {
  themeId: string;
  chatId: string;
  unlockedAt: Timestamp;
  expiresAt: Timestamp; // 24 hours from unlock
  isActive: boolean;
  // Cosmetic only - chat gets special visual treatment
  themeStyle: {
    gradient: string[];
    accentColor: string;
    effectName: 'sparkles' | 'hearts' | 'fire';
  };
}

// ============================================================================
// USER SETTINGS
// ============================================================================

export interface MicroGameSettings {
  enabled: boolean; // Global disable
  allowedGames: MicroGameType[];
  autoAccept: boolean; // Auto-accept game invites
  notificationsEnabled: boolean;
  updatedAt: Timestamp;
}

// ============================================================================
// CHAT-SPECIFIC BLOCK
// ============================================================================

export interface MicroGameBlock {
  userId: string;
  chatId: string;
  blocked: boolean;
  reason?: string;
  createdAt: Timestamp;
}

// ============================================================================
// MONETIZATION TRIGGERS
// ============================================================================

export type MonetizationTrigger =
  | 'voice_note_challenge'
  | 'voice_call_suggestion'
  | 'video_call_suggestion'
  | 'calendar_event_suggestion'
  | 'gift_suggestion';

export interface MonetizationSuggestion {
  type: MonetizationTrigger;
  triggeredAt: Timestamp;
  context: string; // Why this was suggested (e.g., "Strong chemistry detected")
  shown: boolean;
  accepted?: boolean;
}

// ============================================================================
// GAME RESULT
// ============================================================================

export interface GameResult {
  gameId: string;
  winners: string[]; // Can be both if mutual chemistry
  totalRounds: number;
  correctGuesses: number;
  sparkThemeUnlocked: boolean;
  monetizationTriggers: MonetizationSuggestion[];
  completedAt: Timestamp;
  // Auto-generate memory log if both completed
  memoryLogGenerated: boolean;
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface MicroGameAnalytics {
  date: string; // YYYY-MM-DD
  gameType: MicroGameType;
  
  // Volume metrics
  gamesInitiated: number;
  gamesCompleted: number;
  gamesAbandoned: number;
  
  // Engagement metrics
  averageRounds: number;
  averageWordCount: number;
  averageSessionDuration: number; // seconds
  
  // Monetization metrics
  totalConversions: number;
  voiceCallConversions: number;
  videoCallConversions: number;
  calendarBookings: number;
  giftsTriggered: number;
  
  // Revenue attribution
  additionalTokensConsumed: number; // Extra chat tokens during/after game
  
  // Chemistry metrics
  sparkThemesUnlocked: number;
  memoryLogsGenerated: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SAFETY CHECKS
// ============================================================================

export interface SafetyContext {
  userId: string;
  chatId: string;
  
  // Safety flags that block micro-games
  sleepModeActive: boolean;
  breakupRecoveryActive: boolean;
  safetyFlagBetweenUsers: boolean;
  underageSuspicion: boolean;
  stalkerRisk: boolean;
}

export function canPlayMicroGame(safety: SafetyContext): boolean {
  return !safety.sleepModeActive &&
         !safety.breakupRecoveryActive &&
         !safety.safetyFlagBetweenUsers &&
         !safety.underageSuspicion &&
         !safety.stalkerRisk;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTopicPreset(id: TopicPreset): TopicPresetConfig | undefined {
  return TOPIC_PRESETS.find(preset => preset.id === id);
}

export function shouldUnlockSparkTheme(game: MicroGameData): boolean {
  // Unlock if both players guessed correctly twice in a row
  return game.correctGuessStreak >= 2 && !game.sparkThemeUnlocked;
}

export function calculateChemistryScore(rounds: PlayerRound[]): number {
  if (rounds.length === 0) return 0;
  
  const correctGuesses = rounds.filter(r => r.wasCorrect).length;
  const totalGuesses = rounds.filter(r => r.guessedAt != null).length;
  
  return totalGuesses > 0 ? (correctGuesses / totalGuesses) * 100 : 0;
}

export function shouldSuggestVoiceCall(game: MicroGameData): boolean {
  // Suggest after first successful reveal
  return game.roundCount >= 1 && 
         !game.voiceCallSuggested &&
         game.rounds.some(r => r.wasCorrect);
}

export function shouldSuggestVideoCall(game: MicroGameData): boolean {
  // Suggest if strong chemistry detected (both guessed correctly)
  return game.correctGuessStreak >= 2 && !game.videoCallSuggested;
}

export function shouldSuggestCalendarEvent(game: MicroGameData): boolean {
  // Suggest if game completed with high chemistry
  const chemistryScore = calculateChemistryScore(game.rounds);
  return game.status === 'complete' && 
         chemistryScore >= 75 && 
         !game.calendarEventSuggested;
}