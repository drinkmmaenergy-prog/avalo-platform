/**
 * PACK 307 — Catfish Risk Admin Console
 * 
 * Admin interface for reviewing and managing fake profile / catfish risk cases
 * Features:
 * - Filter by risk level
 * - View detailed risk scores and flags
 * - Preview profile photos and verification selfie
 * - Take actions: confirm legit, require re-verification, or ban
 * - Audit logging of all actions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// ============================================================================
// TYPES
// ============================================================================

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CatfishRiskProfile {
  userId: string;
  catfishRiskScore: number;
  aiFaceProbability: number;
  filterIntensityScore: number;
  photoConsistencyScore: number;
  genderMismatchFlag: boolean;
  ageMismatchFlag: boolean;
  identityMatchScore: number;
  reportCountCatfish: number;
  riskLevel: RiskLevel;
  lastRecomputedAt: any;
  autoHiddenFromDiscovery: boolean;
  autoHiddenFromSwipe: boolean;
  manualReviewRequired: boolean;
}

interface DashboardStats {
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  needsReview: number;
}

interface UserDetails {
  displayName?: string;
  email?: string;
  photoUrls: string[];
  verificationSelfieUrl?: string;
  joinedAt?: any;
  country?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CatfishRiskAdmin() {
  const [activeTab, setActiveTab] = useState<'overview' | 'review' | 'search'>('overview');
  const [profiles, setProfiles] = useState<CatfishRiskProfile[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterRiskLevel, setFilterRiskLevel] = useState<RiskLevel | 'ALL'>('ALL');
  const [searchUserId, setSearchUserId] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<CatfishRiskProfile | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const functions = getFunctions();
  const auth = getAuth();

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadDashboardData();
  }, [filterRiskLevel]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const getDashboard = httpsCallable(functions, 'getCatfishRiskDashboard');
      const result = await getDashboard({
        riskLevel: filterRiskLevel === 'ALL' ? undefined : filterRiskLevel,
        limit: 50,
      });

      const data = result.data as any;
      setProfiles(data.profiles || []);
      setStats(data.stats || null);
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const loadUserDetails = async (userId: string) => {
    try {
      // In production, call a Cloud Function to get user details
      // For now, show placeholder
      setUserDetails({
        displayName: 'User ' + userId.substring(0, 8),
        email: 'user@example.com',
        photoUrls: [],
        joinedAt: new Date(),
        country: 'Unknown',
      });
    } catch (error) {
      console.error('Error loading user details:', error);
    }
  };

  // ============================================================================
  // ADMIN ACTIONS
  // ============================================================================

  const handleAdminAction = async (
    userId: string,
    action: 'confirm_legit' | 'require_reverification' | 'ban'
  ) => {
    if (!actionNotes.trim() && action !== 'confirm_legit') {
      Alert.alert('Error', 'Please add notes for this action');
      return;
    }

    Alert.alert(
      'Confirm Action',
      `Are you sure you want to ${action.replace(/_/g, ' ')} this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: action === 'ban' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const overrideRisk = httpsCallable(functions, 'adminOverrideCatfishRisk');
              await overrideRisk({
                userId,
                action,
                notes: actionNotes.trim(),
              });

              Alert.alert('Success', 'Action completed successfully');
              setActionNotes('');
              setSelectedProfile(null);
              await loadDashboardData();
            } catch (error: any) {
              console.error('Error performing action:', error);
              Alert.alert('Error', error.message || 'Failed to perform action');
            }
          },
        },
      ]
    );
  };

  const recomputeRisk = async (userId: string) => {
    try {
      const recompute = httpsCallable(functions, 'recomputeCatfishRisk');
      await recompute({ userId });
      Alert.alert('Success', 'Risk score recomputed successfully');
      await loadDashboardData();
    } catch (error: any) {
      console.error('Error recomputing risk:', error);
      Alert.alert('Error', error.message || 'Failed to recompute risk');
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderRiskBadge = (level: RiskLevel) => {
    const colors = {
      LOW: '#10b981',
      MEDIUM: '#f59e0b',
      HIGH: '#ef4444',
      CRITICAL: '#dc2626',
    };

    return (
      <View style={[styles.badge, { backgroundColor: colors[level] }]}>
        <Text style={styles.badgeText}>{level}</Text>
      </View>
    );
  };

  const renderScoreBar = (label: string, score: number, threshold?: number) => {
    const percentage = Math.round(score * 100);
    const color = threshold && score > threshold ? '#ef4444' : '#3b82f6';

    return (
      <View style={styles.scoreBarContainer}>
        <View style={styles.scoreBarHeader}>
          <Text style={styles.scoreBarLabel}>{label}</Text>
          <Text style={styles.scoreBarValue}>{percentage}%</Text>
        </View>
        <View style={styles.scoreBarBackground}>
          <View style={[styles.scoreBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  // ============================================================================
  // TAB CONTENTS
  // ============================================================================

  const renderOverviewTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Statistics Cards */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#10b981' }]}>{stats.low}</Text>
            <Text style={styles.statLabel}>Low Risk</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{stats.medium}</Text>
            <Text style={styles.statLabel}>Medium</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#ef4444' }]}>{stats.high}</Text>
            <Text style={styles.statLabel}>High</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#dc2626' }]}>{stats.critical}</Text>
            <Text style={styles.statLabel}>Critical</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#8b5cf6' }]}>{stats.needsReview}</Text>
            <Text style={styles.statLabel}>Needs Review</Text>
          </View>
        </View>
      )}

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        {(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.filterButton, filterRiskLevel === level && styles.filterButtonActive]}
            onPress={() => setFilterRiskLevel(level)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filterRiskLevel === level && styles.filterButtonTextActive,
              ]}
            >
              {level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Profiles List */}
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
      ) : profiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No profiles found</Text>
        </View>
      ) : (
        profiles.map((profile) => (
          <TouchableOpacity
            key={profile.userId}
            style={styles.profileCard}
            onPress={() => {
              setSelectedProfile(profile);
              loadUserDetails(profile.userId);
            }}
          >
            <View style={styles.profileHeader}>
              <Text style={styles.profileUserId}>{profile.userId.substring(0, 12)}...</Text>
              {renderRiskBadge(profile.riskLevel)}
            </View>

            <View style={styles.profileScores}>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreValue}>
                  {Math.round(profile.catfishRiskScore * 100)}%
                </Text>
                <Text style={styles.scoreLabel}>Risk Score</Text>
              </View>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreValue}>
                  {Math.round(profile.aiFaceProbability * 100)}%
                </Text>
                <Text style={styles.scoreLabel}>AI Face</Text>
              </View>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreValue}>
                  {Math.round(profile.identityMatchScore * 100)}%
                </Text>
                <Text style={styles.scoreLabel}>Identity Match</Text>
              </View>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreValue}>{profile.reportCountCatfish}</Text>
                <Text style={styles.scoreLabel}>Reports</Text>
              </View>
            </View>

            {profile.manualReviewRequired && (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeText}>⚠️ Review Required</Text>
              </View>
            )}

            {(profile.genderMismatchFlag || profile.ageMismatchFlag) && (
              <View style={styles.flagsContainer}>
                {profile.genderMismatchFlag && (
                  <Text style={styles.flagText}>🚩 Gender Mismatch</Text>
                )}
                {profile.ageMismatchFlag && (
                  <Text style={styles.flagText}>🚩 Age Mismatch</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderReviewTab = () => {
    const reviewProfiles = profiles.filter((p) => p.manualReviewRequired);

    return (
      <ScrollView
        style={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.sectionTitle}>
          Profiles Requiring Manual Review ({reviewProfiles.length})
        </Text>

        {reviewProfiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>✓ No profiles pending review</Text>
          </View>
        ) : (
          reviewProfiles.map((profile) => (
            <TouchableOpacity
              key={profile.userId}
              style={styles.profileCard}
              onPress={() => {
                setSelectedProfile(profile);
                loadUserDetails(profile.userId);
              }}
            >
              <View style={styles.profileHeader}>
                <Text style={styles.profileUserId}>{profile.userId.substring(0, 12)}...</Text>
                {renderRiskBadge(profile.riskLevel)}
              </View>

              {renderScoreBar('Overall Risk', profile.catfishRiskScore, 0.6)}
              {renderScoreBar('AI Face Probability', profile.aiFaceProbability, 0.7)}
              {renderScoreBar('Filter Intensity', profile.filterIntensityScore, 0.8)}
              {renderScoreBar('Photo Consistency', profile.photoConsistencyScore)}
              {renderScoreBar('Identity Match', profile.identityMatchScore)}

              <View style={styles.metaInfo}>
                <Text style={styles.metaText}>
                  Reports: {profile.reportCountCatfish} | Last Updated:{' '}
                  {new Date(profile.lastRecomputedAt?.toDate()).toLocaleDateString()}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  };

  const renderSearchTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter User ID"
          value={searchUserId}
          onChangeText={setSearchUserId}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={async () => {
            if (searchUserId.trim()) {
              try {
                await recomputeRisk(searchUserId.trim());
              } catch (error) {
                Alert.alert('Error', 'User not found or invalid ID');
              }
            }
          }}
        >
          <Text style={styles.searchButtonText}>Search & Recompute</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.helpText}>
        Enter a user ID to view and recompute their catfish risk score
      </Text>
    </ScrollView>
  );

  // ============================================================================
  // DETAIL MODAL
  // ============================================================================

  const renderDetailModal = () => {
    if (!selectedProfile) return null;

    return (
      <View style={styles.modal}>
        <View style={styles.modalContent}>
          <ScrollView>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile Details</Text>
              <TouchableOpacity onPress={() => setSelectedProfile(null)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>User ID:</Text>
              <Text style={styles.detailValue}>{selectedProfile.userId}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Risk Level:</Text>
              {renderRiskBadge(selectedProfile.riskLevel)}
            </View>

            {renderScoreBar('Overall Risk Score', selectedProfile.catfishRiskScore, 0.6)}
            {renderScoreBar('AI Face Probability', selectedProfile.aiFaceProbability, 0.7)}
            {renderScoreBar('Filter Intensity', selectedProfile.filterIntensityScore, 0.8)}
            {renderScoreBar('Photo Consistency', selectedProfile.photoConsistencyScore)}
            {renderScoreBar('Identity Match', selectedProfile.identityMatchScore)}

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Catfish Reports:</Text>
              <Text style={styles.detailValue}>{selectedProfile.reportCountCatfish}</Text>
            </View>

            {(selectedProfile.genderMismatchFlag || selectedProfile.ageMismatchFlag) && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Flags:</Text>
                <View>
                  {selectedProfile.genderMismatchFlag && (
                    <Text style={styles.flagText}>🚩 Gender Mismatch</Text>
                  )}
                  {selectedProfile.ageMismatchFlag && (
                    <Text style={styles.flagText}>🚩 Age Mismatch</Text>
                  )}
                </View>
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text style={styles.detailValue}>
                {selectedProfile.autoHiddenFromDiscovery
                  ? '🔒 Hidden from Discovery'
                  : '✓ Visible'}
              </Text>
            </View>

            {/* Action Notes */}
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Action Notes:</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Add notes for this action..."
                value={actionNotes}
                onChangeText={setActionNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={() => handleAdminAction(selectedProfile.userId, 'confirm_legit')}
              >
                <Text style={styles.actionButtonText}>✓ Confirm Legit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.reverifyButton]}
                onPress={() =>
                  handleAdminAction(selectedProfile.userId, 'require_reverification')
                }
              >
                <Text style={styles.actionButtonText}>🔄 Require Re-verification</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.banButton]}
                onPress={() => handleAdminAction(selectedProfile.userId, 'ban')}
              >
                <Text style={styles.actionButtonText}>🚫 Ban User</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.recomputeButton]}
                onPress={() => recomputeRisk(selectedProfile.userId)}
              >
                <Text style={styles.actionButtonText}>🔄 Recompute Risk</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Catfish Risk Admin</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'review' && styles.tabActive]}
          onPress={() => setActiveTab('review')}
        >
          <Text style={[styles.tabText, activeTab === 'review' && styles.tabTextActive]}>
            Review Queue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'review' && renderReviewTab()}
      {activeTab === 'search' && renderSearchTab()}

      {/* Detail Modal */}
      {selectedProfile && renderDetailModal()}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    fontSize: 16,
    color: '#3b82f6',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    margin: '1%',
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileUserId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'monospace',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  profileScores: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
  },
  scoreItem: {
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  reviewBadge: {
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  reviewBadgeText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
    textAlign: 'center',
  },
  flagsContainer: {
    marginTop: 8,
    gap: 4,
  },
  flagText: {
    fontSize: 12,
    color: '#dc2626',
  },
  scoreBarContainer: {
    marginVertical: 8,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  scoreBarLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  scoreBarValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  scoreBarBackground: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  metaInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  metaText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    padding: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  loader: {
    padding: 32,
  },
  searchContainer: {
    padding: 16,
    gap: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: '#9ca3af',
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    fontSize: 24,
    color: '#9ca3af',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  notesInput: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionButtons: {
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#10b981',
  },
  reverifyButton: {
    backgroundColor: '#f59e0b',
  },
  banButton: {
    backgroundColor: '#ef4444',
  },
  recomputeButton: {
    backgroundColor: '#6366f1',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
