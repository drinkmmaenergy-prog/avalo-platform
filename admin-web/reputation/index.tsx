/**
 * PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
 * 
 * Admin Reputation Dashboard
 * Search, view, and manage user reputation profiles
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { ReputationProfile, RiskLabel } from '../../shared/types/pack422-reputation.types';

interface ReputationSearchResult {
  profile: ReputationProfile;
  userData?: {
    email: string;
    displayName: string;
    phoneNumber?: string;
  };
}

export default function ReputationDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'userId' | 'email' | 'phone' | 'name'>('userId');
  const [results, setResults] = useState<ReputationSearchResult[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ReputationSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterRisk, setFilterRisk] = useState<RiskLabel | 'ALL'>('ALL');

  /**
   * Search users by various criteria
   */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      // First, find user(s) based on search criteria
      let userIds: string[] = [];

      if (searchType === 'userId') {
        userIds = [searchQuery.trim()];
      } else {
        // Search users collection
        const usersRef = collection(db, 'users');
        let userQuery;

        if (searchType === 'email') {
          userQuery = query(usersRef, where('email', '==', searchQuery.toLowerCase().trim()));
        } else if (searchType === 'phone') {
          userQuery = query(usersRef, where('phoneNumber', '==', searchQuery.trim()));
        } else if (searchType === 'name') {
          userQuery = query(usersRef, where('displayName', '>=', searchQuery), where('displayName', '<=', searchQuery + '\uf8ff'));
        }

        if (userQuery) {
          const userSnap = await getDocs(userQuery);
          userIds = userSnap.docs.map(d => d.id);
        }
      }

      // Fetch reputation profiles for found users
      const searchResults: ReputationSearchResult[] = [];

      for (const userId of userIds) {
        const profileRef = doc(db, 'reputationProfiles', userId);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const profile = profileSnap.data() as ReputationProfile;

          // Fetch user data
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          const userData = userSnap.exists() ? {
            email: userSnap.data().email,
            displayName: userSnap.data().displayName,
            phoneNumber: userSnap.data().phoneNumber,
          } : undefined;

          searchResults.push({ profile, userData });
        }
      }

      setResults(searchResults);
    } catch (error) {
      console.error('Error searching reputation profiles:', error);
      alert('Error searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load high-risk users
   */
  const loadHighRiskUsers = async () => {
    setLoading(true);
    try {
      const profilesRef = collection(db, 'reputationProfiles');
      const q = query(
        profilesRef,
        where('riskLabel', 'in', ['HIGH', 'CRITICAL']),
        orderBy('updatedAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const searchResults: ReputationSearchResult[] = [];

      for (const profileDoc of snapshot.docs) {
        const profile = profileDoc.data() as ReputationProfile;

        // Fetch user data
        const userRef = doc(db, 'users', profile.userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? {
          email: userSnap.data().email,
          displayName: userSnap.data().displayName,
          phoneNumber: userSnap.data().phoneNumber,
        } : undefined;

        searchResults.push({ profile, userData });
      }

      setResults(searchResults);
    } catch (error) {
      console.error('Error loading high-risk users:', error);
      alert('Error loading. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Force reputation recalculation
   */
  const forceRecalculation = async (userId: string) => {
    if (!confirm('Force recalculate reputation for this user?')) return;

    try {
      const forceRecalc = httpsCallable(functions, 'forceReputationRecalc');
      await forceRecalc({ userId });
      alert('Reputation recalculated successfully!');
      handleSearch();
    } catch (error) {
      console.error('Error forcing recalculation:', error);
      alert('Error recalculating. Please try again.');
    }
  };

  /**
   * Manual override: Toggle manual review flag
   */
  const toggleManualReview = async (userId: string, currentValue: boolean) => {
    try {
      const profileRef = doc(db, 'reputationProfiles', userId);
      await updateDoc(profileRef, {
        manualReview: !currentValue,
        updatedAt: Date.now(),
      });

      // Log override
      await updateDoc(profileRef, {});

      alert(`Manual review ${!currentValue ? 'enabled' : 'disabled'}`);
      handleSearch();
    } catch (error) {
      console.error('Error toggling manual review:', error);
      alert('Error updating. Please try again.');
    }
  };

  /**
   * Manual override: Change risk label
   */
  const changeRiskLabel = async (userId: string, newLabel: RiskLabel) => {
    const reason = prompt('Enter reason for risk label change:');
    if (!reason) return;

    try {
      const profileRef = doc(db, 'reputationProfiles', userId);
      const profileSnap = await getDoc(profileRef);
      const currentProfile = profileSnap.data() as ReputationProfile;

      await updateDoc(profileRef, {
        riskLabel: newLabel,
        manualReview: true,
        updatedAt: Date.now(),
      });

      // Log override in subcollection
      await addDoc(collection(profileRef, 'overrides'), {
        adminId: 'CURRENT_ADMIN_ID', // TODO: Get from auth context
        timestamp: Date.now(),
        action: 'UPGRADE_RISK' as const,
        previousRiskLabel: currentProfile.riskLabel,
        newRiskLabel: newLabel,
        reason,
      });

      alert('Risk label updated successfully!');
      handleSearch();
    } catch (error) {
      console.error('Error changing risk label:', error);
      alert('Error updating. Please try again.');
    }
  };

  return (
    <div className="reputation-dashboard" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px' }}>
        Reputation Intelligence Dashboard
      </h1>

      {/* Search Section */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Search Users</h2>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as any)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="userId">User ID</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="name">Name</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search by ${searchType}...`}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />

          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: '8px 24px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={loadHighRiskUsers}
            disabled={loading}
            style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Load High-Risk Users
          </button>

          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value as any)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="ALL">All Risk Levels</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>
        </div>
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
            Results ({results.filter(r => filterRisk === 'ALL' || r.profile.riskLabel === filterRisk).length})
          </h2>

          <div style={{ display: 'grid', gap: '16px' }}>
            {results
              .filter(r => filterRisk === 'ALL' || r.profile.riskLabel === filterRisk)
              .map((result) => (
                <ReputationCard
                  key={result.profile.userId}
                  result={result}
                  onSelect={() => setSelectedProfile(result)}
                  onForceRecalc={() => forceRecalculation(result.profile.userId)}
                  onToggleManualReview={() => toggleManualReview(result.profile.userId, result.profile.manualReview)}
                  onChangeRiskLabel={(label) => changeRiskLabel(result.profile.userId, label)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedProfile && (
        <ReputationDetailModal
          result={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  );
}

/**
 * Reputation Card Component
 */
function ReputationCard({
  result,
  onSelect,
  onForceRecalc,
  onToggleManualReview,
  onChangeRiskLabel,
}: {
  result: ReputationSearchResult;
  onSelect: () => void;
  onForceRecalc: () => void;
  onToggleManualReview: () => void;
  onChangeRiskLabel: (label: RiskLabel) => void;
}) {
  const { profile, userData } = result;

  const getRiskColor = (label: RiskLabel) => {
    switch (label) {
      case 'LOW': return '#28a745';
      case 'MEDIUM': return '#ffc107';
      case 'HIGH': return '#fd7e14';
      case 'CRITICAL': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px', cursor: 'pointer' }} onClick={onSelect}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>
            {userData?.displayName || 'Unknown User'}
          </h3>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '2px' }}>{userData?.email}</p>
          <p style={{ fontSize: '12px', color: '#999' }}>ID: {profile.userId}</p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '4px',
              backgroundColor: getRiskColor(profile.riskLabel!),
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              marginBottom: '8px',
            }}
          >
            {profile.riskLabel}
          </div>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{profile.reputationScore}</p>
        </div>
      </div>

      {/* Component Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <ScorePill label="Chat" score={profile.chatQuality} />
        <ScorePill label="Calls" score={profile.callQuality} />
        <ScorePill label="Meetings" score={profile.meetingReliability} />
        <ScorePill label="Cancellations" score={profile.cancellationBehavior} />
        <ScorePill label="Disputes" score={profile.disputeHistory} />
        <ScorePill label="Payment" score={profile.paymentTrust} />
      </div>

      {/* Flags */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {profile.manualReview && (
          <span style={{ padding: '2px 8px', backgroundColor: '#ffc107', color: '#000', borderRadius: '4px', fontSize: '12px' }}>
            ⚠️ Manual Review
          </span>
        )}
        {profile.limitedMode && (
          <span style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px', fontSize: '12px' }}>
            🚫 Limited Mode
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onForceRecalc}
          style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Recalculate
        </button>
        <button
          onClick={onToggleManualReview}
          style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {profile.manualReview ? 'Remove Review' : 'Flag for Review'}
        </button>
      </div>
    </div>
  );
}

/**
 * Score Pill Component
 */
function ScorePill({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return '#28a745';
    if (s >= 60) return '#ffc107';
    if (s >= 40) return '#fd7e14';
    return '#dc3545';
  };

  return (
    <div style={{ textAlign: 'center', padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
      <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: '600', color: getColor(score) }}>{score}</div>
    </div>
  );
}

/**
 * Detail Modal Component
 */
function ReputationDetailModal({
  result,
  onClose,
}: {
  result: ReputationSearchResult;
  onClose: () => void;
}) {
  const { profile } = result;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '12px',
          maxWidth: '800px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
          Reputation Details
        </h2>

        <div style={{ display: 'grid', gap: '16px' }}>
          <DetailRow label="User ID" value={profile.userId} />
          <DetailRow label="Reputation Score" value={`${profile.reputationScore} / 100`} />
          <DetailRow label="Risk Label" value={profile.riskLabel || 'UNKNOWN'} />
          <DetailRow label="Total Reports" value={profile.totalReports} />
          <DetailRow label="Safety Incidents" value={profile.totalSafetyIncidents} />
          <DetailRow label="Missed Meetings" value={profile.missedMeetings} />
          <DetailRow label="Late Arrivals" value={profile.lateArrivals} />
          <DetailRow label="Disputes Filed" value={profile.disputesFiled} />
          <DetailRow label="Disputes Received" value={profile.disputesReceived} />
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '24px',
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Detail Row Component
 */
function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
      <span style={{ fontWeight: '600', color: '#666' }}>{label}:</span>
      <span style={{ fontWeight: '500' }}>{value}</span>
    </div>
  );
}

// Helper import (would need to be defined in component)
function addDoc(collection: any, data: any): Promise<any> {
  // Placeholder - actual implementation would use Firebase
  return Promise.resolve();
}
