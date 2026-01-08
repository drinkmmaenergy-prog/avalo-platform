/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Create Safety Timer Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafetyTimers } from '../../hooks/useSafetyTimers';
import {
  SAFETY_TIMER_DURATIONS,
  SafetyTimerDuration,
} from '../../types/safetyTimer';

export default function CreateSafetyTimerScreen() {
  const router = useRouter();
  const { createTimer, loading } = useSafetyTimers();

  const [selectedDuration, setSelectedDuration] = useState<SafetyTimerDuration>(30);
  const [note, setNote] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // Mock trusted contacts - in production, fetch from user's friends/followers
  const [availableContacts] = useState([
    { id: 'contact1', name: 'Anna Kowalska', avatar: '👤' },
    { id: 'contact2', name: 'Jan Nowak', avatar: '👤' },
    { id: 'contact3', name: 'Marta Wiśniewska', avatar: '👤' },
  ]);

  const toggleContact = (contactId: string) => {
    if (selectedContacts.includes(contactId)) {
      setSelectedContacts(selectedContacts.filter(id => id !== contactId));
    } else {
      if (selectedContacts.length >= 5) {
        Alert.alert('Limit osiągnięty', 'Możesz wybrać maksymalnie 5 zaufanych kontaktów');
        return;
      }
      setSelectedContacts([...selectedContacts, contactId]);
    }
  };

  const handleCreate = async () => {
    if (!note.trim()) {
      Alert.alert('Brak notatki', 'Dodaj krótki opis spotkania (np. "Kawa w centrum")');
      return;
    }

    if (note.length > 200) {
      Alert.alert('Notatka za długa', 'Maksymalna długość to 200 znaków');
      return;
    }

    try {
      await createTimer(selectedDuration, note.trim(), selectedContacts);
      
      Alert.alert(
        'Timer utworzony',
        `Timer bezpieczeństwa na ${selectedDuration} minut został aktywowany.`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się utworzyć timera');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Wstecz</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nowy Timer Bezpieczeństwa</Text>
        <Text style={styles.headerSubtitle}>
          Skonfiguruj timer przed spotkaniem offline
        </Text>
      </View>

      {/* Duration Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Czas trwania</Text>
        <Text style={styles.sectionHint}>Jak długo potrwa spotkanie?</Text>
        
        <View style={styles.durationOptions}>
          {SAFETY_TIMER_DURATIONS.map((duration) => (
            <TouchableOpacity
              key={duration}
              style={[
                styles.durationOption,
                selectedDuration === duration && styles.durationOptionSelected,
              ]}
              onPress={() => setSelectedDuration(duration)}
            >
              <Text
                style={[
                  styles.durationOptionText,
                  selectedDuration === duration && styles.durationOptionTextSelected,
                ]}
              >
                {duration} min
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Note Input */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Opis spotkania</Text>
        <Text style={styles.sectionHint}>
          Krótki opis, np. "Kawa w Starbucks centrum"
        </Text>
        
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Wpisz opis spotkania..."
          placeholderTextColor="#9CA3AF"
          maxLength={200}
          multiline
          numberOfLines={3}
        />
        
        <Text style={styles.characterCount}>
          {note.length}/200 znaków
        </Text>
      </View>

      {/* Trusted Contacts Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Zaufane kontakty (opcjonalnie)</Text>
        <Text style={styles.sectionHint}>
          Wybierz do 5 osób z Avalo, które zostaną powiadomione jeśli nie potwierdzisz
          bezpieczeństwa
        </Text>

        {selectedContacts.length === 0 && (
          <View style={styles.noContactsCard}>
            <Text style={styles.noContactsText}>
              Nie wybrano żadnych kontaktów. Timer będzie działać jako przypomnienie
              dla Ciebie.
            </Text>
          </View>
        )}

        <View style={styles.contactsList}>
          {availableContacts.map((contact) => {
            const isSelected = selectedContacts.includes(contact.id);
            return (
              <TouchableOpacity
                key={contact.id}
                style={[
                  styles.contactItem,
                  isSelected && styles.contactItemSelected,
                ]}
                onPress={() => toggleContact(contact.id)}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactAvatar}>{contact.avatar}</Text>
                  <Text
                    style={[
                      styles.contactName,
                      isSelected && styles.contactNameSelected,
                    ]}
                  >
                    {contact.name}
                  </Text>
                </View>
                
                <View
                  style={[
                    styles.contactCheckbox,
                    isSelected && styles.contactCheckboxSelected,
                  ]}
                >
                  {isSelected && <Text style={styles.contactCheckmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.contactsCount}>
          Wybrano: {selectedContacts.length}/5
        </Text>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Jak działa timer?</Text>
        <Text style={styles.infoText}>
          • Timer startuje natychmiast po utworzeniu{'\n'}
          • Otrzymasz powiadomienia 10 min i 5 min przed końcem{'\n'}
          • Kliknij "Jestem bezpieczny" aby potwierdzić OK{'\n'}
          • Jeśli nie potwierdzisz, zaufane kontakty dostaną alert{'\n'}
          • Możesz anulować timer w każdej chwili
        </Text>
      </View>

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createButton, loading && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={loading || !note.trim()}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.createButtonText}>
            Uruchom Timer ({selectedDuration} min)
          </Text>
        )}
      </TouchableOpacity>

      {/* Disclaimer */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          ⚠️ To narzędzie NIE kontaktuje się z policją ani służbami ratunkowymi.
          W prawdziwej sytuacji zagrożenia dzwoń na 112 (UE) lub 911 (USA).
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  durationOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  durationOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  durationOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  durationOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  durationOptionTextSelected: {
    color: '#3B82F6',
  },
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  noContactsCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noContactsText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  contactsList: {
    gap: 8,
  },
  contactItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  contactItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  contactAvatar: {
    fontSize: 32,
    marginRight: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  contactNameSelected: {
    color: '#3B82F6',
  },
  contactCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCheckboxSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  contactCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  contactsCount: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'right',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  disclaimerBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  disclaimerText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
    textAlign: 'center',
  },
});
