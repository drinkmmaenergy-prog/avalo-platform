/**
 * PACK 343 — Compliance Gate Component
 * Block actions based on age verification, KYC, or legal holds
 */

'use client';

import React from 'react';
import type { UserComplianceStatus } from '../../../hooks/useCompliance';

interface ComplianceGateProps {
  complianceStatus: UserComplianceStatus;
  requiredFor: 'PAYMENT' | 'PAYOUT' | 'SUBSCRIPTION';
  children: React.ReactNode;
}

export function ComplianceGate({ complianceStatus, requiredFor, children }: ComplianceGateProps) {
  // Check for legal hold or regulator lock
  if (complianceStatus.legalHold || complianceStatus.regulatorLock) {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <span className="text-3xl">🚫</span>
          <div>
            <h3 className="font-bold text-red-900 mb-2">Account Restricted</h3>
            <p className="text-red-800 mb-4">
              {complianceStatus.legalHold
                ? 'Your account is under legal hold. Payment operations are temporarily disabled.'
                : 'Your account has been restricted by regulatory authorities. Please contact support.'}
            </p>
            <a
              href="mailto:support@avalo.app"
              className="inline-block bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Check age verification (required for all payment operations)
  if (!complianceStatus.ageVerified) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="font-bold text-amber-900 mb-2">Age Verification Required</h3>
            <p className="text-amber-800 mb-4">
              You must verify your age to {requiredFor === 'PAYMENT' ? 'make purchases' : requiredFor === 'PAYOUT' ? 'request payouts' : 'manage subscriptions'}.
            </p>
            <button
              onClick={() => (window.location.href = '/legal/age-verification')}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition"
            >
              Verify Age
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check KYC (only required for payouts)
  if (requiredFor === 'PAYOUT' && !complianceStatus.kycVerified) {
    return (
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <span className="text-3xl">📋</span>
          <div>
            <h3 className="font-bold text-blue-900 mb-2">KYC Verification Required</h3>
            <p className="text-blue-800 mb-4">
              To request payouts, you must complete KYC (Know Your Customer) verification to comply with financial regulations.
            </p>
            <button
              onClick={() => (window.location.href = '/account/security')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Complete KYC
            </button>
          </div>
        </div>
      </div>
    );
  }

  // All checks passed - render children
  return <>{children}</>;
}
