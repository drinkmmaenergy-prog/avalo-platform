'use client';

/**
 * FIX 120: Age Gate — Required before any content is shown
 *
 * Before user sees ANY profiles, they must confirm 18+.
 * Required by Apple/Google App Store and most dating regulations.
 * Stores confirmation in localStorage so it only shows once per browser.
 */
import { useState, useEffect } from 'react';

export default function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ageVerified = localStorage.getItem('age_verified');
    setVerified(!!ageVerified);
    setLoaded(true);
  }, []);

  const handleConfirm = (isAdult: boolean) => {
    if (isAdult) {
      localStorage.setItem('age_verified', new Date().toISOString());
      setVerified(true);
    } else {
      window.location.href = 'https://www.google.com';
    }
  };

  if (!loaded) return null;
  if (verified) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center">
          <span className="text-3xl text-white font-bold">18+</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Age Verification</h1>
        <p className="text-gray-400 text-sm mb-8">
          Avalo is for adults only. You must be at least 18 years old to use this platform.
          By continuing, you confirm you are 18 or older.
        </p>
        <div className="space-y-3">
          <button onClick={() => handleConfirm(true)}
            className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-xl font-medium">
            I am 18 or older — Enter
          </button>
          <button onClick={() => handleConfirm(false)}
            className="w-full py-3 bg-gray-800 text-gray-400 rounded-xl text-sm">
            I am under 18 — Leave
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-6">
          By entering, you agree to our{' '}
          <a href="/legal/terms" className="underline">Terms of Service</a> and{' '}
          <a href="/legal/privacy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
