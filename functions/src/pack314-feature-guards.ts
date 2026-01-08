/**
 * PACK 314 - Feature-Level Access Guards
 * 
 * Wrappers and decorators for enforcing feature flags on service endpoints
 * 
 * Region: europe-west3
 */

import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  validateFeatureAccess,
  validateFeatureAccessFull,
} from "./middleware/countryGuards";

/**
 * Feature guard wrapper for callable functions
 * 
 * Usage:
 * export const myFunction = withFeatureGuard("aiCompanions", async (request) => {
 *   // Your function logic here
 * });
 */
export function withFeatureGuard<T = any, R = any>(
  featureKey: "aiCompanions" | "eventsAndCalendar" | "passport" | "swipe" | "discovery" | "panicButton",
  handler: (request: CallableRequest<T>) => Promise<R>,
  options: {
    requireVerification?: boolean;
  } = {}
) {
  return async (request: CallableRequest<T>): Promise<R> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const language = (request.data as any)?.language || "en";

    try {
      // Apply feature guard
      await validateFeatureAccessFull(
        userId,
        featureKey,
        options.requireVerification || false,
        language
      );

      // Execute original handler
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(`Feature guard error for ${featureKey}:`, error);
      throw new HttpsError("internal", "Failed to validate feature access");
    }
  };
}

/**
 * Example: Swipe guard
 */
export async function guardSwipeAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccess(userId, "swipe", language);
}

/**
 * Example: Discovery guard
 */
export async function guardDiscoveryAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccess(userId, "discovery", language);
}

/**
 * Example: Events & Calendar guard (requires verification)
 */
export async function guardEventsAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccessFull(userId, "eventsAndCalendar", true, language);
}

/**
 * Example: AI Companions guard
 */
export async function guardAICompanionsAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccess(userId, "aiCompanions", language);
}

/**
 * Example: Passport guard
 */
export async function guardPassportAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccess(userId, "passport", language);
}

/**
 * Example: Panic Button guard
 */
export async function guardPanicButtonAccess(userId: string, language: string = "en"): Promise<void> {
  await validateFeatureAccess(userId, "panicButton", language);
}

/**
 * Middleware function to add to existing endpoints
 * 
 * Add this at the start of any endpoint that needs feature gating:
 * 
 * await enforceFeatureAccess(request.auth.uid, "aiCompanions");
 */
export async function enforceFeatureAccess(
  userId: string,
  featureKey: "aiCompanions" | "eventsAndCalendar" | "passport" | "swipe" | "discovery" | "panicButton",
  options: {
    requireVerification?: boolean;
    language?: string;
  } = {}
): Promise<void> {
  const { requireVerification = false, language = "en" } = options;

  await validateFeatureAccessFull(userId, featureKey, requireVerification, language);
  
  logger.debug("Feature access enforced", {
    userId,
    featureKey,
    requireVerification,
  });
}