/**
 * PHASE 3.3 — Admin Trust & Safety Page (READ-ONLY)
 * 
 * View trust signals and safety monitoring.
 * NO write operations — READ-ONLY monitoring.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { getTrustSignals, getTrustSignalCounts } from '@/lib/services/phase33';
import type { TrustSignalCounts } from '@/lib/services/phase33';
import type { TrustSignal } from '@/types/phase33.types';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'ALL';

function SeverityBadge({ severity }: { severity: TrustSignal['severity'] }) {
  const styles = {
    LOW: 'bg-blue-900 text-blue-300',
    MEDIUM: 'bg-yellow-900 text-yellow-300',
    HIGH: 'bg-orange-900 text-orange-300',
    CRITICAL: 'bg-red-900 text-red-300 animate-pulse',
  };
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[severity]}`}>
      {severity}
    </span>
  );
}

export default function AdminTrustPage() {
  const [signals, setSignals] = useState<TrustSignal[]>([]);
  const [counts, setCounts] = useState<TrustSignalCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Severity>('ALL');
  
  useEffect(() => {
    async function fetchData() {
      try {
        const [signalsData, countsData] = await Promise.all([
          getTrustSignals(),
          getTrustSignalCounts(),
        ]);
        setSignals(signalsData);
        setCounts(countsData);
      } catch (err) {
        console.error('Error loading trust data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const filteredSignals = signals.filter((s) => {
    if (filter === 'ALL') return true;
    return s.severity === filter;
  });
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-700 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-gray-700 rounded-lg" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trust & Safety Signals</h1>
        <p className="text-gray-400 mt-1">Active trust signals and safety monitoring (read-only)</p>
      </div>
      
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setFilter('CRITICAL')}
            className={`p-4 rounded-xl border transition ${
              filter === 'CRITICAL' ? 'bg-red-900/50 border-red-600' : 'bg-gray-800 border-gray-700 hover:border-red-600'
            }`}
          >
            <div className="text-2xl font-bold text-red-400">{counts.critical}</div>
            <div className="text-sm text-gray-400">Critical</div>
          </button>
          
          <button
            onClick={() => setFilter('HIGH')}
            className={`p-4 rounded-xl border transition ${
              filter === 'HIGH' ? 'bg-orange-900/50 border-orange-600' : 'bg-gray-800 border-gray-700 hover:border-orange-600'
            }`}
          >
            <div className="text-2xl font-bold text-orange-400">{counts.high}</div>
            <div className="text-sm text-gray-400">High</div>
          </button>
          
          <button
            onClick={() => setFilter('MEDIUM')}
            className={`p-4 rounded-xl border transition ${
              filter === 'MEDIUM' ? 'bg-yellow-900/50 border-yellow-600' : 'bg-gray-800 border-gray-700 hover:border-yellow-600'
            }`}
          >
            <div className="text-2xl font-bold text-yellow-400">{counts.medium}</div>
            <div className="text-sm text-gray-400">Medium</div>
          </button>
          
          <button
            onClick={() => setFilter('ALL')}
            className={`p-4 rounded-xl border transition ${
              filter === 'ALL' ? 'bg-gray-700 border-gray-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="text-2xl font-bold text-white">{counts.total}</div>
            <div className="text-sm text-gray-400">Total Active</div>
          </button>
        </div>
      )}
      
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        {filteredSignals.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">✅</div>
            <p className="text-gray-400">No active signals{filter !== 'ALL' ? ` with ${filter} severity` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filteredSignals.map((signal, index) => (
              <div key={index} className="p-4 hover:bg-gray-700/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <SeverityBadge severity={signal.severity} />
                      <span className="text-sm text-gray-300">
                        {signal.signalType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">{signal.description}</p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>User: {signal.userId.substring(0, 8)}...</span>
                      <span>Created: {signal.createdAt.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-medium text-yellow-300">Read-Only Monitoring</h3>
            <p className="text-sm text-yellow-400/80 mt-1">
              Trust signals are for monitoring only. Resolution of signals, account actions, 
              and fraud investigations must be performed through the Trust & Safety Admin API 
              with proper audit logging.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


