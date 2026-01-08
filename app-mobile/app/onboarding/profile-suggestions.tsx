/**
 * FTUX Profile Suggestions Screen
 * Shows AI-generated profile suggestions based on quiz answers
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from "@/hooks/useTranslation";
import {
  loadQuizAnswers,
  clearQuizAnswers,
  saveAppliedSuggestion,
  AutoProfileSuggestion,
} from "@/services/onboardingProfileService";
import { generateProfileSuggestion, AutoProfileInput } from "@/utils/autoProfileEngine";
import { useLocaleContext } from "@/contexts/LocaleContext";

const { width } = Dimensions.get('window');

export default function ProfileSuggestionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<AutoProfileSuggestion | null>(null);
  const [newInterest, setNewInterest] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      
      // Load quiz answers
      const quizAnswers = await loadQuizAnswers();
      
      // TODO: In production, load actual user data from profile/auth context
      // For now, we'll use minimal mock data
      const input: AutoProfileInput = {
        quiz: quizAnswers || undefined,
        locale: locale === 'pl' ? 'pl' : 'en',
        // age, city, gender, membershipTier would come from user context
      };
      
      // Generate suggestions
      const generated = generateProfileSuggestion(input);
      setSuggestion(generated);
      
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
      
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      // Even on error, show default suggestion
      setSuggestion({
        tagline: locale === 'pl' 
          ? 'Tutaj dla autentycznych relacji i znaczących spotkań'
          : 'Here for authentic relationships and meaningful connections',
        bio: locale === 'pl'
          ? 'Ciekaw/a ciebie i gotowy/a na nowe doświadczenia. Szukam autentycznych połączeń i prawdziwych rozmów.'
          : "Curious about you and ready for new experiences. Looking for authentic connections and real conversations.",
        interests: locale === 'pl'
          ? ['Muzyka', 'Kultura', 'Spotkania', 'Rozmowy']
          : ['Music', 'Culture', 'Meeting people', 'Deep talks'],
        lookingFor: locale === 'pl'
          ? 'Kogoś interesującego do poznania.'
          : 'Someone interesting to get to know.',
      });
      
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAndContinue = async () => {
    if (!suggestion) return;
    
    try {
      setSaving(true);
      
      // Save the applied suggestion
      await saveAppliedSuggestion(suggestion);
      
      // Clear quiz answers (no longer needed)
      await clearQuizAnswers();
      
      // Mark onboarding as completed
      await AsyncStorage.setItem('onboarding_completed', 'true');
      
      // TODO: In production, also update user profile in Firestore
      // This would be done via a profileService.updateProfile() call
      // For now, we're just storing locally as per requirements
      
      // Navigate to main app
      router.replace('/' as any);
      
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
      setSaving(false);
      // Show error toast if available
    }
  };

  const handleSkip = async () => {
    try {
      setSaving(true);
      
      // Clear quiz answers
      await clearQuizAnswers();
      
      // Mark onboarding as completed (without saving suggestions)
      await AsyncStorage.setItem('onboarding_completed', 'true');
      
      // Navigate to main app
      router.replace('/' as any);
      
    } catch (error) {
      console.error('Failed to skip:', error);
      setSaving(false);
    }
  };

  const updateField = (field: keyof AutoProfileSuggestion, value: string | string[]) => {
    if (!suggestion) return;
    setSuggestion({ ...suggestion, [field]: value });
  };

  const toggleInterest = (interest: string) => {
    if (!suggestion) return;
    const interests = suggestion.interests.includes(interest)
      ? suggestion.interests.filter(i => i !== interest)
      : [...suggestion.interests, interest];
    updateField('interests', interests);
  };

  const addNewInterest = () => {
    if (!suggestion || !newInterest.trim()) return;
    if (suggestion.interests.includes(newInterest.trim())) {
      setNewInterest('');
      return;
    }
    updateField('interests', [...suggestion.interests, newInterest.trim()]);
    setNewInterest('');
  };

  if (loading || !suggestion) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('ftuxProfile.title')}</Text>
              <Text style={styles.subtitle}>{t('ftuxProfile.subtitle')}</Text>
            </View>

            {/* Tagline */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>{t('ftuxProfile.fields.tagline')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('ftuxProfile.fields.taglinePlaceholder')}
                placeholderTextColor="#666"
                value={suggestion.tagline}
                onChangeText={(text) => updateField('tagline', text)}
                maxLength={100}
              />
            </View>

            {/* Bio */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>{t('ftuxProfile.fields.bio')}</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder={t('ftuxProfile.fields.bioPlaceholder')}
                placeholderTextColor="#666"
                value={suggestion.bio}
                onChangeText={(text) => updateField('bio', text)}
                multiline
                numberOfLines={6}
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            {/* Interests */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>{t('ftuxProfile.fields.interests')}</Text>
              <Text style={styles.fieldSubtitle}>{t('ftuxProfile.fields.interestsSubtitle')}</Text>
              
              <View style={styles.interestsContainer}>
                {suggestion.interests.map((interest) => (
                  <TouchableOpacity
                    key={interest}
                    style={styles.interestChip}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text style={styles.interestText}>{interest}</Text>
                    <Text style={styles.removeIcon}>×</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Add new interest */}
              <View style={styles.addInterestRow}>
                <TextInput
                  style={styles.addInterestInput}
                  placeholder={t('ftuxProfile.fields.addInterest')}
                  placeholderTextColor="#666"
                  value={newInterest}
                  onChangeText={setNewInterest}
                  onSubmitEditing={addNewInterest}
                  maxLength={30}
                />
                <TouchableOpacity 
                  style={styles.addInterestButton}
                  onPress={addNewInterest}
                  disabled={!newInterest.trim()}
                >
                  <Text style={styles.addInterestButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Looking For */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>{t('ftuxProfile.fields.lookingFor')}</Text>
              <TextInput
                style={[styles.input, styles.lookingForInput]}
                placeholder={t('ftuxProfile.fields.lookingForPlaceholder')}
                placeholderTextColor="#666"
                value={suggestion.lookingFor}
                onChangeText={(text) => updateField('lookingFor', text)}
                multiline
                numberOfLines={3}
                maxLength={200}
                textAlignVertical="top"
              />
            </View>
          </Animated.View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleApplyAndContinue}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('ftuxProfile.buttons.applyAndContinue')}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSkip}
            disabled={saving}
          >
            <Text style={styles.secondaryButtonText}>
              {t('ftuxProfile.buttons.skipForNow')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#40E0D0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 180,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: '#40E0D0',
    lineHeight: 24,
    opacity: 0.9,
  },
  section: {
    marginBottom: 32,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  fieldSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
    borderRadius: 18,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  bioInput: {
    minHeight: 140,
  },
  lookingForInput: {
    minHeight: 100,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(64, 224, 208, 0.2)',
    borderWidth: 2,
    borderColor: '#40E0D0',
    gap: 8,
  },
  interestText: {
    fontSize: 15,
    color: '#40E0D0',
    fontWeight: '500',
  },
  removeIcon: {
    fontSize: 20,
    color: '#40E0D0',
    fontWeight: '400',
  },
  addInterestRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addInterestInput: {
    flex: 1,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
    borderRadius: 18,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  addInterestButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(64, 224, 208, 0.2)',
    borderWidth: 2,
    borderColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addInterestButtonText: {
    fontSize: 24,
    color: '#40E0D0',
    fontWeight: '300',
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: 'rgba(64, 224, 208, 0.1)',
  },
  primaryButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  secondaryButton: {
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
  },
});
