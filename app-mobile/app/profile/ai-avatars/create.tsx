/**
 * PACK 310 — AI Companions & Avatar Builder
 * Creator UI: AI Avatar Builder
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import {
  PersonaProfile,
  StyleConfig,
  AGE_RANGES,
  VIBE_OPTIONS,
  TOPIC_OPTIONS,
  TONE_OPTIONS,
  FORMALITY_OPTIONS,
  EMOJI_OPTIONS,
  DEFAULT_BOUNDARIES,
  AvatarTone,
  AvatarFormality,
  EmojiUsage
} from "@/types/aiCompanion";

export default function CreateAIAvatar() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Basic Info
  const [displayName, setDisplayName] = useState('');
  const [shortTagline, setShortTagline] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en']);

  // Persona
  const [ageRange, setAgeRange] = useState('25-35');
  const [locationHint, setLocationHint] = useState('');
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  // Style
  const [tone, setTone] = useState<AvatarTone>('FRIENDLY');
  const [formality, setFormality] = useState<AvatarFormality>('CASUAL');
  const [emojiUsage, setEmojiUsage] = useState<EmojiUsage>('MEDIUM');

  // Media
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [primaryPhotoId, setPrimaryPhotoId] = useState<string>('');

  const toggleSelection = (item: string, list: string[], setter: (list: string[]) => void, max?: number) => {
    if (list.includes(item)) {
      setter(list.filter(i => i !== item));
    } else {
      if (max && list.length >= max) {
        Alert.alert('Limit Reached', `Maximum ${max} items allowed`);
        return;
      }
      setter([...list, item]);
    }
  };

  const handleCreate = async () => {
    // Validation
    if (!displayName || displayName.length < 2) {
      Alert.alert('Error', 'Display name must be at least 2 characters');
      return;
    }

    if (!shortTagline || shortTagline.length < 10) {
      Alert.alert('Error', 'Tagline must be at least 10 characters');
      return;
    }

    if (selectedVibes.length === 0) {
      Alert.alert('Error', 'Select at least one vibe');
      return;
    }

    if (selectedTopics.length === 0) {
      Alert.alert('Error', 'Select at least one topic');
      return;
    }

    if (photoIds.length === 0) {
      Alert.alert('Error', 'Add at least one photo');
      return;
    }

    setLoading(true);

    try {
      const personaProfile: PersonaProfile = {
        ageRange,
        locationHint,
        vibe: selectedVibes,
        topics: selectedTopics,
        boundaries: DEFAULT_BOUNDARIES
      };

      const styleConfig: StyleConfig = {
        tone,
        formality,
        emojiUsage
      };

      const createAvatar = httpsCallable(functions, 'createAIAvatar');
      const result = await createAvatar({
        displayName,
        shortTagline,
        languageCodes: selectedLanguages,
        personaProfile,
        styleConfig,
        photoIds,
        primaryPhotoId: primaryPhotoId || photoIds[0]
      });

      Alert.alert(
        'Success',
        'AI Avatar created! It will be reviewed and activated soon.',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create AI avatar');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Basic Information</Text>
      
      <Text style={styles.label}>Display Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g., Luna"
        maxLength={50}
      />
      <Text style={styles.helperText}>{displayName.length}/50 characters</Text>

      <Text style={styles.label}>Short Tagline</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={shortTagline}
        onChangeText={setShortTagline}
        placeholder="e.g., Playful companion from Warsaw who loves travel and deep conversations"
        maxLength={200}
        multiline
        numberOfLines={3}
      />
      <Text style={styles.helperText}>{shortTagline.length}/200 characters</Text>

      <Text style={styles.label}>Languages</Text>
      <View style={styles.chipContainer}>
        {['en', 'pl'].map(lang => (
          <TouchableOpacity
            key={lang}
            style={[
              styles.chip,
              selectedLanguages.includes(lang) && styles.chipSelected
            ]}
            onPress={() => toggleSelection(lang, selectedLanguages, setSelectedLanguages)}
          >
            <Text style={[
              styles.chipText,
              selectedLanguages.includes(lang) && styles.chipTextSelected
            ]}>
              {lang === 'en' ? 'English' : 'Polski'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => setStep(2)}
      >
        <Text style={styles.nextButtonText}>Next: Persona</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Persona Profile</Text>

      <Text style={styles.label}>Age Range</Text>
      <View style={styles.chipContainer}>
        {AGE_RANGES.map(range => (
          <TouchableOpacity
            key={range}
            style={[
              styles.chip,
              ageRange === range && styles.chipSelected
            ]}
            onPress={() => setAgeRange(range)}
          >
            <Text style={[
              styles.chipText,
              ageRange === range && styles.chipTextSelected
            ]}>
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Location Hint (Optional)</Text>
      <TextInput
        style={styles.input}
        value={locationHint}
        onChangeText={setLocationHint}
        placeholder="e.g., Warsaw, Poland"
        maxLength={100}
      />

      <Text style={styles.label}>Vibe (Select up to 3)</Text>
      <View style={styles.chipContainer}>
        {VIBE_OPTIONS.map(vibe => (
          <TouchableOpacity
            key={vibe}
            style={[
              styles.chip,
              selectedVibes.includes(vibe) && styles.chipSelected
            ]}
            onPress={() => toggleSelection(vibe, selectedVibes, setSelectedVibes, 3)}
          >
            <Text style={[
              styles.chipText,
              selectedVibes.includes(vibe) && styles.chipTextSelected
            ]}>
              {vibe}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Topics (Select up to 5)</Text>
      <View style={styles.chipContainer}>
        {TOPIC_OPTIONS.map(topic => (
          <TouchableOpacity
            key={topic}
            style={[
              styles.chip,
              selectedTopics.includes(topic) && styles.chipSelected
            ]}
            onPress={() => toggleSelection(topic, selectedTopics, setSelectedTopics, 5)}
          >
            <Text style={[
              styles.chipText,
              selectedTopics.includes(topic) && styles.chipTextSelected
            ]}>
              {topic}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.nextButton, styles.backButton]}
          onPress={() => setStep(1)}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setStep(3)}
        >
          <Text style={styles.nextButtonText}>Next: Style</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Communication Style</Text>

      <Text style={styles.label}>Tone</Text>
      {TONE_OPTIONS.map(option => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.radioOption,
            tone === option.value && styles.radioOptionSelected
          ]}
          onPress={() => setTone(option.value)}
        >
          <View style={styles.radioCircle}>
            {tone === option.value && <View style={styles.radioCircleInner} />}
          </View>
          <View style={styles.radioContent}>
            <Text style={styles.radioLabel}>{option.label}</Text>
            <Text style={styles.radioDescription}>{option.description}</Text>
          </View>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Formality</Text>
      <View style={styles.chipContainer}>
        {FORMALITY_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.chip,
              formality === option.value && styles.chipSelected
            ]}
            onPress={() => setFormality(option.value)}
          >
            <Text style={[
              styles.chipText,
              formality === option.value && styles.chipTextSelected
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Emoji Usage</Text>
      <View style={styles.chipContainer}>
        {EMOJI_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.chip,
              emojiUsage === option.value && styles.chipSelected
            ]}
            onPress={() => setEmojiUsage(option.value)}
          >
            <Text style={[
              styles.chipText,
              emojiUsage === option.value && styles.chipTextSelected
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.nextButton, styles.backButton]}
          onPress={() => setStep(2)}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setStep(4)}
        >
          <Text style={styles.nextButtonText}>Next: Photos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Avatar Photos</Text>
      
      <Text style={styles.infoBox}>
        📸 Upload 1-3 photos for your AI avatar. Photos must comply with content guidelines:
        no explicit nudity, same NSFW limits as profile photos.
      </Text>

      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => {
          // In real implementation, this would open image picker
          Alert.alert('Photo Upload', 'Image picker integration needed');
        }}
      >
        <Text style={styles.uploadButtonText}>+ Add Photo</Text>
      </TouchableOpacity>

      {photoIds.length > 0 && (
        <View style={styles.photoGrid}>
          {photoIds.map((photoId, index) => (
            <View key={photoId} style={styles.photoItem}>
              <Image
                source={{ uri: photoId }}
                style={styles.photoPreview}
              />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => {
                  setPhotoIds(photoIds.filter(id => id !== photoId));
                  if (primaryPhotoId === photoId) {
                    setPrimaryPhotoId(photoIds[0] || '');
                  }
                }}
              >
                <Text style={styles.removePhotoText}>×</Text>
              </TouchableOpacity>
              {primaryPhotoId === photoId && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Primary</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.nextButton, styles.backButton]}
          onPress={() => setStep(3)}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, styles.createButton]}
          onPress={handleCreate}
          disabled={loading || photoIds.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Avatar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create AI Avatar</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map(s => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s <= step && styles.progressStepActive
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.content}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backText: {
    color: '#FF10F0',
    fontSize: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 50,
  },
  progressBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#FF10F0',
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    padding: 16,
  },
  stepTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  label: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#FFF',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  chipSelected: {
    backgroundColor: '#FF10F0',
    borderColor: '#FF10F0',
  },
  chipText: {
    color: '#FFF',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  radioOption: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  radioOptionSelected: {
    borderColor: '#FF10F0',
    backgroundColor: '#2A1A2A',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF10F0',
  },
  radioContent: {
    flex: 1,
  },
  radioLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  radioDescription: {
    color: '#888',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 8,
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  uploadButton: {
    backgroundColor: '#FF10F0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoItem: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3333',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#FF10F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  primaryBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#FF10F0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#FFF',
  },
  createButton: {
    backgroundColor: '#00FF00',
  },
  createButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
