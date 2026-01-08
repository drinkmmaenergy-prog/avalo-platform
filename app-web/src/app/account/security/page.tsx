/**
 * PACK 343 — Security & Verification Page
 * Manage age verification, KYC, and legal compliance
 */

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { useCompliance } from '../../../../hooks/useCompliance';
import type { UserComplianceStatus, LegalAcceptance } from '../../../../hooks/useCompliance';

export default function SecurityPage() {
  const { getComplianceStatus, getLegalAcceptances } = useCompliance();

  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);
  const [legalAcceptances, setLegalAcceptances] = useState<LegalAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [complianceData, acceptancesData] = await Promise.all([
        getComplianceStatus(),
        getLegalAcceptances(),
      ]);

      setCompliance(complianceData);
      setLegalAcceptances(acceptancesData);
    } catch (err: any) {
      console.error('Load security error:', err);
      setError(err.message || 'Failed to load security data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading security...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Security</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout>
      {/* Account Restrictions Warning */}
      {(compliance?.legalHold || compliance?.regulatorLock) && (
        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🚫</span>
            <div>
              <h3 className="font-bold text-red-900 mb-2">Account Restricted</h3>
              <p className="text-red-800 mb-4">
                {compliance.legalHold
                  ? 'Your account is under legal hold. Payment operations are temporarily disabled.'
                  : 'Your account has been restricted by regulatory authorities.'}
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
      )}

      {/* Age Verification */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Age Verification</h2>
        <div
          className={`rounded-lg p-6 ${
            compliance?.ageVerified
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="text-4xl">{compliance?.ageVerified ? '✅' : '⚠️'}</span>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">
                {compliance?.ageVerified ? 'Age Verified' : 'Age Verification Required'}
              </h3>
              {compliance?.ageVerified ? (
                <div className="space-y-2 text-gray-700 text-sm">
                  <p>
                    <strong>Method:</strong> {compliance.ageVerificationMethod || 'N/A'}
                  </p>
                  {compliance.ageVerifiedAt && (
                    <p>
                      <strong>Verified on:</strong>{' '}
                      {new Date(compliance.ageVerifiedAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-green-700 mt-3">
                    ✓ You can make purchases and manage subscriptions
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-amber-800 mb-3">
                    Age verification is required to make purchases, buy tokens, or subscribe to VIP/Royal plans.
                  </p>
                  <Link
                    href="/legal/age-verification"
                    className="inline-block bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition"
                  >
                    Verify Age
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Selfie Verification */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Selfie Verification</h2>
        <div
          className={`rounded-lg p-6 ${
            compliance?.selfieVerified
              ? 'bg-blue-50 border border-blue-200'
              : 'bg-gray-50 border border-gray-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="text-4xl">{compliance?.selfieVerified ? '✅' : 'ℹ️'}</span>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">
                {compliance?.selfieVerified ? 'Selfie Verified' : 'Selfie Verification'}
              </h3>
              {compliance?.selfieVerified ? (
                <div className="space-y-2 text-gray-700 text-sm">
                  {compliance.selfieVerifiedAt && (
                    <p>
                      <strong>Verified on:</strong>{' '}
                      {new Date(compliance.selfieVerifiedAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-blue-700 mt-3">
                    ✓ Your profile has enhanced trust and visibility
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 mb-3">
                    Selfie verification increases trust and improves your profile visibility. Complete this in the mobile app.
                  </p>
                  <button
                    disabled
                    className="bg-gray-300 text-gray-600 px-4 py-2 rounded-lg cursor-not-allowed"
                  >
                    Verify via Mobile App
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* KYC Verification */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">KYC Verification</h2>
        <div
          className={`rounded-lg p-6 ${
            compliance?.kycVerified
              ? 'bg-green-50 border border-green-200'
              : 'bg-blue-50 border border-blue-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="text-4xl">{compliance?.kycVerified ? '✅' : '📋'}</span>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">
                {compliance?.kycVerified ? 'KYC Verified' : 'KYC Verification'}
              </h3>
              {compliance?.kycVerified ? (
                <div className="space-y-2 text-gray-700 text-sm">
                  {compliance.kycProvider && (
                    <p>
                      <strong>Provider:</strong> {compliance.kycProvider}
                    </p>
                  )}
                  {compliance.kycVerifiedAt && (
                    <p>
                      <strong>Verified on:</strong>{' '}
                      {new Date(compliance.kycVerifiedAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-green-700 mt-3">
                    ✓ You can request payouts and withdraw earnings
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-blue-800 mb-3">
                    KYC (Know Your Customer) verification is required to request payouts and withdraw earnings. This is a regulatory requirement for financial transactions.
                  </p>
                  <button
                    onClick={() => alert('KYC verification flow not yet implemented')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    Start KYC Verification
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Legal Acceptances */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Terms & Legal Documents</h2>
        {legalAcceptances.length > 0 ? (
          <div className="space-y-3">
            {legalAcceptances.map((acceptance, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="font-medium text-gray-900">
                    {acceptance.documentType === 'TERMS'
                      ? 'Terms of Service'
                      : acceptance.documentType === 'PRIVACY'
                      ? 'Privacy Policy'
                      : acceptance.documentType === 'CREATOR_TERMS'
                      ? 'Creator Terms'
                      : 'Wallet Policy'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Version {acceptance.version} • Accepted{' '}
                    {new Date(acceptance.acceptedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-green-600 text-xl">✓</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm">No legal acceptances recorded</p>
          </div>
        )}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-3">Review Documents</h4>
          <div className="space-y-2">
            <Link
              href="/legal/terms"
              className="block text-purple-600 hover:text-purple-700 text-sm"
            >
              Terms of Service →
            </Link>
            <Link
              href="/legal/privacy"
              className="block text-purple-600 hover:text-purple-700 text-sm"
            >
              Privacy Policy →
            </Link>
            <Link
              href="/legal/creator-monetization"
              className="block text-purple-600 hover:text-purple-700 text-sm"
            >
              Creator Monetization Terms →
            </Link>
          </div>
        </div>
      </section>

      {/* Data & Privacy */}
      <section className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Data & Privacy</h2>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Export Your Data</h4>
            <p className="text-gray-600 text-sm mb-3">
              Request a copy of all your personal data stored in our systems.
            </p>
            <button
              onClick={() => alert('Data export feature not yet implemented')}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition text-sm"
            >
              Request Data Export
            </button>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-2">Delete Account</h4>
            <p className="text-gray-600 text-sm mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
              {compliance?.legalHold &&
                ' Note: Account deletion is currently blocked due to legal hold.'}
            </p>
            <button
              onClick={() =>
                alert(
                  compliance?.legalHold
                    ? 'Account deletion is blocked during legal hold'
                    : 'Account deletion feature not yet implemented'
                )
              }
              disabled={compliance?.legalHold}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Delete Account
            </button>
          </div>
        </div>
      </section>

      {/* Important Notice */}
      <div className="mt-6 bg-amber-50 border-l-4 border-amber-500 rounded-lg p-6">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span>ℹ️</span>
          <span>Security & Compliance</span>
        </h4>
        <ul className="space-y-2 text-gray-700 text-sm">
          <li>• Age verification is required for all payment operations</li>
          <li>• KYC verification is required for payouts and withdrawals</li>
          <li>• All verifications are processed securely and encrypted</li>
          <li>• Contact support@avalo.app for verification issues</li>
          <li>• Compliance status is synchronized across web and mobile</li>
        </ul>
      </div>
    </AccountLayout>
  );
}
