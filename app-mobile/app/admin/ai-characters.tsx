/**
 * PACK 185 - AI Characters Admin Console
 * 
 * Admin tools for managing and moderating AI characters
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { aiCharacters, AICharacter } from "@/lib/aiCharacters";
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import app from "@/lib/firebase";

const db = getFirestore(app);

interface SafetyReport {
  reportId: string;
  characterId: string;
  reporterId: string;
  reason: string;
  details: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reportedAt: Timestamp;
}

export default function AICharactersAdminScreen() {
  const auth = getAuth();
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'under_review' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'characters' | 'reports'>('characters');

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadCharacters(),
      loadReports(),
    ]);
    setLoading(false);
  };

  const loadCharacters = async () => {
    try {
      const allCharacters = await aiCharacters.getAllCharacters(100);
      
      let filtered = allCharacters;
      if (filter !== 'all') {
        filtered = allCharacters.filter(c => c.status === filter);
      }
      
      setCharacters(filtered);
    } catch (error) {
      console.error('Error loading characters:', error);
    }
  };

  const loadReports = async () => {
    try {
      const reportsQuery = query(
        collection(db, 'ai_character_safety_reports'),
        where('status', '==', 'pending')
      );
      
      const reportsSnap = await getDocs(reportsQuery);
      const reportsData = reportsSnap.docs.map(doc => ({
        reportId: doc.id,
        ...doc.data(),
      })) as SafetyReport[];
      
      setReports(reportsData);
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  };

  const handleUpdateCharacterStatus = async (
    characterId: string,
    newStatus: 'active' | 'inactive' | 'under_review'
  ) => {
    try {
      await updateDoc(doc(db, 'ai_characters', characterId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      
      Alert.alert('Success', `Character status updated to ${newStatus}`);
      loadData();
    } catch (error) {
      console.error('Error updating character status:', error);
      Alert.alert('Error', 'Failed to update character status');
    }
  };

  const handleReviewReport = async (reportId: string, action: 'resolve' | 'dismiss') => {
    try {
      await updateDoc(doc(db, 'ai_character_safety_reports', reportId), {
        status: action === 'resolve' ? 'resolved' : 'dismissed',
        reviewedAt: Timestamp.now(),
        reviewedBy: auth.currentUser?.uid,
      });
      
      Alert.alert('Success', `Report ${action}d`);
      loadData();
    } catch (error) {
      console.error('Error reviewing report:', error);
      Alert.alert('Error', 'Failed to review report');
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    Alert.alert(
      'Delete Character',
      'Are you sure you want to permanently delete this character? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await aiCharacters.deleteCharacter(characterId);
              Alert.alert('Success', 'Character deleted');
              loadData();
            } catch (error) {
              console.error('Error deleting character:', error);
              Alert.alert('Error', 'Failed to delete character');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Loading admin console...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Characters Admin</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{characters.length}</Text>
            <Text style={styles.statLabel}>Characters</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {reports.length}
            </Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'characters' && styles.tabActive]}
          onPress={() => setSelectedTab('characters')}
        >
          <Text style={[styles.tabText, selectedTab === 'characters' && styles.tabTextActive]}>
            Characters
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'reports' && styles.tabActive]}
          onPress={() => setSelectedTab('reports')}
        >
          <Text style={[styles.tabText, selectedTab === 'reports' && styles.tabTextActive]}>
            Reports ({reports.length})
          </Text>
        </TouchableOpacity>
      </View>

      {selectedTab === 'characters' ? (
        <>
          {/* Filters */}
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filter === 'active' && styles.filterChipActive]}
                onPress={() => setFilter('active')}
              >
                <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filter === 'under_review' && styles.filterChipActive]}
                onPress={() => setFilter('under_review')}
              >
                <Text style={[styles.filterText, filter === 'under_review' && styles.filterTextActive]}>
                  Under Review
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filter === 'inactive' && styles.filterChipActive]}
                onPress={() => setFilter('inactive')}
              >
                <Text style={[styles.filterText, filter === 'inactive' && styles.filterTextActive]}>
                  Inactive
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Characters List */}
          <ScrollView style={styles.content}>
            {characters.map((character) => (
              <CharacterAdminCard
                key={character.characterId}
                character={character}
                onUpdateStatus={handleUpdateCharacterStatus}
                onDelete={handleDeleteCharacter}
              />
            ))}
          </ScrollView>
        </>
      ) : (
        /* Reports List */
        <ScrollView style={styles.content}>
          {reports.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No pending reports</Text>
            </View>
          ) : (
            reports.map((report) => (
              <ReportCard
                key={report.reportId}
                report={report}
                onReview={handleReviewReport}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

interface CharacterAdminCardProps {
  character: AICharacter;
  onUpdateStatus: (id: string, status: 'active' | 'inactive' | 'under_review') => void;
  onDelete: (id: string) => void;
}

function CharacterAdminCard({ character, onUpdateStatus, onDelete }: CharacterAdminCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10B981';
      case 'under_review': return '#F59E0B';
      case 'inactive': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{character.name}</Text>
            <Text style={styles.cardDetails}>
              {character.age} • {character.currentLocation} • Safety: {character.safetyScore}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(character.status) }]}>
            <Text style={styles.statusText}>{character.status}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardExpanded}>
          <Text style={styles.expandedLabel}>Personality: {character.personalityStyle}</Text>
          <Text style={styles.expandedLabel}>Communication: {character.communicationVibe}</Text>
          <Text style={styles.expandedLabel}>Flirt Style: {character.flirtStyle}</Text>
          
          <View style={styles.actionButtons}>
            {character.status !== 'active' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonActive]}
                onPress={() => onUpdateStatus(character.characterId, 'active')}
              >
                <Text style={styles.actionButtonText}>Activate</Text>
              </TouchableOpacity>
            )}
            
            {character.status !== 'under_review' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonReview]}
                onPress={() => onUpdateStatus(character.characterId, 'under_review')}
              >
                <Text style={styles.actionButtonText}>Under Review</Text>
              </TouchableOpacity>
            )}
            
            {character.status !== 'inactive' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonInactive]}
                onPress={() => onUpdateStatus(character.characterId, 'inactive')}
              >
                <Text style={styles.actionButtonText}>Deactivate</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDelete]}
              onPress={() => onDelete(character.characterId)}
            >
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

interface ReportCardProps {
  report: SafetyReport;
  onReview: (reportId: string, action: 'resolve' | 'dismiss') => void;
}

function ReportCard({ report, onReview }: ReportCardProps) {
  return (
    <View style={styles.reportCard}>
      <Text style={styles.reportReason}>Reason: {report.reason}</Text>
      <Text style={styles.reportDetails}>{report.details}</Text>
      <Text style={styles.reportMeta}>
        Character ID: {report.characterId.substring(0, 8)}...
      </Text>
      <Text style={styles.reportMeta}>
        Reported: {report.reportedAt.toDate().toLocaleDateString()}
      </Text>
      
      <View style={styles.reportActions}>
        <TouchableOpacity
          style={[styles.reportButton, styles.reportButtonResolve]}
          onPress={() => onReview(report.reportId, 'resolve')}
        >
          <Text style={styles.reportButtonText}>Resolve</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.reportButton, styles.reportButtonDismiss]}
          onPress={() => onReview(report.reportId, 'dismiss')}
        >
          <Text style={styles.reportButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    marginRight: 32,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#7C3AED',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#7C3AED',
  },
  filterContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardExpanded: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  expandedLabel: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  actionButtonActive: {
    backgroundColor: '#10B981',
  },
  actionButtonReview: {
    backgroundColor: '#F59E0B',
  },
  actionButtonInactive: {
    backgroundColor: '#6B7280',
  },
  actionButtonDelete: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reportReason: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 8,
  },
  reportDetails: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 12,
  },
  reportMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  reportActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  reportButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  reportButtonResolve: {
    backgroundColor: '#10B981',
  },
  reportButtonDismiss: {
    backgroundColor: '#6B7280',
  },
  reportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
