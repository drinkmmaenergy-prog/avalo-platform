/**
 * PACK 384 — Store Defense Dashboard
 * Admin interface for monitoring store health and threats
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface ASOHealthMetric {
  timestamp: Timestamp;
  platform: 'ios' | 'android' | 'both';
  health: 'excellent' | 'good' | 'warning' | 'critical';
  averageRating: number;
  crashRate: number;
  retentionRate: number;
  dailyDownloads: number;
  dailyUninstalls: number;
  alerts: string[];
}

interface ReviewBombingDetection {
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedReviewCount: number;
  suspiciousAccountCount: number;
  averageRating: number;
  velocitySpike: number;
  reasons: string[];
}

interface TrustScoreStats {
  averageScore: number;
  distribution: Record<string, number>;
  lowTrustUsers: number;
}

export default function StoreDefenseDashboard() {
  const [asoHealth, setAsoHealth] = useState<ASOHealthMetric | null>(null);
  const [reviewBombing, setReviewBombing] = useState<ReviewBombingDetection | null>(null);
  const [trustStats, setTrustStats] = useState<TrustScoreStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'trust' | 'aso'>('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load ASO health
      const asoQuery = query(
        collection(db, 'asoHealthMetrics'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const asoSnapshot = await getDocs(asoQuery);
      if (!asoSnapshot.empty) {
        setAsoHealth(asoSnapshot.docs[0].data() as ASOHealthMetric);
      }

      // Load review bombing detection
      const bombingQuery = query(
        collection(db, 'reviewBombingDetections'),
        where('detected', '==', true),
        orderBy('detectedAt', 'desc'),
        limit(1)
      );
      const bombingSnapshot = await getDocs(bombingQuery);
      if (!bombingSnapshot.empty) {
        setReviewBombing(bombingSnapshot.docs[0].data() as ReviewBombingDetection);
      }

      // Load trust score stats
      const trustQuery = query(
        collection(db, 'publicTrustScores'),
        limit(1000)
      );
      const trustSnapshot = await getDocs(trustQuery);
      
      let totalScore = 0;
      const distribution: Record<string, number> = {
        untrusted: 0,
        new: 0,
        bronze: 0,
        silver: 0,
        gold: 0,
        platinum: 0
      };
      let lowTrustCount = 0;

      trustSnapshot.forEach(doc => {
        const data = doc.data();
        totalScore += data.score;
        distribution[data.tier]++;
        if (data.score < 300) lowTrustCount++;
      });

      setTrustStats({
        averageScore: totalScore / trustSnapshot.size,
        distribution,
        lowTrustUsers: lowTrustCount
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReviewBombingDetection = async () => {
    try {
      const detectFn = httpsCallable(functions, 'detectReviewBombing');
      const result = await detectFn({ windowHours: 24 });
      setReviewBombing(result.data as ReviewBombingDetection);
      alert('Review bombing detection complete');
    } catch (error) {
      console.error('Error detecting review bombing:', error);
      alert('Failed to run detection');
    }
  };

  const runASOHealthCheck = async () => {
    try {
      const checkFn = httpsCallable(functions, 'monitorASOHealth');
      const result = await checkFn({ platform: 'both' });
      setAsoHealth(result.data as ASOHealthMetric);
      alert('ASO health check complete');
    } catch (error) {
      console.error('Error checking ASO health:', error);
      alert('Failed to run health check');
    }
  };

  const generateDefenseDossier = async () => {
    try {
      const generateFn = httpsCallable(functions, 'generateStoreDefenseDossier');
      const result = await generateFn({ 
        platform: 'both',
        incidentType: 'review_bombing'
      });
      alert(`Defense dossier generated: ${(result.data as any).dossierId}`);
    } catch (error) {
      console.error('Error generating dossier:', error);
      alert('Failed to generate dossier');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading store defense data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Store Defense Dashboard</h1>
        <p className="text-gray-600">Monitor app store health, threats, and reputation</p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className={`p-6 rounded-lg shadow-lg ${
          asoHealth?.health === 'excellent' ? 'bg-green-100' :
          asoHealth?.health === 'good' ? 'bg-blue-100' :
          asoHealth?.health === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">ASO Health</h3>
          <div className="text-3xl font-bold capitalize">{asoHealth?.health || 'Unknown'}</div>
        </div>

        <div className={`p-6 rounded-lg shadow-lg ${
          reviewBombing?.detected ? 'bg-red-100' : 'bg-green-100'
        }`}>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Review Bombing</h3>
          <div className="text-3xl font-bold">
            {reviewBombing?.detected ? 'DETECTED' : 'Clean'}
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-lg bg-blue-100">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Avg Trust Score</h3>
          <div className="text-3xl font-bold">
            {trustStats?.averageScore.toFixed(0) || '—'}
          </div>
        </div>

        <div className={`p-6 rounded-lg shadow-lg ${
          (trustStats?.lowTrustUsers || 0) > 100 ? 'bg-yellow-100' : 'bg-green-100'
        }`}>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Low Trust Users</h3>
          <div className="text-3xl font-bold">{trustStats?.lowTrustUsers || 0}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={runReviewBombingDetection}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          Run Bombing Detection
        </button>
        <button
          onClick={runASOHealthCheck}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
        >
          Check ASO Health
        </button>
        <button
          onClick={generateDefenseDossier}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
        >
          Generate Defense Dossier
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-4">
          {['overview', 'reviews', 'trust', 'aso'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-semibold ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* ASO Alerts */}
          {asoHealth?.alerts && asoHealth.alerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-red-900 mb-4">🚨 Active Alerts</h3>
              <ul className="space-y-2">
                {asoHealth.alerts.map((alert, i) => (
                  <li key={i} className="text-red-800">{alert}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Review Bombing Status */}
          {reviewBombing?.detected && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-red-900 mb-4">⚠️ Review Bombing Detected</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Severity</div>
                  <div className="text-xl font-bold uppercase">{reviewBombing.severity}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Affected Reviews</div>
                  <div className="text-xl font-bold">{reviewBombing.affectedReviewCount}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Suspicious Accounts</div>
                  <div className="text-xl font-bold">{reviewBombing.suspiciousAccountCount}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Velocity Spike</div>
                  <div className="text-xl font-bold">{reviewBombing.velocitySpike.toFixed(1)}x</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm font-semibold mb-2">Reasons:</div>
                <ul className="list-disc list-inside space-y-1">
                  {reviewBombing.reasons.map((reason, i) => (
                    <li key={i} className="text-sm">{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold mb-4">Key Metrics (24h)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Downloads</div>
                <div className="text-2xl font-bold">{asoHealth?.dailyDownloads || 0}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Uninstalls</div>
                <div className="text-2xl font-bold">{asoHealth?.dailyUninstalls || 0}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Retention Rate</div>
                <div className="text-2xl font-bold">{asoHealth?.retentionRate.toFixed(1) || 0}%</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Crash Rate</div>
                <div className="text-2xl font-bold">{asoHealth?.crashRate.toFixed(2) || 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trust' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold mb-4">Trust Score Distribution</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(trustStats?.distribution || {}).map(([tier, count]) => (
                <div key={tier} className="border rounded p-4">
                  <div className="text-sm text-gray-600 capitalize">{tier}</div>
                  <div className="text-2xl font-bold">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aso' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold mb-4">ASO Health Details</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-600 mb-2">Platform</div>
                <div className="text-lg capitalize">{asoHealth?.platform}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-600 mb-2">Average Rating</div>
                <div className="text-lg">{asoHealth?.averageRating.toFixed(2)} / 5.0</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-600 mb-2">Health Status</div>
                <div className={`text-lg font-bold capitalize ${
                  asoHealth?.health === 'excellent' ? 'text-green-600' :
                  asoHealth?.health === 'good' ? 'text-blue-600' :
                  asoHealth?.health === 'warning' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {asoHealth?.health}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
