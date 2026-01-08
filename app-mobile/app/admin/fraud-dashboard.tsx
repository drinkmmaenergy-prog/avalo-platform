/**
 * PACK 324B — Fraud Detection Admin Dashboard
 * 
 * Admin-only UI for viewing fraud signals and risk scores
 * READ-ONLY display - no blocking actions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Types
interface FraudSignal {
  id: string;
  userId: string;
  source: string;
  signalType: string;
  severity: number;
  contextRef: string;
  metadata?: any;
  createdAt: Date;
}

interface UserRiskScore {
  userId: string;
  riskScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  signalCount: number;
  lastSignalType?: string;
  lastSignalDate?: Date;
}

interface DashboardStats {
  totalSignals24h: number;
  totalSignals7d: number;
  totalSignals30d: number;
  highRiskUsers: number;
  criticalRiskUsers: number;
  signalsByType: Record<string, number>;
  signalsBySource: Record<string, number>;
  averageRiskScore: number;
}

type TabType = 'overview' | 'signals' | 'users';
type FilterSource = 'ALL' | 'CHAT' | 'AI_CHAT' | 'AI_VOICE' | 'AI_VIDEO' | 'CALENDAR' | 'EVENT' | 'WALLET';
type FilterLevel = 'ALL' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export default function FraudDashboard() {
  const router = useRouter();
  const functions = getFunctions();
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [highRiskUsers, setHighRiskUsers] = useState<UserRiskScore[]>([]);
  
  // Filters
  const [filterSource, setFilterSource] = useState<FilterSource>('ALL');
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('ALL');
  const [searchUserId, setSearchUserId] = useState('');
  
  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load stats
      const getStats = httpsCallable(functions, 'pack324b_getFraudDashboardStats');
      const statsResult = await getStats({});
      setStats(statsResult.data as DashboardStats);
      
      // Load recent signals
      const getSignals = httpsCallable(functions, 'pack324b_getFraudSignals');
      const signalsResult = await getSignals({
        limit: 20,
        offset: 0,
      });
      setSignals((signalsResult.data as any).signals || []);
      
      // Load high risk users
      const getHighRisk = httpsCallable(functions, 'pack324b_getHighRiskUsers');
      const usersResult = await getHighRisk({
        level: 'HIGH',
        limit: 20,
        offset: 0,
      });
      setHighRiskUsers((usersResult.data as any).users || []);
      
    } catch (error) {
      console.error('Error loading fraud dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Load filtered signals
  const loadFilteredSignals = async () => {
    try {
      const getSignals = httpsCallable(functions, 'pack324b_getFraudSignals');
      const filter: any = {
        limit: 50,
        offset: 0,
      };
      
      if (filterSource !== 'ALL') {
        filter.source = filterSource;
      }
      
      if (searchUserId) {
        filter.userId = searchUserId;
      }
      
      const result = await getSignals(filter);
      setSignals((result.data as any).signals || []);
    } catch (error) {
      console.error('Error loading filtered signals:', error);
    }
  };
  
  // Load filtered users
  const loadFilteredUsers = async () => {
    try {
      const getUsers = httpsCallable(functions, 'pack324b_getHighRiskUsers');
      const filter: any = {
        limit: 50,
        offset: 0,
      };
      
      if (filterLevel !== 'ALL') {
        filter.level = filterLevel;
      }
      
      const result = await getUsers(filter);
      setHighRiskUsers((result.data as any).users || []);
    } catch (error) {
      console.error('Error loading filtered users:', error);
    }
  };
  
  useEffect(() => {
    loadDashboardData();
  }, []);
  
  useEffect(() => {
    if (activeTab === 'signals') {
      loadFilteredSignals();
    }
  }, [filterSource, searchUserId]);
  
  useEffect(() => {
    if (activeTab === 'users') {
      loadFilteredUsers();
    }
  }, [filterLevel]);
  
  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };
  
  // Helper functions
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return '#7f1d1d';
      case 'HIGH': return '#ef4444';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#10b981';
      default: return '#6b7280';
    }
  };
  
  const getSeverityColor = (severity: number) => {
    if (severity >= 5) return '#7f1d1d';
    if (severity >= 4) return '#ef4444';
    if (severity >= 3) return '#f59e0b';
    if (severity >= 2) return '#fbbf24';
    return '#fcd34d';
  };
  
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };
  
  const formatSignalType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Render loading state
  if (loading && !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading fraud dashboard...</Text>
        </View>
      </View>
    );
  }
  
  // Render overview tab
  const renderOverview = () => (
    <ScrollView
      style={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Signal Activity</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalSignals24h || 0}</Text>
            <Text style={styles.statLabel}>Last 24h</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalSignals7d || 0}</Text>
            <Text style={styles.statLabel}>Last 7 days</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalSignals30d || 0}</Text>
            <Text style={styles.statLabel}>Last 30 days</Text>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>Risk Overview</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: '#ef4444', borderLeftWidth: 4 }]}>
            <Text style={styles.statValue}>{stats?.highRiskUsers || 0}</Text>
            <Text style={styles.statLabel}>High Risk</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#7f1d1d', borderLeftWidth: 4 }]}>
            <Text style={styles.statValue}>{stats?.criticalRiskUsers || 0}</Text>
            <Text style={styles.statLabel}>Critical Risk</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.averageRiskScore || 0}</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>Signals by Type</Text>
        <View style={styles.listContainer}>
          {Object.entries(stats?.signalsByType || {}).map(([type, count]) => (
            <View key={type} style={styles.listItem}>
              <Text style={styles.listItemText}>{formatSignalType(type)}</Text>
              <Text style={styles.listItemValue}>{count}</Text>
            </View>
          ))}
        </View>
        
        <Text style={styles.sectionTitle}>Signals by Source</Text>
        <View style={styles.listContainer}>
          {Object.entries(stats?.signalsBySource || {}).map(([source, count]) => (
            <View key={source} style={styles.listItem}>
              <Text style={styles.listItemText}>{source}</Text>
              <Text style={styles.listItemValue}>{count}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
  
  // Render signals tab
  const renderSignals = () => (
    <ScrollView style={styles.content}>
      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Source:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['ALL', 'CHAT', 'AI_CHAT', 'AI_VOICE', 'AI_VIDEO', 'CALENDAR', 'EVENT', 'WALLET'] as FilterSource[]).map(source => (
            <TouchableOpacity
              key={source}
              style={[styles.filterButton, filterSource === source && styles.filterButtonActive]}
              onPress={() => setFilterSource(source)}
            >
              <Text style={[styles.filterButtonText, filterSource === source && styles.filterButtonTextActive]}>
                {source}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <Text style={styles.filterLabel}>User ID:</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by user ID"
          value={searchUserId}
          onChangeText={setSearchUserId}
          autoCapitalize="none"
        />
      </View>
      
      <View style={styles.listContainer}>
        {signals.map(signal => (
          <TouchableOpacity
            key={signal.id}
            style={styles.signalCard}
            onPress={() => router.push(`/admin/signal-detail?id=${signal.id}` as any)}
          >
            <View style={styles.signalHeader}>
              <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(signal.severity) }]}>
                <Text style={styles.severityText}>Severity {signal.severity}</Text>
              </View>
              <Text style={styles.signalSource}>{signal.source}</Text>
            </View>
            <Text style={styles.signalType}>{formatSignalType(signal.signalType)}</Text>
            <Text style={styles.signalUser}>User: {signal.userId}</Text>
            <Text style={styles.signalDate}>{formatDate(signal.createdAt)}</Text>
            {signal.metadata && (
              <Text style={styles.signalMetadata} numberOfLines={2}>
                {JSON.stringify(signal.metadata)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
  
  // Render users tab
  const renderUsers = () => (
    <ScrollView style={styles.content}>
      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Risk Level:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['ALL', 'MEDIUM', 'HIGH', 'CRITICAL'] as FilterLevel[]).map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.filterButton, filterLevel === level && styles.filterButtonActive]}
              onPress={() => setFilterLevel(level)}
            >
              <Text style={[styles.filterButtonText, filterLevel === level && styles.filterButtonTextActive]}>
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      <View style={styles.listContainer}>
        {highRiskUsers.map(user => (
          <TouchableOpacity
            key={user.userId}
            style={styles.userCard}
            onPress={() => router.push(`/admin/user-risk-detail?userId=${user.userId}` as any)}
          >
            <View style={styles.userHeader}>
              <Text style={styles.userId}>{user.userId}</Text>
              <View style={[styles.riskBadge, { backgroundColor: getRiskColor(user.level) }]}>
                <Text style={styles.riskBadgeText}>{user.level}</Text>
              </View>
            </View>
            <View style={styles.userStats}>
              <View style={styles.userStat}>
                <Text style={styles.userStatLabel}>Risk Score</Text>
                <Text style={styles.userStatValue}>{user.riskScore}</Text>
              </View>
              <View style={styles.userStat}>
                <Text style={styles.userStatLabel}>Signals</Text>
                <Text style={styles.userStatValue}>{user.signalCount}</Text>
              </View>
            </View>
            {user.lastSignalType && (
              <Text style={styles.userLastSignal}>
                Last: {formatSignalType(user.lastSignalType)}
              </Text>
            )}
            {user.lastSignalDate && (
              <Text style={styles.userDate}>{formatDate(user.lastSignalDate)}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fraud Detection Dashboard</Text>
        <Text style={styles.headerSubtitle}>Real-time abuse signals & risk scores</Text>
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
          style={[styles.tab, activeTab === 'signals' && styles.tabActive]}
          onPress={() => setActiveTab('signals')}
        >
          <Text style={[styles.tabText, activeTab === 'signals' && styles.tabTextActive]}>
            Signals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            High Risk Users
          </Text>
        </TouchableOpacity>
      </View>
      
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'signals' && renderSignals()}
      {activeTab === 'users' && renderUsers()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  statsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  listItemText: {
    fontSize: 14,
    color: '#374151',
  },
  listItemValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  filtersContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  signalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  signalSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  signalType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  signalUser: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  signalDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  signalMetadata: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  userStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  userStat: {
    flex: 1,
  },
  userStatLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  userStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  userLastSignal: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  userDate: {
    fontSize: 12,
    color: '#6b7280',
  },
});
