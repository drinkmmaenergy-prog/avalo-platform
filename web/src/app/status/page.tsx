'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '../../components/GlassCard';

export default function StatusPage() {
  const [status, setStatus] = useState<'operational' | 'degraded' | 'down'>('operational');
  const [lastChecked, setLastChecked] = useState<string>('');

  useEffect(() => {
    setLastChecked(new Date().toLocaleString());
    // In a real app, this would check actual service status
    setStatus('operational');
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'operational':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'down':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'operational':
        return 'All Systems Operational';
      case 'degraded':
        return 'Degraded Performance';
      case 'down':
        return 'Service Unavailable';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-8">System Status</h1>
        
        <GlassCard className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Current Status</h2>
            <span className={`text-xl font-semibold ${getStatusColor()}`}>
              ● {getStatusText()}
            </span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Last checked: {lastChecked}
          </p>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">API Services</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Core backend services</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Database</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Data storage and retrieval</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Authentication</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">User login and registration</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Messaging</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Real-time chat functionality</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Media Storage</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Image and video uploads</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">AI Services</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">AI companions and matching</p>
              </div>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Recent Incidents</h2>
          <p className="text-gray-600 dark:text-gray-400">
            No incidents reported in the last 30 days. All systems are running smoothly.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}