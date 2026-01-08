/**
 * PACK 392 - Store Defense Dashboard
 * Monitor store attacks, threats, and automated defense responses
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../src/firebase';

interface StoreDefenseStatus {
  defense: {
    storeThreatScore: number;
    storeRiskState: 'SAFE' | 'WARNING' | 'CRITICAL';
    detectedThreats: Threat[];
    lastAnalysis: any;
  };
  recentIncidents: Incident[];
}

interface Threat {
  type: string;
  severity: string;
  confidence: number;
  description: string;
  detectedAt: any;
}

interface Incident {
  id: string;
  storeId: string;
  status: string;
  threatData: any;
  createdAt: any;
}

export default function StoreDefenseDashboard() {
  const [loading, setLoading] = useState(true);
  const [defenseStatus, setDefenseStatus] = useState<StoreDefenseStatus | null>(null);
  const [selectedStore, setSelectedStore] = useState<string>('apple');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadDefenseStatus();
  }, [selectedStore]);

  const loadDefenseStatus = async () => {
    try {
      setLoading(true);
      const getDefenseStatus = httpsCallable(functions, 'pack392_getStoreDefenseStatus');
      const result = await getDefenseStatus({ storeId: selectedStore });
      setDefenseStatus(result.data as StoreDefenseStatus);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    try {
      setLoading(true);
      const analyzeStoreThreat = httpsCallable(functions, 'pack392_analyzeStoreThreat');
      await analyzeStoreThreat({ storeId: selectedStore });
      await loadDefenseStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (state: string) => {
    switch (state) {
      case 'SAFE': return 'text-green-600 bg-green-50';
      case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'CRITICAL': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'LOW': return 'bg-blue-100 text-blue-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading defense status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Store Defense Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time threat monitoring & attack defense</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-4">
            <select 
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2"
            >
              <option value="apple">Apple App Store</option>
              <option value="google">Google Play Store</option>
              <option value="huawei">Huawei AppGallery</option>
              <option value="samsung">Samsung Store</option>
            </select>
            <button
              onClick={runAnalysis}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Run Analysis
            </button>
          </div>
        </div>

        {defenseStatus && defenseStatus.defense && (
          <>
            {/* Risk Status Card */}
            <div className={`rounded-lg shadow p-6 mb-6 ${getRiskColor(defenseStatus.defense.storeRiskState)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase mb-1">
                    Store Risk State
                  </div>
                  <div className="text-4xl font-bold mb-2">
                    {defenseStatus.defense.storeRiskState}
                  </div>
                  <div className="text-sm opacity-90">
                    Threat Score: {defenseStatus.defense.storeThreatScore}/100
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 mb-1">Last Analysis</div>
                  <div className="text-sm font-mono">
                    {defenseStatus.defense.lastAnalysis && 
                     new Date(defenseStatus.defense.lastAnalysis.seconds * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Detected Threats */}
            {defenseStatus.defense.detectedThreats && defenseStatus.defense.detectedThreats.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Active Threats ({defenseStatus.defense.detectedThreats.length})
                </h2>
                <div className="space-y-4">
                  {defenseStatus.defense.detectedThreats.map((threat, index) => (
                    <div key={index} className="border-l-4 border-red-500 p-4 bg-red-50">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{threat.type}</span>
                          <span className={`text-xs px-2 py-1 rounded font-semibold ${getSeverityColor(threat.severity)}`}>
                            {threat.severity}
                          </span>
                          <span className="text-xs text-gray-600">
                            Confidence: {(threat.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {threat.detectedAt && 
                           new Date(threat.detectedAt.seconds * 1000).toLocaleTimeString()}
                        </div>
                      </div>
                      <p className="text-gray-700">{threat.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Incidents */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Incidents</h2>
              {defenseStatus.recentIncidents && defenseStatus.recentIncidents.length > 0 ? (
                <div className="space-y-3">
                  {defenseStatus.recentIncidents.map((incident) => (
                    <div key={incident.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            incident.status === 'ACTIVE' ? 'bg-red-100 text-red-800' :
                            incident.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {incident.status}
                          </span>
                          <span className="text-sm font-mono text-gray-600">
                            {incident.id.substring(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {incident.createdAt && 
                           new Date(incident.createdAt.seconds * 1000).toLocaleString()}
                        </div>
                      </div>
                      {incident.threatData && (
                        <div className="text-sm text-gray-700">
                          Risk State: {incident.threatData.storeRiskState} • 
                          Threat Score: {incident.threatData.storeThreatScore}/100 •
                          Threats: {incident.threatData.detectedThreats?.length || 0}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No recent incidents
                </div>
              )}
            </div>
          </>
        )}

        {!defenseStatus && !loading && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500">
              <p className="text-lg mb-2">No defense data available</p>
              <p className="text-sm">Run an analysis to generate defense metrics</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
