'use client';

/**
 * FIX 119: Cookie Consent Banner — GDPR Required
 *
 * Displays a fixed-bottom banner on first visit, allowing users to accept
 * all cookies (incl. analytics) or essential-only. Stores preference in
 * localStorage and dispatches a 'consent_granted' CustomEvent when the
 * user opts into analytics so GA / FB Pixel listeners can initialise.
 */
import { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) setShow(true);
  }, []);

  const accept = (level: 'all' | 'essential') => {
    localStorage.setItem('cookie_consent', level);
    localStorage.setItem('cookie_consent_date', new Date().toISOString());
    setShow(false);
    // If 'all', enable analytics
    if (level === 'all') {
      // Enable GA, FB Pixel, etc.
      window.dispatchEvent(new CustomEvent('consent_granted'));
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 bg-white border-t shadow-2xl safe-area-bottom">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium">🍪 We use cookies</p>
            <p className="text-xs text-gray-500 mt-1">
              We use essential cookies for app functionality and optional cookies for analytics
              and personalization. See our{' '}
              <a href="/legal/cookies" className="text-[#E4458F] underline">Cookie Policy</a> and{' '}
              <a href="/legal/privacy" className="text-[#E4458F] underline">Privacy Policy</a>.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => accept('essential')}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
              Essential only
            </button>
            <button onClick={() => accept('all')}
              className="px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm">
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
