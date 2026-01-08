/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Admin incident list and filter page
 */

import { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  where, 
  getDocs, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../../src/firebase';
import Link from 'next/link';

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3';
  status: string;
  source: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  ownerId?: string;
  affectedFeatures: string[];
  fraudRelated?: boolean;
  safetyRelated?: boolean;
}

const SEVERITY_COLORS = {
  SEV0: 'bg-red-100 text-red-800 border-red-300',
  SEV1: 'bg-orange-100 text-orange-800 border-orange-300',
  SEV2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  SEV3: 'bg-blue-100 text-blue-800 border-blue-300',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-50 text-red-700 border-red-200',
  INVESTIGATING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  MITIGATED: 'bg-blue-50 text-blue-700 border-blue-200',
  MONITORING: 'bg-purple-50 text-purple-700 border-purple-200',
  RESOLVED: 'bg-green-50 text-green-700 border-green-200',
  POSTMORTEM_REQUIRED: 'bg-orange-50 text-orange-700 border-orange-200',
  POSTMORTEM_COMPLETE: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    severity: 'ALL',
    status: 'ALL',
    source: 'ALL',
    fraudRelated: false,
    safetyRelated: false,
  });

  useEffect(() => {
    loadIncidents();
  }, [filters]);

  async function loadIncidents() {
    try {
      setLoading(true);
      let q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));

      // Apply filters
      if (filters.severity !== 'ALL') {
        q = query(q, where('severity', '==', filters.severity));
      }
      if (filters.status !== 'ALL') {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters.source !== 'ALL') {
        q = query(q, where('source', '==', filters.source));
      }
      if (filters.fraudRelated) {
        q = query(q, where('fraudRelated', '==', true));
      }
      if (filters.safetyRelated) {
        q = query(q, where('safetyRelated', '==', true));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident));
      setIncidents(data);
    } catch (error) {
      console.error('Error loading incidents:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp: Timestamp): string {
    return timestamp.toDate().toLocaleString();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Incident Management</h1>
          <p className="mt-2 text-gray-600">
            Monitor and manage platform incidents, outages, and escalations
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Severity
              </label>
              <select
                value={filters.severity}
                onChange={e => setFilters({ ...filters, severity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="SEV0">SEV0</option>
                <option value="SEV1">SEV1</option>
                <option value="SEV2">SEV2</option>
                <option value="SEV3">SEV3</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="OPEN">Open</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="MITIGATED">Mitigated</option>
                <option value="MONITORING">Monitoring</option>
                <option value="RESOLVED">Resolved</option>
                <option value="POSTMORTEM_REQUIRED">Postmortem Required</option>
                <option value="POSTMORTEM_COMPLETE">Postmortem Complete</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <select
                value={filters.source}
                onChange={e => setFilters({ ...filters, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="MONITORING">Monitoring</option>
                <option value="SUPPORT_TICKET">Support Ticket</option>
                <option value="FRAUD_ENGINE">Fraud Engine</option>
                <option value="SAFETY_ENGINE">Safety Engine</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.fraudRelated}
                  onChange={e => setFilters({ ...filters, fraudRelated: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Fraud Related</span>
              </label>
            </div>

            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.safetyRelated}
                  onChange={e => setFilters({ ...filters, safetyRelated: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Safety Related</span>
              </label>
            </div>
          </div>
        </div>

        {/* Incidents List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Incidents ({incidents.length})</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading incidents...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No incidents found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {incidents.map(incident => (
                    <tr key={incident.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        <Link href={`/incidents/${incident.id}`}>
                          {incident.id}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {incident.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded border ${SEVERITY_COLORS[incident.severity]}`}>
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded border ${STATUS_COLORS[incident.status] || 'bg-gray-100 text-gray-800'}`}>
                          {incident.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {incident.source.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(incident.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {incident.fraudRelated && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mr-1">
                            Fraud
                          </span>
                        )}
                        {incident.safetyRelated && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Safety
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
