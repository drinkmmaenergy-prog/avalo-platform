'use client';

import { Flag } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useRealtimeAppeals } from '@/lib/moderation/realtime';
import { useRouter } from 'next/navigation';

/* ----------------------------- TYPES ----------------------------- */

type AppealStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DENIED'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'denied';

interface Appeal {
  id: string;
  userId: string;
  incidentId?: string;
  reason?: string;
  appealMessage?: string;
  status: AppealStatus;
  submittedDate?: string;
  timestamp?: any; // Firestore Timestamp
}

/* -------------------------- FALLBACK DATA ------------------------- */

const mockAppeals: Appeal[] = [
  {
    id: 'APP-001',
    userId: 'user_beta',
    incidentId: 'INC-001',
    reason: 'Account Restriction',
    appealMessage: 'I believe this was a misunderstanding.',
    status: 'pending',
    submittedDate: '2024-11-21T08:00:00Z',
  },
  {
    id: 'APP-002',
    userId: 'user_delta',
    incidentId: 'INC-002',
    reason: 'Permanent Ban',
    appealMessage: 'I apologize for my behavior.',
    status: 'under_review',
    submittedDate: '2024-11-19T14:30:00Z',
  },
];

/* --------------------------- HELPERS ------------------------------ */

const normalizeStatus = (status: AppealStatus): AppealStatus =>
  status?.toString().toLowerCase() as AppealStatus;

const getStatusVariant = (
  status: AppealStatus,
): 'success' | 'warning' | 'danger' | 'info' => {
  switch (normalizeStatus(status)) {
    case 'approved':
      return 'success';
    case 'under_review':
      return 'warning';
    case 'rejected':
      return 'danger';
    case 'pending':
    default:
      return 'info';
  }
};

const formatDate = (appeal: Appeal): string => {
  if (appeal.timestamp?.toMillis) {
    return new Date(appeal.timestamp.toMillis()).toLocaleString();
  }
  if (appeal.submittedDate) {
    return new Date(appeal.submittedDate).toLocaleDateString();
  }
  return 'Unknown';
};

/* ---------------------------- PAGE -------------------------------- */

export default function AppealsPage() {
  const router = useRouter();
  const { appeals: realtimeAppeals, loading } = useRealtimeAppeals(100);

  const appeals: Appeal[] = Array.isArray(realtimeAppeals)
    ? realtimeAppeals
    : [];

  const displayAppeals =
    !loading && appeals.length > 0 ? appeals : mockAppeals;

  const pendingCount = displayAppeals.filter(
    (a) => normalizeStatus(a.status) === 'pending',
  ).length;

  const columns = [
    {
      key: 'id',
      label: 'Appeal ID',
      render: (appeal: Appeal) => (
        <button
          onClick={() =>
            router.push(`/admin/moderation/appeals/${appeal.id}`)
          }
          className="font-mono text-[#40E0D0] hover:text-[#D4AF37]"
        >
          {appeal.id}
        </button>
      ),
    },
    {
      key: 'userId',
      label: 'User',
      render: (appeal: Appeal) => (
        <button
          onClick={() =>
            router.push(`/admin/moderation/user/${appeal.userId}`)
          }
          className="text-gray-300 hover:text-[#40E0D0]"
        >
          {appeal.userId}
        </button>
      ),
    },
    {
      key: 'reason',
      label: 'Appeal Reason',
      render: (appeal: Appeal) => (
        <span className="text-gray-300">
          {appeal.reason ?? 'Appeal request'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (appeal: Appeal) => (
        <Badge variant={getStatusVariant(appeal.status)}>
          {normalizeStatus(appeal.status).replace('_', ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'submitted',
      label: 'Submitted',
      render: (appeal: Appeal) => (
        <span className="text-gray-400">{formatDate(appeal)}</span>
      ),
    },
    {
      key: 'incidentId',
      label: 'Related Incident',
      render: (appeal: Appeal) =>
        appeal.incidentId ? (
          <button
            onClick={() =>
              router.push(
                `/admin/moderation/incidents/${appeal.incidentId}`,
              )
            }
            className="font-mono text-yellow-400 hover:text-yellow-300"
          >
            {appeal.incidentId}
          </button>
        ) : (
          <span className="text-gray-500">N/A</span>
        ),
    },
  ];

  /* ---------------------------- UI -------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4" />
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
          <h1 className="text-4xl font-bold text-white mb-2">
            Appeals
          </h1>
          <p className="text-gray-400 text-lg">
            Review and process user appeal requests
          </p>
        </div>

        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#D4AF37]/30">
            <Flag className="w-5 h-5 text-[#D4AF37]" />
            <span className="text-white font-semibold">
              {pendingCount} Pending
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#40E0D0]/20">
            <span className="text-white font-semibold">
              {displayAppeals.length} Total
            </span>
            {appeals.length > 0 && (
              <span className="ml-2 text-xs text-green-400">
                ● LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={displayAppeals}
        emptyMessage="No appeals found"
      />


    </div>
  );
}


