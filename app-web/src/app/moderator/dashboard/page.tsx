import React from 'react';

export const metadata = {
  title: 'Dashboard | Moderator',
  description: 'Moderator dashboard overview',
};

export default function ModeratorDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          Moderator Dashboard
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Overview of moderation activities and platform health
        </p>
      </div>

      {/* Placeholder Content */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats Cards - Placeholder */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Pending Reviews
            </h3>
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-50">--</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Will be implemented in next phase
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Active Incidents
            </h3>
            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-lg">🚨</span>
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-50">--</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Will be implemented in next phase
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Users
            </h3>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 text-lg">👥</span>
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-50">--</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Will be implemented in next phase
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Actions Today
            </h3>
            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <span className="text-green-600 dark:text-green-400 text-lg">✓</span>
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-50">--</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Will be implemented in next phase
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-cyan-900 dark:text-cyan-100 mb-2">
          🚧 Dashboard Under Construction
        </h3>
        <p className="text-cyan-800 dark:text-cyan-200">
          This is a placeholder for the Moderator Dashboard. Real-time statistics, charts, and
          moderation queue will be implemented in the next development phase.
        </p>
      </div>
    </div>
  );
}