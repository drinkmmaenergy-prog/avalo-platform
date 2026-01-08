/**
 * Create New Goal Screen
 * Form for creating a new creator goal
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  createGoal,
  suggestGoalDescription,
  validateGoalInput,
  GoalCategory,
  getCategoryDisplayName,
  getCategoryIcon,
} from "@/services/goalsService";

const CATEGORIES: GoalCategory[] = ['equipment', 'lifestyle', 'travel', 'content', 'other'];

export default function NewGoalScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suggestingDescription, setSuggestingDescription] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GoalCategory>('equipment');
  const [targetTokens, setTargetTokens] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleSuggestDescription = async () => {
    if (!title.trim()) {
      Alert.alert('Błąd', 'Najpierw wpisz tytuł celu');
      return;
    }

    const tokens = parseInt(targetTokens) || 1000;

    try {
      setSuggestingDescription(true);
      const result = await suggestGoalDescription(title, category, tokens);
      setDescription(result.suggestedDescription);
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się wygenerować opisu');
    } finally {
      setSuggestingDescription(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    const validationError = validateGoalInput({
      title,
      description,
      category,
      targetTokens: parseInt(targetTokens) || 0,
      deadline,
    });

    if (validationError) {
      newErrors.general = validationError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      await createGoal({
        title,
        description,
        category,
        targetTokens: parseInt(targetTokens),
        deadline,
      });

      Alert.alert('Sukces', 'Cel został utworzony!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się utworzyć celu');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDeadline(selectedDate);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Anuluj</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nowy cel</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Tytuł celu <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="np. Nowy mikrofon do nagrań"
            placeholderTextColor="#666"
            maxLength={60}
          />
          <Text style={styles.helperText}>{title.length}/60 znaków</Text>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Kategoria <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryButton,
                  category === cat && styles.categoryButtonActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text style={styles.categoryIcon}>{getCategoryIcon(cat)}</Text>
                <Text
                  style={[
                    styles.categoryText,
                    category === cat && styles.categoryTextActive,
                  ]}
                >
                  {getCategoryDisplayName(cat)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Target Tokens */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Cel w tokenach <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={targetTokens}
            onChangeText={setTargetTokens}
            placeholder="500 - 100 000"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
          <Text style={styles.helperText}>Minimum 500, maksimum 100 000 tokenów</Text>
        </View>

        {/* Deadline */}
        <View style={styles.section}>
          <Text style={styles.label}>Termin (opcjonalnie)</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {deadline
                ? deadline.toLocaleDateString('pl-PL')
                : 'Wybierz termin (opcjonalnie)'}
            </Text>
          </TouchableOpacity>
          {deadline && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setDeadline(null)}
            >
              <Text style={styles.clearButtonText}>Usuń termin</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* DatePicker would be shown here - requires @react-native-community/datetimepicker */}

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              Opis <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={handleSuggestDescription}
              disabled={suggestingDescription}
            >
              {suggestingDescription ? (
                <ActivityIndicator size="small" color="#00D4AA" />
              ) : (
                <Text style={styles.aiButtonText}>✨ Podpowiedź AI</Text>
              )}
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Opisz swój cel i dlaczego jest dla Ciebie ważny..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            maxLength={400}
            textAlignVertical="top"
          />
          <Text style={styles.helperText}>{description.length}/400 znaków</Text>
        </View>

        {/* Error message */}
        {errors.general && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errors.general}</Text>
          </View>
        )}

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Utwórz cel</Text>
          )}
        </TouchableOpacity>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Możesz mieć maksymalnie 3 aktywne cele jednocześnie. Od każdego
            wsparcia otrzymasz 70%, a 30% trafia do Avalo.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#00D4AA',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  required: {
    color: '#FF4444',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 16,
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderColor: '#00D4AA',
  },
  categoryIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    color: '#999',
  },
  categoryTextActive: {
    color: '#00D4AA',
    fontWeight: '600',
  },
  dateButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#FFF',
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#FF4444',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 8,
  },
  aiButtonText: {
    fontSize: 13,
    color: '#00D4AA',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#FF4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#FF4444',
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 212, 170, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
});
