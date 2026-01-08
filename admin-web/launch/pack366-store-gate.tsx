/**
 * ✅ PACK 366 — Store Readiness Gate
 * Admin UI for managing App Store / Google Play readiness
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface StoreReadinessConfig {
  android: {
    ready: boolean;
    minVersion: string;
    currentVersion: string;
    releaseDate?: number;
    reviewStatus?: 'pending' | 'approved' | 'rejected';
    blockedReasons?: string[];
  };
  ios: {
    ready: boolean;
    minVersion: string;
    currentVersion: string;
    releaseDate?: number;
    reviewStatus?: 'pending' | 'approved' | 'rejected';
    blockedReasons?: string[];
  };
  webApp: {
    ready: boolean;
    version: string;
    deployedAt?: number;
  };
  globalLock: boolean;
  lockReason?: string;
}

export default function Pack366StoreGate() {
  const [config, setConfig] = useState<StoreReadinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const docRef = doc(db, 'ops', 'storeReadiness');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setConfig(docSnap.data() as StoreReadinessConfig);
      } else {
        // Initialize with defaults
        const defaultConfig: StoreReadinessConfig = {
          android: {
            ready: false,
            minVersion: '1.0.0',
            currentVersion: '1.0.0',
          },
          ios: {
            ready: false,
            minVersion: '1.0.0',
            currentVersion: '1.0.0',
          },
          webApp: {
            ready: false,
            version: '1.0.0',
          },
          globalLock: true,
          lockReason: 'Initial setup - stores not configured',
        };
        setConfig(defaultConfig);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading config:', error);
      setLoading(false);
    }
  };

  const updateConfig = async (updates: Partial<StoreReadinessConfig>) => {
    if (!config) return;

    setSaving(true);
    try {
      const docRef = doc(db, 'ops', 'storeReadiness');
      await updateDoc(docRef, updates);
      
      setConfig({ ...config, ...updates });
      alert('Configuration updated successfully');
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Failed to update configuration');
    } finally {
      setSaving(false);
    }
  };

  const toggleAndroidReady = () => {
    if (!config) return;
    updateConfig({
      android: {
        ...config.android,
        ready: !config.android.ready,
        releaseDate: !config.android.ready ? Date.now() : config.android.releaseDate,
      },
    });
  };

  const toggleIosReady = () => {
    if (!config) return;
    updateConfig({
      ios: {
        ...config.ios,
        ready: !config.ios.ready,
        releaseDate: !config.ios.ready ? Date.now() : config.ios.releaseDate,
      },
    });
  };

  const toggleWebAppReady = () => {
    if (!config) return;
    updateConfig({
      webApp: {
        ...config.webApp,
        ready: !config.webApp.ready,
        deployedAt: !config.webApp.ready ? Date.now() : config.webApp.deployedAt,
      },
    });
  };

  const toggleGlobalLock = () => {
    if (!config) return;
    updateConfig({
      globalLock: !config.globalLock,
      lockReason: !config.globalLock ? 'Manual lock enabled' : undefined,
    });
  };

  const canLaunch = config && config.android.ready && config.ios.ready && !config.globalLock;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading store configuration...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">No configuration found</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          🏪 Store Readiness Gate
        </h1>
        <p className="text-gray-600">
          Manage App Store and Google Play readiness for production launch
        </p>
      </div>

      {/* Launch Status Banner */}
      <div
        className={`rounded-lg p-6 mb-6 ${
          canLaunch
            ? 'bg-green-100 border-2 border-green-500'
            : 'bg-red-100 border-2 border-red-500'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-5xl">{canLaunch ? '🚀' : '🚫'}</div>
            <div>
              <h2 className="text-2xl font-bold">
                {canLaunch
                  ? 'Production Launch ALLOWED'
                  : 'Production Launch BLOCKED'}
              </h2>
              <p className="text-sm mt-1">
                {canLaunch
                  ? 'All systems ready for launch'
                  : 'Fix blockers before launching'}
              </p>
            </div>
          </div>
          {!canLaunch && (
            <div className="text-sm text-red-800">
              <strong>Blockers:</strong>
              <ul className="list-disc list-inside mt-2">
                {!config.android.ready && <li>Android not ready</li>}
                {!config.ios.ready && <li>iOS not ready</li>}
                {config.globalLock && <li>Global lock enabled</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Global Lock Control */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold mb-2">
              🔒 Global Launch Lock
            </h3>
            <p className="text-sm text-gray-600">
              Emergency kill switch for entire platform
            </p>
            {config.globalLock && config.lockReason && (
              <p className="text-sm text-red-600 mt-2">
                Reason: {config.lockReason}
              </p>
            )}
          </div>
          <button
            onClick={toggleGlobalLock}
            disabled={saving}
            className={`px-8 py-4 rounded-lg font-bold text-lg ${
              config.globalLock
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {config.globalLock ? '🔓 Unlock' : '🔒 Lock'}
          </button>
        </div>
      </div>

      {/* Store Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Android Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-green-600 text-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🤖</span>
              <div>
                <h3 className="text-xl font-bold">Android</h3>
                <p className="text-sm opacity-90">Google Play</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4">
              <div
                className={`text-center py-3 rounded-lg font-bold ${
                  config.android.ready
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {config.android.ready ? '✅ READY' : '❌ NOT READY'}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">Current Version</label>
                <input
                  type="text"
                  value={config.android.currentVersion}
                  onChange={(e) =>
                    updateConfig({
                      android: {
                        ...config.android,
                        currentVersion: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                />
              </div>

              <div>
                <label className="text-gray-600">Min Version</label>
                <input
                  type="text"
                  value={config.android.minVersion}
                  onChange={(e) =>
                    updateConfig({
                      android: {
                        ...config.android,
                        minVersion: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                />
              </div>

              <div>
                <label className="text-gray-600">Review Status</label>
                <select
                  value={config.android.reviewStatus || 'pending'}
                  onChange={(e) =>
                    updateConfig({
                      android: {
                        ...config.android,
                        reviewStatus: e.target.value as any,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {config.android.releaseDate && (
                <div className="text-xs text-gray-500 pt-2">
                  Released: {new Date(config.android.releaseDate).toLocaleString()}
                </div>
              )}
            </div>

            <button
              onClick={toggleAndroidReady}
              disabled={saving}
              className={`w-full mt-4 py-2 rounded-lg font-semibold ${
                config.android.ready
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {config.android.ready ? 'Mark Not Ready' : 'Mark Ready'}
            </button>
          </div>
        </div>

        {/* iOS Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gray-800 text-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🍎</span>
              <div>
                <h3 className="text-xl font-bold">iOS</h3>
                <p className="text-sm opacity-90">App Store</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4">
              <div
                className={`text-center py-3 rounded-lg font-bold ${
                  config.ios.ready
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {config.ios.ready ? '✅ READY' : '❌ NOT READY'}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">Current Version</label>
                <input
                  type="text"
                  value={config.ios.currentVersion}
                  onChange={(e) =>
                    updateConfig({
                      ios: {
                        ...config.ios,
                        currentVersion: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                />
              </div>

              <div>
                <label className="text-gray-600">Min Version</label>
                <input
                  type="text"
                  value={config.ios.minVersion}
                  onChange={(e) =>
                    updateConfig({
                      ios: {
                        ...config.ios,
                        minVersion: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                />
              </div>

              <div>
                <label className="text-gray-600">Review Status</label>
                <select
                  value={config.ios.reviewStatus || 'pending'}
                  onChange={(e) =>
                    updateConfig({
                      ios: {
                        ...config.ios,
                        reviewStatus: e.target.value as any,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {config.ios.releaseDate && (
                <div className="text-xs text-gray-500 pt-2">
                  Released: {new Date(config.ios.releaseDate).toLocaleString()}
                </div>
              )}
            </div>

            <button
              onClick={toggleIosReady}
              disabled={saving}
              className={`w-full mt-4 py-2 rounded-lg font-semibold ${
                config.ios.ready
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {config.ios.ready ? 'Mark Not Ready' : 'Mark Ready'}
            </button>
          </div>
        </div>

        {/* Web App Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-blue-600 text-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🌐</span>
              <div>
                <h3 className="text-xl font-bold">Web App</h3>
                <p className="text-sm opacity-90">Progressive Web App</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4">
              <div
                className={`text-center py-3 rounded-lg font-bold ${
                  config.webApp.ready
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {config.webApp.ready ? '✅ READY' : '❌ NOT READY'}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">Version</label>
                <input
                  type="text"
                  value={config.webApp.version}
                  onChange={(e) =>
                    updateConfig({
                      webApp: {
                        ...config.webApp,
                        version: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border rounded mt-1"
                />
              </div>

              {config.webApp.deployedAt && (
                <div className="text-xs text-gray-500 pt-2">
                  Deployed: {new Date(config.webApp.deployedAt).toLocaleString()}
                </div>
              )}
            </div>

            <button
              onClick={toggleWebAppReady}
              disabled={saving}
              className={`w-full mt-4 py-2 rounded-lg font-semibold ${
                config.webApp.ready
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {config.webApp.ready ? 'Mark Not Ready' : 'Mark Ready'}
            </button>
          </div>
        </div>
      </div>

      {/* Pre-Launch Checklist */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-semibold mb-4">📋 Pre-Launch Checklist</h3>
        <div className="space-y-3">
          {[
            { check: config.android.ready, label: 'Android app ready on Google Play' },
            { check: config.ios.ready, label: 'iOS app ready on App Store' },
            {
              check: config.android.reviewStatus === 'approved',
              label: 'Android review approved',
            },
            {
              check: config.ios.reviewStatus === 'approved',
              label: 'iOS review approved',
            },
            { check: !config.globalLock, label: 'Global lock disabled' },
            { check: config.webApp.ready, label: 'Web app deployed' },
          ].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
            >
              <span className="text-2xl">
                {item.check ? '✅' : '⬜'}
              </span>
              <span className={item.check ? 'font-semibold' : 'text-gray-600'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
