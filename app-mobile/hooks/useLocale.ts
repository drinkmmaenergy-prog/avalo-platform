import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export type Locale = 'en' | 'pl';
export type Region = 'PL' | 'EU' | 'UK' | 'US' | 'OTHER';
export type Currency = 'PLN' | 'EUR' | 'GBP' | 'USD';

interface LocaleConfig {
  locale: Locale;
  region: Region;
  currency: Currency;
  currencySymbol: string;
  isAutoDetected: boolean;
}

const LOCALE_STORAGE_KEY = '@avalo_locale_config';

// Currency mapping based on region
const REGION_CURRENCY_MAP: Record<Region, { currency: Currency; symbol: string }> = {
  PL: { currency: 'PLN', symbol: 'zł' },
  EU: { currency: 'EUR', symbol: '€' },
  UK: { currency: 'GBP', symbol: '£' },
  US: { currency: 'USD', symbol: '$' },
  OTHER: { currency: 'USD', symbol: '$' },
};

// EU countries (excluding Poland and UK)
const EU_COUNTRIES = ['DE', 'AT', 'FR', 'IT', 'ES', 'NL', 'BE', 'SE', 'DK', 'FI', 'PT', 'GR', 'IE', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'CY', 'MT'];

/**
 * Detect user's region based on device locale
 */
const detectRegion = (): Region => {
  try {
    const locales = Localization.getLocales();
    if (!locales || locales.length === 0) return 'OTHER';

    const countryCode = locales[0]?.regionCode?.toUpperCase();
    
    if (!countryCode) return 'OTHER';
    
    if (countryCode === 'PL') return 'PL';
    if (countryCode === 'GB' || countryCode === 'UK') return 'UK';
    if (countryCode === 'US') return 'US';
    if (EU_COUNTRIES.includes(countryCode)) return 'EU';
    
    return 'OTHER';
  } catch (error) {
    console.error('Error detecting region:', error);
    return 'OTHER';
  }
};

/**
 * Detect user's preferred locale based on device language
 */
const detectLocale = (): Locale => {
  try {
    const locales = Localization.getLocales();
    if (!locales || locales.length === 0) return 'en';

    const languageCode = locales[0]?.languageCode?.toLowerCase();
    
    if (languageCode === 'pl') return 'pl';
    
    // Default to English for all other languages
    return 'en';
  } catch (error) {
    console.error('Error detecting locale:', error);
    return 'en';
  }
};

/**
 * Hook for managing locale, region, and currency configuration
 */
export const useLocale = () => {
  const [config, setConfig] = useState<LocaleConfig>({
    locale: 'en',
    region: 'OTHER',
    currency: 'USD',
    currencySymbol: '$',
    isAutoDetected: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize locale configuration
  useEffect(() => {
    initializeLocale();
  }, []);

  const initializeLocale = async () => {
    try {
      // Try to load saved config from AsyncStorage
      const savedConfig = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
      
      if (savedConfig) {
        // Use saved configuration
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
      } else {
        // Auto-detect on first launch
        const detectedLocale = detectLocale();
        const detectedRegion = detectRegion();
        const { currency, symbol } = REGION_CURRENCY_MAP[detectedRegion];
        
        const newConfig: LocaleConfig = {
          locale: detectedLocale,
          region: detectedRegion,
          currency,
          currencySymbol: symbol,
          isAutoDetected: true,
        };
        
        // Save to AsyncStorage
        await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(newConfig));
        
        // Save to Firestore if user is authenticated
        await saveToFirestore(newConfig);
        
        setConfig(newConfig);
      }
    } catch (error) {
      console.error('Error initializing locale:', error);
      // Fallback to defaults
      setConfig({
        locale: 'en',
        region: 'OTHER',
        currency: 'USD',
        currencySymbol: '$',
        isAutoDetected: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveToFirestore = async (config: LocaleConfig) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (user) {
        const db = getFirestore();
        const userDocRef = doc(db, 'users', user.uid);
        
        await setDoc(userDocRef, {
          localeConfig: {
            locale: config.locale,
            region: config.region,
            currency: config.currency,
            currencySymbol: config.currencySymbol,
            updatedAt: new Date().toISOString(),
          },
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error saving locale to Firestore:', error);
      // Non-critical error, don't throw
    }
  };

  /**
   * Change the app locale
   */
  const changeLocale = async (newLocale: Locale) => {
    try {
      const newConfig = {
        ...config,
        locale: newLocale,
        isAutoDetected: false,
      };
      
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(newConfig));
      await saveToFirestore(newConfig);
      
      setConfig(newConfig);
    } catch (error) {
      console.error('Error changing locale:', error);
      throw error;
    }
  };

  /**
   * Change the region (and automatically update currency)
   */
  const changeRegion = async (newRegion: Region) => {
    try {
      const { currency, symbol } = REGION_CURRENCY_MAP[newRegion];
      
      const newConfig = {
        ...config,
        region: newRegion,
        currency,
        currencySymbol: symbol,
        isAutoDetected: false,
      };
      
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(newConfig));
      await saveToFirestore(newConfig);
      
      setConfig(newConfig);
    } catch (error) {
      console.error('Error changing region:', error);
      throw error;
    }
  };

  /**
   * Format price based on current locale
   */
  const formatPrice = (amount: number): string => {
    try {
      return new Intl.NumberFormat(config.locale === 'pl' ? 'pl-PL' : 'en-US', {
        style: 'currency',
        currency: config.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (error) {
      console.error('Error formatting price:', error);
      return `${config.currencySymbol}${amount.toFixed(2)}`;
    }
  };

  /**
   * Get display price for tokens (UI only - no backend changes)
   * This converts base USD prices to local currency for display
   */
  const getDisplayPrice = (baseUsdPrice: number): { amount: number; formatted: string } => {
    // Simple conversion rates (approximate)
    const conversionRates: Record<Currency, number> = {
      PLN: 4.0,   // 1 USD = 4 PLN
      EUR: 0.92,  // 1 USD = 0.92 EUR
      GBP: 0.79,  // 1 USD = 0.79 GBP
      USD: 1.0,   // 1 USD = 1 USD
    };
    
    const rate = conversionRates[config.currency] || 1.0;
    const localAmount = baseUsdPrice * rate;
    
    return {
      amount: localAmount,
      formatted: formatPrice(localAmount),
    };
  };

  return {
    locale: config.locale,
    region: config.region,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    isAutoDetected: config.isAutoDetected,
    isLoading,
    changeLocale,
    changeRegion,
    formatPrice,
    getDisplayPrice,
  };
};