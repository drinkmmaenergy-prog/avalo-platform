/**
 * PACK 306 — Admin Verification Panel
 * Review and manage user verifications
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, functions } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'BANNED' | 'BANNED_TEMP' | 'BANNED_PERMANENT';

interface VerificationUser {
  userId: string;
  email?: string;
  displayName?: string;
  status: VerificationStatus;
  attempts: number;
  lastAttemptAt: Date;
  reasonFailed?: string;
  ageVerified: boolean;
  photosChecked: boolean;
}

interface ReviewQueueItem {
  id: string;
  userId: string;
  userName: string;
  flagReason: string;
  priority: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  selfieUrl: string;
  photos: string[];
  faceMatchScores: number[];
  ageEstimate: number;
  livenessScore: number;
  createdAt: Date;
}

export default function AdminVerificationPanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'search'>('overview');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<VerificationUser[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | 'ALL'>('ALL');

  useEffect(() => {
    loadData();
  }, [activeTab, filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        await loadVerificationUsers();
      } else if (activeTab === 'queue') {
        await loadReviewQueue();
      }
    } catch (error) {
      console.error('Load data error:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadVerificationUsers = async () => {
    try {
      let q = collection(db, 'users');
      
      // Note: This would need a proper collection group query for verification status
      // For now, we'll demonstrate the structure
      const usersSnapshot = await getDocs(query(q, limit(50)));
      
      const usersData: VerificationUser[] = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const statusDoc = await getDoc(
          doc(db, 'users', userDoc.id, 'verification', 'status')
        );
        
        if (statusDoc.exists()) {
          const statusData = statusDoc.data();
          const userData = userDoc.data();
          
          if (filterStatus === 'ALL' || statusData.status === filterStatus) {
            usersData.push({
              userId: userDoc.id,
              email: userData.email,
              displayName: userData.displayName,
              status: statusData.status,
              attempts: statusData.attempts,
              lastAttemptAt: statusData.lastAttemptAt?.toDate(),
              reasonFailed: statusData.reasonFailed,
              ageVerified: statusData.ageVerified,
              photosChecked: statusData.photosChecked,
            });
          }
        }
      }
      
      setUsers(usersData);
    } catch (error) {
      console.error('Load users error:', error);
    }
  };

  const loadReviewQueue = async () => {
    try {
      const q = query(
        collection(db, 'verificationReviewQueue'),
        where('status', '==', 'PENDING_REVIEW'),
        orderBy('priority', 'desc'),
        orderBy('createdAt', 'asc'),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      const items: ReviewQueueItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      })) as ReviewQueueItem[];
      
      setReviewQueue(items);
    } catch (error) {
      console.error('Load review queue error:', error);
    }
  };

  const handleManualOverride = async (userId: string, approve: boolean, notes: string) => {
    Alert.alert(
      'Confirm Override',
      `Are you sure you want to ${approve ? 'APPROVE' : 'REJECT'} this user's verification?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const overrideFn = httpsCallable(functions, 'adminVerificationOverride');
              await overrideFn({ userId, approve, notes });
              
              Alert.alert('Success', `User verification ${approve ? 'approved' : 'rejected'}`);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to override verification');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const searchUsers = async () => {
    if (!searchTerm.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setLoading(true);
    try {
      // Search by email or userId
      const userDoc = await getDoc(doc(db, 'users', searchTerm));
      
      if (userDoc.exists()) {
        const statusDoc = await getDoc(
          doc(db, 'users', searchTerm, 'verification', 'status')
        );
        
        if (statusDoc.exists()) {
          const userData = userDoc.data();
          const statusData = statusDoc.data();
          
          setSelectedUser({
            userId: userDoc.id,
            email: userData.email,
            displayName: userData.displayName,
            status: statusData.status,
            attempts: statusData.attempts,
            lastAttemptAt: statusData.lastAttemptAt?.toDate(),
            reasonFailed: statusData.reasonFailed,
            ageVerified: statusData.ageVerified,
            photosChecked: statusData.photosChecked,
          });
        } else {
          Alert.alert('Not Found', 'No verification record found for this user');
        }
      } else {
        Alert.alert('Not Found', 'User not found');
      }
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => (
    <View style={styles.content}>
      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>Filter:</Text>
        {['ALL', 'UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'BANNED'].map(status => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterButton,
              filterStatus === status && styles.filterButtonActive,
            ]}
            onPress={() => setFilterStatus(status as VerificationStatus | 'ALL')}
          >
            <Text
              style={[
                styles.filterButtonText,
                filterStatus === status && styles.filterButtonTextActive,
              ]}
            >
              {status}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.list}>
        {users.map(user => (
          <View key={user.userId} style={styles.userCard}>
            <View style={styles.userHeader}>
              <Text style={styles.userName}>{user.displayName || 'Unknown'}</Text>
              <View style={[styles.statusBadge, getStatusBadgeStyle(user.status)]}>
                <Text style={styles.statusText}>{user.status}</Text>
              </View>
            </View>

            <Text style={styles.userEmail}>{user.email || user.userId}</Text>
            
            <View style={styles.userStats}>
              <Text style={styles.statText}>Attempts: {user.attempts}/7</Text>
              <Text style={styles.statText}>
                Age: {user.ageVerified ? '✓' : '✗'}
              </Text>
              <Text style={styles.statText}>
                Photos: {user.photosChecked ? '✓' : '✗'}
              </Text>
            </View>

            {user.reasonFailed && (
              <Text style={styles.failureReason}>
                Reason: {user.reasonFailed}
              </Text>
            )}

            <View style={styles.userActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => {
                  Alert.prompt(
                    'Approval Notes',
                    'Enter notes (optional)',
                    (notes) => handleManualOverride(user.userId, true, notes)
                  );
                }}
              >
                <Text style={styles.actionButtonText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => {
                  Alert.prompt(
                    'Rejection Reason',
                    'Enter reason (required)',
                    (notes) => {
                      if (notes?.trim()) {
                        handleManualOverride(user.userId, false, notes);
                      } else {
                        Alert.alert('Error', 'Rejection reason is required');
                      }
                    }
                  );
                }}
              >
                <Text style={styles.actionButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {users.length === 0 && !loading && (
          <Text style={styles.emptyText}>No users found</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderReviewQueue = () => (
    <View style={styles.content}>
      <ScrollView style={styles.list}>
        {reviewQueue.map(item => (
          <View key={item.id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewUser}>{item.userName}</Text>
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityText}>Priority: {item.priority}</Text>
              </View>
            </View>

            <Text style={styles.flagReason}>Flag: {item.flagReason}</Text>

            <View style={styles.reviewStats}>
              <Text style={styles.reviewStatText}>
                Age: {item.ageEstimate} years
              </Text>
              <Text style={styles.reviewStatText}>
                Liveness: {(item.livenessScore * 100).toFixed(1)}%
              </Text>
            </View>

            <Text style={styles.matchScoresTitle}>Face Match Scores:</Text>
            <View style={styles.matchScores}>
              {item.faceMatchScores.map((score, idx) => (
                <Text
                  key={idx}
                  style={[
                    styles.matchScore,
                    score < 0.75 && styles.matchScoreLow,
                  ]}
                >
                  Photo {idx + 1}: {(score * 100).toFixed(1)}%
                </Text>
              ))}
            </View>

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => {
                  Alert.prompt(
                    'Approval Notes',
                    'Enter review notes',
                    (notes) => handleManualOverride(item.userId, true, notes || 'Approved after review')
                  );
                }}
              >
                <Text style={styles.actionButtonText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => {
                  Alert.prompt(
                    'Rejection Reason',
                    'Enter rejection reason',
                    (notes) => {
                      if (notes?.trim()) {
                        handleManualOverride(item.userId, false, notes);
                      }
                    }
                  );
                }}
              >
                <Text style={styles.actionButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {reviewQueue.length === 0 && !loading && (
          <Text style={styles.emptyText}>No items in review queue</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderSearch = () => (
    <View style={styles.content}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter User ID or Email"
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchUsers}
          disabled={loading}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {selectedUser && (
        <View style={styles.userDetailCard}>
          <Text style={styles.detailTitle}>User Verification Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>User ID:</Text>
            <Text style={styles.detailValue}>{selectedUser.userId}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email:</Text>
            <Text style={styles.detailValue}>{selectedUser.email || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <View style={[styles.statusBadge, getStatusBadgeStyle(selectedUser.status)]}>
              <Text style={styles.statusText}>{selectedUser.status}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Attempts:</Text>
            <Text style={styles.detailValue}>{selectedUser.attempts}/7</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Age Verified:</Text>
            <Text style={styles.detailValue}>
              {selectedUser.ageVerified ? '✓ Yes' : '✗ No'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Photos Checked:</Text>
            <Text style={styles.detailValue}>
              {selectedUser.photosChecked ? '✓ Yes' : '✗ No'}
            </Text>
          </View>

          {selectedUser.reasonFailed && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Failure Reason:</Text>
              <Text style={[styles.detailValue, styles.failureText]}>
                {selectedUser.reasonFailed}
              </Text>
            </View>
          )}

          <View style={styles.userActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => {
                Alert.prompt(
                  'Approval Notes',
                  'Enter notes',
                  (notes) => handleManualOverride(selectedUser.userId, true, notes || '')
                );
              }}
            >
              <Text style={styles.actionButtonText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => {
                Alert.prompt(
                  'Rejection Reason',
                  'Enter reason',
                  (notes) => {
                    if (notes?.trim()) {
                      handleManualOverride(selectedUser.userId, false, notes);
                    }
                  }
                );
              }}
            >
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const getStatusBadgeStyle = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return styles.statusVerified;
      case 'PENDING':
        return styles.statusPending;
      case 'FAILED':
        return styles.statusFailed;
      case 'BANNED':
      case 'BANNED_TEMP':
      case 'BANNED_PERMANENT':
        return styles.statusBanned;
      default:
        return styles.statusUnverified;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verification Admin</Text>
      </View>

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
          style={[styles.tab, activeTab === 'queue' && styles.tabActive]}
          onPress={() => setActiveTab('queue')}
        >
          <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>
            Review Queue ({reviewQueue.length})
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

      {loading && users.length === 0 && reviewQueue.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF3366" />
        </View>
      ) : (
        <>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'queue' && renderReviewQueue()}
          {activeTab === 'search' && renderSearch()}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#FF3366',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#FF3366',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
    color: '#1a1a1a',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    marginBottom: 8,
  },
  filterButtonActive: {
    backgroundColor: '#FF3366',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    flex: 1,
    padding: 15,
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  userStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  statText: {
    fontSize: 12,
    color: '#444',
  },
  failureReason: {
    fontSize: 12,
    color: '#d32f2f',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  statusVerified: {
    backgroundColor: '#4caf50',
  },
  statusPending: {
    backgroundColor: '#ff9800',
  },
  statusFailed: {
    backgroundColor: '#f44336',
  },
  statusBanned: {
    backgroundColor: '#9c27b0',
  },
  statusUnverified: {
    backgroundColor: '#757575',
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  approveButton: {
    backgroundColor: '#4caf50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 50,
  },
  reviewCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewUser: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  priorityBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  flagReason: {
    fontSize: 13,
    color: '#d32f2f',
    marginBottom: 10,
  },
  reviewStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  reviewStatText: {
    fontSize: 12,
    color: '#444',
  },
  matchScoresTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 5,
  },
  matchScores: {
    marginBottom: 10,
  },
  matchScore: {
    fontSize: 12,
    color: '#4caf50',
    marginBottom: 3,
  },
  matchScoreLow: {
    color: '#f44336',
  },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 14,
    marginRight: 10,
  },
  searchButton: {
    backgroundColor: '#FF3366',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  userDetailCard: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  failureText: {
    color: '#d32f2f',
  },
});
