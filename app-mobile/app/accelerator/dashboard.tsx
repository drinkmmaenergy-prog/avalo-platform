import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import TierProgressBar from "@/components/accelerator/TierProgressBar";
import GrantRequestCard from "@/components/accelerator/GrantRequestCard";

interface ParticipantData {
  userId: string;
  userName: string;
  tier: 'starter' | 'growth' | 'pro' | 'partner';
  ethicsAgreementSigned: boolean;
  progress: {
    workshopsCompleted: number;
    mentoringSessions: number;
    grantsReceived: number;
    businessMilestones: number;
  };
  currentGoals: string[];
}

export default function AcceleratorDashboard() {
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const mockParticipant: ParticipantData = {
        userId: '1',
        userName: 'John Creator',
        tier: 'growth',
        ethicsAgreementSigned: true,
        progress: {
          workshopsCompleted: 4,
          mentoringSessions: 5,
          grantsReceived: 1,
          businessMilestones: 2,
        },
        currentGoals: [
          'Improve video production quality',
          'Build sustainable income streams',
          'Grow audience engagement',
        ],
      };

      const mockGrants = [
        {
          requestId: '1',
          grantType: 'equipment' as const,
          amount: 2500,
          purpose: 'Purchase professional camera and lighting equipment',
          status: 'disbursed' as const,
          requestedAt: new Date('2024-11-01'),
          approvedAmount: 2500,
        },
        {
          requestId: '2',
          grantType: 'marketing' as const,
          amount: 1000,
          purpose: 'Social media advertising campaign',
          status: 'under_review' as const,
          requestedAt: new Date('2024-11-20'),
        },
      ];

      setParticipant(mockParticipant);
      setGrants(mockGrants);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  if (loading && !participant) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (!participant) {
    return (
      <View style={styles.notParticipantContainer}>
        <Text style={styles.notParticipantTitle}>Join the Accelerator</Text>
        <Text style={styles.notParticipantText}>
          You're not currently enrolled in the Creator Accelerator program.
        </Text>
        <TouchableOpacity
          style={styles.applyButton}
          onPress={() => router.push('/accelerator/apply')}
        >
          <Text style={styles.applyButtonText}>Apply Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!participant.ethicsAgreementSigned) {
    return (
      <View style={styles.ethicsWarningContainer}>
        <Text style={styles.ethicsWarningTitle}>⚠️ Ethics Agreement Required</Text>
        <Text style={styles.ethicsWarningText}>
          You must sign the professional ethics agreement before accessing accelerator resources.
        </Text>
        <TouchableOpacity
          style={styles.signButton}
          onPress={() => router.push('/accelerator/ethics-agreement')}
        >
          <Text style={styles.signButtonText}>Sign Ethics Agreement</Text>
        </TouchableOpacity>
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
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.userName}>{participant.userName}</Text>
      </View>

      <TierProgressBar
        currentTier={participant.tier}
        progress={participant.progress}
      />

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/accelerator/mentors')}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionTitle}>Find Mentor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/accelerator/request-grant')}
          >
            <Text style={styles.actionIcon}>💰</Text>
            <Text style={styles.actionTitle}>Request Grant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/accelerator/workshops')}
          >
            <Text style={styles.actionIcon}>📚</Text>
            <Text style={styles.actionTitle}>Workshops</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/accelerator/resources')}
          >
            <Text style={styles.actionIcon}>🎓</Text>
            <Text style={styles.actionTitle}>Resources</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.goalsSection}>
        <Text style={styles.sectionTitle}>Current Goals</Text>
        {participant.currentGoals.map((goal, index) => (
          <View key={index} style={styles.goalItem}>
            <Text style={styles.goalBullet}>•</Text>
            <Text style={styles.goalText}>{goal}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grantsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Grants</Text>
          <TouchableOpacity onPress={() => router.push('/accelerator/grants')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {grants.length === 0 ? (
          <View style={styles.emptyGrants}>
            <Text style={styles.emptyText}>No grants yet</Text>
            <TouchableOpacity
              style={styles.requestGrantButton}
              onPress={() => router.push('/accelerator/request-grant')}
            >
              <Text style={styles.requestGrantButtonText}>Request Your First Grant</Text>
            </TouchableOpacity>
          </View>
        ) : (
          grants.map((grant) => (
            <GrantRequestCard key={grant.requestId} grant={grant} />
          ))
        )}
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Your Progress</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{participant.progress.workshopsCompleted}</Text>
            <Text style={styles.statLabel}>Workshops</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{participant.progress.mentoringSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{participant.progress.grantsReceived}</Text>
            <Text style={styles.statLabel}>Grants</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{participant.progress.businessMilestones}</Text>
            <Text style={styles.statLabel}>Milestones</Text>
          </View>
        </View>
      </View>

      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>🛡️ Your Safety Matters</Text>
        <Text style={styles.safetyText}>
          If anyone crosses the line or plays favoritism — let us know immediately.
        </Text>
        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => router.push('/accelerator/report-violation')}
        >
          <Text style={styles.reportButtonText}>Report an Issue</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  notParticipantContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#f8fafc',
  },
  notParticipantTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  notParticipantText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  applyButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ethicsWarningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fef3c7',
  },
  ethicsWarningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 12,
    textAlign: 'center',
  },
  ethicsWarningText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  signButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  signButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  welcomeText: {
    fontSize: 14,
    color: '#64748b',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  quickActions: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  actionCard: {
    width: '50%',
    padding: 8,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  goalsSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  goalItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  goalBullet: {
    fontSize: 16,
    color: '#3b82f6',
    marginRight: 8,
  },
  goalText: {
    flex: 1,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  grantsSection: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  emptyGrants: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  requestGrantButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  requestGrantButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  safetyCard: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 8,
  },
  safetyText: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
    marginBottom: 12,
  },
  reportButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  spacer: {
    height: 40,
  },
});
