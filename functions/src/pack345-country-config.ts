/**
 * PACK 345 — Country-Level Launch Configuration
 * Regional launch gates and feature flags per country
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CountryLaunchConfig, INITIAL_LAUNCH_COUNTRIES } from './pack345-types';

const db = admin.firestore();

/**
 * Initialize country launch configurations
 */
export async function initializeCountryConfigs(): Promise<void> {
  console.log('[Pack345] Initializing country launch configurations');
  
  const batch = db.batch();
  const timestamp = admin.firestore.Timestamp.now();

  for (const country of INITIAL_LAUNCH_COUNTRIES) {
    const countryCode = country.countryCode!;
    const ref = db.doc(`system/launchCountries/countries/${countryCode}`);
    
    const config: CountryLaunchConfig = {
      ...country,
      lastUpdated: timestamp
    } as CountryLaunchConfig;

    batch.set(ref, config, { merge: true });
  }

  await batch.commit();
  console.log(`[Pack345] Initialized ${INITIAL_LAUNCH_COUNTRIES.length} country configurations`);
}

/**
 * Get country launch configuration
 */
export async function getCountryConfig(countryCode: string): Promise<CountryLaunchConfig | null> {
  const configDoc = await db.doc(`system/launchCountries/countries/${countryCode}`).get();
  
  if (!configDoc.exists) {
    return null;
  }

  return configDoc.data() as CountryLaunchConfig;
}

/**
 * Check if feature is enabled for country
 */
export async function isFeatureEnabledInCountry(
  countryCode: string,
  feature: keyof Pick<CountryLaunchConfig, 'tokenSalesEnabled' | 'payoutsEnabled' | 'calendarEnabled' | 'eventsEnabled' | 'aiEnabled'>
): Promise<boolean> {
  const config = await getCountryConfig(countryCode);
  
  if (!config) {
    return false; // Country not configured
  }

  if (!config.enabled) {
    return false; // Country disabled entirely
  }

  return config[feature] === true;
}

/**
 * Update country configuration (admin only)
 */
export const pack345_updateCountryConfig = functions.https.onCall(
  async (data, context) => {
    // Require admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { countryCode, updates } = data;

    if (!countryCode || !updates) {
      throw new functions.https.HttpsError('invalid-argument', 'countryCode and updates required');
    }

    // Validate country code
    if (typeof countryCode !== 'string' || countryCode.length !== 2) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid country code format');
    }

    // Update country config
    await db.doc(`system/launchCountries/countries/${countryCode}`).set(
      {
        ...updates,
        lastUpdated: admin.firestore.Timestamp.now()
      },
      { merge: true }
    );

    console.log(`[Pack345] Country config updated for ${countryCode} by ${context.auth.uid}`);

    return {
      success: true,
      countryCode,
      message: `Country configuration updated for ${countryCode}`
    };
  }
);

/**
 * Get all country configurations
 */
export const pack345_getAllCountryConfigs = functions.https.onCall(
  async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const countriesSnapshot = await db.collection('system/launchCountries/countries').get();
    
    const countries = countriesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { countries };
  }
);

/**
 * Enable country for launch
 */
export const pack345_enableCountry = functions.https.onCall(
  async (data, context) => {
    // Require admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { countryCode } = data;

    if (!countryCode) {
      throw new functions.https.HttpsError('invalid-argument', 'countryCode required');
    }

    await db.doc(`system/launchCountries/countries/${countryCode}`).update({
      enabled: true,
      launchedAt: admin.firestore.Timestamp.now(),
      lastUpdated: admin.firestore.Timestamp.now()
    });

    console.log(`[Pack345] Country ${countryCode} enabled for launch by ${context.auth.uid}`);

    return {
      success: true,
      countryCode,
      message: `Country ${countryCode} enabled for launch`
    };
  }
);

/**
 * Disable country
 */
export const pack345_disableCountry = functions.https.onCall(
  async (data, context) => {
    // Require admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { countryCode, reason } = data;

    if (!countryCode) {
      throw new functions.https.HttpsError('invalid-argument', 'countryCode required');
    }

    await db.doc(`system/launchCountries/countries/${countryCode}`).update({
      enabled: false,
      disabledAt: admin.firestore.Timestamp.now(),
      disabledReason: reason || 'No reason provided',
      lastUpdated: admin.firestore.Timestamp.now()
    });

    console.log(`[Pack345] Country ${countryCode} disabled by ${context.auth.uid}: ${reason || 'No reason'}`);

    return {
      success: true,
      countryCode,
      message: `Country ${countryCode} disabled`
    };
  }
);

/**
 * Initialize countries on first deploy
 */
export const pack345_initializeCountries = functions.https.onCall(
  async (data, context) => {
    // Require super-admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    await initializeCountryConfigs();

    return {
      success: true,
      message: `Initialized ${INITIAL_LAUNCH_COUNTRIES.length} country configurations`
    };
  }
);
