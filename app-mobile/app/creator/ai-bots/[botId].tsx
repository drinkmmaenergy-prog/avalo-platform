/**
 * Edit AI Bot Screen
 * Similar to create but pre-populated with existing bot data
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Slider from '@react-native-community/slider';
import {
  getBotInfo,
  updateBot,
  deleteBot,
  validateBotData,
  AIBot,
  BotGender,
  BotRoleArchetype,
  WritingTone,
} from '../../../services/aiBotService';
import {
  AI_BOT_CONFIG,
  calculateEarningsPreview,
  getPricingRecommendation,
} from '../../../config/aiMonetization';

export default function EditAIBotScreen() {
  const router = useRouter();
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bot, setBot] = useState<AIBot | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [roleArchetype, setRoleArchetype] = useState<BotRoleArchetype>('friend');
  const [writingTone, setWritingTone] = useState<WritingTone>('friendly');
  const [nsfwEnabled, setNsfwEnabled] = useState(false);
  const [pricePerMessage, setPricePerMessage] = useState<number>(AI_BOT_CONFIG.RECOMMENDED_PRICE);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    loadBot();
  }, [botId]);

  const loadBot = async () => {
    try {
      const botData = await getBotInfo(botId);
      setBot(botData);
      
      // Populate form
      setName(botData.name);
      setPersonality(botData.personality);
      setRoleArchetype(botData.roleArchetype);
      setWritingTone(botData.writingTone);
      setNsfwEnabled(botData.nsfwEnabled);
      setPricePerMessage(botData.pricing.perMessage);
      setIsPaused(botData.isPaused);
    } catch (error) {
      Alert.alert('Error', 'Failed to load bot');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const validation = validateBotData({
      name,
      personality,
      roleArchetype,
      writingTone,
      nsfwEnabled,
      pricing: { perMessage: pricePerMessage },
      age: bot?.age || 25,
      gender: bot?.gender || 'female',
      interests: [],
      languages: ['en'],
    });

    if (!validation.valid) {
      Alert.alert('Validation Error', validation.errors.join('\n'));
      return;
    }

    setSaving(true);
    try {
      await updateBot(botId, {
        name,
        personality,
        roleArchetype,
        writingTone,
        nsfwEnabled,
        pricing: { perMessage: pricePerMessage },
        isPaused,
      } as any);

      Alert.alert('Success', 'Bot updated successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update bot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Bot',
      `Are you sure you want to delete ${bot?.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBot(botId);
              Alert.alert('Success', 'Bot deleted', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete bot');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.textDark]}>
          Loading bot...
        </Text>
      </View>
    );
  }

  const earningsPreview = calculateEarningsPreview(pricePerMessage);
  const pricingRecommendation = getPricingRecommendation(pricePerMessage);

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Stats */}
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            ✏️ Edit {bot?.name}
          </Text>
          
          {bot && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {bot.stats.totalEarnings}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Earned
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {bot.stats.uniqueChats}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Chats
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {bot.stats.totalMessages}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Messages
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Status Control */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={[styles.label, isDark && styles.textDark]}>
                Bot Status
              </Text>
              <Text style={[styles.hint, isDark && styles.textSecondaryDark]}>
                {isPaused ? 'Paused - Not visible to users' : 'Active - Visible to users'}
              </Text>
            </View>
            <Switch
              value={!isPaused}
              onValueChange={(val) => setIsPaused(!val)}
              trackColor={{ false: '#FF3B30', true: '#34C759' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Basic Info */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Basic Info
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>Name</Text>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>
              Personality
            </Text>
            <TextInput
              style={[styles.textArea, isDark && styles.inputDark]}
              multiline
              numberOfLines={4}
              value={personality}
              onChangeText={setPersonality}
            />
            <Text style={[styles.charCount, isDark && styles.textSecondaryDark]}>
              {personality.length} characters
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>Role</Text>
            <View style={styles.roleGrid}>
              {(['friend', 'mentor', 'companion', 'coach'] as BotRoleArchetype[]).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleButton,
                    roleArchetype === role && styles.roleButtonActive,
                  ]}
                  onPress={() => setRoleArchetype(role)}
                >
                  <Text
                    style={[
                      styles.roleText,
                      roleArchetype === role && styles.roleTextActive,
                    ]}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>
              Writing Tone
            </Text>
            <View style={styles.roleGrid}>
              {(['friendly', 'professional', 'flirty', 'humorous'] as WritingTone[]).map((tone) => (
                <TouchableOpacity
                  key={tone}
                  style={[
                    styles.roleButton,
                    writingTone === tone && styles.roleButtonActive,
                  ]}
                  onPress={() => setWritingTone(tone)}
                >
                  <Text
                    style={[
                      styles.roleText,
                      writingTone === tone && styles.roleTextActive,
                    ]}
                  >
                    {tone.charAt(0).toUpperCase() + tone.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Pricing */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            💰 Pricing
          </Text>

          <View style={styles.inputGroup}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.label, isDark && styles.textDark]}>
                Tokens per message
              </Text>
              <Text style={[styles.priceValue, isDark && styles.textDark]}>
                {pricePerMessage}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={AI_BOT_CONFIG.MIN_PRICE_PER_MESSAGE}
              maximumValue={AI_BOT_CONFIG.MAX_PRICE_PER_MESSAGE}
              step={1}
              value={pricePerMessage}
              onValueChange={(val) => setPricePerMessage(val)}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor="#E5E5EA"
              thumbTintColor="#007AFF"
            />
          </View>

          {pricingRecommendation && (
            <View style={styles.recommendationBox}>
              <Text style={styles.recommendationText}>
                💡 {pricingRecommendation}
              </Text>
            </View>
          )}

          <View style={styles.earningsPreview}>
            <Text style={[styles.previewTitle, isDark && styles.textDark]}>
              💵 Earnings Preview
            </Text>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, isDark && styles.textSecondaryDark]}>
                User pays:
              </Text>
              <Text style={[styles.previewValue, isDark && styles.textDark]}>
                {earningsPreview.userPays} tokens
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, styles.creatorColor]}>
                You earn (80%):
              </Text>
              <Text style={[styles.previewValue, styles.creatorColor]}>
                {earningsPreview.creatorEarns} tokens
              </Text>
            </View>
          </View>
        </View>

        {/* NSFW */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={[styles.label, isDark && styles.textDark]}>
                Enable 18+ Content
              </Text>
            </View>
            <Switch
              value={nsfwEnabled}
              onValueChange={setNsfwEnabled}
              trackColor={{ false: '#E5E5EA', true: '#34C759' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : '💾 Save Changes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>🗑️ Delete Bot</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={[styles.cancelText, isDark && styles.textSecondaryDark]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionDark: {
    backgroundColor: '#1C1C1E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#8E8E93',
  },
  inputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000000',
  },
  inputDark: {
    backgroundColor: '#2C2C2E',
    color: '#FFFFFF',
  },
  textArea: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000000',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'right',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleButtonActive: {
    backgroundColor: '#E3F2FF',
    borderColor: '#007AFF',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  roleTextActive: {
    color: '#007AFF',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  recommendationBox: {
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFB800',
  },
  recommendationText: {
    fontSize: 14,
    color: '#000000',
  },
  earningsPreview: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: '#666666',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  creatorColor: {
    color: '#34C759',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#8E8E93',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});