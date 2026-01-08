/**
 * PACK 368 — LAUNCH CONTROL DASHBOARD
 * 
 * Admin interface for managing global launch phases, UA campaigns,
 * and monitoring launch health metrics
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface DashboardData {
  totalCountries: number;
  byPhase: {
    CLOSED: number;
    SOFT: number;
    OPEN: number;
    SCALE: number;
  };
  totalInstalls: number;
  totalRevenue: number;
  totalSpent: number;
  avgCPI: number;
  avgROAS: number;
  activeCampaigns: number;
  activeAlerts: number;
}

interface GeoPhase {
  id: string;
  countryCode: string;
  phase: 'CLOSED' | 'SOFT' | 'OPEN' | 'SCALE';
  dailyInstallCap: number;
  adBudgetCap: number;
  KYCRequired: boolean;
  payoutEnabled: boolean;
}

export const LaunchDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [geoPhases, setGeoPhases] = useState<GeoPhase[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Subscribe to dashboard data
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'launchDashboard', 'current'),
      (snapshot) => {
        if (snapshot.exists()) {
          setDashboardData(snapshot.data() as DashboardData);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to geo phases
  useEffect(() => {
    const q = query(
      collection(db, 'geoLaunchPhases'),
      orderBy('countryCode', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const phases = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeoPhase[];
      setGeoPhases(phases);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to active alerts
  useEffect(() => {
    const q = query(
      collection(db, 'launchAlerts'),
      where('acknowledged', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAlerts(alertList);
    });

    return () => unsubscribe();
  }, []);

  // Handle phase change
  const handlePhaseChange = async (countryCode: string, newPhase: string) => {
    try {
      await updateDoc(doc(db, 'geoLaunchPhases', countryCode), {
        phase: newPhase,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error updating phase:', error);
      alert('Failed to update phase');
    }
  };

  // Handle alert acknowledgement
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'launchAlerts', alertId), {
        acknowledged: true,
        acknowledgedAt: new Date()
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Launch Control Dashboard</h1>
        <p className="text-gray-600 mt-2">PACK 368 — Global Market Expansion Engine</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Total Countries"
          value={dashboardData.totalCountries}
          icon="🌍"
          color="blue"
        />
        <KPICard
          title="Total Installs"
          value={dashboardData.totalInstalls.toLocaleString()}
          icon="📱"
          color="green"
        />
        <KPICard
          title="Avg ROAS"
          value={`${dashboardData.avgROAS.toFixed(2)}x`}
          icon="💰"
          color="purple"
          trend={dashboardData.avgROAS >= 1.5 ? 'up' : 'down'}
        />
        <KPICard
          title="Active Alerts"
          value={dashboardData.activeAlerts}
          icon="⚠️"
          color={dashboardData.activeAlerts > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Phase Distribution */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Phase Distribution</h2>
        <div className="grid grid-cols-4 gap-4">
          <PhaseCard phase="CLOSED" count={dashboardData.byPhase.CLOSED} color="gray" />
          <PhaseCard phase="SOFT" count={dashboardData.byPhase.SOFT} color="yellow" />
          <PhaseCard phase="OPEN" count={dashboardData.byPhase.OPEN} color="green" />
          <PhaseCard phase="SCALE" count={dashboardData.byPhase.SCALE} color="blue" />
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Active Alerts</h2>
          <div className="space-y-3">
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={() => handleAcknowledgeAlert(alert.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Country Management */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Country Management</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Country
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phase
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Daily Cap
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Budget Cap
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  KYC
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Payouts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {geoPhases.map(geo => (
                <tr key={geo.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {geo.countryCode}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PhaseSelector
                      currentPhase={geo.phase}
                      onChange={(phase) => handlePhaseChange(geo.countryCode, phase)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {geo.dailyInstallCap.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${geo.adBudgetCap.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge active={geo.KYCRequired} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge active={geo.payoutEnabled} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setSelectedCountry(geo.countryCode)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// CHILD COMPONENTS
// ═══════════════════════════════════════════════════════════════

const KPICard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: 'up' | 'down';
}> = ({ title, value, icon, color, trend }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-50 text-gray-600'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`text-3xl p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className={`mt-2 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
          {trend === 'up' ? '↑' : '↓'} Trending {trend}
        </div>
      )}
    </div>
  );
};

const PhaseCard: React.FC<{
  phase: string;
  count: number;
  color: string;
}> = ({ phase, count, color }) => {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700'
  };

  return (
    <div className={`p-4 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm font-medium">{phase}</div>
      <div className="text-2xl font-bold mt-1">{count}</div>
    </div>
  );
};

const PhaseSelector: React.FC<{
  currentPhase: string;
  onChange: (phase: string) => void;
}> = ({ currentPhase, onChange }) => {
  const phases = ['CLOSED', 'SOFT', 'OPEN', 'SCALE'];
  const colors = {
    CLOSED: 'bg-gray-100 text-gray-700',
    SOFT: 'bg-yellow-100 text-yellow-700',
    OPEN: 'bg-green-100 text-green-700',
    SCALE: 'bg-blue-100 text-blue-700'
  };

  return (
    <select
      value={currentPhase}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-1 rounded-full text-sm font-medium ${colors[currentPhase as keyof typeof colors]}`}
    >
      {phases.map(phase => (
        <option key={phase} value={phase}>{phase}</option>
      ))}
    </select>
  );
};

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
    active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
  }`}>
    {active ? 'Yes' : 'No'}
  </span>
);

const AlertCard: React.FC<{
  alert: any;
  onAcknowledge: () => void;
}> = ({ alert, onAcknowledge }) => {
  const severityColors = {
    LOW: 'border-blue-300 bg-blue-50',
    MEDIUM: 'border-yellow-300 bg-yellow-50',
    HIGH: 'border-orange-300 bg-orange-50',
    CRITICAL: 'border-red-300 bg-red-50'
  };

  return (
    <div className={`border-l-4 p-4 ${severityColors[alert.severity as keyof typeof severityColors]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{alert.type}</div>
          <div className="text-sm text-gray-600 mt-1">
            {JSON.stringify(alert.data)}
          </div>
        </div>
        <button
          onClick={onAcknowledge}
          className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
};

export default LaunchDashboard;
