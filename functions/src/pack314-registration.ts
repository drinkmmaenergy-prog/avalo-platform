/**
 * PACK 314 - Registration with Country Guards
 * 
 * Enhanced user registration with country rollout enforcement
 * 
 * Region: europe-west3
 */

import { onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  validateRegistrationCountry,
  validateAppVersion,
} from "./middleware/countryGuards";
import { FUNCTIONS_REGION } from "./config";

const db = getFirestore();

/**
 * Pre-registration validation
 * 
 * Call this BEFORE creating Firebase Auth user to validate:
 * - Country availability
 * - Country capacity
 * - App version requirements
 */
export const validateRegistration = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (request) => {
    try {
      const { countryCode, appVersion, language = "en" } = request.data;

      if (!countryCode) {
        return {
          allowed: false,
          reason: "Country code is required",
        };
      }

      // Validate country
      try {
        await validateRegistrationCountry(countryCode, language);
      } catch (error: any) {
        return {
          allowed: false,
          reason: error.message,
          code: "COUNTRY_BLOCKED",
        };
      }

      // Validate app version if provided
      if (appVersion) {
        const versionCheck = await validateAppVersion(appVersion, language);
        if (!versionCheck.allowed) {
          return {
            allowed: false,
            reason: versionCheck.message,
            code: "VERSION_OUTDATED",
            forceUpgrade: versionCheck.forceUpgrade,
          };
        }

        // Return recommendation if needed
        if (versionCheck.recommendUpgrade) {
          return {
            allowed: true,
            recommendUpgrade: true,
            upgradeMessage: versionCheck.message,
          };
        }
      }

      return {
        allowed: true,
        message: "Registration is allowed",
      };
    } catch (error) {
      logger.error("Error in validateRegistration:", error);
      return {
        allowed: false,
        reason: "Validation failed. Please try again.",
        code: "INTERNAL_ERROR",
      };
    }
  }
);

/**
 * Complete user profile after Firebase Auth creation
 * 
 * This should be called immediately after creating the Firebase Auth user
 * to complete the user profile with country information
 */
export const completeUserProfile = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error("User must be authenticated");
      }

      const userId = request.auth.uid;
      const {
        countryCode,
        displayName,
        dateOfBirth,
        gender,
        language = "en",
      } = request.data;

      // Validate country again (defense in depth)
      await validateRegistrationCountry(countryCode, language);

      // Normalize country code
      const normalizedCountry = countryCode.toUpperCase();

      // Create/update user profile
      await db.collection("users").doc(userId).set(
        {
          countryCode: normalizedCountry,
          displayName,
          dateOfBirth,
          gender,
          language,
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          registrationComplete: true,
        },
        { merge: true }
      );

      // Log audit event
      await db.collection("auditLogs").add({
        type: "USER_REGISTRATION_COMPLETE",
        userId,
        countryCode: normalizedCountry,
        timestamp: new Date(),
      });

      logger.info("User profile completed", {
        userId,
        countryCode: normalizedCountry,
      });

      return {
        success: true,
        userId,
        countryCode: normalizedCountry,
      };
    } catch (error) {
      logger.error("Error in completeUserProfile:", error);
      throw error;
    }
  }
);

/**
 * Firestore trigger - set country on user creation
 * 
 * This trigger runs when a user document is created to ensure
 * country code is properly set and tracked
 */
export const onUserDocumentCreated = onDocumentCreated(
  {
    document: "users/{userId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    try {
      const userId = event.params.userId;
      const userData = event.data?.data();

      if (!userData) {
        logger.warn("No user data in creation event", { userId });
        return;
      }

      const countryCode = userData.countryCode;

      if (countryCode) {
        // Update country statistics
        await db
          .collection("countryStats")
          .doc(countryCode)
          .set(
            {
              totalUsers: FieldValue.increment(1),
              lastUserRegistered: new Date(),
            },
            { merge: true }
          );

        logger.info("Country stats updated", {
          userId,
          countryCode,
        });
      }

      // Track registration in analytics
      await db.collection("analytics_events").add({
        type: "USER_REGISTERED",
        userId,
        countryCode: countryCode || "unknown",
        timestamp: new Date(),
        metadata: {
          language: userData.language,
        },
      });
    } catch (error) {
      logger.error("Error in onUserDocumentCreated:", error);
      // Non-blocking - don't fail user creation
    }
  }
);

/**
 * Get user's feature flags based on country
 * 
 * Returns which features are available for the user
 */
export const getUserFeatures = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error("User must be authenticated");
      }

      const userId = request.auth.uid;

      // Get user's country
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const countryCode = userData?.countryCode;

      if (!countryCode) {
        logger.warn("User has no country code", { userId });
        return {
          features: {},
          countryCode: null,
        };
      }

      // Get feature availability from config service
      const { isFeatureEnabled } = await import("./services/configService");

      const features = {
        aiCompanions: await isFeatureEnabled("aiCompanions", countryCode),
        eventsAndCalendar: await isFeatureEnabled("eventsAndCalendar", countryCode),
        passport: await isFeatureEnabled("passport", countryCode),
        swipe: await isFeatureEnabled("swipe", countryCode),
        discovery: await isFeatureEnabled("discovery", countryCode),
        panicButton: await isFeatureEnabled("panicButton", countryCode),
      };

      return {
        features,
        countryCode,
      };
    } catch (error) {
      logger.error("Error in getUserFeatures:", error);
      throw error;
    }
  }
);