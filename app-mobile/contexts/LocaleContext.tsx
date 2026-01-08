import React, { createContext, useContext, ReactNode } from 'react';
import { useLocale, Locale, Region, Currency } from '../hooks/useLocale';

interface DisplayPrice {
  amount: number;
  formatted: string;
}

interface LocaleContextType {
  locale: Locale;
  region: Region;
  currency: Currency;
  currencySymbol: string;
  isAutoDetected: boolean;
  isLoading: boolean;
  changeLocale: (locale: Locale) => Promise<void>;
  changeRegion: (region: Region) => Promise<void>;
  formatPrice: (amount: number) => string;
  getDisplayPrice: (baseUsdPrice: number) => DisplayPrice;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

interface LocaleProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the app and provides locale functionality
 * Automatically detects and sets locale on first launch
 */
export const LocaleProvider: React.FC<LocaleProviderProps> = ({ children }) => {
  const localeData = useLocale();

  return (
    <LocaleContext.Provider value={localeData}>
      {children}
    </LocaleContext.Provider>
  );
};

/**
 * Hook to access locale context
 * Must be used within LocaleProvider
 */
export const useLocaleContext = (): LocaleContextType => {
  const context = useContext(LocaleContext);
  
  if (!context) {
    throw new Error('useLocaleContext must be used within LocaleProvider');
  }
  
  return context;
};

export default LocaleContext;
