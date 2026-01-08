/**
 * Create New AI Bot Screen
 * Form for creating AI companions with pricing configuration
 * Shows real-time earnings preview - Avalo vs Creator split
 */

import React, { useState } from 'react';
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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import {
  createBot,
  validateBotData,
  BotGender,
  BotRoleArchetype,
  WritingTone,
} from "@/services/aiBotService";
import {
  AI_BOT_CONFIG,
  calculateEarningsPreview,
  getPricingRecommendation,
  UI_TRIGGERS,
} from "@/config/aiMonetization";

export default function CreateAIBotScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState<BotGender>('female');
  const [age, setAge] = useState('25');
  const [personality, setPersonality] = useState('');
  const [roleArchetype, setRoleArchetype] = useState<BotRoleArchetype>('friend');
  const [writingTone, setWritingTone] = useState<WritingTone>('friendly');
  const [nsfwEnabled, setNsfwEnabled] = useState(false);
  const [pricePerMessage, setPricePerMessage] = useState<number>(AI_BOT_CONFIG.RECOMMENDED_PRICE);
  
  const [saving, setSaving] = useState(false);
  const [showNSFWCTA, setShowNSFWCTA] = useState(false);

  // Real-time earnings preview
  const earningsPreview = calculateEarningsPreview(pricePerMessage);
  const pricingRecommendation = getPricingRecommendation(pricePerMessage);

  // Show NSFW CTA when enabled
  React.useEffect(() => {
    if (nsfwEnabled) {
      setShowNSFWCTA(true);
    }
  }, [nsfwEnabled]);

  const handleSave = async () => {
    // Validate
    const validation = validateBotData({
      name,
      gender,
      age: parseInt(age),
      personality,
      roleArchetype,
      writingTone,
      nsfwEnabled,
      pricing: { perMessage: pricePerMessage },
      interests: [],
      languages: ['en'],
    });

    if (!validation.valid) {
      Alert.alert('Validation Error', validation.errors.join('\n'));
      return;
    }

    setSaving(true);
    try {
      const result = await createBot({
        name,
        gender,
        age: parseInt(age),
        personality,
        roleArchetype,
        writingTone,
        nsfwEnabled,
        pricing: { perMessage: pricePerMessage },
        interests: [],
        languages: ['en'],
      });

      Alert.alert('Success', 'AI Bot created successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create bot');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            ✨ Create AI Bot
          </Text>
          <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>
            Set up your AI companion and start earning!
          </Text>
        </View>

        {/* Basic Info */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Basic Info
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>Name *</Text>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              placeholder="e.g., Emma, Alex"
              placeholderTextColor="#8E8E93"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>Gender</Text>
            <View style={styles.genderRow}>
              {(['female', 'male', 'other'] as BotGender[]).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderButton,
                    gender === g && styles.genderButtonActive,
                  ]}
                  onPress={() => setGender(g)}
                >
                  <Text
                    style={[
                      styles.genderText,
                      gender === g && styles.genderTextActive,
                    ]}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>Age *</Text>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              placeholder="18-100"
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
              value={age}
              onChangeText={setAge}
              maxLength={3}
            />
          </View>
        </View>

        {/* Personality */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Personality
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textDark]}>
              Bio (min 20 characters) *
            </Text>
            <TextInput
              style={[styles.textArea, isDark && styles.inputDark]}
              placeholder="Describe your bot's personality, interests, and conversation style..."
              placeholderTextColor="#8E8E93"
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
              onValueChange={setPricePerMessage}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor="#E5E5EA"
              thumbTintColor="#007AFF"
            />
            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderLabel, isDark && styles.textSecondaryDark]}>
                {AI_BOT_CONFIG.MIN_PRICE_PER_MESSAGE}
              </Text>
              <Text style={[styles.sliderLabel, isDark && styles.textSecondaryDark]}>
                {AI_BOT_CONFIG.MAX_PRICE_PER_MESSAGE}
              </Text>
            </View>
          </View>

          {/* Pricing Recommendation */}
          {pricingRecommendation && (
            <View style={styles.recommendationBox}>
              <Text style={styles.recommendationText}>
                💡 {pricingRecommendation}
              </Text>
            </View>
          )}

          {/* Real-time Earnings Preview */}
          <View style={styles.earningsPreview}>
            <Text style={[styles.previewTitle, isDark && styles.textDark]}>
              💵 Earnings Preview (per message)
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
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, styles.avaloColor]}>
                Avalo earns (20%):
              </Text>
              <Text style={[styles.previewValue, styles.avaloColor]}>
                {earningsPreview.avaloEarns} tokens
              </Text>
            </View>
          </View>
        </View>

        {/* NSFW Settings */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            🔞 Adult Content
          </Text>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={[styles.label, isDark && styles.textDark]}>
                Enable 18+ Content
              </Text>
              <Text style={[styles.hint, isDark && styles.textSecondaryDark]}>
                Requires age verification
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

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Creating...' : '✨ Create AI Bot'}
          </Text>
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

      {/* NSFW Photo Pack CTA Modal */}
      <Modal
        visible={showNSFWCTA}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNSFWCTA(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <Text style={styles.modalEmoji}>📸</Text>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>
              Boost 18+ Earnings
            </Text>
            <Text style={[styles.modalText, isDark && styles.textSecondaryDark]}>
              {UI_TRIGGERS.NSFW_PHOTO_PACK_CTA}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowNSFWCTA(false);
                // TODO: Navigate to photo pack upload
              }}
            >
              <Text style={styles.modalButtonText}>Upload Photos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowNSFWCTA(false)}
            >
              <Text style={[styles.modalCancelText, isDark && styles.textSecondaryDark]}>
                Skip for Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
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
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  genderButtonActive: {
    backgroundColor: '#E3F2FF',
    borderColor: '#007AFF',
  },
  genderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  genderTextActive: {
    color: '#007AFF',
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
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: '#8E8E93',
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
    lineHeight: 20,
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
  avaloColor: {
    color: '#FF3B30',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
  },
  hint: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#8E8E93',
    shadowOpacity: 0,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalContentDark: {
    backgroundColor: '#1C1C1E',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalCancelButton: {
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});
