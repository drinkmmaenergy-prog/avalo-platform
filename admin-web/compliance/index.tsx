/**
 * PACK 418 — Compliance Dashboard
 * 
 * Admin interface for monitoring safety and compliance violations.
 * Displays violations from PACK 418 compliance guards with links to
 * audit logs, incidents, and user profiles.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// =============================================================================
// TYPES
// =============================================================================

interface ComplianceViolation {
  id: string;
  type: string;
  subType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
  timestamp: Timestamp;
  source: string;
}

interface FilterOptions {
  violationType: string;
  feature: string;
  severity: string;
  timeRange: number; // days
}

// =============================================================================
// COMPLIANCE DASHBOARD COMPONENT
// =============================================================================

export default function ComplianceDashboard() {
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterOptions>({
    violationType: 'ALL',
    feature: 'ALL',
    severity: 'ALL',
    timeRange: 30, // Last 30 days
  });

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  useEffect(() => {
    loadViolations();
  }, [filters]);

  async function loadViolations() {
    setLoading(true);
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - filters.timeRange);

      let q = query(
        collection(db, 'auditLogs'),
        where('type', '==', 'COMPLIANCE_VIOLATION'),
        where('timestamp', '>=', daysAgo),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      // Apply severity filter
      if (filters.severity !== 'ALL') {
        q = query(
          collection(db, 'auditLogs'),
          where('type', '==', 'COMPLIANCE_VIOLATION'),
          where('severity', '==', filters.severity),
          where('timestamp', '>=', daysAgo),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ComplianceViolation[];

      // Client-side filtering for violation type and feature
      let filtered = data;
      
      if (filters.violationType !== 'ALL') {
        filtered = filtered.filter((v) => v.subType === filters.violationType);
      }
      
      if (filters.feature !== 'ALL') {
        filtered = filtered.filter((v) => {
          const monetizationType = v.details?.monetizationType || '';
          return monetizationType === filters.feature;
        });
      }

      setViolations(filtered);
    } catch (error) {
      console.error('Failed to load compliance violations:', error);
    } finally {
      setLoading(false);
    }
  }

  // =============================================================================
  // STATS CALCULATION
  // =============================================================================

  const stats = {
    total: violations.length,
    critical: violations.filter((v) => v.severity === 'CRITICAL').length,
    high: violations.filter((v) => v.severity === 'HIGH').length,
    medium: violations.filter((v) => v.severity === 'MEDIUM').length,
    low: violations.filter((v) => v.severity === 'LOW').length,
  };

  const violationsByType = violations.reduce((acc, v) => {
    acc[v.subType] = (acc[v.subType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-600 bg-red-50';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50';
      case 'LOW':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  }

  function formatTimestamp(timestamp: Timestamp): string {
    return timestamp.toDate().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getViolationTypeLabel(subType: string): string {
    const labels: Record<string, string> = {
      TOKENOMICS_INVARIANT_VIOLATION: 'Tokenomics Violation',
      AGE_VERIFICATION_VIOLATION: 'Age / Verification',
      CONTENT_POLICY_VIOLATION: 'Content Policy',
    };
    return labels[subType] || subType;
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🛡️ Compliance Dashboard
          </h1>
          <p className="text-gray-600">
            PACK 418 — Safety & Compliance Regression Guardrails
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Total Violations</div>
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Critical</div>
            <div className="text-3xl font-bold text-red-600">{stats.critical}</div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">High</div>
            <div className="text-3xl font-bold text-orange-600">{stats.high}</div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Medium</div>
            <div className="text-3xl font-bold text-yellow-600">{stats.medium}</div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Low</div>
            <div className="text-3xl font-bold text-blue-600">{stats.low}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Time Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Range
              </label>
              <select
                value={filters.timeRange}
                onChange={(e) =>
                  setFilters({ ...filters, timeRange: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>

            {/* Violation Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Violation Type
              </label>
              <select
                value={filters.violationType}
                onChange={(e) =>
                  setFilters({ ...filters, violationType: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="ALL">All Types</option>
                <option value="TOKENOMICS_INVARIANT_VIOLATION">Tokenomics</option>
                <option value="AGE_VERIFICATION_VIOLATION">Age / Verification</option>
                <option value="CONTENT_POLICY_VIOLATION">Content Policy</option>
              </select>
            </div>

            {/* Feature */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Feature
              </label>
              <select
                value={filters.feature}
                onChange={(e) => setFilters({ ...filters, feature: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="ALL">All Features</option>
                <option value="CHAT">Chat</option>
                <option value="CALL">Calls</option>
                <option value="MEETING">Meetings</option>
                <option value="EVENT">Events</option>
                <option value="TIP">Tips</option>
                <option value="AI_COMPANION">AI Companions</option>
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Severity
              </label>
              <select
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Violations by Type */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Violations by Type
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(violationsByType).map(([type, count]) => (
              <div key={type} className="p-4 border border-gray-200 rounded-md">
                <div className="text-sm text-gray-600 mb-1">
                  {getViolationTypeLabel(type)}
                </div>
                <div className="text-2xl font-bold text-gray-900">{count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Violations List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Violations
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-600">
              Loading violations...
            </div>
          ) : violations.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No violations found for the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {violations.map((violation) => (
                <div key={violation.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getSeverityColor(
                            violation.severity
                          )}`}
                        >
                          {violation.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {getViolationTypeLabel(violation.subType)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatTimestamp(violation.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="bg-gray-50 p-4 rounded-md mb-3">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(violation.details, null, 2)}
                    </pre>
                  </div>

                  {/* Action Links */}
                  <div className="flex gap-4">
                    <a
                      href={`/admin/audit-logs/${violation.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View Audit Log →
                    </a>
                    {violation.details?.userId && (
                      <a
                        href={`/admin/users/${violation.details.userId}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        View User Profile →
                      </a>
                    )}
                    {violation.details?.incidentId && (
                      <a
                        href={`/admin/incidents/${violation.details.incidentId}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        View Incident →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
