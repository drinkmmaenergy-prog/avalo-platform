'use client';

import { Users, AlertTriangle, ShieldAlert, Flag } from 'lucide-react';
import { StatCard } from './components/StatCard';
import { useRealtimeIncidents, useRealtimeAppeals } from '@/lib/moderation/realtime';
import Link from 'next/link';

export default function ModerationDashboardPage() {
  const { incidents, loading: incidentsLoading } = useRealtimeIncidents(100);
  const { appeals, loading: appealsLoading } = useRealtimeAppeals(100);

  // Calculate stats from real-time data
  const totalIncidents = incidents.length;
  const activeRestrictions = incidents.filter(i => i.status === 'under_review' || i.status === 'pending').length;
  const pendingAppeals = appeals.filter(a => a.status === 'PENDING').length;

  const loading = incidentsLoading || appealsLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">
          Dashboard Overview
        </h1>
        <p className="text-gray-400 text-lg">
          Monitor platform activity and moderation status
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={loading ? '...' : '12,453'}
          icon={Users}
          trend={{ value: '+12.5%', isPositive: true }}
          subtitle="Active users"
        />
        <StatCard
          title="Total Incidents"
          value={loading ? '...' : totalIncidents.toString()}
          icon={AlertTriangle}
          trend={{ value: 'LIVE', isPositive: true }}
          subtitle="Real-time count"
        />
        <StatCard
          title="Active Cases"
          value={loading ? '...' : activeRestrictions.toString()}
          icon={ShieldAlert}
          trend={{ value: 'LIVE', isPositive: true }}
          subtitle="Under review"
        />
        <StatCard
          title="Pending Appeals"
          value={loading ? '...' : pendingAppeals.toString()}
          icon={Flag}
          trend={{ value: 'LIVE', isPositive: pendingAppeals === 0 }}
          subtitle="Awaiting review"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 p-8">
        <h2 className="text-2xl font-bold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/moderation/queue" className="p-6 rounded-lg bg-[#0F0F0F] border border-[#D4AF37]/30 hover:border-[#D4AF37] transition-all duration-200 text-left group shadow-lg hover:shadow-[#D4AF37]/20">
            <ShieldAlert className="w-8 h-8 text-[#D4AF37] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-lg font-semibold text-white mb-1">Priority Queue</h3>
            <p className="text-sm text-gray-400">Start reviewing highest priority cases</p>
          </Link>

          <Link href="/admin/moderation/incidents" className="p-6 rounded-lg bg-[#0F0F0F] border border-[#40E0D0]/30 hover:border-[#40E0D0] transition-all duration-200 text-left group">
            <AlertTriangle className="w-8 h-8 text-[#40E0D0] mb-3 group-hover:text-[#D4AF37] transition-colors" />
            <h3 className="text-lg font-semibold text-white mb-1">Review Incidents</h3>
            <p className="text-sm text-gray-400">Check flagged content and user reports</p>
          </Link>
          
          <Link href="/admin/moderation/appeals" className="p-6 rounded-lg bg-[#0F0F0F] border border-[#40E0D0]/30 hover:border-[#40E0D0] transition-all duration-200 text-left group">
            <Flag className="w-8 h-8 text-[#40E0D0] mb-3 group-hover:text-[#D4AF37] transition-colors" />
            <h3 className="text-lg font-semibold text-white mb-1">Process Appeals</h3>
            <p className="text-sm text-gray-400">Review user appeals and restrictions</p>
          </Link>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 p-8">
        <h2 className="text-2xl font-bold text-white mb-4">Recent Activity</h2>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#40E0D0]/10 mb-4">
            <AlertTriangle className="w-8 h-8 text-[#40E0D0]" />
          </div>
          <p className="text-gray-400 mb-2">
            Recent moderation activity will be displayed here
          </p>
          <p className="text-sm text-gray-600">
            PACK 3 - Real-time updates and live collaboration active
          </p>
        </div>
      </div>
    </div>
  );
}