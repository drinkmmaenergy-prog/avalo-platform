/**
 * PACK 419 — Web Enforcement Detail & Appeal Page
 * 
 * Web version with parity to mobile app
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  EnforcementDecision,
  EnforcementAppeal,
  EnforcementScope,
  EnforcementActionType,
  AppealStatus,
} from '../../../../shared/types/pack419-enforcement.types';

export default function EnforcementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const enforcementId = params?.id as string;

  const [enforcement, setEnforcement] = useState<EnforcementDecision | null>(null);
  const [existingAppeal, setExistingAppeal] = useState<EnforcementAppeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEnforcementData();
    if (searchParams?.get('appeal') === 'true') {
      setShowAppealForm(true);
    }
  }, [enforcementId]);

  const loadEnforcementData = async () => {
    if (!enforcementId || !auth.currentUser) return;

    try {
      const enforcementDoc = await getDoc(doc(db, 'enforcementDecisions', enforcementId));

      if (!enforcementDoc.exists()) {
        alert('Enforcement decision not found');
        router.push('/enforcement');
        return;
      }

      const enforcementData = { id: enforcementDoc.id, ...enforcementDoc.data() } as EnforcementDecision;

      if (enforcementData.userId !== auth.currentUser.uid) {
        alert('Access denied');
        router.push('/enforcement');
        return;
      }

      setEnforcement(enforcementData);

      if (enforcementData.appealId) {
        const appealDoc = await getDoc(doc(db, 'enforcementAppeals', enforcementData.appealId));
        if (appealDoc.exists()) {
          setExistingAppeal({ id: appealDoc.id, ...appealDoc.data() } as EnforcementAppeal);
        }
      }
    } catch (error) {
      console.error('Failed to load enforcement:', error);
      alert('Failed to load enforcement details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enforcement || !auth.currentUser || appealMessage.trim().length < 10) return;

    try {
      setSubmitting(true);

      const appealData = {
        userId: auth.currentUser.uid,
        enforcementId: enforcement.id,
        status: AppealStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userMessage: appealMessage.trim(),
      };

      const appealRef = await addDoc(collection(db, 'enforcementAppeals'), appealData);

      await updateDoc(doc(db, 'enforcementDecisions', enforcement.id), {
        appealId: appealRef.id,
        updatedAt: Date.now(),
      });

      alert('Appeal submitted successfully. Our team will review it within 24-48 hours.');
      loadEnforcementData();
      setShowAppealForm(false);
      setAppealMessage('');
    } catch (error) {
      console.error('Failed to submit appeal:', error);
      alert('Failed to submit appeal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getActionBadge = (action: EnforcementActionType) => {
    const badges = {
      [EnforcementActionType.WARNING]: { label: 'Warning', className: 'bg-yellow-500' },
      [EnforcementActionType.TEMP_RESTRICTION]: { label: 'Temporary Restriction', className: 'bg-orange-500' },
      [EnforcementActionType.PERMA_BAN]: { label: 'Permanent Ban', className: 'bg-red-600' },
      [EnforcementActionType.SHADOW_RESTRICTION]: { label: 'Shadow Restriction', className: 'bg-gray-600' },
    };
    return badges[action];
  };

  const getReasonDescription = (reasonCode: string): string => {
    const descriptions: Record<string, string> = {
      HARASSMENT: 'Harassment or bullying behavior',
      SPAM: 'Spam or excessive unwanted contact',
      SCAM: 'Fraudulent or scam activity',
      FAKE_ID: 'Identity verification violation',
      HATE_SPEECH: 'Hate speech or discrimination',
      NSFW_VIOLATION: 'Adult content policy violation',
      TOS_VIOLATION: 'Terms of service violation',
      SUSPICIOUS_ACTIVITY: 'Suspicious behavior detected',
      PAYMENT_FRAUD: 'Payment or transaction fraud',
      ACCOUNT_ABUSE: 'Multiple accounts or ban evasion',
      IMPERSONATION: 'Impersonating another user',
      CHARGEBACK_ABUSE: 'Excessive payment chargebacks',
    };
    return descriptions[reasonCode] || 'Policy violation';
  };

  const getScopeDescriptions = (scopes: EnforcementScope[]): string[] => {
    const descriptions: Record<EnforcementScope, string> = {
      [EnforcementScope.CHAT]: 'Chat and messaging',
      [EnforcementScope.CALLS]: 'Voice and video calls',
      [EnforcementScope.MEETINGS]: 'Meeting bookings',
      [EnforcementScope.EVENTS]: 'Event participation',
      [EnforcementScope.FEED]: 'Feed posting',
      [EnforcementScope.DISCOVERY]: 'User discovery',
      [EnforcementScope.SWIPE]: 'Swipe features',
      [EnforcementScope.AI_COMPANIONS]: 'AI companions',
      [EnforcementScope.MONETIZATION]: 'Earning and monetization',
      [EnforcementScope.ACCOUNT_FULL]: 'Full account access',
    };
    return scopes.map(scope => descriptions[scope] || scope);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading details...</p>
        </div>
      </div>
    );
  }

  if (!enforcement) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-red-600 text-lg">Enforcement not found</p>
      </div>
    );
  }

  const actionBadge = getActionBadge(enforcement.action);
  const isActive = enforcement.isActive && (!enforcement.expiresAt || enforcement.expiresAt > Date.now());

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className={`${actionBadge.className} text-white px-4 py-2 rounded-lg text-sm font-semibold`}>
              {actionBadge.label}
            </span>
            {isActive && (
              <span className="bg-green-500 text-white px-3 py-1.5 rounded-md text-sm font-semibold">
                Active
              </span>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Reason</h2>
          <p className="text-gray-700">{getReasonDescription(enforcement.reasonCode)}</p>
        </div>

        {/* Affected Features */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Affected Features</h2>
          <ul className="space-y-2">
            {getScopeDescriptions(enforcement.scopes).map((scope, index) => (
              <li key={index} className="flex items-start">
                <span className="text-gray-600 mr-2">•</span>
                <span className="text-gray-700">{scope}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Timeline</h2>
          <div className="space-y-2">
            <div className="flex">
              <span className="font-semibold text-gray-600 w-24">Issued:</span>
              <span className="text-gray-900">{new Date(enforcement.createdAt).toLocaleString()}</span>
            </div>
            {enforcement.expiresAt && (
              <div className="flex">
                <span className="font-semibold text-gray-600 w-24">
                  {isActive ? 'Expires:' : 'Expired:'}
                </span>
                <span className="text-gray-900">{new Date(enforcement.expiresAt).toLocaleString()}</span>
              </div>
            )}
            {!enforcement.expiresAt && (
              <div className="flex">
                <span className="font-semibold text-gray-600 w-24">Duration:</span>
                <span className="text-red-600 font-semibold">Permanent</span>
              </div>
            )}
          </div>
        </div>

        {/* Existing Appeal */}
        {existingAppeal && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Appeal Status</h2>
            <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
              <div className="mb-2">
                <span className={`px-3 py-1 rounded-md text-white text-sm font-semibold ${
                  existingAppeal.status === AppealStatus.PENDING ? 'bg-yellow-500' :
                  existingAppeal.status === AppealStatus.APPROVED ? 'bg-green-500' :
                  existingAppeal.status === AppealStatus.REJECTED ? 'bg-red-500' :
                  'bg-blue-500'
                }`}>
                  {existingAppeal.status === AppealStatus.PENDING && 'Pending Review'}
                  {existingAppeal.status === AppealStatus.APPROVED && 'Approved'}
                  {existingAppeal.status === AppealStatus.REJECTED && 'Rejected'}
                  {existingAppeal.status === AppealStatus.ESCALATED && 'Escalated'}
                </span>
              </div>
              <p className="text-gray-700 my-3">{existingAppeal.userMessage}</p>
              <p className="text-sm text-gray-600">
                Submitted: {new Date(existingAppeal.createdAt).toLocaleDateString()}
              </p>
              {existingAppeal.outcome?.publicExplanation && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <p className="font-semibold text-gray-900 mb-2">Response:</p>
                  <p className="text-gray-700">{existingAppeal.outcome.publicExplanation}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Appeal Form */}
        {isActive && enforcement.isAppealable && !existingAppeal && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            {!showAppealForm ? (
              <button
                onClick={() => setShowAppealForm(true)}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Submit Appeal
              </button>
            ) : (
              <form onSubmit={handleSubmitAppeal}>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Submit Appeal</h2>
                <p className="text-gray-600 mb-4">
                  Help us understand why this restriction should be reviewed
                </p>
                <textarea
                  value={appealMessage}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  placeholder="Explain your situation..."
                  className="w-full border border-gray-300 rounded-lg p-4 mb-2 min-h-[160px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={2000}
                  disabled={submitting}
                />
                <p className={`text-sm mb-4 ${appealMessage.length < 10 ? 'text-red-600' : 'text-gray-600'}`}>
                  {appealMessage.length} / 2000 characters {appealMessage.length < 10 && '(minimum 10)'}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAppealForm(false);
                      setAppealMessage('');
                    }}
                    className="flex-1 py-3 px-6 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                    disabled={appealMessage.trim().length < 10 || submitting}
                  >
                    {submitting ? 'Submitting...' : 'Submit Appeal'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Help */}
        <div className="bg-blue-50 rounded-lg p-6 border-l-4 border-blue-500">
          <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-blue-800 text-sm">
            If you believe this restriction was issued in error or would like more information,
            you can {enforcement.isAppealable && !existingAppeal ? 'submit an appeal above or ' : ''}
            contact our support team.
          </p>
        </div>
      </div>
    </div>
  );
}
