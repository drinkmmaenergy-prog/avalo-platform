/**
 * PACK 372 — GLOBAL LAUNCH ORCHESTRATOR
 * Admin Panel for Global Launch Management
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Types
type LaunchStatus = 'locked' | 'beta' | 'soft' | 'public' | 'frozen';

interface GlobalLaunchConfig {
  countryCode: string;
  launchStatus: LaunchStatus;
  enabledFeatures: string[];
  paymentEnabled: boolean;
  withdrawalsEnabled: boolean;
  adsEnabled: boolean;
  maxNewUsersPerDay: number;
  kycRequired: boolean;
  ageVerificationRequired: boolean;
  lastUpdated: Timestamp;
}

interface CountryTrafficMetrics {
  countryCode: string;
  registrationsThisHour: number;
  chatsThisMinute: number;
  paymentsThisMinute: number;
  payoutsThisHour: number;
}

const statusColors: Record<LaunchStatus, string> = {
  locked: 'bg-gray-500',
  beta: 'bg-blue-500',
  soft: 'bg-yellow-500',
  public: 'bg-green-500',
  frozen: 'bg-red-500',
};

export const GlobalLaunchPanel: React.FC = () => {
  const [countries, setCountries] = useState<GlobalLaunchConfig[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [freezeReason, setFreezeReason] = useState('');
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);

  const functions = getFunctions();

  // Subscribe to global launch configs
  useEffect(() => {
    const q = query(collection(db, 'globalLaunchConfig'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        ...doc.data(),
        countryCode: doc.id,
      })) as GlobalLaunchConfig[];
      setCountries(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleEmergencyFreeze = async (countryCode: string) => {
    if (!freezeReason.trim()) {
      alert('Please provide a reason for the freeze');
      return;
    }

    if (
      !confirm(
        `Are you sure you want to EMERGENCY FREEZE ${countryCode}?\n\nThis will:\n- Block all new registrations\n- Disable wallet operations\n- Stop all payouts\n- Freeze meetings and events\n\nReason: ${freezeReason}`
      )
    ) {
      return;
    }

    try {
      const emergencyFreeze = httpsCallable(functions, 'emergencyFreeze');
      await emergencyFreeze({ countryCode, reason: freezeReason });
      alert(`Emergency freeze activated for ${countryCode}`);
      setShowFreezeDialog(false);
      setFreezeReason('');
    } catch (error) {
      console.error('Error freezing country:', error);
      alert('Failed to activate emergency freeze');
    }
  };

  const handleStatusChange = async (
    countryCode: string,
    newStatus: LaunchStatus
  ) => {
    const reason = prompt(
      `Reason for changing ${countryCode} to ${newStatus}:`
    );
    if (!reason) return;

    try {
      const updateLaunchStatus = httpsCallable(functions, 'updateLaunchStatus');
      await updateLaunchStatus({ countryCode, newStatus, reason });
      alert(`Status updated for ${countryCode}`);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const togglePayments = async (countryCode: string, enable: boolean) => {
    try {
      const countryRef = doc(db, 'globalLaunchConfig', countryCode);
      await updateDoc(countryRef, {
        paymentEnabled: enable,
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error toggling payments:', error);
      alert('Failed to toggle payments');
    }
  };

  const toggleWithdrawals = async (countryCode: string, enable: boolean) => {
    try {
      const countryRef = doc(db, 'globalLaunchConfig', countryCode);
      await updateDoc(countryRef, {
        withdrawalsEnabled: enable,
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error toggling withdrawals:', error);
      alert('Failed to toggle withdrawals');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading global launch data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🌍 Global Launch Orchestrator
          </h1>
          <p className="text-gray-600">
            Control country-by-country rollout, feature access, and emergency
            shutdowns
          </p>
        </div>

        {/* Country Map View */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Country Status Map</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {countries.map((country) => (
              <button
                key={country.countryCode}
                onClick={() => setSelectedCountry(country.countryCode)}
                className={`
                  p-4 rounded-lg text-white font-bold text-center transition
                  ${statusColors[country.launchStatus]}
                  hover:opacity-80 cursor-pointer
                `}
              >
                <div className="text-2xl mb-1">{country.countryCode}</div>
                <div className="text-xs uppercase">{country.launchStatus}</div>
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 rounded"></div>
              <span className="text-sm">Locked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm">Beta</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-sm">Soft Launch</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm">Public</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-sm">Frozen</span>
            </div>
          </div>
        </div>

        {/* Selected Country Details */}
        {selectedCountry && (
          <CountryDetailPanel
            country={countries.find((c) => c.countryCode === selectedCountry)!}
            onStatusChange={handleStatusChange}
            onTogglePayments={togglePayments}
            onToggleWithdrawals={toggleWithdrawals}
            onEmergencyFreeze={() => setShowFreezeDialog(true)}
          />
        )}

        {/* Emergency Freeze Dialog */}
        {showFreezeDialog && selectedCountry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-red-600 mb-4">
                ⚠️ Emergency Freeze
              </h3>
              <p className="mb-4 text-gray-700">
                You are about to trigger an emergency freeze for{' '}
                <strong>{selectedCountry}</strong>. This will immediately
                disable:
              </p>
              <ul className="mb-4 text-sm text-gray-600 list-disc list-inside">
                <li>New registrations</li>
                <li>Wallet top-ups</li>
                <li>Payouts</li>
                <li>Meetings and events</li>
                <li>AI sessions</li>
              </ul>
              <textarea
                className="w-full border rounded p-2 mb-4"
                rows={3}
                placeholder="Reason for freeze (required)"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleEmergencyFreeze(selectedCountry)}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Confirm Freeze
                </button>
                <button
                  onClick={() => {
                    setShowFreezeDialog(false);
                    setFreezeReason('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Country Detail Panel Component
interface CountryDetailPanelProps {
  country: GlobalLaunchConfig;
  onStatusChange: (countryCode: string, newStatus: LaunchStatus) => void;
  onTogglePayments: (countryCode: string, enable: boolean) => void;
  onToggleWithdrawals: (countryCode: string, enable: boolean) => void;
  onEmergencyFreeze: () => void;
}

const CountryDetailPanel: React.FC<CountryDetailPanelProps> = ({
  country,
  onStatusChange,
  onTogglePayments,
  onToggleWithdrawals,
  onEmergencyFreeze,
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {country.countryCode} Configuration
        </h2>
        <button
          onClick={onEmergencyFreeze}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-bold"
        >
          🚨 EMERGENCY FREEZE
        </button>
      </div>

      {/* Status Controls */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Launch Status</label>
        <div className="flex gap-2">
          {(['locked', 'beta', 'soft', 'public', 'frozen'] as LaunchStatus[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => onStatusChange(country.countryCode, status)}
                className={`
                  px-4 py-2 rounded font-medium
                  ${
                    country.launchStatus === status
                      ? `${statusColors[status]} text-white`
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }
                `}
              >
                {status.toUpperCase()}
              </button>
            )
          )}
        </div>
      </div>

      {/* Payment Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">💳 Payments</h3>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={country.paymentEnabled}
              onChange={(e) =>
                onTogglePayments(country.countryCode, e.target.checked)
              }
              className="w-4 h-4"
            />
            <span>Payments Enabled</span>
          </label>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">💰 Withdrawals</h3>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={country.withdrawalsEnabled}
              onChange={(e) =>
                onToggleWithdrawals(country.countryCode, e.target.checked)
              }
              className="w-4 h-4"
            />
            <span>Withdrawals Enabled</span>
          </label>
        </div>
      </div>

      {/* Feature List */}
      <div className="mb-6">
        <h3 className="font-bold mb-2">Enabled Features</h3>
        <div className="flex flex-wrap gap-2">
          {country.enabledFeatures.map((feature) => (
            <span
              key={feature}
              className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="text-sm text-gray-600">Max New Users/Day</div>
          <div className="text-2xl font-bold">{country.maxNewUsersPerDay}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm text-gray-600">KYC Required</div>
          <div className="text-2xl font-bold">
            {country.kycRequired ? '✓ Yes' : '✗ No'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalLaunchPanel;
