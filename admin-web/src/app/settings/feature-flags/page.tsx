/**
 * PACK 416 — Admin Console Feature Control Panel
 * 
 * Admin UI for managing feature flags
 * Features:
 * - View all feature flags
 * - Toggle enabled/disabled status
 * - Adjust rollout percentage
 * - Edit targeting rules
 * - View audit trail
 * - 2-step confirmation for critical features
 */

'use client';

import { useState, useEffect } from 'react';
import {
  FeatureFlagKey,
  FeatureFlagConfig,
  FEATURE_CATEGORIES,
  CRITICAL_FEATURES,
} from '../../../../../shared/config/pack416-feature-flags';
import {
  getAllFeatureFlagsServer,
  updateFeatureFlagServer,
  toggleFeatureFlagServer,
} from '../../../../../app-web/src/lib/featureFlagsServer';

interface FeatureFlagWithCategory extends FeatureFlagConfig {
  category?: string;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEnv, setSelectedEnv] = useState<string>('all');
  const [editingFlag, setEditingFlag] = useState<FeatureFlagKey | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    key: FeatureFlagKey;
    action: 'toggle' | 'update';
    value?: any;
  } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // Load feature flags
  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      setLoading(true);
      // In production, this would be an API call
      // const response = await fetch('/api/admin/feature-flags');
      // const data = await response.json();
      
      // For now, create dummy data
      const dummyFlags: FeatureFlagWithCategory[] = Object.values(FeatureFlagKey).map((key) => ({
        key,
        enabled: true,
        env: 'prod' as const,
        rollout: 100,
        lastUpdatedBy: 'admin@avalo.app',
        lastUpdatedAt: new Date(),
        notes: '',
        category: getCategoryForFlag(key),
      }));
      
      setFlags(dummyFlags);
    } catch (error) {
      console.error('Error loading flags:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryForFlag = (key: FeatureFlagKey): string => {
    for (const [category, keys] of Object.entries(FEATURE_CATEGORIES)) {
      if (keys.includes(key)) {
        return category;
      }
    }
    return 'other';
  };

  const handleToggle = async (key: FeatureFlagKey, currentEnabled: boolean) => {
    // Check if critical feature
    if (CRITICAL_FEATURES.includes(key)) {
      setPendingAction({ key, action: 'toggle', value: !currentEnabled });
      setShowConfirmModal(true);
    } else {
      await executeToggle(key, !currentEnabled);
    }
  };

  const executeToggle = async (key: FeatureFlagKey, enabled: boolean) => {
    try {
      // In production, call API
      // await fetch('/api/admin/feature-flags/toggle', {
      //   method: 'POST',
      //   body: JSON.stringify({ key, enabled }),
      // });
      
      setFlags(prev =>
        prev.map(flag =>
          flag.key === key ? { ...flag, enabled } : flag
        )
      );
      
      alert(`Feature ${key} ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error toggling flag:', error);
      alert('Failed to toggle feature flag');
    }
  };

  const handleRolloutChange = async (key: FeatureFlagKey, rollout: number) => {
    try {
      setFlags(prev =>
        prev.map(flag =>
          flag.key === key ? { ...flag, rollout } : flag
        )
      );
    } catch (error) {
      console.error('Error updating rollout:', error);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    
    // Verify confirmation text for critical features
    if (CRITICAL_FEATURES.includes(pendingAction.key)) {
      if (confirmText !== pendingAction.key) {
        alert('Confirmation text does not match. Please type the exact feature key.');
        return;
      }
    }
    
    // Execute the pending action
    if (pendingAction.action === 'toggle') {
      await executeToggle(pendingAction.key, pendingAction.value);
    }
    
    // Reset modal state
    setShowConfirmModal(false);
    setPendingAction(null);
    setConfirmText('');
  };

  const filteredFlags = flags.filter(flag => {
    const matchesSearch = flag.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || flag.category === selectedCategory;
    const matchesEnv = selectedEnv === 'all' || flag.env === selectedEnv;
    return matchesSearch && matchesCategory && matchesEnv;
  });

  const categories = ['all', ...Object.keys(FEATURE_CATEGORIES), 'other'];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Feature Flags Control Panel</h1>
        <p className="text-gray-600">
          Manage feature toggles, rollouts, and kill-switches across all platforms
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <input
              type="text"
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Environment</label>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="all">All Environments</option>
              <option value="dev">Development</option>
              <option value="staging">Staging</option>
              <option value="prod">Production</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-sm text-gray-600 mb-1">Total Flags</div>
          <div className="text-3xl font-bold">{flags.length}</div>
        </div>
        
        <div className="bg-green-50 rounded-lg shadow-md p-6">
          <div className="text-sm text-green-600 mb-1">Enabled</div>
          <div className="text-3xl font-bold text-green-700">
            {flags.filter(f => f.enabled).length}
          </div>
        </div>
        
        <div className="bg-red-50 rounded-lg shadow-md p-6">
          <div className="text-sm text-red-600 mb-1">Disabled</div>
          <div className="text-3xl font-bold text-red-700">
            {flags.filter(f => !f.enabled).length}
          </div>
        </div>
        
        <div className="bg-yellow-50 rounded-lg shadow-md p-6">
          <div className="text-sm text-yellow-600 mb-1">Partial Rollout</div>
          <div className="text-3xl font-bold text-yellow-700">
            {flags.filter(f => f.rollout < 100 && f.rollout > 0).length}
          </div>
        </div>
      </div>

      {/* Feature Flags Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Environment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rollout
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Loading feature flags...
                  </td>
                </tr>
              ) : filteredFlags.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No feature flags found
                  </td>
                </tr>
              ) : (
                filteredFlags.map(flag => (
                  <tr key={flag.key} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {flag.key}
                            {CRITICAL_FEATURES.includes(flag.key) && (
                              <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                                CRITICAL
                              </span>
                            )}
                          </div>
                          {flag.notes && (
                            <div className="text-sm text-gray-500">{flag.notes}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {flag.category}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        flag.env === 'prod' ? 'bg-purple-100 text-purple-800' :
                        flag.env === 'staging' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {flag.env}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggle(flag.key, flag.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          flag.enabled ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          flag.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={flag.rollout}
                          onChange={(e) => handleRolloutChange(flag.key, parseInt(e.target.value))}
                          className="w-24"
                        />
                        <span className="text-sm font-medium">{flag.rollout}%</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => setEditingFlag(flag.key)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {/* View audit log */}}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && pendingAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-red-600">⚠️ Critical Feature Warning</h3>
            <p className="mb-4">
              You are about to modify a critical feature: <strong>{pendingAction.key}</strong>
            </p>
            <p className="mb-4 text-sm text-gray-600">
              This action may impact essential functionality. Please type the feature key exactly to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={pendingAction.key}
              className="w-full px-4 py-2 border rounded-lg mb-4"
            />
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingAction(null);
                  setConfirmText('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmText !== pendingAction.key}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
