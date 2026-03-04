"use client";

/**
 * PHASE 3.3 — Admin Feature Flags Page (READ-ONLY)
 * 
 * View all feature flags and their status.
 * NO write operations — READ-ONLY monitoring.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { getFeatureFlags } from '@/lib/services/phase33';
import type { FeatureFlagSummary } from '@/types/phase33.types';

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  
  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getFeatureFlags();
        setFlags(data);
      } catch (err) {
        console.error('Error loading flags:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);
  
  const filteredFlags = flags.filter((f) => {
    if (filter === 'enabled') return f.enabled;
    if (filter === 'disabled') return !f.enabled;
    return true;
  });
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-gray-700 rounded-lg" />
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
          <p className="text-gray-400 mt-1">View feature flag configuration (read-only)</p>
        </div>
        
        <div className="flex bg-gray-800 rounded-lg p-1">
          {(['all', 'enabled', 'disabled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition capitalize ${
                filter === f
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Flag Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Rollout</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Roles</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredFlags.map((flag) => (
              <tr key={flag.flagName} className="hover:bg-gray-700/50">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm text-gray-200">{flag.flagName}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    flag.enabled
                      ? 'bg-green-900 text-green-300'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {flag.enabled ? '✓ Enabled' : '○ Disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400">
                  {flag.rolloutPercentage !== undefined
                    ? `${flag.rolloutPercentage}%`
                    : '100%'}
                </td>
                <td className="px-6 py-4">
                  {flag.allowedRoles && flag.allowedRoles.length > 0 ? (
                    <div className="flex gap-1">
                      {flag.allowedRoles.map((role) => (
                        <span
                          key={role}
                          className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-500">All</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {flag.lastUpdated.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        Total: {flags.length} flags | Enabled: {flags.filter((f) => f.enabled).length} | 
        Disabled: {flags.filter((f) => !f.enabled).length}
      </div>
    </div>
  );
}


