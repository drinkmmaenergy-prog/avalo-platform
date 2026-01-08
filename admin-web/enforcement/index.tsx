/**
 * PACK 419 — Admin Enforcement Overview
 * 
 * Dashboard for viewing and managing all enforcement decisions
 * Filters, search, and quick stats
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, limit, getDocs, where, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  EnforcementDecision,
  EnforcementActionType,
  EnforcementScope,
  EnforcementSource,
  EnforcementStats,
} from '../../shared/types/pack419-enforcement.types';

export default function AdminEnforcementOverview() {
  const router = useRouter();
  const [enforcements, setEnforcements] = useState<EnforcementDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EnforcementStats | null>(null);
  
  // Filters
  const [actionFilter, setActionFilter] = useState<EnforcementActionType | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<EnforcementScope | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<EnforcementSource | 'ALL'>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  useEffect(() => {
    loadEnforcements();
  }, [actionFilter, scopeFilter, sourceFilter, activeFilter]);

  const loadEnforcements = async () => {
    setLoading(true);
    try {
      const constraints: QueryConstraint[] = [
        orderBy('createdAt', 'desc'),
        limit(100)
      ];

      if (actionFilter !== 'ALL') {
        constraints.push(where('action', '==', actionFilter));
      }
      if (activeFilter === 'ACTIVE') {
        constraints.push(where('isActive', '==', true));
      } else if (activeFilter === 'INACTIVE') {
        constraints.push(where('isActive', '==', false));
      }

      const q = query(collection(db, 'enforcementDecisions'), ...constraints);
      const snapshot = await getDocs(q);
      
      let decisions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EnforcementDecision[];

      // Client-side filtering for scopes and sources (not indexed)
      if (scopeFilter !== 'ALL') {
        decisions = decisions.filter(d => d.scopes.includes(scopeFilter));
      }
      if (sourceFilter !== 'ALL') {
        decisions = decisions.filter(d => d.source === sourceFilter);
      }

      setEnforcements(decisions);
      calculateStats(decisions);
    } catch (error) {
      console.error('Failed to load enforcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (decisions: EnforcementDecision[]) => {
    const stats: EnforcementStats = {
      totalEnforcements: decisions.length,
      byAction: {
        warnings: decisions.filter(d => d.action === EnforcementActionType.WARNING).length,
        tempRestrictions: decisions.filter(d => d.action === EnforcementActionType.TEMP_RESTRICTION).length,
        permaBans: decisions.filter(d => d.action === EnforcementActionType.PERMA_BAN).length,
        shadowRestrictions: decisions.filter(d => d.action === EnforcementActionType.SHADOW_RESTRICTION).length,
      },
      byScope: {} as Record<EnforcementScope, number>,
      bySource: {} as Record<EnforcementSource, number>,
      appeals: {
        total: decisions.filter(d => d.appealId).length,
        pending: 0,
        approved: 0,
        rejected: 0,
        escalated: 0,
        approvalRate: 0,
        avgResolutionTimeMs: 0,
      },
    };

    setStats(stats);
  };

  const getActionBadge = (action: EnforcementActionType) => {
    const badges = {
      [EnforcementActionType.WARNING]: { label: 'Warning', className: 'bg-yellow-500' },
      [EnforcementActionType.TEMP_RESTRICTION]: { label: 'Temp Ban', className: 'bg-orange-500' },
      [EnforcementActionType.PERMA_BAN]: { label: 'Perma Ban', className: 'bg-red-600' },
      [EnforcementActionType.SHADOW_RESTRICTION]: { label: 'Shadow', className: 'bg-gray-600' },
    };
    return badges[action];
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Enforcement Dashboard</h1>
          <p className="text-gray-600">Manage bans, restrictions, and appeals</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Total Enforcements</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalEnforcements}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Warnings</p>
              <p className="text-3xl font-bold text-yellow-600">{stats.byAction.warnings}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Temp Bans</p>
              <p className="text-3xl font-bold text-orange-600">{stats.byAction.tempRestrictions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Perma Bans</p>
              <p className="text-3xl font-bold text-red-600">{stats.byAction.permaBans}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="ALL">All Actions</option>
                {Object.values(EnforcementActionType).map(action => (
                  <option key={action} value={action}>{action.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="ALL">All Scopes</option>
                {Object.values(EnforcementScope).map(scope => (
                  <option key={scope} value={scope}>{scope.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="ALL">All Sources</option>
                {Object.values(EnforcementSource).map(source => (
                  <option key={source} value={source}>{source.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push('/admin/enforcement/appeals')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
          >
            View Appeals Queue
          </button>
        </div>

        {/* Enforcement List */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading enforcements...</p>
            </div>
          ) : enforcements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No enforcement decisions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scopes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {enforcements.map(enforcement => {
                    const badge = getActionBadge(enforcement.action);
                    const isActive = enforcement.isActive && (!enforcement.expiresAt || enforcement.expiresAt > Date.now());
                    
                    return (
                      <tr key={enforcement.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                          {enforcement.userId.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`${badge.className} text-white px-2 py-1 rounded text-xs font-semibold`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {enforcement.scopes.slice(0, 2).join(', ')}
                          {enforcement.scopes.length > 2 && ` +${enforcement.scopes.length - 2}`}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{enforcement.reasonCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {new Date(enforcement.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => router.push(`/admin/enforcement/${enforcement.id}`)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
