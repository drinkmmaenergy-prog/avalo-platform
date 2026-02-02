/**
 * Creator Agreement Gate Component - Web
 * PHASE 4.2 — B2B Creator Agreement Implementation
 *
 * Shows a modal/overlay requiring creators to accept the B2B Creator Agreement
 * before accessing any monetization features on Web.
 *
 * Usage:
 * <CreatorAgreementGate>
 *   <CreatorDashboard />
 * </CreatorAgreementGate>
 *
 * @version v1.0
 */

'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// Placeholder for auth hook - wire to your actual auth context
// import { useAuth } from '@/contexts/AuthContext';

interface CreatorAgreementGateProps {
  children: ReactNode;
  onAccepted?: () => void;
  onDismiss?: () => void;
}

export default function CreatorAgreementGate({
  children,
  onAccepted,
  onDismiss,
}: CreatorAgreementGateProps) {
  const router = useRouter();
  // const { user } = useAuth(); // Uncomment when auth is wired

  const [loading, setLoading] = useState(true);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check agreement status on mount
    checkAgreementStatus();
  }, []);

  const checkAgreementStatus = async () => {
    try {
      // TODO: Wire to Firebase callable function
      // const getStatus = httpsCallable(functions, 'getCreatorAgreementStatusV1');
      // const result = await getStatus();
      
      // For now, simulate check
      // In production, this should call the backend
      const accepted = false; // Default to not accepted for demo
      
      if (accepted) {
        setAgreementAccepted(true);
        setShowModal(false);
      } else {
        setShowModal(true);
      }
    } catch (error) {
      console.error('Failed to check creator agreement status:', error);
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptAgreement = async () => {
    setAccepting(true);

    try {
      // TODO: Wire to Firebase callable function
      // const acceptAgreement = httpsCallable(functions, 'acceptCreatorAgreementV1');
      // const result = await acceptAgreement({ surface: 'web' });

      // Simulate success for demo
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAgreementAccepted(true);
      setShowModal(false);
      onAccepted?.();
    } catch (error) {
      console.error('Failed to accept creator agreement:', error);
      alert('Failed to accept agreement. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleDismiss = () => {
    setShowModal(false);
    onDismiss?.();
    router.push('/');
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking agreement status...</p>
        </div>
      </div>
    );
  }

  // If accepted, render children
  if (agreementAccepted) {
    return <>{children}</>;
  }

  // Modal for non-accepted users
  return (
    <>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="text-7xl mb-4">📋</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Creator Agreement Required
                </h2>
                <p className="text-gray-600">
                  To access creator monetization features, you must accept our Creator Agreement (B2B).
                </p>
              </div>

              {/* Key Points */}
              <div className="bg-gray-100 rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-gray-800 mb-4">Key Points:</h3>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🤝</span>
                    <span className="text-gray-700 text-sm">
                      You act as an independent B2B contractor
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-xl">📊</span>
                    <span className="text-gray-700 text-sm">
                      You are responsible for taxes and VAT
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-xl">✅</span>
                    <span className="text-gray-700 text-sm">
                      You ensure legal compliance of content
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-xl">💰</span>
                    <span className="text-gray-700 text-sm">
                      Payments via platform treasury system
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <a
                  href="/legal/creator-agreement"
                  className="block w-full py-3 px-4 bg-gray-200 text-gray-700 rounded-lg font-medium text-center hover:bg-gray-300 transition"
                >
                  Read Full Agreement
                </a>

                <button
                  onClick={handleAcceptAgreement}
                  disabled={accepting}
                  className={`w-full py-4 px-4 rounded-lg font-bold text-white transition ${
                    accepting
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30'
                  }`}
                >
                  {accepting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Processing...
                    </span>
                  ) : (
                    'Accept & Continue'
                  )}
                </button>

                <button
                  onClick={handleDismiss}
                  className="w-full py-3 text-gray-500 hover:text-gray-700 transition"
                >
                  Cancel
                </button>
              </div>

              {/* Footer Note */}
              <p className="mt-6 text-xs text-gray-400 text-center">
                By accepting, you confirm you are an independent B2B contractor and understand your responsibilities.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Blocked content behind modal */}
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Creator Agreement Required
          </h2>
          <p className="text-gray-500">
            Please accept the Creator Agreement to continue.
          </p>
        </div>
      </div>
    </>
  );
}
