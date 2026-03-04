/**
 * PHASE 3.3 — Creator Panel Layout
 * 
 * Layout for creator web panel with role gating.
 * Requires creator role to access.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRoleGate } from '@/hooks/useRoleGate';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: 'Earnings', href: '/creator', icon: '💰' },
  { name: 'Payouts', href: '/creator/payouts', icon: '💳' },
  { name: 'Stripe Connect', href: '/creator/stripe', icon: '🔗' },
  { name: 'Analytics', href: '/creator/analytics', icon: '📊' },
];

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isAuthorized, isLoading } = useRoleGate({
    requiredRole: 'creator',
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
  
  // Redirect non-creators
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Creator Access Required</h1>
          <p className="text-gray-600 mb-6">
            You need to be a verified creator to access this panel.
          </p>
          <a
            href="/become-creator"
            className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Become a Creator
          </a>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
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
              <div className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center">
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
              </div>
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
            </ul>
          </nav>
          
          {/* Main Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

