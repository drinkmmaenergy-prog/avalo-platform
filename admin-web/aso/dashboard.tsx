/**
 * PACK 392 - ASO Dashboard
 * App Store Optimization monitoring and management
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../src/firebase';

interface ASOMetrics {
  storeId: string;
  country: string;
  overallScore: number;
  conversionRate: number;
  installToRegistration: number;
  keywords: KeywordMetric[];
  screenshots: ScreenshotMetric[];
  recommendations: ASORecommendation[];
  lastOptimized: any;
}

interface KeywordMetric {
  keyword: string;
  rank: number;
  searchVolume: number;
  conversion: number;
  trending: boolean;
}

interface ScreenshotMetric {
  id: string;
  position: number;
  conversionRate: number;
  variant: string;
}

interface ASORecommendation {
  type: string;
  priority: string;
  action: string;
  expectedImpact: number;
  implementationEffort: string;
}

export default function ASODashboard() {
  const [loading, setLoading] = useState(true);
  const [asoData, setAsoData] = useState<ASOMetrics[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadASOData();
  }, []);

  const loadASOData = async () => {
    try {
      setLoading(true);
      const getASODashboard = httpsCallable(functions, 'pack392_getASODashboard');
      const result = await getASODashboard({ storeId: 'apple' });
      setAsoData(result.data as ASOMetrics[]);
      if (result.data && (result.data as ASOMetrics[]).length > 0) {
        setSelectedStore((result.data as ASOMetrics[])[0].storeId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedStore) return;
    try {
      setLoading(true);
      const runASOAnalysis = httpsCallable(functions, 'pack392_runASOAnalysis');
      await runASOAnalysis({ storeId: selectedStore, country: 'US' });
      await loadASOData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedMetrics = asoData.find(m => m.storeId === selectedStore);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ASO data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ASO Dashboard</h1>
          <p className="text-gray-600 mt-2">App Store Optimization & Performance Metrics</p>
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
              {asoData.map(data => (
                <option key={`${data.storeId}-${data.country}`} value={data.storeId}>
                  {data.storeId} - {data.country}
                </option>
              ))}
            </select>
            <button
              onClick={runAnalysis}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Run Analysis
            </button>
          </div>
        </div>

        {selectedMetrics && (
          <>
            {/* Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Overall Score</div>
                <div className="text-3xl font-bold text-blue-600">
                  {selectedMetrics.overallScore}/100
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {selectedMetrics.overallScore >= 80 ? 'Excellent' : 
                   selectedMetrics.overallScore >= 60 ? 'Good' : 
                   selectedMetrics.overallScore >= 40 ? 'Fair' : 'Needs Work'}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
                <div className="text-3xl font-bold text-green-600">
                  {(selectedMetrics.conversionRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 mt-2">Store page visitors</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Install → Register</div>
                <div className="text-3xl font-bold text-purple-600">
                  {(selectedMetrics.installToRegistration * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 mt-2">User activation</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Keywords Tracked</div>
                <div className="text-3xl font-bold text-orange-600">
                  {selectedMetrics.keywords.length}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {selectedMetrics.keywords.filter(k => k.trending).length} trending
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {selectedMetrics.recommendations.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Recommendations</h2>
                <div className="space-y-4">
                  {selectedMetrics.recommendations.map((rec, index) => (
                    <div 
                      key={index}
                      className={`border-l-4 p-4 ${
                        rec.priority === 'CRITICAL' ? 'border-red-500 bg-red-50' :
                        rec.priority === 'HIGH' ? 'border-orange-500 bg-orange-50' :
                        rec.priority === 'MEDIUM' ? 'border-yellow-500 bg-yellow-50' :
                        'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              rec.priority === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                              rec.priority === 'HIGH' ? 'bg-orange-200 text-orange-800' :
                              rec.priority === 'MEDIUM' ? 'bg-yellow-200 text-yellow-800' :
                              'bg-blue-200 text-blue-800'
                            }`}>
                              {rec.priority}
                            </span>
                            <span className="text-xs text-gray-600">{rec.type}</span>
                            <span className="text-xs text-gray-600">• Effort: {rec.implementationEffort}</span>
                          </div>
                          <p className="text-gray-900 font-medium">{rec.action}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Expected impact: +{rec.expectedImpact}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Top Keywords</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Keyword</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Rank</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Search Volume</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Conversion</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMetrics.keywords.slice(0, 10).map((keyword, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{keyword.keyword}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-sm ${
                            keyword.rank <= 10 ? 'bg-green-100 text-green-800' :
                            keyword.rank <= 50 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            #{keyword.rank}
                          </span>
                        </td>
                        <td className="py-3 px-4">{keyword.searchVolume.toLocaleString()}</td>
                        <td className="py-3 px-4">{(keyword.conversion * 100).toFixed(1)}%</td>
                        <td className="py-3 px-4">
                          {keyword.trending && (
                            <span className="text-green-600 text-sm">↗ Trending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Screenshots */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Screenshot Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedMetrics.screenshots.slice(0, 6).map((screenshot) => (
                  <div key={screenshot.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">Position {screenshot.position}</span>
                      <span className="text-xs text-gray-600">{screenshot.variant}</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      {(screenshot.conversionRate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-600">Conversion rate</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
