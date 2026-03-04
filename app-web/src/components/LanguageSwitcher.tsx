/**
 * Language Switcher Component
 *
 * Dropdown for selecting the user's preferred locale.
 * Uses I18nProvider context for reactive locale switching (no page reload).
 * Supports all 42 scaffolded locales.
 *
 * Usage:
 *   <LanguageSwitcher />
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
  type SupportedLocale,
} from '@/i18n/config';
import { useI18n } from '@/components/providers/I18nProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(newLocale: SupportedLocale) {
    setLocale(newLocale);
    setIsOpen(false);
  }

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
        aria-label="Select language"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="text-base" aria-hidden="true">🌐</span>
        <span>{LOCALE_DISPLAY_NAMES[locale]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50 dark:bg-gray-800 dark:border-gray-700"
          role="listbox"
          aria-label="Available languages"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              role="option"
              aria-selected={loc === locale}
              onClick={() => handleSelect(loc)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-pink-50 dark:hover:bg-pink-900/20 transition ${
                loc === locale
                  ? 'bg-pink-50 text-pink-700 font-semibold dark:bg-pink-900/30 dark:text-pink-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {LOCALE_DISPLAY_NAMES[loc]}
              {loc === locale && (
                <span className="float-right text-pink-600 dark:text-pink-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

