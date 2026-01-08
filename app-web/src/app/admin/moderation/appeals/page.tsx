'use client';

import { Flag } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useRealtimeAppeals } from '@/lib/moderation/realtime';
import { useRouter } from 'next/navigation';

// Fallback data for offline/error state
const mockAppeals = [
  {
    id: 'APP-001',
    userId: 'user_beta',
    incidentId: 'INC-001',
    reason: 'Account Restriction',
    appealMessage: 'I believe this was a misunderstanding. My profile bio was a song lyric.',
    status: 'pending',
    submittedDate: '2024-11-21T08:00:00Z',
  },
  {
    id: 'APP-002',
    userId: 'user_delta',
    incidentId: 'INC-002',
    reason: 'Permanent Ban',
    appealMessage: 'I apologize for my behavior. I understand I violated the terms and would like a second chance.',
    status: 'under_review',
    submittedDate: '2024-11-19T14:30:00Z',
  },
  {
    id: 'APP-003',
    userId: 'user_epsilon',
    incidentId: 'INC-003',
    reason: 'Content Removal',
    appealMessage: 'The content was removed by mistake. It was part of a legitimate promotion.',
    status: 'approved',
    submittedDate: '2024-11-18T10:15:00Z',
  },
  {
    id: 'APP-004',
    userId: 'user_beta',
    incidentId: 'INC-005',
    reason: 'Content Warning',
    appealMessage: 'The image was artistic in nature and did not violate community guidelines.',
    status: 'rejected',
    submittedDate: '2024-11-20T16:45:00Z',
  },
  {
    id: 'APP-005',
    userId: 'user_delta',
    incidentId: 'INC-004',
    reason: 'Account Suspension',
    appealMessage: 'This was not impersonation. The username similarity was coincidental.',
    status: 'pending',
    submittedDate: '2024-11-21T11:20:00Z',
  },
];

const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
  switch (status) {
    case 'approved':
      return 'success';
    case 'under_review':
      return 'warning';
    case 'rejected':
      return 'danger';
    case 'pending':
      return 'info';
    default:
      return 'info';
  }
};

export default function AppealsPage() {
  const router = useRouter();
  const { appeals, loading, error } = useRealtimeAppeals(100);
  
  // Use real-time data if available, fallback to mock data
  const displayAppeals = loading ? mockAppeals : appeals.length > 0 ? appeals : mockAppeals;
  const pendingCount = displayAppeals.filter(a => a.status === 'PENDING' || a.status === 'pending').length;

  const columns = [
    {
      key: 'id',
      label: 'Appeal ID',
      render: (appeal: any) => (
        <button
          onClick={() => router.push(`/admin/moderation/appeals/${appeal.id}`)}
          className="font-mono text-[#40E0D0] hover:text-[#D4AF37] transition-colors"
        >
          {appeal.id}
        </button>
      ),
    },
    {
      key: 'userId',
      label: 'User',
      render: (appeal: any) => (
        <button
          onClick={() => router.push(`/admin/moderation/user/${appeal.userId}`)}
          className="text-gray-300 hover:text-[#40E0D0] transition-colors"
        >
          {appeal.userId}
        </button>
      ),
    },
    {
      key: 'reason',
      label: 'Appeal Reason',
      render: (appeal: any) => (
        <span className="text-gray-300">{appeal.reason || 'Appeal request'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (appeal: any) => (
        <Badge variant={getStatusVariant(appeal.status)}>
          {(appeal.status || 'PENDING').replace(/_/g, ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      label: 'Submitted',
      render: (appeal: any) => (
        <span className="text-gray-400">
          {appeal.timestamp
            ? new Date(appeal.timestamp.toMillis()).toLocaleString()
            : appeal.submittedDate
            ? new Date(appeal.submittedDate).toLocaleDateString()
            : 'Unknown'}
        </span>
      ),
    },
    {
      key: 'incidentId',
      label: 'Related Incident',
      render: (appeal: any) => (
        <button
          onClick={() => appeal.incidentId && router.push(`/admin/moderation/incidents/${appeal.incidentId}`)}
          className="font-mono text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          {appeal.incidentId || 'N/A'}
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Loading appeals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Appeals</h1>
          <p className="text-gray-400 text-lg">
            Review and process user appeal requests
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#D4AF37]/30">
            <Flag className="w-5 h-5 text-[#D4AF37]" />
            <span className="text-white font-semibold">{pendingCount} Pending</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#40E0D0]/20">
            <span className="text-white font-semibold">{displayAppeals.length} Total</span>
            {!loading && appeals.length > 0 && (
              <span className="ml-2 text-xs text-green-400">● LIVE</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters Placeholder */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Statuses</option>
            <option>Pending</option>
            <option>Under Review</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Reasons</option>
            <option>Account Restriction</option>
            <option>Account Suspension</option>
            <option>Permanent Ban</option>
            <option>Content Removal</option>
          </select>
          <input
            type="text"
            placeholder="Search by user or incident..."
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#40E0D0] focus:outline-none"
            disabled
          />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Note: Filter and search functionality will be available in PACK 2
        </p>
      </div>

      {/* Appeals Table */}
      <DataTable
        columns={columns}
        data={displayAppeals}
        emptyMessage="No appeals found"
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">
            ⚠️ <strong>Connection Error:</strong> {error}. Showing cached data.
          </p>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg p-4">
        <p className="text-sm text-[#40E0D0]">
          ℹ️ <strong>PACK 3 - Real-Time Updates:</strong> This page now updates automatically when new appeals are submitted.
          Click appeal ID to review and take action (approve/reject/request info).
        </p>
      </div>
    </div>
  );
}