'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth/moderator';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/auth/moderator';

interface ModeratorTopbarProps {
  currentUser: CurrentUser | null;
}

export function ModeratorTopbar({ currentUser }: ModeratorTopbarProps) {
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Moderator Dashboard
        </h2>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Back to Main App */}
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to app</span>
        </Link>

        {/* User Info */}
        {currentUser && (
          <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {currentUser.displayName
                  ? currentUser.displayName[0].toUpperCase()
                  : currentUser.email?.[0].toUpperCase() || 'M'}
              </span>
            </div>

            {/* User Details */}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                {currentUser.displayName || currentUser.email}
              </span>
              {/* Role Badge */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeColor(
                  currentUser.role
                )}`}
              >
                {getRoleDisplayName(currentUser.role)}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}