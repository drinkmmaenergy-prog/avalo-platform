/**
 * PACK 295 - Globalization & Localization
 * Formatting Utilities for Currency, Numbers, and Dates
 */

import { LocaleCode } from "./locales";
import { CurrencyCode, CURRENCY_METADATA } from "./currencies";

/**
 * Format currency amount according to locale and currency
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  locale: LocaleCode
): string {
  const metadata = CURRENCY_METADATA[currency];
  
  try {
    // Use Intl.NumberFormat for proper locale-aware formatting
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: metadata.decimalPlaces,
      maximumFractionDigits: metadata.decimalPlaces,
    });
    
    return formatter.format(amount);
  } catch (error) {
    // Fallback to manual formatting if Intl fails
    const formattedNumber = formatNumber(amount, locale, metadata.decimalPlaces);
    
    if (metadata.symbolPosition === "before") {
      return `${metadata.symbol}${formattedNumber}`;
    } else {
      return `${formattedNumber} ${metadata.symbol}`;
    }
  }
}

/**
 * Format number according to locale
 */
export function formatNumber(
  num: number,
  locale: LocaleCode,
  decimalPlaces?: number
): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimalPlaces ?? 0,
      maximumFractionDigits: decimalPlaces ?? 2,
    });
    
    return formatter.format(num);
  } catch (error) {
    // Fallback to toFixed if Intl fails
    return decimalPlaces !== undefined 
      ? num.toFixed(decimalPlaces)
      : num.toString();
  }
}

/**
 * Format date and time according to locale and timezone
 */
export function formatDateTime(
  date: Date,
  locale: LocaleCode,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timeZone,
      ...options,
    };
    
    const formatter = new Intl.DateTimeFormat(locale, defaultOptions);
    return formatter.format(date);
  } catch (error) {
    // Fallback to ISO string
    return date.toISOString();
  }
}

/**
 * Format date only (no time)
 */
export function formatDate(
  date: Date,
  locale: LocaleCode,
  timeZone: string
): string {
  return formatDateTime(date, locale, timeZone, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: undefined,
    minute: undefined,
  });
}

/**
 * Format time only (no date)
 */
export function formatTime(
  date: Date,
  locale: LocaleCode,
  timeZone: string
): string {
  return formatDateTime(date, locale, timeZone, {
    year: undefined,
    month: undefined,
    day: undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date,
  locale: LocaleCode,
  baseDate: Date = new Date()
): string {
  try {
    const diffMs = date.getTime() - baseDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    
    if (Math.abs(diffDays) >= 1) {
      return rtf.format(diffDays, "day");
    } else if (Math.abs(diffHours) >= 1) {
      return rtf.format(diffHours, "hour");
    } else if (Math.abs(diffMinutes) >= 1) {
      return rtf.format(diffMinutes, "minute");
    } else {
      return rtf.format(diffSeconds, "second");
    }
  } catch (error) {
    // Fallback to simple string
    return formatDateTime(date, locale, "UTC");
  }
}

/**
 * Format percentage
 */
export function formatPercent(
  value: number,
  locale: LocaleCode,
  decimalPlaces: number = 1
): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
    
    return formatter.format(value);
  } catch (error) {
    return `${(value * 100).toFixed(decimalPlaces)}%`;
  }
}

/**
 * Format compact number (e.g., 1.2K, 3.4M)
 */
export function formatCompactNumber(
  num: number,
  locale: LocaleCode
): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
    });
    
    return formatter.format(num);
  } catch (error) {
    // Fallback to manual compact formatting
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }
}

/**
 * Format token amount (always displayed as unitless number)
 */
export function formatTokens(
  amount: number,
  locale: LocaleCode
): string {
  return formatNumber(amount, locale, 0);
}