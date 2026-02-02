/**
 * PHASE 5.1 — Web Foundation Header Component
 * 
 * Minimal, professional header for the Avalo web app.
 * Infrastructure UI — not marketing.
 * 
 * @version v1.0
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

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
            <span className="text-2xl font-bold text-gray-900">Avalo</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link 
              href="/wallet/buy" 
              className="text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Buy Tokens
            </Link>
            <Link 
              href="/legal/terms" 
              className="text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Terms
            </Link>
            <Link 
              href="/legal/privacy" 
              className="text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Privacy
            </Link>
          </nav>

          {/* Auth Actions */}
          {showAuthButtons && (
            <div className="flex items-center space-x-4">
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
                <Link
                  href="/auth/login"
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Sign In
                </Link>
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
