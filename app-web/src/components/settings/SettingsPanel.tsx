'use client';

/**
 * Settings Panel Component
 * Wired navigation to account pages + sign out via AuthProvider.
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';

interface SettingsLink {
  href: string;
  label: string;
  icon: string;
  description?: string;
}

const settingsLinks: SettingsLink[] = [
  {
    href: '/account',
    label: 'Account',
    icon: '👤',
    description: 'Profile, subscription, and wallet overview',
  },
  {
    href: '/account/security',
    label: 'Security',
    icon: '🔒',
    description: 'Password, sessions, and verification',
  },
  {
    href: '/account/billing',
    label: 'Billing',
    icon: '💳',
    description: 'Subscription and payment methods',
  },
  {
    href: '/account/tokens',
    label: 'Tokens',
    icon: '💎',
    description: 'Token balance and purchases',
  },
  {
    href: '/legal/privacy',
    label: 'Privacy',
    icon: '🛡️',
    description: 'Privacy settings and data management',
  },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    icon: '🔔',
    description: 'Email and push notification preferences',
  },
];

export default function SettingsPanel() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast({
        type: 'success',
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign out.';
      toast({ type: 'error', title: 'Sign out failed', description: message });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">Settings</h1>
        {user?.displayName && (
          <p className="text-sm text-gray-500 mt-1">{user.displayName}</p>
        )}
      </div>
      <div className="divide-y">
        {settingsLinks.map((link) => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center group transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{link.icon}</span>
              <div>
                <span className="font-medium text-gray-900">{link.label}</span>
                {link.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{link.description}</p>
                )}
              </div>
            </div>
            <span className="text-gray-400 group-hover:text-gray-600 transition">&rarr;</span>
          </button>
        ))}

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full p-4 text-left hover:bg-red-50 flex justify-between items-center text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🚪</span>
            <span className="font-medium">
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </span>
          </div>
          {signingOut ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
          ) : (
            <span>&rarr;</span>
          )}
        </button>
      </div>
    </div>
  );
}
