/**
 * PACK 295 - Globalization & Localization
 * Currency Configuration and Utilities
 */

export const SUPPORTED_CURRENCIES = [
  "PLN",
  "EUR",
  "USD",
  "GBP",
  "RON",
  "BGN",
  "CZK",
  "HUF",
  "HRK",
  "RSD",
  "UAH",
  "RUB",
  "NOK",
  "SEK",
  "DKK",
  "CHF",
  "TRY",
  "SAR",
  "AED",
  "JPY",
  "KRW",
  "CNY",
  "TWD",
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

/**
 * Map ISO 3166-1 alpha-2 country codes to default currencies
 */
export const REGION_DEFAULT_CURRENCY: Record<string, CurrencyCode> = {
  // Europe - Euro zone
  "AT": "EUR", // Austria
  "BE": "EUR", // Belgium
  "CY": "EUR", // Cyprus
  "EE": "EUR", // Estonia
  "FI": "EUR", // Finland
  "FR": "EUR", // France
  "DE": "EUR", // Germany
  "GR": "EUR", // Greece
  "IE": "EUR", // Ireland
  "IT": "EUR", // Italy
  "LV": "EUR", // Latvia
  "LT": "EUR", // Lithuania
  "LU": "EUR", // Luxembourg
  "MT": "EUR", // Malta
  "NL": "EUR", // Netherlands
  "PT": "EUR", // Portugal
  "SK": "EUR", // Slovakia
  "SI": "EUR", // Slovenia
  "ES": "EUR", // Spain
  "HR": "EUR", // Croatia (joined 2023)
  
  // Europe - Non-Euro
  "PL": "PLN", // Poland
  "CZ": "CZK", // Czechia
  "HU": "HUF", // Hungary
  "RO": "RON", // Romania
  "BG": "BGN", // Bulgaria
  "RS": "RSD", // Serbia
  "UA": "UAH", // Ukraine
  "RU": "RUB", // Russia
  "NO": "NOK", // Norway
  "SE": "SEK", // Sweden
  "DK": "DKK", // Denmark
  "CH": "CHF", // Switzerland
  "GB": "GBP", // United Kingdom
  "TR": "TRY", // Turkey
  
  // Americas
  "US": "USD", // United States
  "CA": "USD", // Canada (often USD for international)
  "MX": "USD", // Mexico (often USD for international)
  "BR": "USD", // Brazil (often USD for international)
  "AR": "USD", // Argentina
  
  // Middle East
  "SA": "SAR", // Saudi Arabia
  "AE": "AED", // UAE
  "IL": "USD", // Israel (often USD for international)
  
  // Asia Pacific
  "JP": "JPY", // Japan
  "KR": "KRW", // South Korea
  "CN": "CNY", // China
  "TW": "TWD", // Taiwan
  "SG": "USD", // Singapore (often USD for international)
  "HK": "USD", // Hong Kong
  "AU": "USD", // Australia
  "NZ": "USD", // New Zealand
  
  // Default fallback
  "DEFAULT": "EUR",
};

/**
 * Currency display metadata
 */
export const CURRENCY_METADATA: Record<CurrencyCode, {
  symbol: string;
  name: string;
  decimalPlaces: number;
  symbolPosition: "before" | "after";
}> = {
  "PLN": { symbol: "zł", name: "Polish Złoty", decimalPlaces: 2, symbolPosition: "after" },
  "EUR": { symbol: "€", name: "Euro", decimalPlaces: 2, symbolPosition: "before" },
  "USD": { symbol: "$", name: "US Dollar", decimalPlaces: 2, symbolPosition: "before" },
  "GBP": { symbol: "£", name: "British Pound", decimalPlaces: 2, symbolPosition: "before" },
  "RON": { symbol: "lei", name: "Romanian Leu", decimalPlaces: 2, symbolPosition: "after" },
  "BGN": { symbol: "лв", name: "Bulgarian Lev", decimalPlaces: 2, symbolPosition: "after" },
  "CZK": { symbol: "Kč", name: "Czech Koruna", decimalPlaces: 2, symbolPosition: "after" },
  "HUF": { symbol: "Ft", name: "Hungarian Forint", decimalPlaces: 0, symbolPosition: "after" },
  "HRK": { symbol: "kn", name: "Croatian Kuna", decimalPlaces: 2, symbolPosition: "after" },
  "RSD": { symbol: "дин", name: "Serbian Dinar", decimalPlaces: 2, symbolPosition: "after" },
  "UAH": { symbol: "₴", name: "Ukrainian Hryvnia", decimalPlaces: 2, symbolPosition: "after" },
  "RUB": { symbol: "₽", name: "Russian Ruble", decimalPlaces: 2, symbolPosition: "after" },
  "NOK": { symbol: "kr", name: "Norwegian Krone", decimalPlaces: 2, symbolPosition: "after" },
  "SEK": { symbol: "kr", name: "Swedish Krona", decimalPlaces: 2, symbolPosition: "after" },
  "DKK": { symbol: "kr", name: "Danish Krone", decimalPlaces: 2, symbolPosition: "after" },
  "CHF": { symbol: "CHF", name: "Swiss Franc", decimalPlaces: 2, symbolPosition: "before" },
  "TRY": { symbol: "₺", name: "Turkish Lira", decimalPlaces: 2, symbolPosition: "before" },
  "SAR": { symbol: "﷼", name: "Saudi Riyal", decimalPlaces: 2, symbolPosition: "before" },
  "AED": { symbol: "د.إ", name: "UAE Dirham", decimalPlaces: 2, symbolPosition: "before" },
  "JPY": { symbol: "¥", name: "Japanese Yen", decimalPlaces: 0, symbolPosition: "before" },
  "KRW": { symbol: "₩", name: "South Korean Won", decimalPlaces: 0, symbolPosition: "before" },
  "CNY": { symbol: "¥", name: "Chinese Yuan", decimalPlaces: 2, symbolPosition: "before" },
  "TWD": { symbol: "NT$", name: "Taiwan Dollar", decimalPlaces: 0, symbolPosition: "before" },
};

/**
 * Get default currency for a country code
 */
export function getCurrencyForRegion(countryCode: string): CurrencyCode {
  return REGION_DEFAULT_CURRENCY[countryCode.toUpperCase()] || REGION_DEFAULT_CURRENCY["DEFAULT"];
}

/**
 * Check if a currency is supported
 */
export function isSupportedCurrency(currency: string): currency is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(currency as CurrencyCode);
}