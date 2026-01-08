'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Users, Clock, Eye } from 'lucide-react';
import { useOnlineModerators } from '@/lib/moderation/realtime';
import Link from 'next/link';

export function LiveModeratorsPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { moderators, loading } = useOnlineModerators();

  const formatTimeOnCase = (timeInMs?: number): string => {
    if (!timeInMs) return '0m';
    const minutes = Math.floor(timeInMs / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div
      className={`fixed right-0 top-16 h-[calc(100vh-4rem)] bg-[#1A1A1A] border-l border-[#40E0D0]/20 transition-all duration-300 z-40 ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Collapse/Expand Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -left-3 top-6 w-6 h-6 bg-[#40E0D0] rounded-full flex items-center justify-center hover:bg-[#D4AF37] transition-colors shadow-lg"
        title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
      >
        {isCollapsed ? (
          <ChevronLeft className="w-4 h-4 text-[#0F0F0F]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#0F0F0F]" />
        )}
      </button>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="h-full flex flex-col p-4 overflow-hidden">
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-[#40E0D0]" />
              <h3 className="text-lg font-bold text-white">Live Moderators</h3>
            </div>
            <p className="text-xs text-gray-500">Currently online and active</p>
          </div>

          {/* Online Count */}
          <div className="mb-4 px-3 py-2 bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Online</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-lg font-bold text-[#40E0D0]">
                  {loading ? '...' : moderators.length}
                </span>
              </div>
            </div>
          </div>

          {/* Moderators List */}
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-2 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-xs text-gray-500">Loading...</p>
              </div>
            ) : moderators.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No moderators online</p>
              </div>
            ) : (
              moderators.map((moderator) => (
                <div
                  key={moderator.id}
                  className="bg-[#0F0F0F] rounded-lg p-3 border border-[#40E0D0]/20 hover:border-[#40E0D0]/40 transition-colors"
                >
                  {/* Moderator Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
                          <span className="text-[#0F0F0F] font-bold text-xs">
                            {moderator.displayName?.[0]?.toUpperCase() ||
                              moderator.email?.[0]?.toUpperCase() ||
                              'M'}
                          </span>
                        </div>
                        {/* Online indicator */}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0F0F0F]"></span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {moderator.displayName || 'Moderator'}
                        </p>
                        {moderator.email && (
                          <p className="text-xs text-gray-500 truncate">
                            {moderator.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Current Activity */}
                  {moderator.currentIncidentId ? (
                    <Link
                      href={`/admin/moderation/incidents/${moderator.currentIncidentId}`}
                      className="block bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded p-2 hover:bg-[#D4AF37]/20 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Eye className="w-3 h-3 text-[#D4AF37] flex-shrink-0" />
                        <span className="text-xs text-[#D4AF37] font-semibold">
                          Reviewing
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono truncate mb-1">
                        {moderator.currentIncidentId}
                      </p>
                      {moderator.timeOnCase && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimeOnCase(moderator.timeOnCase)}</span>
                        </div>
                      )}
                    </Link>
                  ) : (
                    <div className="bg-[#40E0D0]/5 border border-[#40E0D0]/20 rounded p-2">
                      <p className="text-xs text-gray-500 italic">Available</p>
                    </div>
                  )}

                  {/* Last Seen */}
                  <div className="mt-2 pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-600">
                      Last seen:{' '}
                      {moderator.lastSeen
                        ? new Date(moderator.lastSeen.toMillis()).toLocaleTimeString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-[#40E0D0]/20">
            <p className="text-xs text-gray-600 text-center">
              Updates every 15 seconds
            </p>
          </div>
        </div>
      )}

      {/* Collapsed View */}
      {isCollapsed && (
        <div className="h-full flex flex-col items-center py-6 gap-4">
          <Users className="w-6 h-6 text-[#40E0D0]" />
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#40E0D0]/20 border border-[#40E0D0]/40">
            <span className="text-sm font-bold text-[#40E0D0]">
              {loading ? '...' : moderators.length}
            </span>
          </div>
          {moderators.length > 0 && (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          )}
        </div>
      )}

      {/* Custom Scrollbar Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f0f0f;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #40e0d0;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4af37;
        }
      `}</style>
    </div>
  );
}