'use client';

/**
 * AppShell — Authenticated layout with bottom navigation and top bar.
 *
 * Features:
 * - Bottom navigation: Feed, Discover, AI, Wallet, Profile
 * - Top bar: logo, language switch, notifications bell, user menu
 * - Auth guard: redirects logged-out users to /auth
 * - Onboarding guard: redirects incomplete profiles to /onboarding
 * - Icons via lucide-react + translated labels via i18n
 * - Desktop responsive: sidebar-style on large screens
 *
 * Usage:
 *   <AppShell>{children}</AppShell>
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Newspaper,
  Compass,
  Bot,
  Wallet,
  UserCircle,
  Bell,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'feed', href: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
  { key: 'discover', href: '/discover', icon: Compass, labelKey: 'nav.discover' },
  { key: 'ai', href: '/ai/chat', icon: Bot, labelKey: 'nav.ai' },
  { key: 'wallet', href: '/wallet', icon: Wallet, labelKey: 'nav.wallet' },
  { key: 'profile', href: '/profile', icon: UserCircle, labelKey: 'nav.profile' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, firebaseUser, loading, needsOnboarding, signOut } = useAuth();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace('/auth/login');
    }
  }, [loading, firebaseUser, router]);

  // Onboarding guard
  useEffect(() => {
    if (!loading && firebaseUser && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [loading, firebaseUser, needsOnboarding, router]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.replace('/auth/login');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Not authenticated or needs onboarding — useEffect will redirect
  if (!firebaseUser || needsOnboarding) {
    return null;
  }

  const displayName = user?.displayName ?? firebaseUser.displayName ?? '';
  const photoURL = user?.photoURL ?? firebaseUser.photoURL ?? '';
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/feed" className="flex items-center gap-2">
            <span className="text-xl font-display font-bold bg-gradient-to-r from-primary-600 to-pink-500 bg-clip-text text-transparent">
              {t('common.appName')}
            </span>
          </Link>

          {/* Desktop Navigation (only visible on large screens) */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Language switcher - hidden on mobile */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {/* Notifications bell */}
            <Link
              href="/account"
              className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </Link>

            {/* User menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label={t('appShell.userMenu')}
              >
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={displayName}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-semibold">
                    {initials}
                  </div>
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email ?? firebaseUser.email}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <UserCircle className="w-4 h-4" />
                      {t('nav.profile')}
                    </Link>
                    <Link
                      href="/account"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      {t('nav.settings')}
                    </Link>
                    {user?.isCreator && (
                      <Link
                        href="/creator"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Newspaper className="w-4 h-4" />
                        {t('nav.creators')}
                      </Link>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    {/* Mobile-only language switcher */}
                    <div className="px-4 py-2 sm:hidden">
                      <LanguageSwitcher />
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('nav.signOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 lg:pb-4">
        {children}
      </main>

      {/* Bottom Navigation — mobile & tablet only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 lg:hidden safe-area-pb">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px] ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
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
