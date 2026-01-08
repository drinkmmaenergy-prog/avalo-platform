'use client';

import React, { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRestriction } from '../hooks/useUserRestriction';

interface RestrictionGateProps {
  children: ReactNode;
  userId?: string;
}

/**
 * RestrictionGate - Global component that detects and reacts to user restriction states
 * 
 * Status behaviors:
 * - ACTIVE: Allow full access (pass through)
 * - WARNING: Show yellow banner, allow access
 * - SOFT_RESTRICTED: Show modal, block certain actions
 * - SHADOWBAN: Allow access but UI-only visibility limitation
 * - HARD_BANNED: Show full-screen block with logout button
 */
export const RestrictionGate: React.FC<RestrictionGateProps> = ({ children, userId }) => {
  const router = useRouter();
  
  const {
    isActive,
    isWarning,
    isSoftRestricted,
    isHardBanned,
    canAppeal,
    restrictionMessage,
    restrictionEndsAt,
    trust,
  } = useUserRestriction(userId);

  const handleLogout = () => {
    // Navigate to signin
    router.push('/auth/signin');
  };

  const handleAppeal = () => {
    router.push('/restriction/appeal');
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  // ACTIVE or SHADOWBAN: Pass through (shadowban is UI-only, handled elsewhere)
  if (isActive || trust?.status === 'SHADOWBAN') {
    return (
      <>
        {isWarning && <WarningBanner message={restrictionMessage} />}
        {children}
      </>
    );
  }

  // WARNING: Show banner but allow access
  if (isWarning) {
    return (
      <>
        <WarningBanner message={restrictionMessage} />
        {children}
      </>
    );
  }

  // SOFT_RESTRICTED: Show modal
  if (isSoftRestricted) {
    return (
      <>
        {children}
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-5 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Account Temporarily Restricted
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Some features are temporarily unavailable due to a policy violation.
              </p>
              
              {restrictionMessage && (
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded mb-4">
                  <p className="text-sm text-red-800 dark:text-red-200 font-semibold">
                    Reason: {restrictionMessage}
                  </p>
                </div>
              )}

              {restrictionEndsAt && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Restriction ends: {formatDate(restrictionEndsAt)}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {canAppeal && (
                  <button
                    onClick={handleAppeal}
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                  >
                    Appeal Decision
                  </button>
                )}
                <button
                  onClick={() => {}}
                  className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // HARD_BANNED: Full-screen block
  if (isHardBanned) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center">
          <div className="text-8xl mb-6">🚫</div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Account Suspended
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
            Your account has been suspended due to violations of our Terms of Service.
          </p>

          {restrictionMessage && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-lg mb-6 text-left max-w-xl mx-auto">
              <p className="text-sm text-red-800 dark:text-red-200 font-semibold">
                Reason: {restrictionMessage}
              </p>
            </div>
          )}

          {restrictionEndsAt ? (
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              Restriction ends: {formatDate(restrictionEndsAt)}
            </p>
          ) : (
            <p className="text-lg text-red-600 dark:text-red-400 font-semibold mb-8">
              This restriction is permanent.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            {canAppeal && (
              <button
                onClick={handleAppeal}
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 px-6 rounded-xl transition-colors shadow-lg"
              >
                Appeal Decision
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl transition-colors shadow-lg"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: Allow access
  return <>{children}</>;
};

// Warning Banner Component
const WarningBanner: React.FC<{ message: string | null }> = ({ message }) => (
  <div className="bg-teal-500 dark:bg-teal-600 border-b-2 border-teal-600 dark:border-teal-700 px-4 py-3">
    <div className="max-w-7xl mx-auto flex items-center">
      <span className="text-2xl mr-3">⚠️</span>
      <div className="flex-1">
        <p className="font-bold text-gray-900 dark:text-white text-sm">
          Account Warning
        </p>
        <p className="text-gray-900 dark:text-white text-sm">
          {message || 'Your account has received a warning. Please review our community guidelines.'}
        </p>
      </div>
    </div>
  </div>
);

export default RestrictionGate;