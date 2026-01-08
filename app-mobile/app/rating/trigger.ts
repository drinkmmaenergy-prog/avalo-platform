/**
 * PACK 411 — In-App Rating Trigger (Mobile)
 * Client-side helper for rating prompt logic
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { RatingPromptDecision } from "@/shared/types/pack411-reviews";
import { getAppVersion } from "@/utils/app-info";

const functions = getFunctions();

/**
 * Check if user should be prompted for rating
 */
export async function checkRatingPromptEligibility(): Promise<RatingPromptDecision> {
  try {
    const appVersion = await getAppVersion();
    const checkDecision = httpsCallable<
      { appVersion: string },
      RatingPromptDecision
    >(functions, 'pack411_ratingPromptDecision');

    const result = await checkDecision({ appVersion });
    return result.data;
  } catch (error) {
    console.error('Error checking rating prompt eligibility:', error);
    // Default to not prompting on error
    return {
      shouldPrompt: false,
      reason: 'NEW_USER',
    };
  }
}

/**
 * Log rating prompt event
 */
export async function logRatingPrompt(
  decision: RatingPromptDecision,
  userAction?: 'DISMISSED' | 'RATED_1' | 'RATED_2' | 'RATED_3' | 'RATED_4' | 'RATED_5' | 'FEEDBACK',
  redirectedToStore: boolean = false,
  linkedSupportTicketId?: string
): Promise<void> {
  try {
    const appVersion = await getAppVersion();
    const logPrompt = httpsCallable(functions, 'pack411_logRatingPrompt');

    await logPrompt({
      appVersion,
      decision,
      userAction,
      redirectedToStore,
      linkedSupportTicketId,
    });
  } catch (error) {
    console.error('Error logging rating prompt:', error);
  }
}

/**
 * Create feedback ticket for negative rating
 */
export async function createFeedbackTicket(
  rating: 1 | 2 | 3,
  feedback: string,
  screenshot?: string
): Promise<string | null> {
  try {
    const appVersion = await getAppVersion();
    const createTicket = httpsCallable<
      { rating: number; feedback: string; appVersion: string; screenshot?: string },
      { success: boolean; ticketId: string }
    >(functions, 'pack411_createFeedbackTicket');

    const result = await createTicket({
      rating,
      feedback,
      appVersion,
      screenshot,
    });

    return result.data.ticketId;
  } catch (error) {
    console.error('Error creating feedback ticket:', error);
    return null;
  }
}

