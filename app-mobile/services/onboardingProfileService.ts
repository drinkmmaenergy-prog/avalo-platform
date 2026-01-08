/**
 * Onboarding Profile Service
 * Handles quiz answers storage and profile suggestion management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Quiz answers type
export type QuizAnswers = {
  goals?: string[];        // what they're looking for
  lifestyle?: string[];    // lifestyle chips
  values?: string[];       // things they care about most
  weekend?: string;        // free-text
  peopleType?: string[];   // type of people
};

// Profile suggestion type
export type AutoProfileSuggestion = {
  tagline: string;
  bio: string;
  interests: string[];
  lookingFor: string;
};

const QUIZ_ANSWERS_KEY = 'onboarding_quiz_answers';
const PROFILE_SUGGESTION_KEY = 'onboarding_profile_suggestion_applied';

/**
 * Save quiz answers to AsyncStorage
 */
export async function saveQuizAnswers(answers: QuizAnswers): Promise<void> {
  try {
    await AsyncStorage.setItem(QUIZ_ANSWERS_KEY, JSON.stringify(answers));
  } catch (error) {
    console.error('Failed to save quiz answers:', error);
    throw error;
  }
}

/**
 * Load quiz answers from AsyncStorage
 */
export async function loadQuizAnswers(): Promise<QuizAnswers | null> {
  try {
    const data = await AsyncStorage.getItem(QUIZ_ANSWERS_KEY);
    if (data) {
      return JSON.parse(data) as QuizAnswers;
    }
    return null;
  } catch (error) {
    console.error('Failed to load quiz answers:', error);
    return null;
  }
}

/**
 * Clear quiz answers from AsyncStorage
 */
export async function clearQuizAnswers(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUIZ_ANSWERS_KEY);
  } catch (error) {
    console.error('Failed to clear quiz answers:', error);
    throw error;
  }
}

/**
 * Save applied profile suggestion
 */
export async function saveAppliedSuggestion(suggestion: AutoProfileSuggestion): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_SUGGESTION_KEY, JSON.stringify(suggestion));
  } catch (error) {
    console.error('Failed to save applied suggestion:', error);
    throw error;
  }
}

/**
 * Load applied profile suggestion
 */
export async function loadAppliedSuggestion(): Promise<AutoProfileSuggestion | null> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_SUGGESTION_KEY);
    if (data) {
      return JSON.parse(data) as AutoProfileSuggestion;
    }
    return null;
  } catch (error) {
    console.error('Failed to load applied suggestion:', error);
    return null;
  }
}

/**
 * Clear applied profile suggestion
 */
export async function clearAppliedSuggestion(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_SUGGESTION_KEY);
  } catch (error) {
    console.error('Failed to clear applied suggestion:', error);
    throw error;
  }
}