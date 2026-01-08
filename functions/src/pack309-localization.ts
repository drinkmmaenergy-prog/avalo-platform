/**
 * PACK 309 — Swipe Limit Localization
 * 
 * Localized messages for swipe limits and discovery features
 */

export interface SwipeLimitMessages {
  en: {
    dailyLimitReached: {
      title: string;
      message: string;
    };
    hourlyLimitReached: {
      title: string;
      message: string;
    };
    swipesRemaining: string;
    noSwipesLeft: string;
    refreshesIn: string;
    refreshesTomorrow: string;
  };
  pl: {
    dailyLimitReached: {
      title: string;
      message: string;
    };
    hourlyLimitReached: {
      title: string;
      message: string;
    };
    swipesRemaining: string;
    noSwipesLeft: string;
    refreshesIn: string;
    refreshesTomorrow: string;
  };
}

export const SWIPE_LIMIT_MESSAGES: SwipeLimitMessages = {
  en: {
    dailyLimitReached: {
      title: "Daily Limit Reached",
      message: "You've reached today's swipe limit. New swipes refresh tomorrow."
    },
    hourlyLimitReached: {
      title: "Swipe Limit Reached",
      message: "You've reached the swipe limit for this hour. Come back in a bit."
    },
    swipesRemaining: "{count} swipes left today",
    noSwipesLeft: "No swipes left",
    refreshesIn: "Refreshes in {time}",
    refreshesTomorrow: "Refreshes tomorrow"
  },
  pl: {
    dailyLimitReached: {
      title: "Osiągnięto Dzienny Limit",
      message: "Wykorzystałeś dzisiejszy limit swipe'ów. Nowy limit będzie jutro."
    },
    hourlyLimitReached: {
      title: "Osiągnięto Limit Swipe'ów",
      message: "Osiągnięto limit swipe'ów na tę godzinę. Wróć za chwilę."
    },
    swipesRemaining: "Pozostało {count} swipe'ów dzisiaj",
    noSwipesLeft: "Brak swipe'ów",
    refreshesIn: "Odnowienie za {time}",
    refreshesTomorrow: "Odnowienie jutro"
  }
};

export interface DiscoveryMessages {
  en: {
    freeAndUnlimited: string;
    browseProfiles: string;
    viewProfile: string;
    likeProfile: string;
    noNearbyProfiles: string;
    adjustFilters: string;
  };
  pl: {
    freeAndUnlimited: string;
    browseProfiles: string;
    viewProfile: string;
    likeProfile: string;
    noNearbyProfiles: string;
    adjustFilters: string;
  };
}

export const DISCOVERY_MESSAGES: DiscoveryMessages = {
  en: {
    freeAndUnlimited: "Discovery is free and unlimited",
    browseProfiles: "Browse profiles near you",
    viewProfile: "View full profile",
    likeProfile: "Like profile",
    noNearbyProfiles: "No profiles found nearby",
    adjustFilters: "Try adjusting your filters or distance"
  },
  pl: {
    freeAndUnlimited: "Discovery jest darmowe i nieograniczone",
    browseProfiles: "Przeglądaj profile w pobliżu",
    viewProfile: "Zobacz pełny profil",
    likeProfile: "Polub profil",
    noNearbyProfiles: "Nie znaleziono profili w pobliżu",
    adjustFilters: "Spróbuj dostosować filtry lub dystans"
  }
};

/**
 * Get localized swipe limit message
 */
export function getSwipeLimitMessage(
  type: 'daily' | 'hourly',
  language: 'en' | 'pl' = 'en'
): { title: string; message: string } {
  const lang = language === 'pl' ? 'pl' : 'en';
  return type === 'daily' 
    ? SWIPE_LIMIT_MESSAGES[lang].dailyLimitReached
    : SWIPE_LIMIT_MESSAGES[lang].hourlyLimitReached;
}

/**
 * Format swipes remaining message
 */
export function formatSwipesRemaining(
  count: number,
  language: 'en' | 'pl' = 'en'
): string {
  const lang = language === 'pl' ? 'pl' : 'en';
  if (count === 0) {
    return SWIPE_LIMIT_MESSAGES[lang].noSwipesLeft;
  }
  return SWIPE_LIMIT_MESSAGES[lang].swipesRemaining.replace('{count}', count.toString());
}

/**
 * Format time until refresh
 */
export function formatRefreshTime(
  milliseconds: number,
  language: 'en' | 'pl' = 'en'
): string {
  const lang = language === 'pl' ? 'pl' : 'en';
  
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    return SWIPE_LIMIT_MESSAGES[lang].refreshesTomorrow;
  }
  
  let timeStr = '';
  if (hours > 0) {
    timeStr = `${hours}h`;
    if (minutes > 0) {
      timeStr += ` ${minutes}m`;
    }
  } else {
    timeStr = `${minutes}m`;
  }
  
  return SWIPE_LIMIT_MESSAGES[lang].refreshesIn.replace('{time}', timeStr);
}

console.log('✅ PACK 309 — Swipe Limit Localization initialized');