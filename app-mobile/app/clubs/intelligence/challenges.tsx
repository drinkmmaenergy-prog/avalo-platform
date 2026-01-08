/**
 * PACK 193 — Club Challenges & Missions
 * Safe, educational challenges only (NO flirting, popularity contests, etc.)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface Challenge {
  challengeId: string;
  title: string;
  description: string;
  type: string;
  difficulty: string;
  startDate: any;
  endDate: any;
  participantCount: number;
  completionCount: number;
  isActive: boolean;
}

const CHALLENGE_TYPES = [
  { value: 'fitness', label: 'Fitness', icon: '💪', color: '#E74C3C' },
  { value: 'language', label: 'Language', icon: '🗣️', color: '#3498DB' },
  { value: 'business', label: 'Business', icon: '💼', color: '#9B59B6' },
  { value: 'creativity', label: 'Creativity', icon: '🎨', color: '#F39C12' },
  { value: 'team_project', label: 'Team Project', icon: '🤝', color: '#27AE60' },
];

const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Beginner', icon: '⭐' },
  { value: 'intermediate', label: 'Intermediate', icon: '⭐⭐' },
  { value: 'advanced', label: 'Advanced', icon: '⭐⭐⭐' },
];

export default function ClubChallenges() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (clubId) {
      loadChallenges();
    }
  }, [clubId]);

  const loadChallenges = async () => {
    try {
      setLoading(true);
      // Note: This would need a backend function to list challenges
      // For now, we'll show the UI structure
      setChallenges([]);
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChallenge = async () => {
    if (!title || !description || !selectedType || !selectedDifficulty) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);

      const result = await httpsCallable(functions, 'createClubChallenge')({
        clubId,
        title,
        description,
        type: selectedType,
        difficulty: selectedDifficulty,
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert('Success', 'Challenge created successfully!');
        setShowCreateModal(false);
        resetForm();
        loadChallenges();
      } else {
        Alert.alert('Error', data.error || 'Failed to create challenge');
      }
    } catch (error: any) {
      console.error('Error creating challenge:', error);
      Alert.alert('Error', error.message || 'Failed to create challenge');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedType('');
    setSelectedDifficulty('');
    setStartDate('');
    setEndDate('');
  };

  const getTypeConfig = (type: string) => {
    return CHALLENGE_TYPES.find(t => t.value === type) || CHALLENGE_TYPES[0];
  };

  const getDifficultyConfig = (difficulty: string) => {
    return DIFFICULTY_LEVELS.find(d => d.value === difficulty) || DIFFICULTY_LEVELS[0];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading challenges...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club Challenges</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#4A90E2" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Safety Banner */}
        <View style={styles.safetyBanner}>
          <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
          <Text style={styles.safetyText}>
            Only safe, educational challenges allowed. No flirting, popularity contests, or attractiveness challenges.
          </Text>
        </View>

        {/* Active Challenges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Challenges</Text>
          {challenges.length > 0 ? (
            challenges
              .filter(c => c.isActive)
              .map((challenge) => {
                const typeConfig = getTypeConfig(challenge.type);
                const difficultyConfig = getDifficultyConfig(challenge.difficulty);
                const completionRate = challenge.participantCount > 0
                  ? Math.round((challenge.completionCount / challenge.participantCount) * 100)
                  : 0;

                return (
                  <TouchableOpacity
                    key={challenge.challengeId}
                    style={[styles.challengeCard, { borderLeftColor: typeConfig.color }]}
                  >
                    <View style={styles.challengeHeader}>
                      <Text style={styles.challengeIcon}>{typeConfig.icon}</Text>
                      <View style={styles.challengeHeaderInfo}>
                        <Text style={styles.challengeTitle}>{challenge.title}</Text>
                        <View style={styles.challengeMetaRow}>
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>{typeConfig.label}</Text>
                          </View>
                          <Text style={styles.difficultyText}>{difficultyConfig.icon}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.challengeDescription} numberOfLines={2}>
                      {challenge.description}
                    </Text>

                    <View style={styles.challengeStats}>
                      <View style={styles.statItem}>
                        <Ionicons name="people" size={16} color="#7F8C8D" />
                        <Text style={styles.statText}>{challenge.participantCount} joined</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
                        <Text style={styles.statText}>{completionRate}% completed</Text>
                      </View>
                    </View>

                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="trophy" size={48} color="#BDC3C7" />
              <Text style={styles.emptyText}>No active challenges</Text>
              <Text style={styles.emptySubtext}>Create a challenge to motivate members!</Text>
            </View>
          )}
        </View>

        {/* Challenge Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Challenge Types</Text>
          <View style={styles.typeGrid}>
            {CHALLENGE_TYPES.map((type) => (
              <View key={type.value} style={[styles.typeCard, { borderColor: type.color }]}>
                <Text style={styles.typeCardIcon}>{type.icon}</Text>
                <Text style={styles.typeCardLabel}>{type.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Forbidden Challenges */}
        <View style={styles.forbiddenSection}>
          <Text style={styles.forbiddenTitle}>🚫 Forbidden Challenge Types</Text>
          <View style={styles.forbiddenItem}>
            <Ionicons name="close-circle" size={16} color="#E74C3C" />
            <Text style={styles.forbiddenText}>Flirting or seduction challenges</Text>
          </View>
          <View style={styles.forbiddenItem}>
            <Ionicons name="close-circle" size={16} color="#E74C3C" />
            <Text style={styles.forbiddenText}>Popularity or attractiveness contests</Text>
          </View>
          <View style={styles.forbiddenItem}>
            <Ionicons name="close-circle" size={16} color="#E74C3C" />
            <Text style={styles.forbiddenText}>Jealousy or humiliation tasks</Text>
          </View>
          <View style={styles.forbiddenItem}>
            <Ionicons name="close-circle" size={16} color="#E74C3C" />
            <Text style={styles.forbiddenText}>Spending or wealth competitions</Text>
          </View>
        </View>
      </ScrollView>

      {/* Create Challenge Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Challenge</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#2C3E50" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Title */}
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., 30-Day Fitness Challenge"
                maxLength={100}
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the challenge goals and activities..."
                multiline
                numberOfLines={4}
                maxLength={500}
              />

              {/* Type */}
              <Text style={styles.inputLabel}>Challenge Type *</Text>
              <View style={styles.typeSelector}>
                {CHALLENGE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeSelectorItem,
                      selectedType === type.value && styles.typeSelectorItemSelected,
                    ]}
                    onPress={() => setSelectedType(type.value)}
                  >
                    <Text style={styles.typeSelectorIcon}>{type.icon}</Text>
                    <Text style={styles.typeSelectorLabel}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Difficulty */}
              <Text style={styles.inputLabel}>Difficulty *</Text>
              <View style={styles.difficultySelector}>
                {DIFFICULTY_LEVELS.map((level) => (
                  <TouchableOpacity
                    key={level.value}
                    style={[
                      styles.difficultySelectorItem,
                      selectedDifficulty === level.value && styles.difficultySelectorItemSelected,
                    ]}
                    onPress={() => setSelectedDifficulty(level.value)}
                  >
                    <Text style={styles.difficultyIcon}>{level.icon}</Text>
                    <Text style={styles.difficultyLabel}>{level.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleCreateChallenge}
                disabled={creating || !title || !description || !selectedType || !selectedDifficulty}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Create Challenge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  addButton: {
    padding: 8,
  },
  safetyBanner: {
    flexDirection: 'row',
    backgroundColor: '#D5F4E6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
    gap: 8,
  },
  safetyText: {
    flex: 1,
    fontSize: 13,
    color: '#27AE60',
    lineHeight: 18,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  challengeCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  challengeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  challengeHeaderInfo: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 6,
  },
  challengeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7F8C8D',
  },
  difficultyText: {
    fontSize: 14,
  },
  challengeDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    lineHeight: 20,
    marginBottom: 12,
  },
  challengeStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#ECF0F1',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#27AE60',
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7F8C8D',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#95A5A6',
    marginTop: 4,
    textAlign: 'center',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  typeCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
  },
  forbiddenSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  forbiddenTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E74C3C',
    marginBottom: 12,
  },
  forbiddenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  forbiddenText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2C3E50',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ECF0F1',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  typeSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeSelectorItemSelected: {
    backgroundColor: '#E8F4FD',
    borderColor: '#4A90E2',
  },
  typeSelectorIcon: {
    fontSize: 18,
  },
  typeSelectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
  },
  difficultySelector: {
    gap: 8,
    marginBottom: 20,
  },
  difficultySelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  difficultySelectorItemSelected: {
    backgroundColor: '#FFF4E5',
    borderColor: '#F39C12',
  },
  difficultyIcon: {
    fontSize: 18,
  },
  difficultyLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1',
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#4A90E2',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  buttonSecondary: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#BDC3C7',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7F8C8D',
  },
});
