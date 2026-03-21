'use client';

/**
 * Navbar — Public-facing navigation bar.
 *
 * Order: Logo | Feed | Discover | Creators | Wallet | Token Economy | Download App | Sign In
 *
 * "Creators" is visually emphasized.
 * "Download App" is prominent.
 *
 * For authenticated users: shows profile + wallet.
 * For unauthenticated users: shows Sign In (opens AuthModal).
 */

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, Download, Sparkles } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthModal } from '@/components/AuthModal';

interface NavLink {
  label: string;
  href: string;
  requireAuth?: boolean;
  emphasized?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Feed', href: '/feed', requireAuth: true },
  { label: 'Discover', href: '/discover', requireAuth: true },
  { label: 'Creators', href: '/creators', emphasized: true },
  { label: 'Wallet', href: '/wallet', requireAuth: true },
  { label: 'Token Economy', href: '/features/token-economy' },
  { label: 'Download App', href: '/download' },
];

export default function Navbar() {
  const { user, firebaseUser, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (link: NavLink, e: React.MouseEvent) => {
    if (link.requireAuth && !firebaseUser) {
      e.preventDefault();
      openAuthModal(link.href);
    }
  };

  const handleSignIn = () => {
    openAuthModal('/feed');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <span className="text-2xl font-extrabold gradient-text">Avalo</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(link, e)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  link.emphasized
                    ? 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {link.emphasized && <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                {link.label === 'Download App' && <Download className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-20 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg" />
            ) : firebaseUser ? (
              <div className="hidden sm:flex items-center gap-3">
                <Link
                  href="/wallet/buy"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
                  style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}
                >
                  💎 Buy Tokens
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {(user?.photoURL || firebaseUser.photoURL) ? (
                    <img src={(user?.photoURL || firebaseUser.photoURL)!} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                      {(user?.displayName ?? firebaseUser.displayName ?? 'U')[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="hidden md:inline">
                    {user?.displayName ?? firebaseUser.displayName ?? 'Profile'}
                  </span>
                </Link>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="hidden sm:inline-flex items-center px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition shadow-sm"
              >
                Sign In
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  handleNavClick(link, e);
                  setMobileOpen(false);
                }}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  link.emphasized
                    ? 'text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {!firebaseUser && (
              <button
                onClick={() => {
                  handleSignIn();
                  setMobileOpen(false);
                }}
                className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold text-center"
              >
                Sign In
              </button>
            )}

            {firebaseUser && (
              <Link
                href="/wallet/buy"
                onClick={() => setMobileOpen(false)}
                className="block mt-2 px-4 py-3 rounded-xl text-white text-sm font-semibold text-center"
                style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}
              >
                💎 Buy Tokens
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

