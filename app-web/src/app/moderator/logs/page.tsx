export const metadata = {
  title: 'Moderation Logs | Moderator',
  description: 'View moderation activity logs',
};

export default function ModeratorLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          Moderation Logs
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          View all moderation actions and audit trail
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
            <span className="text-3xl">📝</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
            Activity Logs
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            This page will display a chronological log of all moderation actions.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Will be implemented in Phase 30B-2 Pack 2
          </p>
        </div>
      </div>
    </div>
  );
}