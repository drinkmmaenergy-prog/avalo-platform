'use client';

import { ModeratorSidebar } from './ModeratorSidebar';
import { ModeratorTopbar } from './ModeratorTopbar';
import type { CurrentUser } from '@/lib/auth/moderator';

interface ModeratorLayoutShellProps {
  children: React.ReactNode;
  currentUser: CurrentUser | null;
}

export function ModeratorLayoutShell({
  children,
  currentUser,
}: ModeratorLayoutShellProps) {
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <ModeratorSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <ModeratorTopbar currentUser={currentUser} />

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}