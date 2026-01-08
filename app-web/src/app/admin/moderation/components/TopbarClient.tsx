'use client';

import Link from 'next/link';
import { ArrowLeft, Bell } from 'lucide-react';
import type { ModeratorUser } from '@/lib/moderation/auth';
import { useAlertCounts } from '@/lib/moderation/realtime';

interface ModerationTopbarClientProps {
  user: ModeratorUser | null;
}

export function ModerationTopbarClient({ user }: ModerationTopbarClientProps) {
  const alertCounts = useAlertCounts();
  
  const totalAlerts = alertCounts.newIncidentsCount + alertCounts.newAppealsCount;
  const hasCritical = alertCounts.criticalCount > 0;
  const hasHigh = alertCounts.highCount > 0;

  // Determine badge color based on priority
  const getBadgeColor = () => {
    if (hasCritical) return 'bg-red-500'; // Critical = Red
    if (hasHigh) return 'bg-amber-500'; // High = Amber
    if (alertCounts.newAppealsCount > 0) return 'bg-blue-500'; // Appeals = Blue
    return 'bg-[#D4AF37]'; // Default = Gold
  };

  return (
    <header className="h-16 bg-[#0F0F0F] border-b border-[#40E0D0]/20 flex items-center justify-between px-8">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-white">
          Moderation Command Center
        </h2>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Notifications Bell with Live Counts */}
        <Link 
          href="/admin/moderation/queue"
          className="relative p-2 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <Bell className="w-5 h-5 text-[#40E0D0] group-hover:text-[#D4AF37] transition-colors" />
          
          {totalAlerts > 0 && (
            <>
              {/* Badge */}
              <span 
                className={`absolute -top-1 -right-1 ${getBadgeColor()} text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-lg`}
              >
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </span>
              
              {/* Pulse animation for critical items */}
              {hasCritical && (
                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 animate-ping opacity-75"></span>
              )}
            </>
          )}
        </Link>

        {/* Alerts Breakdown Tooltip (on hover) */}
        {totalAlerts > 0 && (
          <div className="hidden group-hover:block absolute top-full right-0 mt-2 bg-[#1A1A1A] border border-[#40E0D0]/30 rounded-lg p-4 shadow-xl z-50 min-w-[200px]">
            <div className="space-y-2">
              {alertCounts.criticalCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-400">Critical</span>
                  <span className="text-white font-bold">{alertCounts.criticalCount}</span>
                </div>
              )}
              {alertCounts.highCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-400">High</span>
                  <span className="text-white font-bold">{alertCounts.highCount}</span>
                </div>
              )}
              {alertCounts.newAppealsCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-400">New Appeals</span>
                  <span className="text-white font-bold">{alertCounts.newAppealsCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Back to Main App */}
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 text-sm text-[#40E0D0] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to App</span>
        </Link>

        {/* User Info */}
        {user && (
          <div className="flex items-center gap-3 pl-6 border-l border-[#40E0D0]/20">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
              <span className="text-[#0F0F0F] font-bold text-sm">
                {user.displayName
                  ? user.displayName[0].toUpperCase()
                  : user.email?.[0].toUpperCase() || 'M'}
              </span>
            </div>

            {/* User Details */}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                {user.displayName || user.email}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30">
                MODERATOR
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}