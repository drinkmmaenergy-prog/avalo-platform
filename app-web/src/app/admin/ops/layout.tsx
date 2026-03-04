/**
 * PHASE 3.3 — Admin Ops Layout
 * 
 * Layout for admin ops views with admin role gating.
 * READ-ONLY access — no wallet balance mutations.
 */

'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRoleGate } from '@/hooks/useRoleGate';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: 'Overview', href: '/admin/ops', icon: '📊' },
  { name: 'Feature Flags', href: '/admin/ops/flags', icon: '🚩' },
  { name: 'Trust & Safety', href: '/admin/ops/trust', icon: '🛡️' },
  { name: 'System Health', href: '/admin/ops/health', icon: '💚' },
];

export default function AdminOpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { isAuthorized, isLoading } = useRoleGate({
    requiredRole: 'admin',
    redirectTo: '/admin/no-access',
  });
  
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto" />
          <p className="mt-4 text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center max-w-md p-8 bg-gray-800 rounded-xl">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white mb-2">Admin Access Required</h1>
          <p className="text-gray-400 mb-6">
            You need administrator privileges to access this panel.
          </p>
          <a
            href="/"
            className="inline-block bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <a href="/" className="text-2xl font-bold text-green-500">
                Avalo
              </a>
              <span className="text-gray-600">|</span>
              <span className="text-gray-300 font-medium">Admin Ops</span>
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
                READ-ONLY
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">
                {user?.displayName || user?.email}
              </span>
              <div className="h-8 w-8 rounded-full bg-green-900 flex items-center justify-center">
                <span className="text-green-400 font-medium">👤</span>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
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
                          ? 'bg-gray-800 text-green-400 font-medium'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
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
          
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

