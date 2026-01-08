/**
 * PACK 314 - Country & Feature Guards Middleware
 * 
 * Middleware for enforcing country rollout and feature access control
 * 
 * Region: europe-west3
 */

import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  isCountryAllowed,
  isCountryAtCapacity,
  isFeatureEnabled,
  FeaturesConfig,
} from "../services/configService";

const db = getFirestore();

/**
 * Error messages for country/feature restrictions
 */
export const CountryGuardErrors = {
  COUNTRY_NOT_ALLOWED: {
    en: "Avalo is not yet available in your country.",
    pl: "Avalo nie jest jeszcze dostępne w Twoim kraju.",
  },
  COUNTRY_AT_CAPACITY: {
    en: "We are currently at capacity in your region. Join the waitlist.",
    pl: "Aktualnie osiągnęliśmy limit użytkowników w Twoim regionie. Dołącz do listy oczekujących.",
  },
  FEATURE_NOT_AVAILABLE: {
    en: "This feature is not available in your region yet.",
    pl: "Ta funkcja nie jest jeszcze dostępna w Twoim regionie.",
  },
  COUNTRY_CODE_REQUIRED: {
    en: "Country code is required for registration.",
    pl: "Kod kraju jest wymagany do rejestracji.",
  },
  VERIFICATION_REQUIRED: {
    en: "This feature requires identity verification.",
    pl: "Ta funkcja wymaga weryfikacji tożsamości.",
  },
};

/**
 * Interface for registration data
 */
export interface RegistrationData {
  countryCode: string;
  email?: string;
  phoneNumber?: string;
  [key: string]: any;
}

/**
 * Guard for registration - check country allowance and capacity
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param language - User's language preference (default: 'en')
 * @throws HttpsError if country not allowed or at capacity
 */
export async function validateRegistrationCountry(
  countryCode: string,
  language: string = "en"
): Promise<void> {
  try {
    if (!countryCode) {
      const message = CountryGuardErrors.COUNTRY_CODE_REQUIRED[language as keyof typeof CountryGuardErrors.COUNTRY_CODE_REQUIRED] ||
        CountryGuardErrors.COUNTRY_CODE_REQUIRED.en;
      throw new HttpsError("invalid-argument", message);
    }

    // Normalize country code to uppercase
    const normalizedCountry = countryCode.toUpperCase();

    // Check if country is allowed
    const allowed = await isCountryAllowed(normalizedCountry);
    if (!allowed) {
      const message = CountryGuardErrors.COUNTRY_NOT_ALLOWED[language as keyof typeof CountryGuardErrors.COUNTRY_NOT_ALLOWED] ||
        CountryGuardErrors.COUNTRY_NOT_ALLOWED.en;
      
      logger.warn("Registration blocked - country not allowed", {
        countryCode: normalizedCountry,
      });
      
      throw new HttpsError("permission-denied", message);
    }

    // Check if country has reached capacity
    const atCapacity = await isCountryAtCapacity(normalizedCountry);
    if (atCapacity) {
      const message = CountryGuardErrors.COUNTRY_AT_CAPACITY[language as keyof typeof CountryGuardErrors.COUNTRY_AT_CAPACITY] ||
        CountryGuardErrors.COUNTRY_AT_CAPACITY.en;
      
      logger.warn("Registration blocked - country at capacity", {
        countryCode: normalizedCountry,
      });
      
      // Add to waitlist (optional)
      // await addToWaitlist(email, normalizedCountry);
      
      throw new HttpsError("resource-exhausted", message);
    }

    logger.info("Registration country validated", {
      countryCode: normalizedCountry,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error validating registration country:", error);
    throw new HttpsError("internal", "Failed to validate country");
  }
}

/**
 * Guard for feature access - check if feature is enabled for user's country
 * 
 * @param userId - User ID
 * @param featureKey - Feature key from FeaturesConfig
 * @param language - User's language preference (default: 'en')
 * @throws HttpsError if feature not available
 */
export async function validateFeatureAccess(
  userId: string,
  featureKey: keyof FeaturesConfig,
  language: string = "en"
): Promise<void> {
  try {
    // Get user's country code
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const userData = userDoc.data();
    const countryCode = userData?.countryCode;

    if (!countryCode) {
      logger.warn("User has no country code set", { userId });
      // Allow for backward compatibility, but log warning
      return;
    }

    // Check if feature is enabled for this country
    const enabled = await isFeatureEnabled(featureKey, countryCode);
    
    if (!enabled) {
      const message = CountryGuardErrors.FEATURE_NOT_AVAILABLE[language as keyof typeof CountryGuardErrors.FEATURE_NOT_AVAILABLE] ||
        CountryGuardErrors.FEATURE_NOT_AVAILABLE.en;
      
      logger.warn("Feature access denied", {
        userId,
        featureKey,
        countryCode,
      });
      
      throw new HttpsError("permission-denied", message);
    }

    logger.debug("Feature access validated", {
      userId,
      featureKey,
      countryCode,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error validating feature access:", error);
    throw new HttpsError("internal", "Failed to validate feature access");
  }
}

/**
 * Guard for verification-required features
 * 
 * @param userId - User ID
 * @param featureKey - Feature key that requires verification
 * @param language - User's language preference (default: 'en')
 * @throws HttpsError if user not verified
 */
export async function validateVerificationRequired(
  userId: string,
  featureKey: keyof FeaturesConfig,
  language: string = "en"
): Promise<void> {
  try {
    // Check feature config to see if verification is required
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const countryCode = userData?.countryCode;

    // Get verification status
    const verificationDoc = await db
      .collection("users")
      .doc(userId)
      .collection("verification")
      .doc("status")
      .get();

    const verificationData = verificationDoc.data();
    const isVerified = verificationData?.status === "VERIFIED";

    if (!isVerified) {
      const message = CountryGuardErrors.VERIFICATION_REQUIRED[language as keyof typeof CountryGuardErrors.VERIFICATION_REQUIRED] ||
        CountryGuardErrors.VERIFICATION_REQUIRED.en;
      
      logger.warn("Feature access denied - verification required", {
        userId,
        featureKey,
        verificationStatus: verificationData?.status,
      });
      
      throw new HttpsError("permission-denied", message);
    }

    logger.debug("Verification validated for feature", {
      userId,
      featureKey,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error validating verification requirement:", error);
    throw new HttpsError("internal", "Failed to validate verification");
  }
}

/**
 * Combined guard for feature access (country + verification)
 * 
 * @param userId - User ID
 * @param featureKey - Feature key from FeaturesConfig
 * @param requireVerification - Whether to check verification status
 * @param language - User's language preference (default: 'en')
 */
export async function validateFeatureAccessFull(
  userId: string,
  featureKey: keyof FeaturesConfig,
  requireVerification: boolean = false,
  language: string = "en"
): Promise<void> {
  // Check feature availability for user's country
  await validateFeatureAccess(userId, featureKey, language);

  // Check verification if required
  if (requireVerification) {
    await validateVerificationRequired(userId, featureKey, language);
  }
}

/**
 * Add user to waitlist when country is at capacity
 * 
 * @param email - User email
 * @param countryCode - Country code
 */
export async function addToWaitlist(
  email: string,
  countryCode: string
): Promise<void> {
  try {
    await db.collection("waitlist").add({
      email,
      countryCode,
      createdAt: new Date(),
      status: "PENDING",
    });

    logger.info("User added to waitlist", {
      email: email.substring(0, 3) + "***", // Anonymize for logs
      countryCode,
    });
  } catch (error) {
    logger.error("Error adding user to waitlist:", error);
    // Non-blocking - don't throw
  }
}

/**
 * Validate app version and force upgrade if needed
 * 
 * @param appVersion - Client app version
 * @param language - User's language preference
 * @returns Upgrade requirement info
 */
export async function validateAppVersion(
  appVersion: string,
  language: string = "en"
): Promise<{
  allowed: boolean;
  forceUpgrade: boolean;
  recommendUpgrade: boolean;
  message?: string;
}> {
  try {
    const { shouldForceUpgrade } = await import("../services/configService");
    const upgradeInfo = await shouldForceUpgrade(appVersion);

    if (upgradeInfo.force) {
      const message = upgradeInfo.message?.[language as keyof typeof upgradeInfo.message] ||
        upgradeInfo.message?.en ||
        "Please update your app to continue";

      logger.warn("App version blocked - force upgrade required", {
        appVersion,
        minVersion: "Check config",
      });

      return {
        allowed: false,
        forceUpgrade: true,
        recommendUpgrade: false,
        message,
      };
    }

    if (upgradeInfo.recommend) {
      const message = upgradeInfo.message?.[language as keyof typeof upgradeInfo.message] ||
        upgradeInfo.message?.en;

      return {
        allowed: true,
        forceUpgrade: false,
        recommendUpgrade: true,
        message,
      };
    }

    return {
      allowed: true,
      forceUpgrade: false,
      recommendUpgrade: false,
    };
  } catch (error) {
    logger.error("Error validating app version:", error);
    // Fail open - don't block users on version check errors
    return {
      allowed: true,
      forceUpgrade: false,
      recommendUpgrade: false,
    };
  }
}