'use client';

import React, { useEffect, useState } from 'react';

/**
 * Offline Fallback Component
 * Displays when the user loses internet connection
 */
export function OfflineFallback() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Check initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="max-w-md mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 dark:bg-yellow-900 rounded-full mb-4">
          <svg
            className="w-6 h-6 text-yellow-600 dark:text-yellow-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2">
          You are offline
        </h2>

        <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-4">
          Check your internet connection and try again.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}

/**
 * Connection Status Indicator
 * Small badge showing connection status
 */
export function ConnectionStatusBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-lg shadow-lg">
      <div className="w-2 h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full animate-pulse" />
      <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
        Offline
      </span>
    </div>
  );
}