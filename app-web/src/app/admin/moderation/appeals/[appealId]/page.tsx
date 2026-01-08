'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  MessageSquare
} from 'lucide-react';
import { ActionButton } from '../../components/ActionButton';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Badge } from '../../components/Badge';
import { updateAppealStatus, applyModerationAction } from '@/lib/moderation/actions';
import Link from 'next/link';

interface AppealData {
  id: string;
  appealText: string;
  language?: string;
  timestamp: string;
  status: string;
  userId?: string;
  username?: string;
  incidentId?: string;
  reason?: string;
  additionalInfo?: string;
}

interface ModalState {
  isOpen: boolean;
  action: 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUIRED' | null;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'primary' | 'destructive';
}

export default function AppealReviewPage() {
  const params = useParams();
  const router = useRouter();
  const appealId = params.appealId as string;

  const [appealData, setAppealData] = useState<AppealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    action: null,
    title: '',
    description: '',
    confirmLabel: '',
    variant: 'primary',
  });

  useEffect(() => {
    loadAppealData();
  }, [appealId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadAppealData = async () => {
    try {
      setLoading(true);
      const db = getFirestore();
      const appealDoc = await getDoc(doc(db, 'appeals', appealId));
      
      if (appealDoc.exists()) {
        const data = appealDoc.data();
        setAppealData({
          id: appealId,
          appealText: data.appealText || data.message || '',
          language: data.language,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
          status: data.status || 'pending',
          userId: data.userId,
          username: data.username,
          incidentId: data.incidentId,
          reason: data.reason,
          additionalInfo: data.additionalInfo,
        });
      }
    } catch (error) {
      console.error('Error loading appeal data:', error);
      setToast({ message: 'Failed to load appeal data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action: 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUIRED') => {
    const actionConfig = {
      APPROVED: {
        title: 'Approve Appeal',
        description: 'This will approve the appeal and unlock the user account. All restrictions will be removed.',
        confirmLabel: 'Approve Appeal',
        variant: 'primary' as const,
      },
      REJECTED: {
        title: 'Reject Appeal',
        description: 'This will reject the appeal. The user will be notified and restrictions will remain in place.',
        confirmLabel: 'Reject Appeal',
        variant: 'destructive' as const,
      },
      MORE_INFO_REQUIRED: {
        title: 'Request More Information',
        description: 'This will notify the user that more information is needed before a decision can be made.',
        confirmLabel: 'Request Info',
        variant: 'primary' as const,
      },
    };

    const config = actionConfig[action];
    setModalState({
      isOpen: true,
      action,
      ...config,
    });
  };

  const handleConfirmAction = async () => {
    if (!modalState.action) return;

    try {
      setActionLoading(true);
      
      // Update appeal status
      const result = await updateAppealStatus({
        appealId,
        status: modalState.action,
        moderatorNote: `Action taken via dashboard: ${modalState.action}`,
      });

      if (result.success) {
        // If approved, also unlock the user
        if (modalState.action === 'APPROVED' && appealData?.userId) {
          const unlockResult = await applyModerationAction({
            userId: appealData.userId,
            action: 'UNLOCK',
            reason: `Appeal ${appealId} approved`,
            moderatorNote: 'User unlocked after successful appeal',
          });

          if (!unlockResult.success) {
            setToast({ 
              message: 'Appeal approved but failed to unlock user. Please unlock manually.', 
              type: 'error' 
            });
            setModalState({ ...modalState, isOpen: false });
            await loadAppealData();
            return;
          }
        }

        setToast({ message: result.message, type: 'success' });
        setModalState({ ...modalState, isOpen: false });
        
        // Reload appeal data to get updated status
        await loadAppealData();
      } else {
        setToast({ message: result.message, type: 'error' });
      }
    } catch (error: any) {
      console.error('Error processing appeal:', error);
      setToast({ message: error.message || 'Failed to process appeal', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'success';
      case 'pending':
      case 'more_info_required':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'bg-green-900/20 border-green-500';
      case 'pending':
        return 'bg-yellow-900/20 border-yellow-500';
      case 'more_info_required':
        return 'bg-orange-900/20 border-orange-500';
      case 'rejected':
        return 'bg-red-900/20 border-red-500';
      default:
        return 'bg-gray-900/20 border-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading appeal details...</p>
        </div>
      </div>
    );
  }

  if (!appealData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Appeal Not Found</h2>
        <p className="text-gray-400 mb-6">The appeal you're looking for doesn't exist.</p>
        <Link href="/admin/moderation/appeals">
          <ActionButton variant="secondary">
            <ArrowLeft className="w-5 h-5" />
            Back to Appeals
          </ActionButton>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg border-2 ${
            toast.type === 'success'
              ? 'bg-green-900/90 border-green-500 text-green-100'
              : 'bg-red-900/90 border-red-500 text-red-100'
          } backdrop-blur-sm`}
        >
          {toast.message}
        </div>
      )}

      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Link href="/admin/moderation/appeals">
          <button className="p-2 rounded-lg bg-[#1A1A1A] border border-[#40E0D0]/30 hover:border-[#40E0D0] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#40E0D0]" />
          </button>
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-white">Appeal Review</h1>
          <p className="text-gray-400 text-lg">Review and decide on user appeal</p>
        </div>
      </div>

      {/* Appeal Info Card */}
      <div className={`rounded-xl border-2 p-6 ${getStatusColor(appealData.status)}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-16 h-16 rounded-full bg-[#0F0F0F] flex items-center justify-center border-2 border-current">
            <Flag className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-2xl font-bold text-white">Appeal #{appealData.id.substring(0, 8)}</h2>
              <Badge variant={getStatusVariant(appealData.status)}>
                {appealData.status.replace(/_/g, ' ').toUpperCase()}
              </Badge>
              {appealData.language && (
                <Badge variant="neutral">{appealData.language.toUpperCase()}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#40E0D0]" />
                <span className="text-gray-400">Submitted:</span>
                <span className="text-white">{new Date(appealData.timestamp).toLocaleString()}</span>
              </div>
              
              {appealData.incidentId && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#40E0D0]" />
                  <span className="text-gray-400">Incident ID:</span>
                  <span className="text-white font-mono">{appealData.incidentId.substring(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appeal Text */}
        <div className="mt-6 p-5 bg-[#0F0F0F] rounded-lg border-l-4 border-[#40E0D0]">
          <div className="flex items-start gap-3 mb-3">
            <MessageSquare className="w-5 h-5 text-[#40E0D0] flex-shrink-0 mt-1" />
            <h3 className="text-lg font-semibold text-[#40E0D0]">Appeal Message</h3>
          </div>
          <p className="text-white leading-relaxed">{appealData.appealText}</p>
        </div>

        {/* Additional Info */}
        {appealData.additionalInfo && (
          <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg">
            <h3 className="text-sm font-semibold text-[#40E0D0] mb-2">Additional Information:</h3>
            <p className="text-gray-300">{appealData.additionalInfo}</p>
          </div>
        )}

        {/* Reason */}
        {appealData.reason && (
          <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg">
            <h3 className="text-sm font-semibold text-[#40E0D0] mb-2">Reason for Appeal:</h3>
            <p className="text-gray-300">{appealData.reason}</p>
          </div>
        )}
      </div>

      {/* User Information */}
      {appealData.userId && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Associated User</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="w-10 h-10 text-[#40E0D0]" />
              <div>
                <p className="text-white font-semibold">{appealData.username || 'Unknown User'}</p>
                <p className="text-sm text-gray-400 font-mono">{appealData.userId}</p>
              </div>
            </div>
            <Link href={`/admin/moderation/user/${appealData.userId}`}>
              <ActionButton variant="secondary">
                View User Profile
                <ExternalLink className="w-4 h-4" />
              </ActionButton>
            </Link>
          </div>
        </div>
      )}

      {/* Related Incident */}
      {appealData.incidentId && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Related Incident</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-10 h-10 text-[#40E0D0]" />
              <div>
                <p className="text-white font-semibold">Incident Report</p>
                <p className="text-sm text-gray-400 font-mono">{appealData.incidentId}</p>
              </div>
            </div>
            <Link href={`/admin/moderation/incidents/${appealData.incidentId}`}>
              <ActionButton variant="secondary">
                View Incident
                <ExternalLink className="w-4 h-4" />
              </ActionButton>
            </Link>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {appealData.status.toLowerCase() === 'pending' && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Review Actions</h3>
          <p className="text-sm text-gray-400 mb-6">
            Choose an action to take on this appeal
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionButton
              variant="primary"
              icon={CheckCircle}
              onClick={() => handleActionClick('APPROVED')}
            >
              Accept
            </ActionButton>

            <ActionButton
              variant="destructive"
              icon={XCircle}
              onClick={() => handleActionClick('REJECTED')}
            >
              Reject
            </ActionButton>

            <ActionButton
              variant="secondary"
              icon={AlertCircle}
              onClick={() => handleActionClick('MORE_INFO_REQUIRED')}
            >
              Need More Info
            </ActionButton>
          </div>

          <div className="mt-6 p-4 bg-[#0F0F0F] rounded-lg border border-[#40E0D0]/20">
            <h4 className="text-sm font-semibold text-[#40E0D0] mb-2">Action Descriptions:</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li><strong className="text-white">Accept:</strong> Approve the appeal and unlock the user (if APPROVED → calls UNLOCK)</li>
              <li><strong className="text-white">Reject:</strong> Deny the appeal and maintain current restrictions</li>
              <li><strong className="text-white">Need More Info:</strong> Request additional information from the user</li>
            </ul>
          </div>
        </div>
      )}

      {appealData.status.toLowerCase() !== 'pending' && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6 text-center">
          <p className="text-gray-400">
            This appeal has already been processed with status: <Badge variant={getStatusVariant(appealData.status)}>
              {appealData.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </p>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={modalState.title}
        description={modalState.description}
        confirmLabel={modalState.confirmLabel}
        variant={modalState.variant}
        loading={actionLoading}
      />
    </div>
  );
}