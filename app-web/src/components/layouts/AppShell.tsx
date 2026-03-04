'use client';

/**
 * AppShell — Authenticated layout with top header navigation.
 *
 * Features:
 * - Top header navigation:
 *     Left:   Avalo Logo
 *     Center: Feed, Discover, AI, Creator Hub
 *     Right:  💎 Buy Tokens (CTA), Wallet, Profile
 * - Admin link visible only for moderator/admin role
 * - Auth guard: redirects logged-out users to /auth
 * - Onboarding guard: redirects incomplete profiles to /onboarding
 * - Icons via lucide-react + translated labels via i18n
 * - Mobile: collapsible hamburger menu + bottom nav for quick access
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
  Gem,
  Shield,
  Palette,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuthModal } from '@/components/AuthModal';
import LanguageSwitcher from '@/components/LanguageSwitcher';

/* ─── Nav definitions ──────────────────────────────────────────────────── */

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
}

/** Center navigation — primary app sections */
const CENTER_NAV: NavItem[] = [
  { key: 'feed', href: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
  { key: 'discover', href: '/discover', icon: Compass, labelKey: 'nav.discover' },
  { key: 'ai', href: '/ai/chat', icon: Bot, labelKey: 'nav.ai' },
  { key: 'creator', href: '/creator', icon: Palette, labelKey: 'nav.creatorHub' },
];

/** Bottom navigation for mobile — quick access */
const BOTTOM_NAV: NavItem[] = [
  { key: 'feed', href: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
  { key: 'discover', href: '/discover', icon: Compass, labelKey: 'nav.discover' },
  { key: 'ai', href: '/ai/chat', icon: Bot, labelKey: 'nav.ai' },
  { key: 'wallet', href: '/wallet', icon: Wallet, labelKey: 'nav.wallet' },
  { key: 'profile', href: '/profile', icon: UserCircle, labelKey: 'nav.profile' },
];

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function isAdminOrModerator(role?: string): boolean {
  return role === 'admin' || role === 'moderator';
}

/* ─── Component ───────────────────────────────────────────────────────── */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, firebaseUser, loading, needsOnboarding, signOut } = useAuth();
  const { t } = useI18n();
  const { openAuthModal } = useAuthModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auth guard — show modal instead of redirect
  useEffect(() => {
    if (!loading && !firebaseUser) {
      openAuthModal(pathname ?? '/feed');
    }
  }, [loading, firebaseUser, pathname, openAuthModal]);

  // Onboarding guard
  useEffect(() => {
    if (!loading && firebaseUser && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [loading, firebaseUser, needsOnboarding, router]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    await signOut();
    router.replace('/');
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
  const showAdmin = isAdminOrModerator(user?.role);

  function isActive(href: string): boolean {
    return pathname === href || (pathname?.startsWith(href + '/') ?? false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* ─── Top Header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* LEFT — Logo */}
          <Link href="/feed" className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-display font-bold bg-gradient-to-r from-primary-600 to-pink-500 bg-clip-text text-transparent">
              {t('common.appName')}
            </span>
          </Link>

          {/* CENTER — Primary navigation (desktop only) */}
          <nav className="hidden lg:flex items-center gap-1">
            {CENTER_NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}

            {/* Admin link — visible only for moderator/admin role */}
            {showAdmin && (
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/admin')
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{t('nav.admin')}</span>
              </Link>
            )}
          </nav>

          {/* RIGHT — Actions (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Language switcher */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {/* 💎 Buy Tokens — primary CTA */}
            <Link
              href="/wallet/buy"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-pink-600 hover:to-purple-700 transition-all"
            >
              <Gem className="w-4 h-4" />
              <span>{t('nav.buyTokens')}</span>
            </Link>

            {/* Wallet */}
            <Link
              href="/wallet"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/wallet')
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>{t('nav.wallet')}</span>
            </Link>

            {/* Notifications bell */}
            <Link
              href="/account"
              className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </Link>

            {/* User menu (profile dropdown) */}
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
                        <Palette className="w-4 h-4" />
                        {t('nav.creatorHub')}
                      </Link>
                    )}
                    {showAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        {t('nav.admin')}
                      </Link>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
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

          {/* MOBILE — Hamburger + Buy Tokens CTA */}
          <div className="flex items-center gap-2 lg:hidden">
            {/* Buy Tokens CTA — always visible on mobile header */}
            <Link
              href="/wallet/buy"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-semibold shadow-sm"
            >
              <Gem className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.buyTokens')}</span>
              <span className="sm:hidden">💎</span>
            </Link>

            {/* Hamburger toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MOBILE — Slide-down menu */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg animate-fade-in">
            <nav className="max-w-7xl mx-auto px-4 py-3 space-y-1">
              {CENTER_NAV.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}

              {showAdmin && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin')
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  {t('nav.admin')}
                </Link>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              <Link
                href="/wallet"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/wallet')
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Wallet className="w-4 h-4" />
                {t('nav.wallet')}
              </Link>

              <Link
                href="/profile"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/profile')
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <UserCircle className="w-4 h-4" />
                {t('nav.profile')}
              </Link>

              <Link
                href="/account"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Settings className="w-4 h-4" />
                {t('nav.settings')}
              </Link>

              <div className="px-3 py-2">
                <LanguageSwitcher />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('nav.signOut')}
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* ─── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 pb-20 lg:pb-4">
        {children}
      </main>

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
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
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

