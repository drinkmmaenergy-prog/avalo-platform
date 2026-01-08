/**
 * Creator Goals Dashboard
 * Shows creator's active and past goals
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import {
  getCreatorGoals,
  GoalSummary,
  formatProgressPercentage,
  formatDaysRemaining,
  formatTokenAmount,
  getCategoryDisplayName,
  getCategoryIcon,
} from "@/services/goalsService";

export default function CreatorGoalsDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeGoals, setActiveGoals] = useState<GoalSummary[]>([]);
  const [pastGoals, setPastGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPastGoals, setShowPastGoals] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      loadGoals();
    }
  }, [user]);

  const loadGoals = async () => {
    if (!user?.uid) return;

    try {
      // Load active goals
      const activeResult = await getCreatorGoals(user.uid, false, 10);
      setActiveGoals(activeResult.goals);

      // Load past goals if needed
      if (showPastGoals) {
        const pastResult = await getCreatorGoals(user.uid, true, 10);
        setPastGoals(pastResult.goals.filter(g => !g.isActive));
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadGoals();
  };

  const handleCreateGoal = () => {
    router.push('/creator/goals/new' as any);
  };

  const handleGoalPress = (goalId: string) => {
    router.push(`/creator/goals/${goalId}` as any);
  };

  const renderGoalCard = (goal: GoalSummary) => {
    const progressPercentage = goal.progressPercentage;

    return (
      <TouchableOpacity
        key={goal.goalId}
        style={styles.goalCard}
        onPress={() => handleGoalPress(goal.goalId)}
        activeOpacity={0.7}
      >
        <View style={styles.goalHeader}>
          <View style={styles.goalTitleRow}>
            <Text style={styles.goalIcon}>{getCategoryIcon(goal.category)}</Text>
            <Text style={styles.goalTitle} numberOfLines={1}>
              {goal.title}
            </Text>
          </View>
          <Text style={styles.goalCategory}>
            {getCategoryDisplayName(goal.category)}
          </Text>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercentage}%` as any }]} />
          </View>
          <Text style={styles.progressText}>
            {formatProgressPercentage(goal.currentTokens, goal.targetTokens)} zrealizowano
          </Text>
        </View>

        <View style={styles.goalStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatTokenAmount(goal.currentTokens)}</Text>
            <Text style={styles.statLabel}>z {formatTokenAmount(goal.targetTokens)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{goal.supportersCount}</Text>
            <Text style={styles.statLabel}>wspierających</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatDaysRemaining(goal.daysRemaining)}</Text>
            <Text style={styles.statLabel}>pozostało</Text>
          </View>
        </View>

        {!goal.isActive && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {goal.status === 'completed' ? '✓ Zrealizowany' : 'Zamknięty'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4AA" />
        <Text style={styles.loadingText}>Ładowanie celów...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cele zarobkowe</Text>
        <Text style={styles.headerSubtitle}>
          {activeGoals.length}/3 aktywnych celów
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeGoals.length < 3 && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateGoal}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonIcon}>+</Text>
            <Text style={styles.createButtonText}>Dodaj nowy cel</Text>
          </TouchableOpacity>
        )}

        {activeGoals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Nie masz jeszcze celów</Text>
            <Text style={styles.emptyText}>
              Stwórz swój pierwszy cel zarobkowy i zacznij zbierać wsparcie od
              swojej społeczności!
            </Text>
          </View>
        ) : (
          <View style={styles.goalsSection}>
            <Text style={styles.sectionTitle}>Aktywne cele</Text>
            {activeGoals.map(renderGoalCard)}
          </View>
        )}

        {pastGoals.length > 0 && (
          <View style={styles.goalsSection}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowPastGoals(!showPastGoals)}
            >
              <Text style={styles.sectionTitle}>Zakończone cele</Text>
              <Text style={styles.sectionToggle}>
                {showPastGoals ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>
            {showPastGoals && pastGoals.map(renderGoalCard)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderWidth: 2,
    borderColor: '#00D4AA',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  createButtonIcon: {
    fontSize: 24,
    color: '#00D4AA',
    marginRight: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00D4AA',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  goalsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  sectionToggle: {
    fontSize: 14,
    color: '#999',
  },
  goalCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  goalHeader: {
    marginBottom: 12,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  goalIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  goalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  goalCategory: {
    fontSize: 12,
    color: '#999',
    marginLeft: 28,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00D4AA',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
  },
  goalStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00D4AA',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
  },
  statusBadge: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  statusText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
