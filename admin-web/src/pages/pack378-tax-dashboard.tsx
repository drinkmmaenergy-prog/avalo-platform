/**
 * PACK 378 — Tax & Compliance Dashboard
 * Admin panel for managing global tax compliance
 */

import React, { useState, useEffect } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

interface TaxProfile {
  id?: string;
  countryCode: string;
  vatRate: number;
  digitalServicesTax: number;
  creatorIncomeTaxEstimate: number;
  payoutWithholdingEnabled: boolean;
  requiresInvoice: boolean;
  effectiveFrom: Date;
  vatMossEnabled: boolean;
  reverseChargeEnabled: boolean;
  withholdingRate: number;
  withholdingThreshold: number;
}

export default function TaxDashboard() {
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [stats, setStats] = useState({
    totalVATCollected: 0,
    totalWithholdings: 0,
    activeCountries: 0,
    pendingReports: 0
  });

  useEffect(() => {
    loadTaxProfiles();
    loadStats();
  }, []);

  const loadTaxProfiles = async () => {
    const q = query(collection(db, 'taxProfiles'));
    const snapshot = await getDocs(q);
    const profiles = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      effectiveFrom: doc.data().effectiveFrom?.toDate()
    })) as TaxProfile[];
    setTaxProfiles(profiles);
  };

  const loadStats = async () => {
    // Load VAT stats
    const vatSnapshot = await getDocs(collection(db, 'vatRecords'));
    const totalVAT = vatSnapshot.docs.reduce((sum, doc) => sum + (doc.data().vatAmount || 0), 0);

    // Load withholding stats
    const withholdingSnapshot = await getDocs(collection(db, 'taxWithholdings'));
    const totalWithholdings = withholdingSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

    // Count active countries
    const profilesSnapshot = await getDocs(collection(db, 'taxProfiles'));
    const activeCountries = new Set(profilesSnapshot.docs.map(doc => doc.data().countryCode)).size;

    // Count pending exports
    const q = query(collection(db, 'taxAuditExports'), where('status', '==', 'pending'));
    const pendingSnapshot = await getDocs(q);

    setStats({
      totalVATCollected: totalVAT,
      totalWithholdings,
      activeCountries,
      pendingReports: pendingSnapshot.size
    });
  };

  const generateReport = async (reportType: string) => {
    const generateExport = httpsCallable(functions, 'pack378_generateTaxAuditExports');
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    try {
      const result = await generateExport({
        exportType: reportType,
        periodStart: startOfMonth.toISOString(),
        periodEnd: now.toISOString(),
        countries: [],
        format: 'csv'
      });
      
      alert('Report generation started. You will be notified when ready.');
    } catch (error) {
      console.error('Report generation failed:', error);
      alert('Failed to generate report');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tax & Compliance Dashboard</h1>
        <p className="text-gray-600 mt-2">PACK 378 — Global Payments, Tax, VAT & Legal Compliance</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total VAT Collected"
          value={`$${stats.totalVATCollected.toLocaleString()}`}
          icon="💰"
          color="green"
        />
        <StatCard
          title="Total Withholdings"
          value={`$${stats.totalWithholdings.toLocaleString()}`}
          icon="📊"
          color="blue"
        />
        <StatCard
          title="Active Countries"
          value={stats.activeCountries}
          icon="🌍"
          color="purple"
        />
        <StatCard
          title="Pending Reports"
          value={stats.pendingReports}
          icon="📄"
          color="amber"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionButton
            label="VAT Report"
            onClick={() => generateReport('vat_report')}
            icon="📊"
          />
          <ActionButton
            label="Payout Tax"
            onClick={() => generateReport('payout_tax')}
            icon="💵"
          />
          <ActionButton
            label="Profit Statement"
            onClick={() => generateReport('profit_statement')}
            icon="📈"
          />
          <ActionButton
            label="Fraud Risk Report"
            onClick={() => generateReport('fraud_tax_risk')}
            icon="⚠️"
          />
        </div>
      </div>

      {/* Tax Profiles */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Tax Profiles by Country</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Add Country
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">VAT Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DST</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Withholding</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">VAT MOSS</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {taxProfiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium">{profile.countryCode}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{profile.vatRate}%</td>
                  <td className="px-6 py-4 whitespace-nowrap">{profile.digitalServicesTax}%</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {profile.payoutWithholdingEnabled ? `${profile.withholdingRate}%` : 'No'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {profile.vatMossEnabled ? '✓' : '✗'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button className="text-red-600 hover:text-red-800">Disable</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DSA Compliance Alerts */}
      <div className="bg-white rounded-lg shadow-md p-6 mt-8">
        <h2 className="text-xl font-semibold mb-4">DSA Compliance Alerts</h2>
        <DSAComplianceList />
      </div>
    </div>
  );
}

// Sub-components

function StatCard({ title, value, icon, color }: any) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className={`${colors[color]} border rounded-lg p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, icon }: any) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <span className="text-3xl mb-2">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}

function DSAComplianceList() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    const q = query(
      collection(db, 'dsaComplianceLogs'),
      where('priority', 'in', ['high', 'critical'])
    );
    const snapshot = await getDocs(q);
    const alertsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setAlerts(alertsData.slice(0, 10)); // Show latest 10
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No critical compliance alerts</p>
        <p className="text-sm mt-2">✓ All systems compliant</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div key={alert.id} className="flex items-start p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex-shrink-0">
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="ml-4 flex-1">
            <p className="font-medium text-red-900">{alert.eventType}</p>
            <p className="text-sm text-red-700 mt-1">{alert.description}</p>
            <p className="text-xs text-red-600 mt-2">
              Priority: {alert.priority} | {new Date(alert.timestamp?.toDate()).toLocaleString()}
            </p>
          </div>
          <button className="ml-4 text-sm text-red-600 hover:text-red-800">View</button>
        </div>
      ))}
    </div>
  );
}
