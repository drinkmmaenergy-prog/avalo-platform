import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ALLOWED_SEED_ARCHETYPES, PersonalityTraits } from "@/types/pack189-ai-federation.types";

export default function SeedBuilder() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [archetype, setArchetype] = useState(ALLOWED_SEED_ARCHETYPES[0]);
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [backstory, setBackstory] = useState('');

  const [personality, setPersonality] = useState<Partial<PersonalityTraits>>({
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5,
  });

  const [communicationStyle, setCommunicationStyle] = useState({
    formality: 0.5,
    humor: 0.5,
    empathy: 0.5,
    directness: 0.5,
    verbosity: 0.5,
  });

  const [showArchetypeMenu, setShowArchetypeMenu] = useState(false);

  const addInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleGenerateSeed = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create an AI Seed');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for your AI Seed');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description for your AI Seed');
      return;
    }

    if (interests.length === 0) {
      Alert.alert('Error', 'Please add at least one interest');
      return;
    }

    setLoading(true);

    try {
      const generateAiSeed = httpsCallable(functions, 'generateAiSeed');
      const result = await generateAiSeed({
        userId: user.uid,
        name,
        description,
        archetype,
        personality,
        interests,
        communicationStyle,
        backstory,
      });

      const data = result.data as { success: boolean; seedId: string; message: string };

      if (data.success) {
        Alert.alert('Success', 'AI Seed created successfully!', [
          {
            text: 'OK',
            onPress: () => router.push('/ai-federation/my-seeds'),
          },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create AI Seed');
    } finally {
      setLoading(false);
    }
  };

  const renderSlider = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    leftLabel: string,
    rightLabel: string
  ) => (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderEndLabel}>{leftLabel}</Text>
        <Text style={styles.sliderEndLabel}>{rightLabel}</Text>
      </View>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${value * 100}%` }]} />
        <TouchableOpacity
          style={[styles.sliderThumb, { left: `${value * 100}%` }]}
          onPressIn={(e) => {
            const target = e.currentTarget as any;
            target.measure((x: number, y: number, width: number, height: number, pageX: number) => {
              const newValue = Math.max(0, Math.min(1, (e.nativeEvent.pageX - pageX) / 300));
              onChange(newValue);
            });
          }}
        />
      </View>
      <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create AI Seed</Text>
        <Text style={styles.subtitle}>Build your own AI character personality</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter seed name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your AI seed"
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Archetype *</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowArchetypeMenu(!showArchetypeMenu)}
          >
            <Text style={styles.dropdownText}>{archetype}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>
          {showArchetypeMenu && (
            <View style={styles.dropdownMenu}>
              <ScrollView style={styles.dropdownScroll}>
                {ALLOWED_SEED_ARCHETYPES.map((arch) => (
                  <TouchableOpacity
                    key={arch}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setArchetype(arch);
                      setShowArchetypeMenu(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{arch}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interests *</Text>
        <View style={styles.interestsContainer}>
          {interests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={styles.interestTag}
              onPress={() => removeInterest(interest)}
            >
              <Text style={styles.interestTagText}>{interest}</Text>
              <Text style={styles.interestTagRemove}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.interestInput]}
            value={newInterest}
            onChangeText={setNewInterest}
            placeholder="Add interest"
            placeholderTextColor="#999"
            onSubmitEditing={addInterest}
          />
          <TouchableOpacity style={styles.addButton} onPress={addInterest}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personality Traits</Text>
        {renderSlider(
          'Openness',
          personality.openness || 0.5,
          (value) => setPersonality({ ...personality, openness: value }),
          'Conventional',
          'Creative'
        )}
        {renderSlider(
          'Conscientiousness',
          personality.conscientiousness || 0.5,
          (value) => setPersonality({ ...personality, conscientiousness: value }),
          'Spontaneous',
          'Organized'
        )}
        {renderSlider(
          'Extraversion',
          personality.extraversion || 0.5,
          (value) => setPersonality({ ...personality, extraversion: value }),
          'Reserved',
          'Outgoing'
        )}
        {renderSlider(
          'Agreeableness',
          personality.agreeableness || 0.5,
          (value) => setPersonality({ ...personality, agreeableness: value }),
          'Competitive',
          'Cooperative'
        )}
        {renderSlider(
          'Neuroticism',
          personality.neuroticism || 0.5,
          (value) => setPersonality({ ...personality, neuroticism: value }),
          'Stable',
          'Sensitive'
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Communication Style</Text>
        {renderSlider(
          'Formality',
          communicationStyle.formality,
          (value) => setCommunicationStyle({ ...communicationStyle, formality: value }),
          'Casual',
          'Formal'
        )}
        {renderSlider(
          'Humor',
          communicationStyle.humor,
          (value) => setCommunicationStyle({ ...communicationStyle, humor: value }),
          'Serious',
          'Humorous'
        )}
        {renderSlider(
          'Empathy',
          communicationStyle.empathy,
          (value) => setCommunicationStyle({ ...communicationStyle, empathy: value }),
          'Logical',
          'Emotional'
        )}
        {renderSlider(
          'Directness',
          communicationStyle.directness,
          (value) => setCommunicationStyle({ ...communicationStyle, directness: value }),
          'Subtle',
          'Direct'
        )}
        {renderSlider(
          'Verbosity',
          communicationStyle.verbosity,
          (value) => setCommunicationStyle({ ...communicationStyle, verbosity: value }),
          'Concise',
          'Detailed'
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backstory (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={backstory}
          onChangeText={setBackstory}
          placeholder="Write a backstory for your AI seed..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={5}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleGenerateSeed}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create AI Seed</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownArrow: {
    color: '#999',
    fontSize: 12,
  },
  dropdownMenu: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 14,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  interestTag: {
    backgroundColor: '#6c5ce7',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  interestTagText: {
    color: '#fff',
    fontSize: 14,
    marginRight: 4,
  },
  interestTagRemove: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interestInput: {
    flex: 1,
    marginRight: 8,
  },
  addButton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sliderContainer: {
    marginBottom: 24,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderEndLabel: {
    fontSize: 12,
    color: '#999',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: 4,
    backgroundColor: '#6c5ce7',
    borderRadius: 2,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
    position: 'absolute',
    top: -8,
    marginLeft: -10,
  },
  sliderValue: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    padding: 20,
  },
  button: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
