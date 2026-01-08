/**
 * Trusted Contact Form Screen
 * Phase 25: Set or update trusted contact for Safe-Meet
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTrustedContact,
  setTrustedContact,
  TrustedContact,
} from "@/services/safeMeetService";

export default function TrustedContactForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    loadExistingContact();
  }, []);

  const loadExistingContact = async () => {
    try {
      setLoading(true);
      const contact = await getTrustedContact();
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone);
        setEmail(contact.email);
      }
    } catch (error) {
      console.error('Error loading trusted contact:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): string | null => {
    if (!name.trim()) {
      return 'Imię jest wymagane';
    }

    if (!phone.trim()) {
      return 'Numer telefonu jest wymagany';
    }

    // Basic phone validation (at least 9 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 9) {
      return 'Wprowadź prawidłowy numer telefonu';
    }

    if (!email.trim()) {
      return 'Email jest wymagany';
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Wprowadź prawidłowy adres email';
    }

    return null;
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Błąd', error);
      return;
    }

    try {
      setSaving(true);
      const result = await setTrustedContact({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
      });

      if (result.success) {
        Alert.alert(
          'Sukces',
          'Kontakt zaufany został zapisany',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Błąd', result.error || 'Nie udało się zapisać kontaktu');
      }
    } catch (error) {
      Alert.alert('Błąd', 'Wystąpił problem podczas zapisywania');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="person-circle" size={64} color="#007AFF" />
          <Text style={styles.title}>Kontakt zaufany</Text>
          <Text style={styles.subtitle}>
            Ta osoba zostanie powiadomiona w sytuacji zagrożenia
          </Text>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#007AFF" />
          <Text style={styles.infoText}>
            Wybierz osobę najbliższą, która powinna być powiadomiona, jeśli
            użyjesz funkcji SOS podczas spotkania Safe-Meet.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Imię i nazwisko *</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="person-outline"
                size={20}
                color="#6C757D"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="np. Jan Kowalski"
                placeholderTextColor="#ADB5BD"
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Numer telefonu *</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="call-outline"
                size={20}
                color="#6C757D"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="np. +48 123 456 789"
                placeholderTextColor="#ADB5BD"
                keyboardType="phone-pad"
              />
            </View>
            <Text style={styles.hint}>
              Numer telefonu kontaktu zaufanego (z kierunkowym)
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adres email *</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color="#6C757D"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="np. kontakt@example.com"
                placeholderTextColor="#ADB5BD"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <Text style={styles.hint}>
              Powiadomienie SOS zostanie wysłane na ten adres
            </Text>
          </View>
        </View>

        {/* Warning Box */}
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={24} color="#FFC107" />
          <Text style={styles.warningText}>
            <Text style={styles.warningBold}>Ważne:</Text> Upewnij się, że
            dane kontaktu są aktualne. W sytuacji zagrożenia ta osoba zostanie
            natychmiast powiadomiona emailem.
          </Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#FFF" />
              <Text style={styles.saveButtonText}>Zapisz kontakt zaufany</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 8,
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E7F3FF',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  form: {
    backgroundColor: '#FFF',
    padding: 20,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#212529',
  },
  hint: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 6,
    marginLeft: 4,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  warningBold: {
    fontWeight: '600',
  },
  spacer: {
    height: 100,
  },
  bottomBar: {
    backgroundColor: '#FFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
