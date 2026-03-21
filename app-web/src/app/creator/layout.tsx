'use client';

/**
 * PHASE 3.3 — Creator Hub Layout
 *
 * Layout for Creator Hub / Earn with Avalo panel.
 * ANY authenticated user can access — earner is NOT restricted to creator role.
 * See creator/page.tsx: "earn_on is GLOBAL — ANY user can be an earner."
 */
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Newspaper,
  Compass,
  Bot,
  Wallet,
  UserCircle,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRoleGate } from '@/hooks/useRoleGate';
import { useI18n } from '@/components/providers/I18nProvider';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: 'Earnings', href: '/creator', icon: '💰' },
  { name: 'AI Companions', href: '/creator/ai', icon: '🤖' },
  { name: 'Payouts', href: '/creator/payouts', icon: '💳' },
  { name: 'Stripe Connect', href: '/creator/stripe', icon: '🔗' },
  { name: 'Analytics', href: '/creator/analytics', icon: '📊' },
];

interface BottomNavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
}

const BOTTOM_NAV: BottomNavItem[] = [
  { key: 'feed', href: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
  { key: 'discover', href: '/discover', icon: Compass, labelKey: 'nav.discover' },
  { key: 'ai', href: '/ai', icon: Bot, labelKey: 'nav.ai' },
  { key: 'creator', href: '/creator', icon: Palette, labelKey: 'nav.creator' },
  { key: 'wallet', href: '/wallet', icon: Wallet, labelKey: 'nav.wallet' },
  { key: 'profile', href: '/profile', icon: UserCircle, labelKey: 'nav.profile' },
];

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { isAuthorized, isLoading } = useRoleGate({
    requiredRole: 'user',
    redirectTo: '/auth/login?redirect=/creator',
  });
  
  // Show loading state
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading creator panel...</p>
        </div>
      </div>
    );
  }
  
  // Redirect unauthenticated users
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign In Required</h1>
          <p className="text-gray-600 mb-6">
            Please sign in to access the Creator Hub and start earning with Avalo.
          </p>
          <a
            href="/auth/login?redirect=/creator"
            className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }
  
  const isSubpage = pathname !== '/creator' && (pathname ?? '').startsWith('/creator/');

  function isActive(href: string): boolean {
    return pathname === href || (pathname?.startsWith(href + '/') ?? false);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              {isSubpage && (
                <button
                  onClick={() => router.push('/creator')}
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition mr-2"
                >
                  ← Back
                </button>
              )}
              <a href="/" className="text-2xl font-bold text-pink-600">
                Avalo
              </a>
              <span className="text-gray-400">|</span>
              <span className="text-gray-700 font-medium">Creator Panel</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {user?.displayName || user?.email}
              </span>
              <button
                onClick={() => router.push('/profile')}
                className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-pink-300 transition"
                aria-label="View my profile"
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <span className="text-pink-600 font-medium">
                    {(user?.displayName || user?.email || 'C')[0].toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-56 flex-shrink-0">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={`flex items-center px-4 py-3 rounded-lg transition ${
                        isActive
                          ? 'bg-pink-50 text-pink-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      {item.name}
                    </a>
                  </li>
                );
              })}
              {/* View My Profile link */}
              <li>
                <a
                  href="/profile"
                  className="flex items-center px-4 py-3 rounded-lg transition text-gray-700 hover:bg-gray-100 border-t border-gray-100 mt-2 pt-4"
                >
                  <span className="mr-3 text-lg">👤</span>
                  View My Profile
                </a>
              </li>
            </ul>
          </nav>
          
          {/* Main Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>

      {/* ─── Bottom Navigation — mobile & tablet only ─────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 lg:hidden safe-area-pb">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px] ${
                  active
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] leading-tight truncate ${active ? 'font-semibold' : 'font-medium'}`}>
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}


