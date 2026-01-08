/**
 * PACK 305 — Legal & Audit Snapshot Export
 * Admin UI: Snapshots List Component
 */

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface LegalSnapshot {
  snapshotId: string;
  type: 'INVESTOR_OVERVIEW' | 'REGULATOR_OVERVIEW' | 'INTERNAL_COMPLIANCE';
  requestedByAdminId: string;
  requestedAt: string;
  period: {
    from: string;
    to: string;
  };
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  fileUrl: string | null;
  fileFormat: 'PDF' | 'ZIP' | 'JSON';
  errorMessage?: string | null;
}

export const SnapshotsList: React.FC = () => {
  const [snapshots, setSnapshots] = useState<LegalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    type?: string;
    status?: string;
  }>({});

  const functions = getFunctions();

  const loadSnapshots = async () => {
    try {
      setLoading(true);
      setError(null);

      const listSnapshots = httpsCallable(functions, 'listLegalSnapshots');
      const result = await listSnapshots(filter);

      if (result.data && typeof result.data === 'object' && 'snapshots' in result.data) {
        setSnapshots((result.data as any).snapshots || []);
      }
    } catch (err: any) {
      console.error('Error loading snapshots:', err);
      setError(err.message || 'Failed to load snapshots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, [filter]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'READY':
        return 'bg-green-100 text-green-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'INVESTOR_OVERVIEW':
        return 'bg-purple-100 text-purple-800';
      case 'REGULATOR_OVERVIEW':
        return 'bg-indigo-100 text-indigo-800';
      case 'INTERNAL_COMPLIANCE':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading snapshots...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Legal Snapshots</h2>
        <p className="text-gray-600 mt-1">
          Manage and download legal & audit snapshot exports
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filter.type || ''}
          onChange={(e) => setFilter({ ...filter, type: e.target.value || undefined })}
          className="border rounded-lg px-4 py-2"
        >
          <option value="">All Types</option>
          <option value="INVESTOR_OVERVIEW">Investor Overview</option>
          <option value="REGULATOR_OVERVIEW">Regulator Overview</option>
          <option value="INTERNAL_COMPLIANCE">Internal Compliance</option>
        </select>

        <select
          value={filter.status || ''}
          onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })}
          className="border rounded-lg px-4 py-2"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="READY">Ready</option>
          <option value="FAILED">Failed</option>
        </select>

        <button
          onClick={loadSnapshots}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Snapshots Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Format
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Requested
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {snapshots.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No snapshots found
                </td>
              </tr>
            ) : (
              snapshots.map((snapshot) => (
                <tr key={snapshot.snapshotId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeClass(snapshot.type)}`}>
                      {snapshot.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>{new Date(snapshot.period.from).toLocaleDateString()}</div>
                    <div className="text-gray-500">to {new Date(snapshot.period.to).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(snapshot.status)}`}>
                      {snapshot.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {snapshot.fileFormat}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(snapshot.requestedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {snapshot.status === 'READY' && snapshot.fileUrl ? (
                      <a
                        href={snapshot.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Download
                      </a>
                    ) : snapshot.status === 'FAILED' ? (
                      <span className="text-red-600" title={snapshot.errorMessage || ''}>
                        Error
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};