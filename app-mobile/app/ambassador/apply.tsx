/**
 * PACK 202 - Ambassador Application Flow
 * 
 * Professional application process for ambassadors with strict
 * anti-NSFW content screening.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';

type QualificationType = 
  | 'educational_value'
  | 'community_building'
  | 'social_skills'
  | 'skill_excellence'
  | 'professionalism';

type ExpertiseCategory =
  | 'fitness'
  | 'language'
  | 'business'
  | 'events'
  | 'motivation'
  | 'art'
  | 'music'
  | 'gaming'
  | 'photography'
  | 'design'
  | 'production'
  | 'teaching'
  | 'entrepreneurship'
  | 'public_speaking'
  | 'coaching'
  | 'workshops';

const QUALIFICATION_TYPES = [
  { value: 'educational_value', label: 'Educational Value', description: 'Fitness coach, tutor, mentor' },
  { value: 'community_building', label: 'Community Building', description: 'Event organizer, challenge leader' },
  { value: 'social_skills', label: 'Social Skills', description: 'Motivational host, workshop organizer' },
  { value: 'skill_excellence', label: 'Skill Excellence', description: 'Art, music, gaming, photography' },
  { value: 'professionalism', label: 'Professionalism', description: 'Consistent quality and safe content' }
];

const EXPERTISE_CATEGORIES = [
  { value: 'fitness', label: '💪 Fitness' },
  { value: 'language', label: '🗣️ Language' },
  { value: 'business', label: '💼 Business' },
  { value: 'events', label: '🎉 Events' },
  { value: 'motivation', label: '⭐ Motivation' },
  { value: 'art', label: '🎨 Art' },
  { value: 'music', label: '🎵 Music' },
  { value: 'gaming', label: '🎮 Gaming' },
  { value: 'photography', label: '📸 Photography' },
  { value: 'design', label: '✨ Design' },
  { value: 'production', label: '🎬 Production' },
  { value: 'teaching', label: '👨‍🏫 Teaching' },
  { value: 'entrepreneurship', label: '🚀 Entrepreneurship' },
  { value: 'public_speaking', label: '🎤 Public Speaking' },
  { value: 'coaching', label: '🎯 Coaching' },
  { value: 'workshops', label: '🛠️ Workshops' }
];

export default function AmbassadorApplicationScreen() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form data
  const [qualificationType, setQualificationType] = useState<QualificationType | null>(null);
  const [qualificationDescription, setQualificationDescription] = useState('');
  const [experience, setExperience] = useState('');
  const [achievements, setAchievements] = useState(['']);
  const [expertise, setExpertise] = useState<ExpertiseCategory[]>([]);
  const [motivationStatement, setMotivationStatement] = useState('');
  const [contentSamples, setContentSamples] = useState(['']);

  const addAchievement = () => {
    setAchievements([...achievements, '']);
  };

  const updateAchievement = (index: number, value: string) => {
    const updated = [...achievements];
    updated[index] = value;
    setAchievements(updated);
  };

  const removeAchievement = (index: number) => {
    setAchievements(achievements.filter((_, i) => i !== index));
  };

  const addContentSample = () => {
    setContentSamples([...contentSamples, '']);
  };

  const updateContentSample = (index: number, value: string) => {
    const updated = [...contentSamples];
    updated[index] = value;
    setContentSamples(updated);
  };

  const removeContentSample = (index: number) => {
    setContentSamples(contentSamples.filter((_, i) => i !== index));
  };

  const toggleExpertise = (category: ExpertiseCategory) => {
    if (expertise.includes(category)) {
      setExpertise(expertise.filter(e => e !== category));
    } else {
      setExpertise([...expertise, category]);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!qualificationType) {
        Alert.alert('Required', 'Please select a qualification type');
        return;
      }
      if (!qualificationDescription || !experience) {
        Alert.alert('Required', 'Please fill in all required fields');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (expertise.length === 0) {
        Alert.alert('Required', 'Please select at least one expertise area');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!motivationStatement) {
        Alert.alert('Required', 'Please provide your motivation statement');
        return;
      }
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      const functions = getFunctions();
      const applyForAmbassador = httpsCallable(functions, 'applyForAmbassador');

      const result = await applyForAmbassador({
        qualification: {
          type: qualificationType,
          description: qualificationDescription,
          experience,
          achievements: achievements.filter(a => a.trim() !== '')
        },
        expertise,
        portfolio: [],
        socialProfiles: [],
        motivationStatement,
        contentSamples: contentSamples.filter(s => s.trim() !== ''),
        references: []
      });

      const response = result.data as any;

      if (response.success) {
        Alert.alert(
          'Application Submitted!',
          'Your ambassador application has been submitted. Our team will review it and notify you of the outcome.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/profile')
            }
          ]
        );
      } else {
        Alert.alert(
          'Application Rejected',
          response.reason || 'Your application did not pass our content screening. Please ensure your content is professional and appropriate.',
          [
            {
              text: 'OK'
            },
            { text: 'OK' }
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Step 1: Qualification</Text>
      <Text style={styles.stepDescription}>
        Select the qualification that best describes your professional expertise
      </Text>

      {QUALIFICATION_TYPES.map((type) => (
        <TouchableOpacity
          key={type.value}
          style={[
            styles.qualificationCard,
            qualificationType === type.value && styles.qualificationCardSelected
          ]}
          onPress={() => setQualificationType(type.value as QualificationType)}
        >
          <View style={styles.qualificationHeader}>
            <Text style={styles.qualificationLabel}>{type.label}</Text>
            {qualificationType === type.value && (
              <Ionicons name="checkmark-circle" size={24} color="#00b894" />
            )}
          </View>
          <Text style={styles.qualificationDescription}>{type.description}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.inputLabel}>Qualification Description *</Text>
      <TextInput
        style={styles.textArea}
        value={qualificationDescription}
        onChangeText={setQualificationDescription}
        placeholder="Describe your professional qualifications in detail..."
        multiline
        numberOfLines={4}
        placeholderTextColor="#95a5a6"
      />

      <Text style={styles.inputLabel}>Professional Experience *</Text>
      <TextInput
        style={styles.textArea}
        value={experience}
        onChangeText={setExperience}
        placeholder="Describe your professional experience..."
        multiline
        numberOfLines={4}
        placeholderTextColor="#95a5a6"
      />

      <Text style={styles.inputLabel}>Key Achievements</Text>
      {achievements.map((achievement, index) => (
        <View key={index} style={styles.listItemContainer}>
          <TextInput
            style={styles.listInput}
            value={achievement}
            onChangeText={(value) => updateAchievement(index, value)}
            placeholder={`Achievement ${index + 1}`}
            placeholderTextColor="#95a5a6"
          />
          {achievements.length > 1 && (
            <TouchableOpacity onPress={() => removeAchievement(index)}>
              <Ionicons name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity style={styles.addButton} onPress={addAchievement}>
        <Ionicons name="add-circle-outline" size={20} color="#3498db" />
        <Text style={styles.addButtonText}>Add Achievement</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Step 2: Expertise</Text>
      <Text style={styles.stepDescription}>
        Select all areas where you have professional expertise
      </Text>

      <View style={styles.expertiseGrid}>
        {EXPERTISE_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.value}
            style={[
              styles.expertiseChip,
              expertise.includes(category.value as ExpertiseCategory) && styles.expertiseChipSelected
            ]}
            onPress={() => toggleExpertise(category.value as ExpertiseCategory)}
          >
            <Text
              style={[
                styles.expertiseLabel,
                expertise.includes(category.value as ExpertiseCategory) && styles.expertiseLabelSelected
              ]}
            >
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Step 3: Motivation</Text>
      <Text style={styles.stepDescription}>
        Tell us why you want to become an Avalo Ambassador
      </Text>

      <Text style={styles.inputLabel}>Motivation Statement *</Text>
      <TextInput
        style={styles.textArea}
        value={motivationStatement}
        onChangeText={setMotivationStatement}
        placeholder="Why do you want to be an Avalo Ambassador? What value will you bring to the community?"
        multiline
        numberOfLines={6}
        placeholderTextColor="#95a5a6"
      />

      <Text style={styles.inputLabel}>Content Samples (URLs)</Text>
      <Text style={styles.fieldHint}>
        Share links to your professional work, portfolios, or content
      </Text>
      {contentSamples.map((sample, index) => (
        <View key={index} style={styles.listItemContainer}>
          <TextInput
            style={styles.listInput}
            value={sample}
            onChangeText={(value) => updateContentSample(index, value)}
            placeholder="https://..."
            placeholderTextColor="#95a5a6"
            keyboardType="url"
          />
          {contentSamples.length > 1 && (
            <TouchableOpacity onPress={() => removeContentSample(index)}>
              <Ionicons name="close-circle" size={24} color="#e74c3c" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity style={styles.addButton} onPress={addContentSample}>
        <Ionicons name="add-circle-outline" size={20} color="#3498db" />
        <Text style={styles.addButtonText}>Add Content Sample</Text>
      </TouchableOpacity>

      <View style={styles.warningBox}>
        <Ionicons name="shield-checkmark" size={24} color="#f39c12" />
        <Text style={styles.warningText}>
          All applications are screened for professional standards. Content must be appropriate,
          ethical, and free from NSFW or romantic/dating themes.
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Become an Ambassador',
          headerBackTitle: 'Back'
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.progressBar}>
            <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]} />
            <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]} />
            <View style={[styles.progressStep, step >= 3 && styles.progressStepActive]} />
          </View>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextButton, loading && styles.buttonDisabled]}
            onPress={handleNext}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextButtonText}>
                {step === 3 ? 'Submit Application' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    gap: 10
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#ecf0f1',
    borderRadius: 2
  },
  progressStepActive: {
    backgroundColor: '#3498db'
  },
  stepContainer: {
    gap: 15
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50'
  },
  stepDescription: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 10
  },
  qualificationCard: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ecf0f1',
    backgroundColor: '#fff'
  },
  qualificationCardSelected: {
    borderColor: '#3498db',
    backgroundColor: '#ebf5fb'
  },
  qualificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5
  },
  qualificationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50'
  },
  qualificationDescription: {
    fontSize: 14,
    color: '#7f8c8d'
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginTop: 10
  },
  fieldHint: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: -10
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2c3e50',
    minHeight: 100,
    textAlignVertical: 'top'
  },
  listItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10
  },
  listInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2c3e50'
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10
  },
  addButtonText: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '500'
  },
  expertiseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  expertiseChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dfe6e9',
    backgroundColor: '#fff'
  },
  expertiseChipSelected: {
    borderColor: '#3498db',
    backgroundColor: '#3498db'
  },
  expertiseLabel: {
    fontSize: 14,
    color: '#2c3e50'
  },
  expertiseLabelSelected: {
    color: '#fff',
    fontWeight: '600'
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 15,
    backgroundColor: '#fef5e7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f39c12',
    marginTop: 20
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#d68910',
    lineHeight: 20
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    backgroundColor: '#fff'
  },
  backButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe6e9',
    alignItems: 'center'
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50'
  },
  nextButton: {
    flex: 2,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#3498db',
    alignItems: 'center'
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  },
  buttonDisabled: {
    opacity: 0.5
  }
});
