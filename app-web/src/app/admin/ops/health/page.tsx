'use client';

/**
 * PHASE 3.3 — Admin System Health Page (READ-ONLY)
 * 
 * View system health metrics and service status.
 * NO write operations — READ-ONLY monitoring.
 */
import React, { useEffect, useState } from 'react';
import { getSystemHealth } from '@/lib/services/phase33';
import type { SystemHealthMetric } from '@/types/phase33.types';

function StatusBadge({ status }: { status: SystemHealthMetric['status'] }) {
  const config = {
    HEALTHY: { bg: 'bg-green-900', text: 'text-green-300', label: 'Healthy' },
    DEGRADED: { bg: 'bg-yellow-900', text: 'text-yellow-300', label: 'Degraded' },
    DOWN: { bg: 'bg-red-900', text: 'text-red-300', label: 'Down' },
  };
  
  const { bg, text, label } = config[status];
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}

function MetricBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
    </div>
  );
}

export default function AdminHealthPage() {
  const [health, setHealth] = useState<SystemHealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  async function fetchData() {
    try {
      const data = await getSystemHealth();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error loading health data:', err);
    } finally {
      setLoading(false);
    }
  }
  
  useEffect(() => {
    fetchData();
    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-gray-700 rounded-lg" />
        ))}
      </div>
    );
  }
  
  const overallStatus = health.every((s) => s.status === 'HEALTHY')
    ? 'HEALTHY'
    : health.some((s) => s.status === 'DOWN')
    ? 'DOWN'
    : 'DEGRADED';
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-gray-400 mt-1">Service status and performance metrics (read-only)</p>
        </div>
        <div className="text-right">
          <StatusBadge status={overallStatus} />
          <p className="text-xs text-gray-500 mt-2">
            Refreshed: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </div>
      
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-900">
          <div className="grid grid-cols-5 gap-4 text-xs font-medium text-gray-400 uppercase">
            <div className="col-span-2">Service</div>
            <div>Status</div>
            <div>Latency</div>
            <div>Error Rate</div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-700">
          {health.map((service) => {
            const latencyColor = service.latencyMs < 100 ? 'bg-green-500' : service.latencyMs < 500 ? 'bg-yellow-500' : 'bg-red-500';
            const errorColor = service.errorRate < 0.01 ? 'bg-green-500' : service.errorRate < 0.05 ? 'bg-yellow-500' : 'bg-red-500';
            
            return (
              <div key={service.service} className="px-6 py-4 hover:bg-gray-700/50">
                <div className="grid grid-cols-5 gap-4 items-center">
                  <div className="col-span-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        service.status === 'HEALTHY' ? 'bg-green-500' :
                        service.status === 'DEGRADED' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="text-gray-200 font-medium">{service.service}</span>
                    </div>
                  </div>
                  
                  <div>
                    <span className={`text-sm ${
                      service.status === 'HEALTHY' ? 'text-green-400' :
                      service.status === 'DEGRADED' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {service.status}
                    </span>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-300 w-16">{service.latencyMs}ms</span>
                      <div className="flex-1">
                        <MetricBar value={service.latencyMs} max={1000} color={latencyColor} />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-300 w-16">{(service.errorRate * 100).toFixed(2)}%</span>
                      <div className="flex-1">
                        <MetricBar value={service.errorRate * 100} max={10} color={errorColor} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="text-sm text-gray-400 mb-1">Avg Latency</div>
          <div className="text-2xl font-bold text-white">
            {Math.round(health.reduce((a, b) => a + b.latencyMs, 0) / health.length || 0)}ms
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="text-sm text-gray-400 mb-1">Avg Error Rate</div>
          <div className="text-2xl font-bold text-white">
            {((health.reduce((a, b) => a + b.errorRate, 0) / health.length || 0) * 100).toFixed(3)}%
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="text-sm text-gray-400 mb-1">Services Monitored</div>
          <div className="text-2xl font-bold text-white">{health.length}</div>
        </div>
      </div>
      
      <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-300">Monitoring Notes</h3>
            <p className="text-sm text-blue-400/80 mt-1">
              Health metrics are collected from Cloud Monitoring and internal health checks. 
              Data refreshes automatically every 15 seconds. For incident response, refer to 
              the on-call playbook and contact the SRE team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


