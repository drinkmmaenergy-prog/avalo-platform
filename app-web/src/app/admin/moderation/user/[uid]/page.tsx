'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { 
  AlertTriangle, 
  Clock, 
  Shield, 
  Ban, 
  Unlock,
  Eye,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { UserInfoHeader } from '../../components/UserInfoHeader';
import { ActionButton } from '../../components/ActionButton';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Badge } from '../../components/Badge';
import { applyModerationAction, ModerationActionType } from '@/lib/moderation/actions';
import Link from 'next/link';

interface UserData {
  uid: string;
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  tier?: string;
  trustScore?: number;
  status?: string;
  joinedDate?: string;
  moderationHistory?: any[];
  violations?: any[];
}

interface ModalState {
  isOpen: boolean;
  action: ModerationActionType | null;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'primary' | 'destructive';
  duration?: number;
}

export default function UserModerationPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.uid as string;

  const [userData, setUserData] = useState<UserData | null>(null);
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
    loadUserData();
  }, [userId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const db = getFirestore();
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({
          uid: userId,
          username: data.username,
          email: data.email,
          displayName: data.displayName,
          avatar: data.avatar,
          tier: data.tier,
          trustScore: data.trustScore,
          status: data.status || 'ACTIVE',
          joinedDate: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          moderationHistory: data.moderationHistory || [],
          violations: data.violations || [],
        });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setToast({ message: 'Failed to load user data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (
    action: ModerationActionType,
    duration?: number
  ) => {
    const actionConfig = {
      WARN: {
        title: 'Warn User',
        description: 'This will issue a warning to the user. They will be notified and this will be recorded in their moderation history.',
        confirmLabel: 'Issue Warning',
        variant: 'primary' as const,
      },
      RESTRICT: {
        title: `Restrict User (${duration} days)`,
        description: `This will restrict the user's account for ${duration} days. They will have limited access to features.`,
        confirmLabel: 'Apply Restriction',
        variant: 'primary' as const,
      },
      SUSPEND: {
        title: `Suspend User (${duration} days)`,
        description: `This will suspend the user's account for ${duration} days. They will not be able to access the platform during this time.`,
        confirmLabel: 'Suspend Account',
        variant: 'destructive' as const,
      },
      SHADOWBAN: {
        title: 'Shadowban User',
        description: 'This will apply a hidden restriction. The user will appear to post normally but their content will be hidden from others.',
        confirmLabel: 'Apply Shadowban',
        variant: 'destructive' as const,
      },
      BAN_PERMANENT: {
        title: 'Permanent Ban',
        description: 'This will permanently ban the user. This action cannot be easily undone. Use with extreme caution.',
        confirmLabel: 'Permanent Ban',
        variant: 'destructive' as const,
      },
      UNLOCK: {
        title: 'Unlock User',
        description: 'This will remove all restrictions and restore the user account to active status.',
        confirmLabel: 'Unlock Account',
        variant: 'primary' as const,
      },
    };

    const config = actionConfig[action];
    setModalState({
      isOpen: true,
      action,
      duration,
      ...config,
    });
  };

  const handleConfirmAction = async () => {
    if (!modalState.action) return;

    try {
      setActionLoading(true);
      
      const result = await applyModerationAction({
        userId,
        action: modalState.action,
        duration: modalState.duration,
        reason: `Applied by moderator via dashboard`,
        moderatorNote: `Action: ${modalState.action}`,
      });

      if (result.success) {
        setToast({ message: result.message, type: 'success' });
        setModalState({ ...modalState, isOpen: false });
        
        // Reload user data to get updated status
        await loadUserData();
      } else {
        setToast({ message: result.message, type: 'error' });
      }
    } catch (error: any) {
      console.error('Error applying action:', error);
      setToast({ message: error.message || 'Failed to apply action', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">User Not Found</h2>
        <p className="text-gray-400 mb-6">The user you're looking for doesn't exist.</p>
        <Link href="/admin/moderation/users">
          <ActionButton variant="secondary">
            <ArrowLeft className="w-5 h-5" />
            Back to Users
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
        <Link href="/admin/moderation/users">
          <button className="p-2 rounded-lg bg-[#1A1A1A] border border-[#40E0D0]/30 hover:border-[#40E0D0] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#40E0D0]" />
          </button>
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-white">User Moderation</h1>
          <p className="text-gray-400 text-lg">Apply moderation actions to user account</p>
        </div>
      </div>

      {/* User Info Header */}
      <UserInfoHeader user={userData} />

      {/* Moderation Actions */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
        <h2 className="text-2xl font-bold text-white mb-6">Moderation Actions</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Warn */}
          <ActionButton
            variant="secondary"
            icon={AlertTriangle}
            onClick={() => handleActionClick('WARN')}
          >
            Warn User
          </ActionButton>

          {/* Restrict 7 days */}
          <ActionButton
            variant="secondary"
            icon={Shield}
            onClick={() => handleActionClick('RESTRICT', 7)}
          >
            Restrict 7 Days
          </ActionButton>

          {/* Suspend 7 days */}
          <ActionButton
            variant="destructive"
            icon={Clock}
            onClick={() => handleActionClick('SUSPEND', 7)}
          >
            Suspend 7 Days
          </ActionButton>

          {/* Suspend 30 days */}
          <ActionButton
            variant="destructive"
            icon={Clock}
            onClick={() => handleActionClick('SUSPEND', 30)}
          >
            Suspend 30 Days
          </ActionButton>

          {/* Shadowban */}
          <ActionButton
            variant="destructive"
            icon={Eye}
            onClick={() => handleActionClick('SHADOWBAN')}
          >
            Shadowban
          </ActionButton>

          {/* Permanent Ban */}
          <ActionButton
            variant="destructive"
            icon={Ban}
            onClick={() => handleActionClick('BAN_PERMANENT')}
          >
            Permanent Ban
          </ActionButton>

          {/* Unlock */}
          <ActionButton
            variant="primary"
            icon={Unlock}
            onClick={() => handleActionClick('UNLOCK')}
          >
            Unlock User
          </ActionButton>
        </div>

        {/* Action Descriptions */}
        <div className="mt-6 p-4 bg-[#0F0F0F] rounded-lg border border-[#40E0D0]/20">
          <h3 className="text-sm font-semibold text-[#40E0D0] mb-2">Action Descriptions:</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li><strong className="text-white">Warn:</strong> Issue a warning without restrictions</li>
            <li><strong className="text-white">Restrict:</strong> Limit content posting and features for set period</li>
            <li><strong className="text-white">Suspend:</strong> Temporarily suspend account access</li>
            <li><strong className="text-white">Shadowban:</strong> Hide user content from others (no expiry)</li>
            <li><strong className="text-white">Permanent Ban:</strong> Permanently ban the account</li>
            <li><strong className="text-white">Unlock:</strong> Remove all restrictions and restore account</li>
          </ul>
        </div>
      </div>

      {/* Moderation History */}
      {userData.moderationHistory && userData.moderationHistory.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Moderation History</h2>
          <div className="space-y-3">
            {userData.moderationHistory.slice(0, 5).map((entry: any, index: number) => (
              <div key={index} className="p-4 bg-[#0F0F0F] rounded-lg border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="neutral">{entry.action}</Badge>
                  <span className="text-xs text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                {entry.reason && (
                  <p className="text-sm text-gray-400">{entry.reason}</p>
                )}
              </div>
            ))}
          </div>
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