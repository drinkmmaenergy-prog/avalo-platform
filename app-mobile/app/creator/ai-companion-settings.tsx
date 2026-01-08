import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  activateCompanion,
  deactivateCompanion,
  getCompanionSettings,
  CompanionSettings,
} from "@/services/creatorAICompanionService";
import {
  setVoiceConfig,
  getVoiceConfig,
  VoiceConfig,
} from "@/services/aiVoiceService";

const VOICE_STYLES = ['romantic', 'playful', 'confident', 'mysterious', 'sultry'] as const;

const COMMON_INTERESTS = [
  'Travel',
  'Fitness',
  'Music',
  'Art',
  'Cooking',
  'Fashion',
  'Movies',
  'Gaming',
  'Reading',
  'Photography',
  'Sports',
  'Technology',
];

export default function AICompanionSettingsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [confidence, setConfidence] = useState(50);
  const [humor, setHumor] = useState(50);
  const [tenderness, setTenderness] = useState(50);
  const [assertiveness, setAssertiveness] = useState(50);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [voiceStyle, setVoiceStyle] = useState<typeof VOICE_STYLES[number]>('confident');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [selectedVoiceStyle, setSelectedVoiceStyle] = useState<typeof VOICE_STYLES[number]>('confident');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Glow animation for save button
  const glowAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    loadSettings();
    startGlowAnimation();
  }, []);

  const startGlowAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const loadSettings = async () => {
    if (!user?.uid) return;

    try {
      const settings = await getCompanionSettings(user.uid);
      if (settings) {
        setEnabled(settings.enabled);
        setConfidence(settings.personality.confidence);
        setHumor(settings.personality.humor);
        setTenderness(settings.personality.tenderness);
        setAssertiveness(settings.personality.assertiveness);
        setSelectedInterests(settings.interests);
        setVoiceStyle(settings.voiceStyle);
      }

      // Load voice config
      const voiceConfig = await getVoiceConfig(user.uid);
      if (voiceConfig) {
        setVoiceEnabled(voiceConfig.enabled);
        setSelectedVoiceStyle(voiceConfig.selectedVoice);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.uid) return;

    setSaving(true);
    try {
      const settings = {
        personality: {
          confidence,
          humor,
          tenderness,
          assertiveness,
        },
        interests: selectedInterests,
        voiceStyle,
      };

      if (enabled) {
        await activateCompanion(user.uid, settings);
      } else {
        await deactivateCompanion(user.uid);
      }

      // Save voice config
      const voiceConfig: VoiceConfig = {
        enabled: voiceEnabled,
        selectedVoice: selectedVoiceStyle,
      };
      await setVoiceConfig(user.uid, voiceConfig);

      router.back();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const addCustomInterest = () => {
    if (customInterest.trim() && !selectedInterests.includes(customInterest.trim())) {
      setSelectedInterests([...selectedInterests, customInterest.trim()]);
      setCustomInterest('');
    }
  };

  const handleVoicePreview = (style: typeof VOICE_STYLES[number]) => {
    // Simulate audio preview (no actual audio in UI-only implementation)
    Alert.alert(
      t('aiVoice.previewTitle'),
      t(`aiVoice.previewMessage_${style}`),
      [{ text: t('common.ok'), style: 'default' }]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('aiCompanion.settings.title')}</Text>
          <Text style={styles.subtitle}>{t('aiCompanion.settings.subtitle')}</Text>
        </View>

        {/* Main Toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabel}>
              <Text style={styles.sectionTitle}>{t('aiCompanion.settings.enableCompanion')}</Text>
              <Text style={styles.sectionDesc}>{t('aiCompanion.settings.enableDesc')}</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: '#333', true: '#40E0D0' }}
              thumbColor={enabled ? '#D4AF37' : '#999'}
            />
          </View>
        </View>

        {enabled && (
          <>
            {/* Personality Sliders */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('aiCompanion.settings.personalityBuilder')}</Text>
              
              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>{t('aiCompanion.settings.confidence')}</Text>
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${confidence}%` }]} />
                  </View>
                  <Text style={styles.sliderValue}>{confidence}</Text>
                </View>
                <View style={styles.sliderButtons}>
                  <TouchableOpacity onPress={() => setConfidence(Math.max(0, confidence - 10))}>
                    <Text style={styles.sliderButton}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfidence(Math.min(100, confidence + 10))}>
                    <Text style={styles.sliderButton}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>{t('aiCompanion.settings.humor')}</Text>
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${humor}%` }]} />
                  </View>
                  <Text style={styles.sliderValue}>{humor}</Text>
                </View>
                <View style={styles.sliderButtons}>
                  <TouchableOpacity onPress={() => setHumor(Math.max(0, humor - 10))}>
                    <Text style={styles.sliderButton}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setHumor(Math.min(100, humor + 10))}>
                    <Text style={styles.sliderButton}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>{t('aiCompanion.settings.tenderness')}</Text>
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${tenderness}%` }]} />
                  </View>
                  <Text style={styles.sliderValue}>{tenderness}</Text>
                </View>
                <View style={styles.sliderButtons}>
                  <TouchableOpacity onPress={() => setTenderness(Math.max(0, tenderness - 10))}>
                    <Text style={styles.sliderButton}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTenderness(Math.min(100, tenderness + 10))}>
                    <Text style={styles.sliderButton}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>{t('aiCompanion.settings.assertiveness')}</Text>
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${assertiveness}%` }]} />
                  </View>
                  <Text style={styles.sliderValue}>{assertiveness}</Text>
                </View>
                <View style={styles.sliderButtons}>
                  <TouchableOpacity onPress={() => setAssertiveness(Math.max(0, assertiveness - 10))}>
                    <Text style={styles.sliderButton}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAssertiveness(Math.min(100, assertiveness + 10))}>
                    <Text style={styles.sliderButton}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Voice Style Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('aiCompanion.settings.voiceStyle')}</Text>
              <View style={styles.voiceStyleGrid}>
                {VOICE_STYLES.map((style) => (
                  <TouchableOpacity
                    key={style}
                    style={[
                      styles.voiceStyleButton,
                      voiceStyle === style && styles.voiceStyleButtonActive,
                    ]}
                    onPress={() => setVoiceStyle(style)}
                  >
                    <Text
                      style={[
                        styles.voiceStyleText,
                        voiceStyle === style && styles.voiceStyleTextActive,
                      ]}
                    >
                      {t(`aiCompanion.settings.voiceStyle_${style}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Voice Pack Section */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabel}>
                  <Text style={styles.sectionTitle}>{t('aiVoice.enableVoiceReplies')}</Text>
                  <Text style={styles.sectionDesc}>{t('aiVoice.enableVoiceDesc')}</Text>
                </View>
                <Switch
                  value={voiceEnabled}
                  onValueChange={setVoiceEnabled}
                  trackColor={{ false: '#333', true: '#40E0D0' }}
                  thumbColor={voiceEnabled ? '#D4AF37' : '#999'}
                />
              </View>

              {voiceEnabled && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 12 }]}>
                    {t('aiVoice.voicePackTitle')}
                  </Text>
                  <Text style={styles.voicePackSubtitle}>{t('aiVoice.voicePackSubtitle')}</Text>

                  <View style={styles.voicePackGrid}>
                    {VOICE_STYLES.map((style) => (
                      <TouchableOpacity
                        key={style}
                        style={[
                          styles.voicePackCard,
                          selectedVoiceStyle === style && styles.voicePackCardActive,
                        ]}
                        onPress={() => setSelectedVoiceStyle(style)}
                      >
                        <View style={styles.voicePackHeader}>
                          <Text
                            style={[
                              styles.voicePackName,
                              selectedVoiceStyle === style && styles.voicePackNameActive,
                            ]}
                          >
                            {t(`aiVoice.voiceStyle_${style}`)}
                          </Text>
                          {selectedVoiceStyle === style && (
                            <Text style={styles.voicePackCheck}>✓</Text>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.previewButton}
                          onPress={() => handleVoicePreview(style)}
                        >
                          <Text style={styles.previewButtonText}>🎧 {t('aiVoice.preview')}</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.voicePricingInfo}>
                    <Text style={styles.voicePricingText}>
                      💰 {t('aiVoice.pricingInfo')}
                    </Text>
                    <Text style={styles.voicePricingDetail}>
                      {t('aiVoice.vipDiscountInfo')}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Interest Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('aiCompanion.settings.interests')}</Text>
              <View style={styles.interestsGrid}>
                {COMMON_INTERESTS.map((interest) => (
                  <TouchableOpacity
                    key={interest}
                    style={[
                      styles.interestChip,
                      selectedInterests.includes(interest) && styles.interestChipActive,
                    ]}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text
                      style={[
                        styles.interestChipText,
                        selectedInterests.includes(interest) && styles.interestChipTextActive,
                      ]}
                    >
                      {interest}
                    </Text>
                  </TouchableOpacity>
                ))}
                {selectedInterests
                  .filter((i) => !COMMON_INTERESTS.includes(i))
                  .map((interest) => (
                    <TouchableOpacity
                      key={interest}
                      style={[styles.interestChip, styles.interestChipActive]}
                      onPress={() => toggleInterest(interest)}
                    >
                      <Text style={[styles.interestChipText, styles.interestChipTextActive]}>
                        {interest}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
              
              <View style={styles.customInterestRow}>
                <TextInput
                  style={styles.customInterestInput}
                  placeholder={t('aiCompanion.settings.addCustomInterest')}
                  placeholderTextColor="#666"
                  value={customInterest}
                  onChangeText={setCustomInterest}
                  onSubmitEditing={addCustomInterest}
                />
                <TouchableOpacity style={styles.addButton} onPress={addCustomInterest}>
                  <Text style={styles.addButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ scale: glowAnim }] }}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t('common.saving') : t('common.save')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    marginBottom: 30,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    flex: 1,
    marginRight: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#999',
  },
  sliderGroup: {
    marginBottom: 20,
  },
  sliderLabel: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 18,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 18,
  },
  sliderValue: {
    fontSize: 16,
    color: '#D4AF37',
    fontWeight: 'bold',
    marginLeft: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  sliderButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  sliderButton: {
    fontSize: 24,
    color: '#40E0D0',
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  voiceStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  voiceStyleButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  voiceStyleButtonActive: {
    borderColor: '#40E0D0',
    backgroundColor: '#40E0D022',
  },
  voiceStyleText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  voiceStyleTextActive: {
    color: '#40E0D0',
    fontWeight: '600',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  interestChipActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#D4AF3722',
  },
  interestChipText: {
    fontSize: 14,
    color: '#999',
  },
  interestChipTextActive: {
    color: '#D4AF37',
    fontWeight: '600',
  },
  customInterestRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  customInterestInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 16,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: '#0F0F0F',
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  saveButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
  voicePackSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  voicePackGrid: {
    gap: 12,
  },
  voicePackCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#333',
    padding: 16,
    marginBottom: 12,
  },
  voicePackCardActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#D4AF3711',
  },
  voicePackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  voicePackName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  voicePackNameActive: {
    color: '#D4AF37',
  },
  voicePackCheck: {
    fontSize: 24,
    color: '#D4AF37',
  },
  previewButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  voicePricingInfo: {
    backgroundColor: '#D4AF3722',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
    padding: 16,
    marginTop: 16,
  },
  voicePricingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 8,
  },
  voicePricingDetail: {
    fontSize: 14,
    color: '#D4AF37',
    opacity: 0.8,
  },
  },
});
