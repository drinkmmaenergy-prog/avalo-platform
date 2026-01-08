/**
 * PACK 412 — Launch Control Room Dashboard
 * Main dashboard for regional launch management
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type {
  LaunchRegionConfig,
  LaunchRegionStats,
  LaunchGuardrailViolation,
} from '../../../shared/types/pack412-launch';
import { collection, query, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface RegionDashboardData extends LaunchRegionConfig {
  stats?: LaunchRegionStats;
  recentViolations: LaunchGuardrailViolation[];
  healthStatus: 'GREEN' | 'YELLOW' | 'RED';
}

export default function LaunchControlRoom() {
  const router = useRouter();
  const [regions, setRegions] = useState<RegionDashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'planned'>('active');

  useEffect(() => {
    loadRegions();
  }, [filter]);

  const loadRegions = async () => {
    setLoading(true);
    try {
      // Build query based on filter
      const regionRef = collection(db, 'launchRegions');
      let q = query(regionRef, orderBy('updatedAt', 'desc'));
      
      if (filter === 'active') {
        q = query(regionRef, where('stage', 'in', ['SOFT_LIVE', 'FULL_LIVE']), orderBy('updatedAt', 'desc'));
      } else if (filter === 'planned') {
        q = query(regionRef, where('stage', 'in', ['PLANNED', 'READY_FOR_SOFT', 'READY_FOR_FULL']), orderBy('updatedAt', 'desc'));
      }
      
      const snapshot = await getDocs(q);
      
      // Load data for each region
      const regionsData = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const region = doc.data() as LaunchRegionConfig;
          
          // Get latest stats
          const statsQuery = query(
            collection(db, 'launchRegionStats'),
            where('regionId', '==', region.id),
            orderBy('snapshotAt', 'desc'),
            limit(1)
          );
          const statsSnapshot = await getDocs(statsQuery);
          const stats = statsSnapshot.empty ? undefined : (statsSnapshot.docs[0].data() as LaunchRegionStats);
          
          // Get recent unresolved violations
          const violationsQuery = query(
            collection(db, 'launchGuardrailViolations'),
            where('regionId', '==', region.id),
            where('resolvedAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(10)
          );
          const violationsSnapshot = await getDocs(violationsQuery);
          const recentViolations = violationsSnapshot.docs.map((d) => d.data() as LaunchGuardrailViolation);
          
          // Determine health status
          const healthStatus = getHealthStatus(region, stats, recentViolations);
          
          return {
            ...region,
            stats,
            recentViolations,
            healthStatus,
          };
        })
      );
      
      setRegions(regionsData);
    } catch (error) {
      console.error('Error loading regions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthStatus = (
    region: LaunchRegionConfig,
    stats?: LaunchRegionStats,
    violations?: LaunchGuardrailViolation[]
  ): 'GREEN' | 'YELLOW' | 'RED' => {
    // RED: Paused, rolled back, or critical violations
    if (region.stage === 'PAUSED' || region.stage === 'ROLLED_BACK') {
      return 'RED';
    }
    if (violations && violations.some((v) => v.severity === 'CRITICAL')) {
      return 'RED';
    }
    
    // YELLOW: Has warnings or high risk score
    if (violations && violations.length > 0) {
      return 'YELLOW';
    }
    if (stats && stats.riskScore > 0.6) {
      return 'YELLOW';
    }
    
    // GREEN: All good
    return 'GREEN';
  };

  const getStageColor = (stage: string): string => {
    switch (stage) {
      case 'NOT_PLANNED':
        return 'bg-gray-100 text-gray-800';
      case 'PLANNED':
        return 'bg-blue-100 text-blue-800';
      case 'READY_FOR_SOFT':
      case 'READY_FOR_FULL':
        return 'bg-purple-100 text-purple-800';
      case 'SOFT_LIVE':
        return 'bg-yellow-100 text-yellow-800';
      case 'FULL_LIVE':
        return 'bg-green-100 text-green-800';
      case 'PAUSED':
        return 'bg-orange-100 text-orange-800';
      case 'ROLLED_BACK':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getHealthColor = (status: 'GREEN' | 'YELLOW' | 'RED'): string => {
    switch (status) {
      case 'GREEN':
        return 'bg-green-500';
      case 'YELLOW':
        return 'bg-yellow-500';
      case 'RED':
        return 'bg-red-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading launch control room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🚀 Launch Control Room</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage regional launches and monitor market expansion
              </p>
            </div>
            <button
              onClick={() => router.push('/launch/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + New Region
            </button>
          </div>
          
          {/* Filter tabs */}
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'all'
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Regions
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'active'
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Active Launches
            </button>
            <button
              onClick={() => setFilter('planned')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'planned'
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Planned
            </button>
          </div>
        </div>
      </div>

      {/* Regions grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {regions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No regions found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regions.map((region) => (
              <div
                key={region.id}
                onClick={() => router.push(`/launch/${region.id}`)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer overflow-hidden"
              >
                {/* Health indicator bar */}
                <div className={`h-2 ${getHealthColor(region.healthStatus)}`}></div>
                
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{region.id}</h3>
                      <p className="text-sm text-gray-500">{region.cluster}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStageColor(region.stage)}`}>
                      {region.stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                  
                  {/* Countries */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1">Countries</p>
                    <div className="flex flex-wrap gap-1">
                      {region.countries.slice(0, 5).map((country) => (
                        <span key={country} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {country}
                        </span>
                      ))}
                      {region.countries.length > 5 && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          +{region.countries.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Traffic cap */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Traffic Cap</span>
                      <span className="font-medium">{region.currentTrafficCapPct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${region.currentTrafficCapPct}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Stats */}
                  {region.stats && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500">DAU</p>
                        <p className="text-lg font-semibold text-gray-900">{region.stats.dau.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Risk Score</p>
                        <p className={`text-lg font-semibold ${
                          region.stats.riskScore > 0.7 ? 'text-red-600' :
                          region.stats.riskScore > 0.4 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {(region.stats.riskScore * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Violations */}
                  {region.recentViolations.length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-xs text-red-600 font-medium">
                        ⚠️ {region.recentViolations.length} active violation{region.recentViolations.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                  
                  {/* Dependencies */}
                  {!region.dependenciesOk && (
                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-xs text-yellow-600 font-medium">
                        ⚠️ Dependencies not satisfied
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Quick links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => router.push('/launch/guardrails')}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
          >
            <h3 className="font-semibold text-gray-900 mb-1">🛡️ Guardrail Thresholds</h3>
            <p className="text-sm text-gray-500">Manage auto-pause thresholds</p>
          </button>
          
          <button
            onClick={() => router.push('/launch/timeline')}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
          >
            <h3 className="font-semibold text-gray-900 mb-1">📅 Launch Timeline</h3>
            <p className="text-sm text-gray-500">View upcoming launches</p>
          </button>
          
          <button
            onClick={() => router.push('/launch/proposals')}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
          >
            <h3 className="font-semibold text-gray-900 mb-1">🌍 Expansion Proposals</h3>
            <p className="text-sm text-gray-500">AI-generated market suggestions</p>
          </button>
        </div>
      </div>
    </div>
  );
}
