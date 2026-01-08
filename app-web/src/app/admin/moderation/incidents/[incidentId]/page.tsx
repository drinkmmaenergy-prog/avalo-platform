'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { 
  AlertTriangle, 
  Clock, 
  Shield, 
  Ban, 
  Eye,
  AlertCircle,
  ArrowLeft,
  User,
  FileText,
  ExternalLink
} from 'lucide-react';
import { ActionButton } from '../../components/ActionButton';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Badge } from '../../components/Badge';
import { applyModerationAction, ModerationActionType } from '@/lib/moderation/actions';
import Link from 'next/link';

interface IncidentData {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  snippet?: string;
  timestamp: string;
  contentId?: string;
  userId?: string;
  username?: string;
  status?: string;
  reportedBy?: string;
  description?: string;
  contentType?: string;
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

export default function IncidentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.incidentId as string;

  const [incidentData, setIncidentData] = useState<IncidentData | null>(null);
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
    loadIncidentData();
  }, [incidentId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadIncidentData = async () => {
    try {
      setLoading(true);
      const db = getFirestore();
      const incidentDoc = await getDoc(doc(db, 'contentIncidents', incidentId));
      
      if (incidentDoc.exists()) {
        const data = incidentDoc.data();
        setIncidentData({
          id: incidentId,
          category: data.category || 'Unknown',
          severity: data.severity || 'medium',
          snippet: data.snippet,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
          contentId: data.contentId,
          userId: data.userId,
          username: data.username,
          status: data.status || 'pending',
          reportedBy: data.reportedBy,
          description: data.description,
          contentType: data.contentType,
        });
      }
    } catch (error) {
      console.error('Error loading incident data:', error);
      setToast({ message: 'Failed to load incident data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickModerate = (
    action: ModerationActionType,
    duration?: number
  ) => {
    if (!incidentData?.userId) {
      setToast({ message: 'No user associated with this incident', type: 'error' });
      return;
    }

    const actionConfig = {
      WARN: {
        title: 'Warn User',
        description: `Issue a warning to ${incidentData.username || 'this user'} for this incident.`,
        confirmLabel: 'Issue Warning',
        variant: 'primary' as const,
      },
      RESTRICT: {
        title: `Restrict User (${duration} days)`,
        description: `Restrict ${incidentData.username || 'this user'} for ${duration} days due to this incident.`,
        confirmLabel: 'Apply Restriction',
        variant: 'primary' as const,
      },
      SUSPEND: {
        title: `Suspend User (${duration} days)`,
        description: `Suspend ${incidentData.username || 'this user'} for ${duration} days due to this incident.`,
        confirmLabel: 'Suspend Account',
        variant: 'destructive' as const,
      },
      SHADOWBAN: {
        title: 'Shadowban User',
        description: `Apply shadowban to ${incidentData.username || 'this user'} due to this incident.`,
        confirmLabel: 'Apply Shadowban',
        variant: 'destructive' as const,
      },
      BAN_PERMANENT: {
        title: 'Permanent Ban',
        description: `Permanently ban ${incidentData.username || 'this user'} due to this incident.`,
        confirmLabel: 'Permanent Ban',
        variant: 'destructive' as const,
      },
    };

    const config = actionConfig[action as keyof typeof actionConfig];
    setModalState({
      isOpen: true,
      action,
      duration,
      ...config,
    });
  };

  const handleConfirmAction = async () => {
    if (!modalState.action || !incidentData?.userId) return;

    try {
      setActionLoading(true);
      
      const result = await applyModerationAction({
        userId: incidentData.userId,
        action: modalState.action,
        duration: modalState.duration,
        reason: `Incident: ${incidentData.category} - ${incidentId}`,
        moderatorNote: `Quick moderation from incident ${incidentId}`,
      });

      if (result.success) {
        setToast({ message: result.message, type: 'success' });
        setModalState({ ...modalState, isOpen: false });
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

  const getSeverityVariant = (severity: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (severity.toLowerCase()) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
      case 'critical':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'low':
        return 'bg-green-900/20 border-green-500';
      case 'medium':
        return 'bg-yellow-900/20 border-yellow-500';
      case 'high':
        return 'bg-orange-900/20 border-orange-500';
      case 'critical':
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
          <p className="text-gray-400">Loading incident details...</p>
        </div>
      </div>
    );
  }

  if (!incidentData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Incident Not Found</h2>
        <p className="text-gray-400 mb-6">The incident you're looking for doesn't exist.</p>
        <Link href="/admin/moderation/incidents">
          <ActionButton variant="secondary">
            <ArrowLeft className="w-5 h-5" />
            Back to Incidents
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
        <Link href="/admin/moderation/incidents">
          <button className="p-2 rounded-lg bg-[#1A1A1A] border border-[#40E0D0]/30 hover:border-[#40E0D0] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#40E0D0]" />
          </button>
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-white">Incident Details</h1>
          <p className="text-gray-400 text-lg">Review and take action on reported content</p>
        </div>
      </div>

      {/* Incident Info Card */}
      <div className={`rounded-xl border-2 p-6 ${getSeverityColor(incidentData.severity)}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-16 h-16 rounded-full bg-[#0F0F0F] flex items-center justify-center border-2 border-current">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-2xl font-bold text-white">{incidentData.category}</h2>
              <Badge variant={getSeverityVariant(incidentData.severity)}>
                {incidentData.severity.toUpperCase()}
              </Badge>
              {incidentData.status && (
                <Badge variant="neutral">{incidentData.status.toUpperCase()}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#40E0D0]" />
                <span className="text-gray-400">Incident ID:</span>
                <span className="text-white font-mono">{incidentData.id.substring(0, 12)}...</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#40E0D0]" />
                <span className="text-gray-400">Reported:</span>
                <span className="text-white">{new Date(incidentData.timestamp).toLocaleString()}</span>
              </div>

              {incidentData.contentType && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#40E0D0]" />
                  <span className="text-gray-400">Content Type:</span>
                  <span className="text-white">{incidentData.contentType}</span>
                </div>
              )}

              {incidentData.reportedBy && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#40E0D0]" />
                  <span className="text-gray-400">Reported By:</span>
                  <span className="text-white">{incidentData.reportedBy}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {incidentData.description && (
          <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg">
            <h3 className="text-sm font-semibold text-[#40E0D0] mb-2">Description:</h3>
            <p className="text-white">{incidentData.description}</p>
          </div>
        )}

        {/* Content Snippet */}
        {incidentData.snippet && (
          <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg border border-gray-800">
            <h3 className="text-sm font-semibold text-[#40E0D0] mb-2">Content Snippet:</h3>
            <p className="text-gray-300 italic">{incidentData.snippet}</p>
          </div>
        )}
      </div>

      {/* User Information */}
      {incidentData.userId && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Associated User</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="w-10 h-10 text-[#40E0D0]" />
              <div>
                <p className="text-white font-semibold">{incidentData.username || 'Unknown User'}</p>
                <p className="text-sm text-gray-400 font-mono">{incidentData.userId}</p>
              </div>
            </div>
            <Link href={`/admin/moderation/user/${incidentData.userId}`}>
              <ActionButton variant="secondary">
                View User Profile
                <ExternalLink className="w-4 h-4" />
              </ActionButton>
            </Link>
          </div>
        </div>
      )}

      {/* Quick Moderation Actions */}
      {incidentData.userId && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Quick Moderation Actions</h3>
          <p className="text-sm text-gray-400 mb-6">
            Take immediate action against the user associated with this incident
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ActionButton
              variant="secondary"
              icon={AlertTriangle}
              onClick={() => handleQuickModerate('WARN')}
            >
              Warn
            </ActionButton>

            <ActionButton
              variant="secondary"
              icon={Shield}
              onClick={() => handleQuickModerate('RESTRICT', 7)}
            >
              Restrict 7d
            </ActionButton>

            <ActionButton
              variant="destructive"
              icon={Clock}
              onClick={() => handleQuickModerate('SUSPEND', 7)}
            >
              Suspend 7d
            </ActionButton>

            <ActionButton
              variant="destructive"
              icon={Eye}
              onClick={() => handleQuickModerate('SHADOWBAN')}
            >
              Shadowban
            </ActionButton>

            <ActionButton
              variant="destructive"
              icon={Ban}
              onClick={() => handleQuickModerate('BAN_PERMANENT')}
            >
              Ban Permanently
            </ActionButton>
          </div>
        </div>
      )}

      {/* Content ID Link */}
      {incidentData.contentId && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Related Content</h3>
          <div className="flex items-center gap-3">
            <FileText className="w-10 h-10 text-[#40E0D0]" />
            <div>
              <p className="text-white font-semibold">Content ID</p>
              <p className="text-sm text-gray-400 font-mono">{incidentData.contentId}</p>
            </div>
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