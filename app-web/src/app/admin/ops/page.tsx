'use client';

/**
 * PHASE 3.3 — Admin Ops Overview Page (READ-ONLY)
 * 
 * Combined view of feature flags, trust signals, and system health.
 * NO write operations — READ-ONLY monitoring.
 * 
 * Backend sources:
 * - featureFlags collection (Firestore read)
 * - trust_signals collection (Firestore read)
 * - getSystemHealth function
 */
import React, { useEffect, useState } from 'react';
import { getAdminOpsView } from '@/lib/services/phase33';
import type { AdminOpsView } from '@/types/phase33.types';

function StatusDot({ status }: { status: 'HEALTHY' | 'DEGRADED' | 'DOWN' }) {
  const colors = {
    HEALTHY: 'bg-green-500',
    DEGRADED: 'bg-yellow-500',
    DOWN: 'bg-red-500',
  };
  
  return (
    <span className={`inline-block w-3 h-3 rounded-full ${colors[status]} animate-pulse`} />
  );
}

function SeverityBadge({ severity }: { severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const styles = {
    LOW: 'bg-blue-900 text-blue-300',
    MEDIUM: 'bg-yellow-900 text-yellow-300',
    HIGH: 'bg-orange-900 text-orange-300',
    CRITICAL: 'bg-red-900 text-red-300',
  };
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[severity]}`}>
      {severity}
    </span>
  );
}

export default function AdminOpsOverviewPage() {
  const [data, setData] = useState<AdminOpsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const opsView = await getAdminOpsView();
        setData(opsView);
      } catch (err: any) {
        setError(err.message || 'Failed to load ops data');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-700 rounded w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-300 mb-2">Error Loading Ops Data</h2>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }
  
  if (!data) return null;
  
  const healthyServices = data.systemHealth.filter((s) => s.status === 'HEALTHY').length;
  const totalServices = data.systemHealth.length;
  const enabledFlags = data.featureFlags.filter((f) => f.enabled).length;
  const criticalSignals = data.trustSignals.filter((s) => s.severity === 'CRITICAL').length;
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ops Overview</h1>
          <p className="text-gray-400 mt-1">System status and monitoring (read-only)</p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {data.snapshotTime.toLocaleTimeString()}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl">💚</span>
            <StatusDot status={healthyServices === totalServices ? 'HEALTHY' : 'DEGRADED'} />
          </div>
          <div className="text-2xl font-bold text-white">
            {healthyServices}/{totalServices}
          </div>
          <div className="text-sm text-gray-400">Services Healthy</div>
          <a
            href="/admin/ops/health"
            className="mt-4 inline-block text-sm text-green-400 hover:text-green-300"
          >
            View details →
          </a>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl">🚩</span>
            <span className="text-sm text-gray-500">Active</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {enabledFlags}/{data.featureFlags.length}
          </div>
          <div className="text-sm text-gray-400">Feature Flags Enabled</div>
          <a
            href="/admin/ops/flags"
            className="mt-4 inline-block text-sm text-green-400 hover:text-green-300"
          >
            View flags →
          </a>
        </div>
        
        <div className={`rounded-xl p-6 border ${
          criticalSignals > 0 
            ? 'bg-red-900/30 border-red-700' 
            : 'bg-gray-800 border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl">🛡️</span>
            {criticalSignals > 0 && (
              <span className="text-xs bg-red-600 text-white px-2 py-1 rounded animate-pulse">
                ATTENTION
              </span>
            )}
          </div>
          <div className={`text-2xl font-bold ${criticalSignals > 0 ? 'text-red-400' : 'text-white'}`}>
            {data.trustSignals.length}
          </div>
          <div className="text-sm text-gray-400">Active Trust Signals</div>
          <a
            href="/admin/ops/trust"
            className="mt-4 inline-block text-sm text-green-400 hover:text-green-300"
          >
            View signals →
          </a>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">System Health</h2>
          <div className="space-y-3">
            {data.systemHealth.slice(0, 5).map((service) => (
              <div
                key={service.service}
                className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={service.status} />
                  <span className="text-gray-200">{service.service}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {service.latencyMs}ms | {(service.errorRate * 100).toFixed(1)}% err
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Trust Signals</h2>
          {data.trustSignals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">✅</div>
              <p>No active trust signals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.trustSignals.slice(0, 5).map((signal, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={signal.severity} />
                      <span className="text-sm text-gray-300 truncate">
                        {signal.signalType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {signal.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-medium text-yellow-300">Read-Only View</h3>
            <p className="text-sm text-yellow-400/80 mt-1">
              This admin panel is read-only. No modifications to feature flags, user accounts, 
              or wallet balances can be made from this interface. All write operations must go 
              through the appropriate admin APIs with proper audit trails.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


