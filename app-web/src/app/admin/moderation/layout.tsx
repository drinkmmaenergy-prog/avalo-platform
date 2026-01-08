import React from 'react';
import { redirect } from 'next/navigation';
import { ModerationSidebar } from './components/Sidebar';
import { ModerationTopbar } from './components/Topbar';
import { LiveModeratorsPanel } from './components/LiveModeratorsPanel';
import { checkModeratorAccess } from '@/lib/moderation/auth';

export const metadata = {
  title: 'Avalo Moderator Dashboard',
  description: 'Moderation and content management for Avalo',
};

export default async function ModerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is authenticated and has moderator access
  const moderatorInfo = await checkModeratorAccess();

  if (!moderatorInfo.hasAccess) {
    // User doesn't have moderator access - redirect to no-access page
    redirect('/admin/no-access');
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white font-['Inter']">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <ModerationSidebar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <ModerationTopbar user={moderatorInfo.user} />
          
          {/* Page Content with Live Moderators Panel */}
          <div className="relative flex-1 overflow-hidden">
            <main className="h-full overflow-y-auto p-8 pr-[calc(2rem+20rem)]">
              {children}
            </main>
            
            {/* Live Moderators Panel (Fixed Right) */}
            <LiveModeratorsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}