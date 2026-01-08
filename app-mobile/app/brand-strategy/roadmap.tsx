import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface Milestone {
  id: string;
  name: string;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completedDate?: Date;
}

interface Phase {
  id: string;
  name: string;
  order: number;
  timeline: string;
  description: string;
  milestones: Milestone[];
  status: 'not_started' | 'in_progress' | 'completed';
}

interface Roadmap {
  id: string;
  careerPath: string;
  phases: Phase[];
  currentPhase: string;
  outcomes: {
    revenue: string[];
    audience: string[];
    products: string[];
    events: string[];
  };
  sustainabilityMetrics: {
    workPace: string;
    burnoutRisk: string;
    restCycles: string[];
  };
}

export default function RoadmapView() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const user = auth.currentUser;

  useEffect(() => {
    loadRoadmap();
  }, []);

  const loadRoadmap = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const getRoadmap = httpsCallable(functions, 'getCareerRoadmap');
      const result = await getRoadmap({ roadmapId: user.uid });
      
      if (result.data && (result.data as any).success) {
        setRoadmap((result.data as any).roadmap);
      }
    } catch (error: any) {
      console.error('Error loading roadmap:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRoadmap();
    setRefreshing(false);
  };

  const updateMilestoneStatus = async (milestoneId: string, status: string) => {
    if (!roadmap || !user) return;

    try {
      const updateStatus = httpsCallable(functions, 'updateMilestoneStatus');
      await updateStatus({
        roadmapId: roadmap.id,
        milestoneId,
        status,
        completedDate: status === 'completed' ? new Date().toISOString() : null,
      });

      const updatedPhases = roadmap.phases.map(phase => ({
        ...phase,
        milestones: phase.milestones.map(m =>
          m.id === milestoneId
            ? { ...m, status: status as any, completedDate: status === 'completed' ? new Date() : undefined }
            : m
        ),
      }));
      setRoadmap({ ...roadmap, phases: updatedPhases });
    } catch (error) {
      console.error('Error updating milestone:', error);
    }
  };

  const getProgress = () => {
    if (!roadmap) return 0;
    const totalMilestones = roadmap.phases.reduce(
      (acc, phase) => acc + phase.milestones.length,
      0
    );
    const completedMilestones = roadmap.phases.reduce(
      (acc, phase) =>
        acc + phase.milestones.filter(m => m.status === 'completed').length,
      0
    );
    return totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your roadmap...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!roadmap) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="map-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Roadmap Yet</Text>
          <Text style={styles.emptyText}>
            Create your career roadmap to track your journey
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/brand-strategy/create-roadmap' as any)}
          >
            <Text style={styles.primaryButtonText}>Create Roadmap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = getProgress();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Career Roadmap</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Overall Progress</Text>
            <Text style={styles.progressPercentage}>{progress.toFixed(0)}%</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressSubtitle}>
            {formatRole(roadmap.careerPath)}
          </Text>
        </View>

        <View style={styles.sustainabilityCard}>
          <Text style={styles.sustainabilityTitle}>Sustainability</Text>
          <View style={styles.sustainabilityRow}>
            <Ionicons name="speedometer-outline" size={20} color="#10B981" />
            <Text style={styles.sustainabilityText}>
              Work Pace: {roadmap.sustainabilityMetrics.workPace}
            </Text>
          </View>
          <View style={styles.sustainabilityRow}>
            <Ionicons
              name={getBurnoutIcon(roadmap.sustainabilityMetrics.burnoutRisk) as any}
              size={20}
              color={getBurnoutColor(roadmap.sustainabilityMetrics.burnoutRisk)}
            />
            <Text style={styles.sustainabilityText}>
              Burnout Risk: {roadmap.sustainabilityMetrics.burnoutRisk}
            </Text>
          </View>
        </View>

        <View style={styles.phasesContainer}>
          {roadmap.phases.map((phase, index) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              isExpanded={expandedPhase === phase.id}
              onToggle={() =>
                setExpandedPhase(expandedPhase === phase.id ? null : phase.id)
              }
              onMilestoneUpdate={updateMilestoneStatus}
              isLast={index === roadmap.phases.length - 1}
            />
          ))}
        </View>

        <View style={styles.outcomesCard}>
          <Text style={styles.outcomesTitle}>Expected Outcomes</Text>
          <OutcomeSection title="Revenue Streams" items={roadmap.outcomes.revenue} />
          <OutcomeSection title="Audience Growth" items={roadmap.outcomes.audience} />
          <OutcomeSection title="Products" items={roadmap.outcomes.products} />
          <OutcomeSection title="Events" items={roadmap.outcomes.events} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PhaseCard({ phase, isExpanded, onToggle, onMilestoneUpdate, isLast }: {
  phase: Phase;
  isExpanded: boolean;
  onToggle: () => void;
  onMilestoneUpdate: (milestoneId: string, status: string) => void;
  isLast: boolean;
}) {
  const completedMilestones = phase.milestones.filter(m => m.status === 'completed').length;
  const totalMilestones = phase.milestones.length;
  const phaseProgress = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

  const getPhaseColor = () => {
    if (phase.status === 'completed') return '#10B981';
    if (phase.status === 'in_progress') return '#007AFF';
    return '#9CA3AF';
  };

  return (
    <View style={styles.phaseCard}>
      <View style={styles.phaseTimeline}>
        <View style={[styles.phaseNumber, { backgroundColor: getPhaseColor() }]}>
          <Text style={styles.phaseNumberText}>{phase.order}</Text>
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      <View style={styles.phaseContent}>
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
          <View style={styles.phaseHeader}>
            <View style={styles.phaseInfo}>
              <Text style={styles.phaseName}>{phase.name}</Text>
              <Text style={styles.phaseTimeline}>{phase.timeline}</Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#6B7280"
            />
          </View>
          <Text style={styles.phaseDescription}>{phase.description}</Text>
          <View style={styles.phaseProgressContainer}>
            <View style={styles.phaseProgressBar}>
              <View
                style={[
                  styles.phaseProgressFill,
                  { width: `${phaseProgress}%`, backgroundColor: getPhaseColor() },
                ]}
              />
            </View>
            <Text style={styles.phaseProgressText}>
              {completedMilestones}/{totalMilestones}
            </Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.milestonesContainer}>
            {phase.milestones.map(milestone => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                onStatusChange={onMilestoneUpdate}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MilestoneCard({ milestone, onStatusChange }: {
  milestone: Milestone;
  onStatusChange: (milestoneId: string, status: string) => void;
}) {
  const getStatusIcon = () => {
    if (milestone.status === 'completed') return 'checkmark-circle';
    if (milestone.status === 'in_progress') return 'ellipse-outline';
    return 'ellipse-outline';
  };

  const getStatusColor = () => {
    if (milestone.status === 'completed') return '#10B981';
    if (milestone.status === 'in_progress') return '#007AFF';
    return '#9CA3AF';
  };

  return (
    <View style={styles.milestoneCard}>
      <View style={styles.milestoneHeader}>
        <Ionicons
          name={getStatusIcon() as any}
          size={24}
          color={getStatusColor()}
        />
        <Text style={styles.milestoneName}>{milestone.name}</Text>
      </View>
      <Text style={styles.milestoneDescription}>{milestone.description}</Text>
      {milestone.completedDate && (
        <Text style={styles.milestoneDate}>
          Completed: {new Date(milestone.completedDate).toLocaleDateString()}
        </Text>
      )}
      {milestone.status !== 'completed' && (
        <TouchableOpacity
          style={styles.milestoneButton}
          onPress={() =>
            onStatusChange(
              milestone.id,
              milestone.status === 'not_started' ? 'in_progress' : 'completed'
            )
          }
        >
          <Text style={styles.milestoneButtonText}>
            {milestone.status === 'not_started' ? 'Start' : 'Complete'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function OutcomeSection({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.outcomeSection}>
      <Text style={styles.outcomeSectionTitle}>{title}</Text>
      {items.map((item, index) => (
        <View key={index} style={styles.outcomeItem}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.outcomeText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function formatRole(role: string): string {
  const roles: Record<string, string> = {
    full_time_creator: 'Full-Time Creator',
    hybrid_creator: 'Hybrid Creator',
    educator: 'Educator',
    entertainer: 'Entertainer',
    coach_trainer: 'Coach/Trainer',
  };
  return roles[role] || role;
}

function getBurnoutIcon(risk: string): string {
  if (risk === 'low') return 'happy-outline';
  if (risk === 'medium') return 'alert-circle-outline';
  return 'warning-outline';
}

function getBurnoutColor(risk: string): string {
  if (risk === 'low') return '#10B981';
  if (risk === 'medium') return '#F59E0B';
  return '#EF4444';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  progressCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  sustainabilityCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sustainabilityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  sustainabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sustainabilityText: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  phasesContainer: {
    paddingHorizontal: 20,
  },
  phaseCard: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  phaseTimeline: {
    alignItems: 'center',
    marginRight: 16,
  },
  phaseNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#E5E7EB',
    marginTop: 8,
  },
  phaseContent: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  phaseDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  phaseProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phaseProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  phaseProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  phaseProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  milestonesContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  milestoneCard: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  milestoneName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  milestoneDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  milestoneDate: {
    fontSize: 12,
    color: '#10B981',
    marginBottom: 8,
  },
  milestoneButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  milestoneButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  outcomesCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  outcomesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  outcomeSection: {
    marginBottom: 16,
  },
  outcomeSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  outcomeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  outcomeText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
});
