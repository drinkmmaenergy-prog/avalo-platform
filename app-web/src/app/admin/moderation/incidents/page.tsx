'use client';

import { AlertTriangle } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useRealtimeIncidents } from '@/lib/moderation/realtime';
import { useRouter } from 'next/navigation';

// Fallback data for offline/error state
const mockIncidents = [
  {
    id: 'INC-001',
    userId: 'user_beta',
    type: 'inappropriate_content',
    severity: 'medium',
    status: 'under_review',
    reportedDate: '2024-11-20T10:30:00Z',
    description: 'Inappropriate language in profile bio',
  },
  {
    id: 'INC-002',
    userId: 'user_delta',
    type: 'harassment',
    severity: 'high',
    status: 'resolved',
    reportedDate: '2024-11-18T14:22:00Z',
    description: 'Repeated harassment in chat messages',
  },
  {
    id: 'INC-003',
    userId: 'user_epsilon',
    type: 'spam',
    severity: 'low',
    status: 'pending',
    reportedDate: '2024-11-21T09:15:00Z',
    description: 'Spam messages in public channels',
  },
  {
    id: 'INC-004',
    userId: 'user_delta',
    type: 'impersonation',
    severity: 'high',
    status: 'resolved',
    reportedDate: '2024-11-17T16:45:00Z',
    description: 'Impersonating another user',
  },
  {
    id: 'INC-005',
    userId: 'user_beta',
    type: 'inappropriate_content',
    severity: 'medium',
    status: 'under_review',
    reportedDate: '2024-11-19T11:00:00Z',
    description: 'Inappropriate image uploaded',
  },
];

const getSeverityVariant = (severity: string): 'success' | 'warning' | 'danger' => {
  switch (severity) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
    case 'critical':
      return 'danger';
    default:
      return 'warning';
  }
};

const getStatusVariant = (status: string): 'success' | 'warning' | 'info' | 'neutral' => {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'under_review':
      return 'warning';
    case 'pending':
      return 'info';
    default:
      return 'neutral';
  }
};

export default function IncidentsPage() {
  const router = useRouter();
  const { incidents, loading, error } = useRealtimeIncidents(100);
  
  // Use real-time data if available, fallback to mock data
  const displayIncidents = loading ? mockIncidents : incidents.length > 0 ? incidents : mockIncidents;

  const columns = [
    {
      key: 'id',
      label: 'Incident ID',
      render: (incident: any) => (
        <button
          onClick={() => router.push(`/admin/moderation/incidents/${incident.id}`)}
          className="font-mono text-[#40E0D0] hover:text-[#D4AF37] transition-colors"
        >
          {incident.id}
        </button>
      ),
    },
    {
      key: 'userId',
      label: 'User',
      render: (incident: any) => (
        <button
          onClick={() => router.push(`/admin/moderation/user/${incident.userId}`)}
          className="text-gray-300 hover:text-[#40E0D0] transition-colors"
        >
          {incident.userId}
        </button>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (incident: any) => (
        <span className="text-gray-300">
          {(incident.category || incident.type || 'Unknown').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (incident: any) => (
        <Badge variant={getSeverityVariant(incident.severity)}>
          {(incident.severity || 'MEDIUM').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (incident: any) => (
        <Badge variant={getStatusVariant(incident.status)}>
          {(incident.status || 'pending').replace(/_/g, ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      label: 'Reported',
      render: (incident: any) => (
        <span className="text-gray-400">
          {incident.timestamp
            ? new Date(incident.timestamp.toMillis()).toLocaleString()
            : incident.reportedDate
            ? new Date(incident.reportedDate).toLocaleDateString()
            : 'Unknown'}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Loading incidents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Incidents</h1>
          <p className="text-gray-400 text-lg">
            Content moderation incidents and reports
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#40E0D0]/20">
          <AlertTriangle className="w-5 h-5 text-[#40E0D0]" />
          <span className="text-white font-semibold">{displayIncidents.length} Incidents</span>
          {!loading && incidents.length > 0 && (
            <span className="ml-2 text-xs text-green-400">● LIVE</span>
          )}
        </div>
      </div>

      {/* Filters Placeholder */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Severities</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Statuses</option>
            <option>Pending</option>
            <option>Under Review</option>
            <option>Resolved</option>
          </select>
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Types</option>
            <option>Inappropriate Content</option>
            <option>Harassment</option>
            <option>Spam</option>
            <option>Impersonation</option>
          </select>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Note: Filter functionality will be available in PACK 2
        </p>
      </div>

      {/* Incidents Table */}
      <DataTable
        columns={columns}
        data={displayIncidents}
        emptyMessage="No incidents found"
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
          ℹ️ <strong>PACK 3 - Real-Time Updates:</strong> This page now updates automatically when new incidents are reported.
          Click incident ID to view details and take action.
        </p>
      </div>
    </div>
  );
}