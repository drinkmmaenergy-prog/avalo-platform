'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

import {
  Flag,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  User,
  FileText,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

import { ActionButton } from '../../components/ActionButton';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Badge } from '../../components/Badge';
import {
  updateAppealStatus,
  applyModerationAction,
} from '@/lib/moderation/actions';

/* =======================
   TYPES
======================= */

interface AppealData {
  id: string;
  appealText: string;
  timestamp: string;
  status: string;
  userId?: string;
  username?: string;
  incidentId?: string;
  reason?: string;
  additionalInfo?: string;
  language?: string;
}

interface ModalState {
  isOpen: boolean;
  action: 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUIRED' | null;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'primary' | 'destructive';
}

type ToastState = {
  message: string;
  type: 'success' | 'error';
};

/* =======================
   PAGE
======================= */

export default function AppealReviewPage() {
  const params = useParams()!;
  const router = useRouter();
  const appealId = params.appealId as string;

  const [appealData, setAppealData] = useState<AppealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    action: null,
    title: '',
    description: '',
    confirmLabel: '',
    variant: 'primary',
  });

  /* =======================
     LOAD DATA
  ======================= */

  useEffect(() => {
    loadAppeal();
  }, [appealId]);

  const loadAppeal = async () => {
    try {
      setLoading(true);
      const db = getFirestore();
      const snap = await getDoc(doc(db, 'appeals', appealId));

      if (!snap.exists()) {
        setAppealData(null);
        return;
      }

      const d = snap.data();

      setAppealData({
        id: appealId,
        appealText: d.appealText || d.message || '',
        timestamp: d.timestamp?.toDate?.().toISOString() ?? new Date().toISOString(),
        status: d.status ?? 'pending',
        userId: d.userId,
        username: d.username,
        incidentId: d.incidentId,
        reason: d.reason,
        additionalInfo: d.additionalInfo,
        language: d.language,
      });
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to load appeal', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     ACTION HANDLING
  ======================= */

  const openModal = (action: ModalState['action']) => {
    const map = {
      APPROVED: {
        title: 'Approve Appeal',
        description: 'Approve appeal and unlock user account.',
        confirmLabel: 'Approve',
        variant: 'primary',
      },
      REJECTED: {
        title: 'Reject Appeal',
        description: 'Reject appeal and keep restrictions.',
        confirmLabel: 'Reject',
        variant: 'destructive',
      },
      MORE_INFO_REQUIRED: {
        title: 'Request More Info',
        description: 'Ask user for more details.',
        confirmLabel: 'Request Info',
        variant: 'primary',
      },
    } as const;

    if (!action) return;

    setModalState({
      isOpen: true,
      action,
      ...map[action],
    });
  };

  const confirmAction = async () => {
    if (!modalState.action) return;

    try {
      setActionLoading(true);

      const result = await updateAppealStatus({
        appealId,
        status: modalState.action,
      });

      if (!result.success) {
        setToast({ message: 'Failed to update appeal status', type: 'error' });
        return;
      }

      if (modalState.action === 'APPROVED' && appealData?.userId) {
        const unlock = await applyModerationAction({
          targetId: appealData.userId,
          targetType: 'USER',
          action: 'UNLOCK',
          reason: `Appeal ${appealId} approved`,
        });

        if (!unlock.success) {
          setToast({
            message: 'Appeal approved but user unlock failed',
            type: 'error',
          });
          return;
        }
      }

      setToast({ message: 'Action completed successfully', type: 'success' });
      setModalState((s) => ({ ...s, isOpen: false }));
      await loadAppeal();
    } catch (e) {
      console.error(e);
      setToast({ message: 'Unexpected error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  /* =======================
     HELPERS
  ======================= */

  const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (s.toLowerCase()) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'pending':
      case 'more_info_required':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  /* =======================
     RENDER
  ======================= */

  if (loading) {
    return <div className="p-10 text-gray-400">Loading appeal…</div>;
  }

  if (!appealData) {
    return <div className="p-10 text-red-400">Appeal not found</div>;
  }

  return (
    <div className="space-y-6">

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-black border px-4 py-2">
          {toast.message}
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link href="/admin/moderation/appeals">
          <ArrowLeft />
        </Link>
        <h1 className="text-3xl font-bold text-white">Appeal Review</h1>
      </div>

      <div className="border p-6">
        <h2 className="text-xl font-bold text-white mb-2">
          Appeal #{appealData.id}
        </h2>

        <Badge variant={statusVariant(appealData.status)}>
          {appealData.status.toUpperCase()}
        </Badge>

        <p className="mt-4 text-white">{appealData.appealText}</p>
      </div>

      {appealData.status === 'pending' && (
        <div className="grid grid-cols-3 gap-4">
          <ActionButton icon={CheckCircle} onClick={() => openModal('APPROVED')}>
            Approve
          </ActionButton>
          <ActionButton icon={XCircle} variant="destructive" onClick={() => openModal('REJECTED')}>
            Reject
          </ActionButton>
          <ActionButton icon={AlertCircle} onClick={() => openModal('MORE_INFO_REQUIRED')}>
            More Info
          </ActionButton>
        </div>
      )}

      <ConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        confirmLabel={modalState.confirmLabel}
        variant={modalState.variant}
        loading={actionLoading}
        onClose={() => setModalState((s) => ({ ...s, isOpen: false }))}
        onConfirm={confirmAction}
      />
    </div>
  );
}

