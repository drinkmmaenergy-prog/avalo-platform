/**
 * PACK 383 - Global Payment Routing Dashboard
 * Admin dashboard for financial control and monitoring
 */

'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PayoutSummary {
  totalPending: number;
  totalProcessing: number;
  totalCompleted: number;
  totalBlocked: number;
  totalAmount: number;
}

interface RiskAlert {
  userId: string;
  type: 'aml' | 'sanctions' | 'chargeback' | 'fraud';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  timestamp: Date;
}

export default function FinanceDashboard() {
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary>({
    totalPending: 0,
    totalProcessing: 0,
    totalCompleted: 0,
    totalBlocked: 0,
    totalAmount: 0,
  });
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      // Load payout summary
      const payoutsRef = collection(db, 'payouts');
      const pendingQuery = query(payoutsRef, where('status', '==', 'pending'), limit(100));
      const processingQuery = query(payoutsRef, where('status', '==', 'processing'), limit(100));
      const completedQuery = query(payoutsRef, where('status', '==', 'completed'), limit(100));

      const [pendingSnap, processingSnap, completedSnap] = await Promise.all([
        getDocs(pendingQuery),
        getDocs(processingQuery),
        getDocs(completedQuery),
      ]);

      const summary: PayoutSummary = {
        totalPending: pendingSnap.size,
        totalProcessing: processingSnap.size,
        totalCompleted: completedSnap.size,
        totalBlocked: 0,
        totalAmount: 0,
      };

      setPayoutSummary(summary);

      // Load recent risk alerts
      const amlQuery = query(
        collection(db, 'amlScreeningResults'),
        where('status', 'in', ['review', 'blocked']),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      const amlSnap = await getDocs(amlQuery);
      const alerts: RiskAlert[] = amlSnap.docs.map(doc => {
        const data = doc.data();
        return {
          userId: data.userId,
          type: 'aml',
          severity: data.riskLevel === 'critical' ? 'critical' : 'high',
          details: `AML ${data.status}: ${data.flags?.join(', ')}`,
          timestamp: data.createdAt?.toDate() || new Date(),
        };
      });

      setRiskAlerts(alerts);
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Global Payment Control Center</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Pending Payouts"
          value={payoutSummary.totalPending}
          color="yellow"
        />
        <SummaryCard
          title="Processing"
          value={payoutSummary.totalProcessing}
          color="blue"
        />
        <SummaryCard
          title="Completed"
          value={payoutSummary.totalCompleted}
          color="green"
        />
        <SummaryCard
          title="Blocked"
          value={payoutSummary.totalBlocked}
          color="red"
        />
      </div>

      {/* Risk Alerts */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Risk Alerts</h2>
        <div className="space-y-2">
          {riskAlerts.length === 0 ? (
            <p className="text-gray-500">No current risk alerts</p>
          ) : (
            riskAlerts.map((alert, idx) => (
              <RiskAlertItem key={idx} alert={alert} />
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickActionCard
          title="Payout Queue"
          description="Review and approve pending payouts"
          href="/finance/payouts"
        />
        <QuickActionCard
          title="KYC Reviews"
          description="Review pending KYC verifications"
          href="/finance/kyc"
        />
        <QuickActionCard
          title="Risk Management"
          description="View high-risk users and alerts"
          href="/finance/risk"
        />
      </div>
    </div>
  );
}

function SummaryCard({ title, value, color }: { title: string; value: number; color: string }) {
  const colorClasses = {
    yellow: 'bg-yellow-50 border-yellow-200',
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

function RiskAlertItem({ alert }: { alert: RiskAlert }) {
  const severityColors = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${severityColors[alert.severity]}`}>
            {alert.severity.toUpperCase()}
          </span>
          <span className="text-sm font-medium">{alert.type.toUpperCase()}</span>
        </div>
        <p className="text-sm text-gray-600 mt-1">{alert.details}</p>
      </div>
      <div className="text-sm text-gray-500">
        {alert.timestamp.toLocaleDateString()}
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block p-6 bg-white rounded-lg border hover:border-blue-500 hover:shadow-md transition"
    >
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-gray-600 text-sm mt-2">{description}</p>
    </a>
  );
}
