'use client';

/**
 * PHASE 5.1 — Web Foundation Header Component
 * 
 * Header for marketing/unauthenticated pages (legal, standalone).
 * For authenticated app pages, AppShell provides its own top navigation.
 * 
 * @version v2.0 — updated to include Buy Tokens CTA and consistent links
 */
import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface HeaderProps {
  showAuthButtons?: boolean;
}

export default function Header({ showAuthButtons = true }: HeaderProps) {
  const { user, loading } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-pink-500 bg-clip-text text-transparent">
              Avalo
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              href="/feed" 
              className="text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Feed
            </Link>
            <Link 
              href="/discover" 
              className="text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Discover
            </Link>
            <Link 
              href="/wallet/buy" 
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-pink-600 hover:to-purple-700 transition-all"
            >
              💎 Buy Tokens
            </Link>
          </nav>

          {/* Auth Actions + Language Switcher */}
          {showAuthButtons && (
            <div className="flex items-center space-x-4">
              <div className="hidden sm:block">
                <LanguageSwitcher />
              </div>
              {loading ? (
                <div className="h-8 w-8 animate-pulse bg-gray-200 rounded-full" />
              ) : user ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 hidden sm:block">
                    {user.displayName || user.email || 'User'}
                  </span>
                  <Link
                    href="/wallet"
                    className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    My Wallet
                  </Link>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link
                    href="/auth/login"
                    className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
                    className="hidden sm:inline-block bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg 
              className="h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 6h16M4 12h16M4 18h16" 
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}


