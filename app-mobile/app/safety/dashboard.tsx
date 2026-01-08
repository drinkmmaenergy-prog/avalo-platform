/**
 * PACK 126 — Safety Dashboard Screen
 * 
 * User-facing safety control center showing:
 * - Safety insights (non-numerical)
 * - Consent history
 * - Active protections
 * - Available safety tools
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface SafetyDashboard {
  userId: string;
  safetyLevel: 'PROTECTED' | 'STANDARD' | 'NEEDS_ATTENTION';
  activeProtections: string[];
  consentHistory: {
    totalConnections: number;
    activeConsents: number;
    pausedConsents: number;
    revokedConsents: number;
  };
  contactsPaused: string[];
  contactsRevoked: string[];
  blockedUsers: string[];
  availableTools: Array<{
    toolId: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
  }>;
  recentSafetyActions: Array<{
    action: string;
    timestamp: any;
    outcome: string;
  }>;
}

export default function SafetyDashboardScreen() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<SafetyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    if (!user?.uid) return;

    try {
      const getSafetyDashboard = httpsCallable(functions, 'pack126_getSafetyDashboard');
      const result = await getSafetyDashboard({});
      
      if (result.data && typeof result.data === 'object' && 'dashboard' in result.data) {
        setDashboard((result.data as any).dashboard);
      }
    } catch (error) {
      console.error('Error loading safety dashboard:', error);
      Alert.alert('Error', 'Failed to load safety dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const handleToolPress = (toolId: string) => {
    switch (toolId) {
      case 'pause_consent':
      case 'revoke_consent':
        router.push('/safety/consent-management');
        break;
      case 'block_user':
        router.push('/profile/settings/blocked-users');
        break;
      case 'report_user':
        router.push('/support/new');
        break;
      case 'contact_support':
        router.push('/support');
        break;
      case 'privacy_settings':
        router.push('/profile/settings/privacy');
        break;
      case 'safety_center':
        router.push('/safety');
        break;
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading safety dashboard...</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.centered}>
        <Text>No dashboard data available</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Safety Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Your safety controls and protections
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Level</Text>
        <View style={[styles.levelCard, getSafetyLevelStyle(dashboard.safetyLevel)]}>
          <Ionicons
            name={getSafetyLevelIcon(dashboard.safetyLevel)}
            size={32}
            color={getSafetyLevelColor(dashboard.safetyLevel)}
          />
          <View style={styles.levelContent}>
            <Text style={styles.levelText}>{dashboard.safetyLevel}</Text>
            <Text style={styles.levelDescription}>
              {getSafetyLevelDescription(dashboard.safetyLevel)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Protections</Text>
        {dashboard.activeProtections.length === 0 ? (
          <Text style={styles.emptyText}>No active protections</Text>
        ) : (
          dashboard.activeProtections.map((protection, index) => (
            <View key={index} style={styles.protectionItem}>
              <Ionicons name="shield-checkmark" size={20} color="#10b981" />
              <Text style={styles.protectionText}>{protection}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consent History</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard.consentHistory.totalConnections}</Text>
            <Text style={styles.statLabel}>Total Connections</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#10b981' }]}>
              {dashboard.consentHistory.activeConsents}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>
              {dashboard.consentHistory.pausedConsents}
            </Text>
            <Text style={styles.statLabel}>Paused</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#ef4444' }]}>
              {dashboard.consentHistory.revokedConsents}
            </Text>
            <Text style={styles.statLabel}>Ended</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Blocked Users</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {dashboard.blockedUsers.length} user(s) blocked
          </Text>
          {dashboard.blockedUsers.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/profile/settings/blocked-users')}>
              <Text style={styles.linkText}>Manage blocked users →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Safety Tools</Text>
        <View style={styles.toolsGrid}>
          {dashboard.availableTools.map((tool) => (
            <TouchableOpacity
              key={tool.toolId}
              style={styles.toolCard}
              onPress={() => handleToolPress(tool.toolId)}
              disabled={!tool.enabled}
            >
              <Ionicons
                name={getToolIcon(tool.category)}
                size={24}
                color={tool.enabled ? '#3b82f6' : '#9ca3af'}
              />
              <Text style={[styles.toolName, !tool.enabled && styles.toolDisabled]}>
                {tool.name}
              </Text>
              <Text style={styles.toolDescription}>{tool.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {dashboard.recentSafetyActions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {dashboard.recentSafetyActions.slice(0, 5).map((action, index) => (
            <View key={index} style={styles.activityItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <View style={styles.activityContent}>
                <Text style={styles.activityAction}>{action.action}</Text>
                <Text style={styles.activityOutcome}>{action.outcome}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function getSafetyLevelStyle(level: string) {
  switch (level) {
    case 'PROTECTED':
      return { backgroundColor: '#d1fae5', borderColor: '#10b981' };
    case 'NEEDS_ATTENTION':
      return { backgroundColor: '#fee2e2', borderColor: '#ef4444' };
    default:
      return { backgroundColor: '#f3f4f6', borderColor: '#6b7280' };
  }
}

function getSafetyLevelIcon(level: string): any {
  switch (level) {
    case 'PROTECTED':
      return 'shield-checkmark';
    case 'NEEDS_ATTENTION':
      return 'alert-circle';
    default:
      return 'shield-outline';
  }
}

function getSafetyLevelColor(level: string): string {
  switch (level) {
    case 'PROTECTED':
      return '#10b981';
    case 'NEEDS_ATTENTION':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

function getSafetyLevelDescription(level: string): string {
  switch (level) {
    case 'PROTECTED':
      return 'You have active safety protections in place';
    case 'NEEDS_ATTENTION':
      return 'Consider reviewing your safety settings';
    default:
      return 'Standard safety protections are active';
  }
}

function getToolIcon(category: string): any {
  switch (category) {
    case 'CONSENT':
      return 'hand-left-outline';
    case 'BLOCKING':
      return 'ban';
    case 'REPORTING':
      return 'flag';
    case 'SUPPORT':
      return 'help-circle';
    case 'PRIVACY':
      return 'lock-closed';
    default:
      return 'shield';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    padding: 20,
    backgroundColor: '#fff',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  levelContent: {
    flex: 1,
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  levelDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  protectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  protectionText: {
    fontSize: 14,
    color: '#374151',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
  },
  linkText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolCard: {
    width: '47%',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  toolName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  toolDisabled: {
    color: '#9ca3af',
  },
  toolDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 8,
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  activityOutcome: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});
