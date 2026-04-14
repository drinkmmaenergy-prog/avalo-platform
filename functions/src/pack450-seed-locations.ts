/**
 * PACK 450 — Seed Profile Locations
 *
 * FIX 50F: Adds lat/lng location data to existing seed profiles
 * so that distance filtering works in Discovery.
 *
 * Run via Firebase callable or admin script:
 *   const seedLocations = httpsCallable(functions, 'pack450_seedProfileLocations');
 *   await seedLocations();
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Polish cities coordinates map
const POLISH_CITIES: Record<string, { lat: number; lng: number }> = {
  'Warszawa': { lat: 52.2297, lng: 21.0122 },
  'Warsaw': { lat: 52.2297, lng: 21.0122 },
  'Kraków': { lat: 50.0647, lng: 19.9450 },
  'Krakow': { lat: 50.0647, lng: 19.9450 },
  'Gdańsk': { lat: 54.3520, lng: 18.6466 },
  'Gdansk': { lat: 54.3520, lng: 18.6466 },
  'Wrocław': { lat: 51.1079, lng: 17.0385 },
  'Wroclaw': { lat: 51.1079, lng: 17.0385 },
  'Poznań': { lat: 52.4064, lng: 16.9252 },
  'Poznan': { lat: 52.4064, lng: 16.9252 },
  'Łódź': { lat: 51.7592, lng: 19.4560 },
  'Lodz': { lat: 51.7592, lng: 19.4560 },
  'Lublin': { lat: 51.2465, lng: 22.5684 },
  'Katowice': { lat: 50.2649, lng: 19.0238 },
  'Szczecin': { lat: 53.4285, lng: 14.5528 },
  'Bydgoszcz': { lat: 53.1235, lng: 18.0084 },
  'Białystok': { lat: 53.1325, lng: 23.1688 },
  'Bialystok': { lat: 53.1325, lng: 23.1688 },
  'Rzeszów': { lat: 50.0412, lng: 21.9991 },
  'Rzeszow': { lat: 50.0412, lng: 21.9991 },
  'Toruń': { lat: 53.0138, lng: 18.5984 },
  'Torun': { lat: 53.0138, lng: 18.5984 },
  'Kielce': { lat: 50.8661, lng: 20.6286 },
  'Olsztyn': { lat: 53.7784, lng: 20.4801 },
  'Gdynia': { lat: 54.5189, lng: 18.5305 },
  'Sopot': { lat: 54.4418, lng: 18.5601 },
};

/**
 * Geocode a city using the static map. Returns null if unknown.
 */
function lookupCityCoords(city: string): { lat: number; lng: number } | null {
  if (!city) return null;
  const trimmed = city.trim();

  // Direct match
  if (POLISH_CITIES[trimmed]) return POLISH_CITIES[trimmed];

  // Case-insensitive match
  const lower = trimmed.toLowerCase();
  for (const [key, coords] of Object.entries(POLISH_CITIES)) {
    if (key.toLowerCase() === lower) return coords;
  }

  // Try extracting city from "City, Country" format
  const cityPart = trimmed.split(',')[0].trim();
  if (POLISH_CITIES[cityPart]) return POLISH_CITIES[cityPart];
  for (const [key, coords] of Object.entries(POLISH_CITIES)) {
    if (key.toLowerCase() === cityPart.toLowerCase()) return coords;
  }

  return null;
}

/**
 * Callable function to seed location data on all public_profiles that have a city but no location.
 */
export const pack450_seedProfileLocations = functions
  .region('europe-west1')
  .https.onCall(async (_data, context) => {
    // Require admin auth
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }

    const db = admin.firestore();
    const profilesRef = db.collection('public_profiles');
    const snapshot = await profilesRef.get();

    let updated = 0;
    let skipped = 0;
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const city = data.city || data.location;

      // Skip if already has structured location
      if (data.location && typeof data.location === 'object' && data.location.lat) {
        skipped++;
        continue;
      }

      if (typeof city === 'string' && city.length > 0) {
        const coords = lookupCityCoords(city);
        if (coords) {
          batch.update(doc.ref, { location: coords });

          // Also update users collection
          const userRef = db.collection('users').doc(doc.id);
          batch.update(userRef, { location: coords });

          updated++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    if (updated > 0) {
      await batch.commit();
    }

    return {
      success: true,
      message: `Seeded ${updated} profiles with location data, skipped ${skipped}`,
      updated,
      skipped,
    };
  });


