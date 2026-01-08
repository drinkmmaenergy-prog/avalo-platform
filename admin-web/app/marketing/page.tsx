'use client';

/**
 * PACK 373 — MARKETING CONTROL PANEL
 * Main dashboard for marketing automation
 */

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  doc, 
  updateDoc,
  Timestamp 
} from 'firebase/firestore';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  AlertTriangle,
  Play,
  Pause,
  BarChart3
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  country: string;
  status: string;
  dailyBudget: number;
  totalSpend: number;
  totalInstalls: number;
  validatedInstalls: number;
  fraudInstalls: number;
  cpi: number;
  ltv: number;
  roas: number;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  createdAt: Timestamp;
  resolved: boolean;
  [key: string]: any;
}

export default function MarketingControlPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState({
    totalSpend: 0,
    totalInstalls: 0,
    avgCPI: 0,
    avgROAS: 0,
    activeAlerts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load campaigns
      const campaignsSnapshot = await getDocs(
        query(collection(db, 'adCampaigns'), orderBy('roas', 'desc'))
      );
      
      const campaignData: Campaign[] = [];
      let totalSpend = 0;
      let totalInstalls = 0;
      let totalCPI = 0;
      let totalROAS = 0;
      
      campaignsSnapshot.forEach(doc => {
        const data = doc.data();
        const campaign: Campaign = {
          id: doc.id,
          name: data.name || doc.id,
          platform: data.platform,
          country: data.country,
          status: data.status,
          dailyBudget: data.dailyBudget || 0,
          totalSpend: data.totalSpend || 0,
          totalInstalls: data.totalInstalls || 0,
          validatedInstalls: data.validatedInstalls || 0,
          fraudInstalls: data.fraudInstalls || 0,
          cpi: data.cpi || 0,
          ltv: data.ltv || 0,
          roas: data.roas || 0
        };
        
        campaignData.push(campaign);
        totalSpend += campaign.totalSpend;
        totalInstalls += campaign.totalInstalls;
        totalCPI += campaign.cpi;
        totalROAS += campaign.roas;
      });
      
      setCampaigns(campaignData);
      
      // Load alerts
      const alertsSnapshot = await getDocs(
        query(
          collection(db, 'marketingAlerts'),
          where('resolved', '==', false),
          orderBy('createdAt', 'desc')
        )
      );
      
      const alertData: Alert[] = [];
      alertsSnapshot.forEach(doc => {
        alertData.push({ id: doc.id, ...doc.data() } as Alert);
      });
      
      setAlerts(alertData);
      
      // Calculate stats
      const campaignCount = campaignData.length || 1;
      setStats({
        totalSpend,
        totalInstalls,
        avgCPI: totalCPI / campaignCount,
        avgROAS: totalROAS / campaignCount,
        activeAlerts: alertData.length
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading marketing data:', error);
      setLoading(false);
    }
  };

  const toggleCampaign = async (campaignId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      await updateDoc(doc(db, 'adCampaigns', campaignId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
      
      // Reload data
      loadData();
    } catch (error) {
      console.error('Error toggling campaign:', error);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'marketingAlerts', alertId), {
        resolved: true,
        resolvedAt: Timestamp.now()
      });
      
      // Reload data
      loadData();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading marketing data...</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Marketing Control Panel
          </h1>
          <p className="text-gray-600">
            PACK 373 — Real-time ROI monitoring and fraud protection
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Spend</span>
              <DollarSign className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              ${stats.totalSpend.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Installs</span>
              <Users className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.totalInstalls.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Avg CPI</span>
              <TrendingUp className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              ${stats.avgCPI.toFixed(2)}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Avg ROAS</span>
              <BarChart3 className="w-5 h-5 text-orange-500" />
            </div>
            <div className={`text-2xl font-bold ${stats.avgROAS >= 1 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.avgROAS.toFixed(2)}x
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Active Alerts</span>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className={`text-2xl font-bold ${stats.activeAlerts > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {stats.activeAlerts}
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Active Alerts
            </h2>
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className="bg-white rounded p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {alert.type.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {alert.reason || alert.type}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {alert.createdAt?.toDate().toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Active Campaigns
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Country
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Installs
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPI
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    LTV
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ROAS
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fraud %
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns.map(campaign => {
                  const fraudRate = campaign.totalInstalls > 0 
                    ? (campaign.fraudInstalls / campaign.totalInstalls) * 100 
                    : 0;
                  
                  return (
                    <tr key={campaign.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {campaign.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 capitalize">
                          {campaign.platform}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {campaign.country}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          campaign.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {campaign.validatedInstalls} / {campaign.totalInstalls}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ${campaign.cpi.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ${campaign.ltv.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-semibold ${
                          campaign.roas >= 1 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {campaign.roas.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-semibold ${
                          fraudRate > 15 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {fraudRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleCampaign(campaign.id, campaign.status)}
                          className={`inline-flex items-center px-3 py-1 rounded ${
                            campaign.status === 'active'
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {campaign.status === 'active' ? (
                            <>
                              <Pause className="w-4 h-4 mr-1" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-1" />
                              Resume
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
