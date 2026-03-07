'use client';

/**
 * Profile Page — user profile view
 * Layout provides AppShell wrapping.
 */

import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { UserCircle, Wallet, Shield } from 'lucide-react';

export default function ProfilePage() {
  const { user, firebaseUser } = useAuth();
  const { t } = useI18n();

  const displayName = user?.displayName ?? firebaseUser?.displayName ?? '';
  const email = user?.email ?? firebaseUser?.email ?? '';
  const photoURL = user?.photoURL ?? firebaseUser?.photoURL ?? '';
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {t('placeholder.profileTitle')}
      </h1>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-500 text-white flex items-center justify-center text-2xl font-bold">
              {initials}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{displayName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{email}</p>
            {user?.isCreator && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
                Creator
              </span>
            )}
          </div>
        </div>

        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          {t('placeholder.profileDesc')}
        </p>

        {user && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-primary-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('wallet.tokenBalance')}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{user.tokenBalance ?? 0}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-green-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user.accountStatus ?? 'ACTIVE'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


