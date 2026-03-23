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
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { doc, collection, query, orderBy, limit, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuthModal } from '@/components/AuthModal';
import { Avatar } from '@/components/ui/Avatar';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { requireDb } from '@/lib/firebase';
import { useFCM } from '@/hooks/useFCM';
import { initPresence } from '@/lib/presenceService';
import NotificationPrompt from '@/components/notifications/NotificationPrompt';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import DailyMissions from '@/components/missions/DailyMissions';

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
  { key: 'messages', href: '/messages', icon: MessageCircle, labelKey: 'nav.messages' },
  { key: 'ai', href: '/ai', icon: Bot, labelKey: 'nav.ai' },
  { key: 'creator', href: '/creator', icon: Palette, labelKey: 'nav.creatorHub' },
];

/** Bottom navigation for mobile — base items (creator conditional via FIX 20) */
const BOTTOM_NAV_BASE: NavItem[] = [
  { key: 'feed', href: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
  { key: 'discover', href: '/discover', icon: Compass, labelKey: 'nav.discover' },
  { key: 'messages', href: '/messages', icon: MessageCircle, labelKey: 'nav.messages' },
  { key: 'ai', href: '/ai', icon: Bot, labelKey: 'nav.ai' },
];

const BOTTOM_NAV_CREATOR: NavItem = { key: 'creator', href: '/creator', icon: Palette, labelKey: 'nav.creator' };

const BOTTOM_NAV_TAIL: NavItem[] = [
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

  // FIX 56A: Initialize Firebase Cloud Messaging for push notifications
  useFCM(firebaseUser?.uid ?? null);

  // FIX 102: Initialize online presence (green dot + last seen) via RTDB
  useEffect(() => {
    if (firebaseUser?.uid) {
      initPresence(firebaseUser.uid);
    }
  }, [firebaseUser?.uid]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // FIX 35: Notification Center state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // FIX 20: Conditionally show Kreator in bottom nav based on earn_on
  const [earnOn, setEarnOn] = useState(false);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    let active = true;
    try {
      const unsub = onSnapshot(doc(requireDb(), 'users', uid), (snap) => {
        if (active) setEarnOn(snap.data()?.earn_on === true);
      });
      return () => { active = false; unsub(); };
    } catch {
      return () => { active = false; };
    }
  }, [firebaseUser?.uid]);

  // FIX 35: Real-time notification listener
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    let active = true;
    try {
      const q = query(
        collection(requireDb(), 'notifications', uid, 'items'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!active) return;
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setNotifications(items);
        setUnreadCount(items.filter((n: any) => !n.read).length);
      });
      return () => { active = false; unsub(); };
    } catch {
      return () => { active = false; };
    }
  }, [firebaseUser?.uid]);

  // FIX 20: Compute bottom nav items dynamically
  const bottomNavItems: NavItem[] = [
    ...BOTTOM_NAV_BASE,
    ...(earnOn ? [BOTTOM_NAV_CREATOR] : []),
    ...BOTTOM_NAV_TAIL,
  ];

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

  // Close user menu and notification panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile nav and panels on route change
  useEffect(() => {
    setMobileNavOpen(false);
    setMenuOpen(false);
    setShowNotifPanel(false);
  }, [pathname]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    await signOut();
    router.replace('/');
  };

  // FIX 35: Notification helpers
  const formatTimeAgo = (ts: any): string => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const handleNotifClick = async (n: any) => {
    if (!n.read) {
      try {
        await updateDoc(doc(requireDb(), 'notifications', firebaseUser!.uid, 'items', n.id), { read: true });
      } catch { /* silent — read-mark is best-effort */ }
    }
    if (['message', 'priority_message'].includes(n.type)) {
      router.push(`/chat/${n.chatId || n.senderId}`);
    } else if (['follow', 'like', 'comment'].includes(n.type)) {
      router.push(`/profile/${n.senderId}`);
    } else if (['booking', 'booking_confirmed', 'booking_cancelled', 'booking_reminder'].includes(n.type)) {
      router.push('/calendar');
    } else if (n.type === 'tip' || n.type === 'payout_completed') {
      router.push('/wallet');
    } else if (n.type === 'event_ticket') {
      router.push('/calendar');
    }
    setShowNotifPanel(false);
  };

  const markAllRead = async () => {
    try {
      await Promise.all(
        notifications
          .filter((n: any) => !n.read)
          .map((n: any) =>
            updateDoc(doc(requireDb(), 'notifications', firebaseUser!.uid, 'items', n.id), { read: true })
          )
      );
    } catch { /* silent — best-effort */ }
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

          {/* CENTER — Primary navigation (desktop only) — FIX 20: Creator link conditional */}
          <nav className="hidden lg:flex items-center gap-1">
            {CENTER_NAV.filter(item => item.key !== 'creator' || earnOn).map((item) => {
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
              style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}
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

            {/* FIX 35: Notifications bell + dropdown */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <div className="absolute right-0 top-12 w-80 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-700 z-50">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-[#E4458F] hover:underline">Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-gray-400 text-center py-8 text-sm">No notifications yet</p>
                  ) : (
                    notifications.map((n: any) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${!n.read ? 'bg-pink-50 dark:bg-pink-900/20' : ''}`}
                      >
                        <Avatar src={n.senderPhotoURL} name={n.senderName} size={40} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            <strong>{n.senderName || 'Someone'}</strong>{' '}
                            {n.type === 'like' && 'liked your post'}
                            {n.type === 'follow' && 'started following you'}
                            {n.type === 'tip' && `sent you a ${n.amount || ''} token tip`}
                            {n.type === 'message' && 'sent you a message'}
                            {n.type === 'priority_message' && 'sent a priority message'}
                            {n.type === 'booking' && 'booked a meeting with you'}
                            {n.type === 'booking_confirmed' && 'confirmed your meeting'}
                            {n.type === 'booking_cancelled' && 'cancelled a meeting'}
                            {n.type === 'booking_reminder' && 'Meeting reminder'}
                            {n.type === 'mismatch_report' && 'reported appearance mismatch'}
                            {n.type === 'subscription' && 'subscribed to you'}
                            {n.type === 'comment' && 'commented on your post'}
                            {n.type === 'event_ticket' && 'bought a ticket to your event'}
                            {n.type === 'payout_completed' && 'Payout processed'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatTimeAgo(n.createdAt)}</p>
                        </div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-[#E4458F] flex-shrink-0 mt-2" />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* User menu (profile dropdown) */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label={t('appShell.userMenu')}
              >
                {/* FIX 21 + FIX 113: Avatar thumbnail in navbar */}
                <Avatar src={photoURL} name={displayName || 'U'} size={32} className="ring-2 ring-gray-200 dark:ring-gray-700" />
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm"
              style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}
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

      {/* FIX 65C: Compact legal footer links — Terms, Privacy, Contact */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-8 py-4 px-6 text-center text-xs text-gray-400 dark:text-gray-500 hidden lg:block">
        <div className="flex justify-center gap-4">
          <a href="/terms" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Terms of Service</a>
          <a href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy Policy</a>
          <a href="mailto:support@avalo.app" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Contact</a>
        </div>
        <p className="mt-2">&copy; 2026 Avalo. All rights reserved.</p>
      </footer>

      {/* FIX 56C: Notification permission prompt — shown once after login */}
      <NotificationPrompt uid={firebaseUser?.uid ?? null} />

      {/* FIX 67D: PWA install prompt — shown after 30s on supported browsers */}
      <InstallPrompt />

      {/* FIX 108: Daily Missions floating card — visible for logged-in users */}
      {firebaseUser && <DailyMissions />}

      {/* ─── Bottom Navigation — mobile & tablet only ─────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 lg:hidden safe-area-pb">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          {bottomNavItems.map((item) => {
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


