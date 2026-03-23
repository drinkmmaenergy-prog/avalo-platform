/**
 * FIX 50 — Geocoding Service
 *
 * Provides city→coordinates mapping for discovery distance filtering.
 * Uses a static map of common Polish cities for instant lookup,
 * with Nominatim fallback for unknown cities (rate-limited: 1 req/sec).
 *
 * Usage:
 *   const coords = await geocodeCity('Warszawa');
 *   // → { lat: 52.2297, lng: 21.0122 } or null
 */

export interface GeoCoords {
  lat: number;
  lng: number;
}

// ============================================================================
// STATIC POLISH CITIES MAP (instant lookup, no API call)
// ============================================================================

export const POLISH_CITIES: Record<string, GeoCoords> = {
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
  'Częstochowa': { lat: 50.8118, lng: 19.1203 },
  'Radom': { lat: 51.4027, lng: 21.1471 },
  'Sosnowiec': { lat: 50.2863, lng: 19.1042 },
  'Gliwice': { lat: 50.2945, lng: 18.6714 },
  'Zabrze': { lat: 50.3249, lng: 18.7857 },
  'Bielsko-Biała': { lat: 49.8224, lng: 19.0587 },
  'Bielsko-Biala': { lat: 49.8224, lng: 19.0587 },
  'Bytom': { lat: 50.3483, lng: 18.9158 },
  'Zielona Góra': { lat: 51.9356, lng: 15.5062 },
  'Zielona Gora': { lat: 51.9356, lng: 15.5062 },
  'Rybnik': { lat: 50.0971, lng: 18.5463 },
  'Opole': { lat: 50.6751, lng: 17.9213 },
  'Elbląg': { lat: 54.1522, lng: 19.4044 },
  'Płock': { lat: 52.5468, lng: 19.7064 },
  'Wałbrzych': { lat: 50.7714, lng: 16.2843 },
  'Tarnów': { lat: 50.0121, lng: 20.9858 },
  'Legnica': { lat: 51.2070, lng: 16.1619 },
};

// ============================================================================
// NOMINATIM GEOCODING (fallback for unknown cities)
// ============================================================================

/**
 * Geocode a city name using OpenStreetMap Nominatim.
 * Rate-limited to 1 request/sec — only call on profile SAVE, never on keystroke.
 *
 * @param city - City name to geocode
 * @returns Coordinates or null if not found
 */
export async function geocodeCityNominatim(city: string): Promise<GeoCoords | null> {
  if (!city || city.trim().length === 0) return null;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city.trim())}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'Avalo/1.0 (contact@avalo.pl)',
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
  } catch (e) {
    console.error('[geocodingService] Nominatim geocoding failed:', e);
  }

  return null;
}

// ============================================================================
// MAIN GEOCODE FUNCTION
// ============================================================================

/**
 * Geocode a city name. Checks static Polish cities map first,
 * then falls back to Nominatim API if not found.
 *
 * @param city - City name to geocode
 * @returns Coordinates or null
 */
export async function geocodeCity(city: string): Promise<GeoCoords | null> {
  if (!city || city.trim().length === 0) return null;

  const trimmed = city.trim();

  // Check static map first (case-sensitive for Polish diacritics)
  if (POLISH_CITIES[trimmed]) {
    return POLISH_CITIES[trimmed];
  }

  // Try title-case normalization
  const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  if (POLISH_CITIES[titleCase]) {
    return POLISH_CITIES[titleCase];
  }

  // Check case-insensitive match
  const lowerCity = trimmed.toLowerCase();
  for (const [key, coords] of Object.entries(POLISH_CITIES)) {
    if (key.toLowerCase() === lowerCity) {
      return coords;
    }
  }

  // Fallback to Nominatim
  return geocodeCityNominatim(trimmed);
}

// ============================================================================
// HAVERSINE DISTANCE CALCULATION
// ============================================================================

/**
 * Calculate the great-circle distance between two points on Earth
 * using the Haversine formula.
 *
 * @returns Distance in kilometers
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
