/**
 * PACK 338a - Legal Acceptance Gate (Web)
 * Blocks app access until user accepts all legal documents
 */

'use client';

import React, { useState, useEffect } from 'react';
import { LEGAL_DOCS, getAllLegalDocKeys } from '../../../../shared/legal/legalRegistry';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';

interface LegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  guidelinesVersion: string;
  refundsVersion: string;
  ageVerificationVersion: string;
  acceptedAt: Date;
  lang: 'en' | 'pl';
  platform: 'mobile' | 'web';
}

interface LegalGateProps {
  onAccepted?: () => void;
}

export default function LegalGate({ onAccepted }: LegalGateProps) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [lang] = useState<'en' | 'pl'>('en'); // TODO: detect from browser locale

  const [checkboxes, setCheckboxes] = useState({
    terms: false,
    privacy: false,
    guidelines: false,
    refunds: false,
    ageVerification: false,
  });

  useEffect(() => {
    if (user) {
      checkAcceptance();
    }
  }, [user]);

  const checkAcceptance = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const acceptanceRef = doc(db, 'userLegalAcceptances', user.uid);
      const acceptanceSnap = await getDoc(acceptanceRef);

      if (!acceptanceSnap.exists()) {
        setVisible(true);
        return;
      }

      const acceptance = acceptanceSnap.data() as LegalAcceptance;
      const needsUpdate =
        acceptance.termsVersion !== LEGAL_DOCS.terms[lang].version ||
        acceptance.privacyVersion !== LEGAL_DOCS.privacy[lang].version ||
        acceptance.guidelinesVersion !== LEGAL_DOCS.guidelines[lang].version ||
        acceptance.refundsVersion !== LEGAL_DOCS.refunds[lang].version ||
        acceptance.ageVerificationVersion !== LEGAL_DOCS.ageVerification[lang].version;

      if (needsUpdate) {
        setVisible(true);
      } else {
        setVisible(false);
        onAccepted?.();
      }
    } catch (error) {
      console.error('Error checking legal acceptance:', error);
      setVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckbox = (key: keyof typeof checkboxes) => {
    setCheckboxes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checkboxes).every((v) => v);

  const handleAccept = async () => {
    if (!allChecked || !user) return;

    try {
      setAccepting(true);

      const response = await fetch(
        `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/pack338a_acceptLegal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({ lang }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save acceptance');
      }

      setVisible(false);
      onAccepted?.();
    } catch (error) {
      console.error('Error accepting legal documents:', error);
      alert('Failed to save acceptance. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-pink-50 rounded-full mb-4">
            <svg className="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Legal Agreement Required</h1>
          <p className="text-gray-600">
            Please review and accept our policies to continue using Avalo
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {getAllLegalDocKeys().map((key) => {
            const doc = LEGAL_DOCS[key][lang];
            return (
              <button
                key={key}
                onClick={() => handleCheckbox(key)}
                className="w-full flex items-start p-4 border-2 border-gray-200 rounded-lg hover:border-pink-500 transition-colors text-left"
              >
                <div
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 mr-3 ${
                    checkboxes[key]
                      ? 'bg-pink-500 border-pink-500'
                      : 'border-gray-300'
                  }`}
                >
                  {checkboxes[key] && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    I accept the <span className="text-pink-500">{doc.title}</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Version {doc.version}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-8 flex items-start">
          <svg className="w-5 h-5 text-gray-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-gray-600">
            You can review these documents anytime in Settings → Legal & Policies
          </p>
        </div>

        <button
          onClick={handleAccept}
          disabled={!allChecked || accepting}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-colors ${
            allChecked && !accepting
              ? 'bg-pink-500 hover:bg-pink-600'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {accepting ? 'Processing...' : 'Accept & Continue'}
        </button>

        <p className="text-center text-sm text-gray-500 mt-4">
          By accepting, you confirm you are 18+ and agree to all policies above
        </p>
      </div>
    </div>
  );
}
