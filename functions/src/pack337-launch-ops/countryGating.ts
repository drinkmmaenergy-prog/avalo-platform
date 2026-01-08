/**
 * PACK 337: Country Gating & Resolution Engine
 * Handles country detection and access control
 */

import { firestore } from 'firebase-admin';
import { db } from '../config';
import {
  GeoRolloutCountry,
  CountryResolutionResult,
  CountryAccessCheck,
  CountryRegistrationQuota,
} from './types';

/**
 * Resolve user's country using majority vote logic
 */
export async function resolveUserCountry(
  simCountry?: string,
  ipCountry?: string,
  appStoreRegion?: string,
  userSetting?: string
): Promise<CountryResolutionResult> {
  const votes: { [country: string]: { count: number; methods: string[] } } = {};

  // Collect votes (SIM has highest weight)
  if (simCountry) {
    votes[simCountry] = votes[simCountry] || { count: 0, methods: [] };
    votes[simCountry].count += 3; // SIM gets 3 votes
    votes[simCountry].methods.push('SIM');
  }

  if (ipCountry) {
    votes[ipCountry] = votes[ipCountry] || { count: 0, methods: [] };
    votes[ipCountry].count += 2; // IP gets 2 votes
    votes[ipCountry].methods.push('IP');
  }

  if (appStoreRegion) {
    votes[appStoreRegion] = votes[appStoreRegion] || { count: 0, methods: [] };
    votes[appStoreRegion].count += 2; // App Store gets 2 votes
    votes[appStoreRegion].methods.push('APP_STORE');
  }

  if (userSetting) {
    votes[userSetting] = votes[userSetting] || { count: 0, methods: [] };
    votes[userSetting].count += 1; // User setting gets 1 vote
    votes[userSetting].methods.push('USER_SETTING');
  }

  // Find winner
  let winner = { country: 'US', count: 0, methods: [] as string[] };
  for (const [country, data] of Object.entries(votes)) {
    if (data.count > winner.count) {
      winner = { country, count: data.count, methods: data.methods };
    }
  }

  // Calculate confidence (max possible is 8 votes)
  const confidence = Math.min(winner.count / 8, 1);

  // Get country name
  const countryNames: { [key: string]: string } = {
    PL: 'Poland',
    US: 'United States',
    GB: 'United Kingdom',
    DE: 'Germany',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    // Add more as needed
  };

  return {
    countryCode: winner.country,
    countryName: countryNames[winner.country] || winner.country,
    confidence,
    method: winner.methods[0] as any,
  };
}

/**
 * Check if user can access platform from their country
 */
export async function checkCountryAccess(
  countryCode: string
): Promise<CountryAccessCheck> {
  try {
    const countryDoc = await db
      .collection('geoRolloutCountries')
      .doc(countryCode)
      .get();

    if (!countryDoc.exists) {
      // Country not configured - default to DISABLED
      return {
        allowed: false,
        status: 'DISABLED',
        reason: 'Not available in your country yet',
        requiresKYC: false,
        requiresAgeVerification: false,
        paymentsEnabled: false,
        withdrawalsEnabled: false,
      };
    }

    const country = countryDoc.data() as GeoRolloutCountry;

    if (country.status === 'DISABLED') {
      return {
        allowed: false,
        status: 'DISABLED',
        reason: 'Not available in your country yet',
        requiresKYC: country.kycRequired,
        requiresAgeVerification: country.ageVerificationRequired,
        paymentsEnabled: false,
        withdrawalsEnabled: false,
      };
    }

    if (country.status === 'LOCKED') {
      return {
        allowed: true, // Existing users can log in
        status: 'LOCKED',
        reason: 'New registrations temporarily unavailable',
        requiresKYC: country.kycRequired,
        requiresAgeVerification: country.ageVerificationRequired,
        paymentsEnabled: country.paymentsEnabled,
        withdrawalsEnabled: country.withdrawalsEnabled,
      };
    }

    // BETA or OPEN
    return {
      allowed: true,
      status: country.status,
      requiresKYC: country.kycRequired,
      requiresAgeVerification: country.ageVerificationRequired,
      paymentsEnabled: country.paymentsEnabled,
      withdrawalsEnabled: country.withdrawalsEnabled,
    };
  } catch (error) {
    console.error('Error checking country access:', error);
    // Fail closed for safety
    return {
      allowed: false,
      status: 'DISABLED',
      reason: 'Unable to verify country access',
      requiresKYC: false,
      requiresAgeVerification: false,
      paymentsEnabled: false,
      withdrawalsEnabled: false,
    };
  }
}

/**
 * Check if new registration is allowed (respects daily limits)
 */
export async function checkRegistrationAllowed(
  countryCode: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // First check country status
    const access = await checkCountryAccess(countryCode);
    if (!access.allowed) {
      return { allowed: false, reason: access.reason };
    }

    if (access.status === 'LOCKED') {
      return { allowed: false, reason: 'New registrations temporarily closed' };
    }

    // Get country config
    const countryDoc = await db
      .collection('geoRolloutCountries')
      .doc(countryCode)
      .get();

    if (!countryDoc.exists) {
      return { allowed: false, reason: 'Country not configured' };
    }

    const country = countryDoc.data() as GeoRolloutCountry;

    // Check daily registration limit
    if (country.maxNewRegistrationsPerDay > 0) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const quotaDoc = await db
        .collection('countryRegistrationQuotas')
        .doc(`${countryCode}_${today}`)
        .get();

      if (quotaDoc.exists) {
        const quota = quotaDoc.data() as CountryRegistrationQuota;
        if (quota.registrationsToday >= country.maxNewRegistrationsPerDay) {
          return {
            allowed: false,
            reason: 'Daily registration limit reached. Please try again tomorrow.',
          };
        }
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking registration:', error);
    return { allowed: false, reason: 'Unable to verify registration eligibility' };
  }
}

/**
 * Increment registration count for country (called after successful registration)
 */
export async function incrementRegistrationCount(
  countryCode: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const quotaRef = db
    .collection('countryRegistrationQuotas')
    .doc(`${countryCode}_${today}`);

  await db.runTransaction(async (transaction) => {
    const quotaDoc = await transaction.get(quotaRef);

    if (quotaDoc.exists) {
      transaction.update(quotaRef, {
        registrationsToday: firestore.FieldValue.increment(1),
        lastUpdatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(quotaRef, {
        countryCode,
        date: today,
        registrationsToday: 1,
        lastUpdatedAt: firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

/**
 * Get active user count for country
 */
export async function getActiveUserCount(countryCode: string): Promise<number> {
  // Query users with this country who were active in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const snapshot = await db
    .collection('users')
    .where('countryCode', '==', countryCode)
    .where('lastActiveAt', '>=', firestore.Timestamp.fromDate(thirtyDaysAgo))
    .count()
    .get();

  return snapshot.data().count;
}

/**
 * Check if country has reached max active users
 */
export async function checkActiveUserLimit(
  countryCode: string
): Promise<{ withinLimit: boolean; current: number; max: number }> {
  const countryDoc = await db
    .collection('geoRolloutCountries')
    .doc(countryCode)
    .get();

  if (!countryDoc.exists) {
    return { withinLimit: false, current: 0, max: 0 };
  }

  const country = countryDoc.data() as GeoRolloutCountry;
  const currentCount = await getActiveUserCount(countryCode);

  return {
    withinLimit:
      country.maxActiveUsers === 0 || currentCount < country.maxActiveUsers,
    current: currentCount,
    max: country.maxActiveUsers,
  };
}
