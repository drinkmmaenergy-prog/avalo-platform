'use client';

/**
 * PACK 343 — Security & Verification Page
 * Manage age verification, KYC, legal compliance,
 * password change, active sessions, and account deletion.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { useCompliance } from '../../../../hooks/useCompliance';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';
import {
  changePassword,
  getActiveSessions,
  revokeSession,
  deleteAccount,
  deleteAccountOAuth,
  hasPasswordProvider,
  getAuthProviders,
  recordSession,
  type SessionInfo,
} from '@/lib/services/accountService';

import type { UserComplianceStatus, LegalAcceptance } from '../../../../hooks/useCompliance';

// ---------------------------------------------------------------------------
// Password validation
// ---------------------------------------------------------------------------
const MIN_PASSWORD_LENGTH = 8;

function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  return null;
}

export default function SecurityPage() {
  const { getComplianceStatus, getLegalAcceptances } = useCompliance();
  const { user, firebaseUser, signOut } = useAuth();
  const router = useRouter();

  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);
  const [legalAcceptances, setLegalAcceptances] = useState<LegalAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [changingPassword, setChangingPassword] = useState(false);
  const [isPasswordUser, setIsPasswordUser] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Auth provider info
  const [authProviders, setAuthProviders] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (firebaseUser) {
      setIsPasswordUser(hasPasswordProvider());
      setAuthProviders(getAuthProviders());
      loadSessions();
      // Record session on page load
      recordSession().catch(() => {});
    }
  }, [firebaseUser]);

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
    } catch (err: unknown) {
      console.error('Load security error:', err);
      const message = err instanceof Error ? err.message : 'Failed to load security data';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      setSessionsLoading(true);
      const sessionList = await getActiveSessions();
      setSessions(sessionList);
    } catch (err) {
      console.warn('[Security] Failed to load sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Password Change Handler
  // -----------------------------------------------------------------------
  const handleChangePassword = async () => {
    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required.';
    }
    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else {
      const validationError = validateNewPassword(newPassword);
      if (validationError) {
        errors.newPassword = validationError;
      }
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (currentPassword === newPassword && newPassword) {
      errors.newPassword = 'New password must be different from current password.';
    }

    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});

      toast({
        type: 'success',
        title: 'Password changed',
        description: 'Your password has been updated successfully.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to change password.';

      // Map Firebase error codes to user-friendly messages
      let displayMessage = message;
      if (message.includes('wrong-password') || message.includes('INVALID_LOGIN_CREDENTIALS')) {
        displayMessage = 'Current password is incorrect.';
      } else if (message.includes('weak-password')) {
        displayMessage = 'New password is too weak. Use a stronger password.';
      } else if (message.includes('requires-recent-login')) {
        displayMessage = 'Please sign out and sign in again before changing your password.';
      }

      toast({
        type: 'error',
        title: 'Password change failed',
        description: displayMessage,
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // -----------------------------------------------------------------------
  // Session Revocation Handler
  // -----------------------------------------------------------------------
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast({
        type: 'success',
        title: 'Session revoked',
        description: 'The session has been signed out.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to revoke session.';
      toast({ type: 'error', title: 'Error', description: message });
    } finally {
      setRevokingSession(null);
    }
  };

  // -----------------------------------------------------------------------
  // Account Deletion Handler
  // -----------------------------------------------------------------------
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast({
        type: 'warning',
        title: 'Confirmation required',
        description: 'Type "DELETE" to confirm account deletion.',
      });
      return;
    }

    if (isPasswordUser && !deletePassword) {
      toast({
        type: 'warning',
        title: 'Password required',
        description: 'Enter your password to confirm deletion.',
      });
      return;
    }

    setDeletingAccount(true);
    try {
      if (isPasswordUser) {
        await deleteAccount(deletePassword, deleteReason);
      } else {
        await deleteAccountOAuth(deleteReason);
      }

      toast({
        type: 'success',
        title: 'Account deleted',
        description: 'Your account and data have been scheduled for deletion.',
      });

      // Redirect to home after deletion
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';

      let displayMessage = message;
      if (message.includes('wrong-password') || message.includes('INVALID_LOGIN_CREDENTIALS')) {
        displayMessage = 'Password is incorrect. Please try again.';
      } else if (message.includes('requires-recent-login')) {
        displayMessage = 'Please sign out and sign in again before deleting your account.';
      }

      toast({
        type: 'error',
        title: 'Deletion failed',
        description: displayMessage,
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  // -----------------------------------------------------------------------
  // Format helpers
  // -----------------------------------------------------------------------
  const formatDeviceInfo = (userAgent: string): string => {
    if (userAgent === 'client-side' || userAgent === 'Unknown') return 'Unknown device';
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    if (userAgent.includes('Mobile')) return 'Mobile Browser';
    return 'Web Browser';
  };

  const getProviderLabel = (providerId: string): string => {
    switch (providerId) {
      case 'password': return 'Email & Password';
      case 'google.com': return 'Google';
      case 'apple.com': return 'Apple';
      default: return providerId;
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
          <div className="text-6xl mb-4">&#x26A0;&#xFE0F;</div>
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

      {/* Auth Providers Info */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Sign-in Methods</h2>
        <div className="space-y-3">
          {authProviders.map((providerId) => (
            <div
              key={providerId}
              className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {providerId === 'password' ? '📧' : providerId === 'google.com' ? '🔵' : '🍎'}
                </span>
                <div>
                  <p className="font-medium text-gray-900">{getProviderLabel(providerId)}</p>
                  <p className="text-sm text-gray-500">
                    {providerId === 'password'
                      ? firebaseUser?.email
                      : `Linked via ${getProviderLabel(providerId)}`}
                  </p>
                </div>
              </div>
              <span className="text-green-600 text-sm font-medium">Active</span>
            </div>
          ))}
        </div>
      </section>

      {/* Change Password — only for email/password users */}
      {isPasswordUser && (
        <section className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Change Password</h2>
          <div className="space-y-4 max-w-md">
            {/* Current Password */}
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (passwordErrors.currentPassword) {
                    setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                  }
                }}
                disabled={changingPassword}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 ${
                  passwordErrors.currentPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter current password"
              />
              {passwordErrors.currentPassword && (
                <p className="text-sm text-red-600 mt-1">{passwordErrors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordErrors.newPassword) {
                    setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                  }
                }}
                disabled={changingPassword}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 ${
                  passwordErrors.newPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter new password"
              />
              {passwordErrors.newPassword && (
                <p className="text-sm text-red-600 mt-1">{passwordErrors.newPassword}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Min {MIN_PASSWORD_LENGTH} characters, at least one uppercase, lowercase, and number.
              </p>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordErrors.confirmPassword) {
                    setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                disabled={changingPassword}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 ${
                  passwordErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Confirm new password"
              />
              {passwordErrors.confirmPassword && (
                <p className="text-sm text-red-600 mt-1">{passwordErrors.confirmPassword}</p>
              )}
            </div>

            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {changingPassword ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </button>
          </div>
        </section>
      )}

      {/* Active Sessions */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Active Sessions</h2>
          <button
            onClick={loadSessions}
            disabled={sessionsLoading}
            className="text-purple-600 hover:text-purple-700 text-sm font-medium disabled:opacity-50"
          >
            {sessionsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {sessionsLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-3xl mb-2">🖥️</p>
            <p className="text-sm">No active sessions recorded</p>
            <p className="text-xs text-gray-400 mt-1">Sessions are tracked when you visit account pages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  session.isCurrent
                    ? 'border-purple-200 bg-purple-50'
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {session.deviceInfo.includes('Mobile') ? '📱' : '💻'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">
                        {formatDeviceInfo(session.deviceInfo)}
                      </p>
                      {session.isCurrent && (
                        <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Last active: {session.lastActiveAt.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      Started: {session.createdAt.toLocaleString()}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revokingSession === session.id}
                    className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                  >
                    {revokingSession === session.id ? 'Revoking...' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Session metadata from Firebase Auth */}
        {firebaseUser?.metadata && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Account Activity</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {firebaseUser.metadata.creationTime && (
                <div>
                  <p className="text-gray-500">Account created</p>
                  <p className="font-medium text-gray-900">
                    {new Date(firebaseUser.metadata.creationTime).toLocaleDateString()}
                  </p>
                </div>
              )}
              {firebaseUser.metadata.lastSignInTime && (
                <div>
                  <p className="text-gray-500">Last sign-in</p>
                  <p className="font-medium text-gray-900">
                    {new Date(firebaseUser.metadata.lastSignInTime).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
                    Version {acceptance.version} &bull; Accepted{' '}
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
              Terms of Service &rarr;
            </Link>
            <Link
              href="/legal/privacy"
              className="block text-purple-600 hover:text-purple-700 text-sm"
            >
              Privacy Policy &rarr;
            </Link>
            <Link
              href="/legal/creator-monetization"
              className="block text-purple-600 hover:text-purple-700 text-sm"
            >
              Creator Monetization Terms &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Data & Privacy + Account Deletion */}
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

          {/* GDPR-Compliant Account Deletion */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-semibold text-red-900 mb-2">Delete Account</h4>
            <p className="text-gray-600 text-sm mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
              All your profile data, chat history, media uploads, transaction history, and preferences
              will be permanently removed in compliance with GDPR.
              {compliance?.legalHold &&
                ' Note: Account deletion is currently blocked due to legal hold.'}
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!!compliance?.legalHold}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Delete Account
              </button>
            ) : (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mt-4">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <h3 className="font-bold text-red-900 mb-1">Confirm Account Deletion</h3>
                    <p className="text-red-800 text-sm">
                      This will permanently delete:
                    </p>
                    <ul className="list-disc list-inside text-red-700 text-sm mt-2 space-y-1">
                      <li>Your profile and personal data</li>
                      <li>Authentication credentials</li>
                      <li>Chat history and messages</li>
                      <li>Uploaded media and photos</li>
                      <li>Transaction and payment history</li>
                      <li>Session data and preferences</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Reason (optional) */}
                  <div>
                    <label
                      htmlFor="deleteReason"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Reason for leaving (optional)
                    </label>
                    <textarea
                      id="deleteReason"
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      disabled={deletingAccount}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      rows={2}
                      placeholder="Help us improve — why are you leaving?"
                    />
                  </div>

                  {/* Password confirmation for email/password users */}
                  {isPasswordUser && (
                    <div>
                      <label
                        htmlFor="deletePassword"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Confirm your password
                      </label>
                      <input
                        id="deletePassword"
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        disabled={deletingAccount}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Enter your password"
                      />
                    </div>
                  )}

                  {/* Type DELETE to confirm */}
                  <div>
                    <label
                      htmlFor="deleteConfirm"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Type <strong>DELETE</strong> to confirm
                    </label>
                    <input
                      id="deleteConfirm"
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      disabled={deletingAccount}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Type DELETE"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {deletingAccount ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          Deleting...
                        </>
                      ) : (
                        'Permanently Delete Account'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeletePassword('');
                        setDeleteReason('');
                        setDeleteConfirmText('');
                      }}
                      disabled={deletingAccount}
                      className="text-gray-600 hover:text-gray-900 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
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
          <li>&bull; Age verification is required for all payment operations</li>
          <li>&bull; KYC verification is required for payouts and withdrawals</li>
          <li>&bull; All verifications are processed securely and encrypted</li>
          <li>&bull; Contact support@avalo.app for verification issues</li>
          <li>&bull; Compliance status is synchronized across web and mobile</li>
        </ul>
      </div>
    </AccountLayout>
  );
}
