/**
 * PACK 55 — Age Gate Screen
 * Requires users to verify they are 18+ before using the app
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLocaleContext } from '../../contexts/LocaleContext';
import { submitSoftAgeVerification } from '../../services/ageGateService';

interface Props {
  onVerified: () => void;
}

export default function AgeGateScreen({ onVerified }: Props) {
  const { user } = useAuth();
  const localeContext = useLocaleContext();
  
  // Helper function to translate
  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = require('../../i18n/strings.en.json');
    for (const k of keys) {
      value = value[k];
      if (!value) return key;
    }
    return value;
  };

  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Validate inputs
    if (!year || !month || !day) {
      Alert.alert(
        t('common.error'),
        'Please enter your complete date of birth'
      );
      return;
    }

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);

    if (yearNum < 1900 || yearNum > new Date().getFullYear()) {
      Alert.alert(t('common.error'), 'Invalid year');
      return;
    }

    if (monthNum < 1 || monthNum > 12) {
      Alert.alert(t('common.error'), 'Invalid month');
      return;
    }

    if (dayNum < 1 || dayNum > 31) {
      Alert.alert(t('common.error'), 'Invalid day');
      return;
    }

    // Format date as YYYY-MM-DD
    const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    setLoading(true);

    try {
      const result = await submitSoftAgeVerification(
        user.uid,
        dateOfBirth,
        country || undefined
      );

      if (result.ageVerified) {
        // User is 18+, allow access
        onVerified();
      } else {
        // User is under 18
        Alert.alert(
          t('compliance.ageGate.underage'),
          'You must be at least 18 years old to use Avalo. Please contact support if you believe this is an error.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Log out or prevent access
                // For now, just show error
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('[AgeGateScreen] Error verifying age:', error);
      Alert.alert(
        t('common.error'),
        error.message || 'Failed to verify age. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('compliance.ageGate.title')}</Text>
        <Text style={styles.subtitle}>{t('compliance.ageGate.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>{t('compliance.ageGate.dob')}</Text>

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Year</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY"
              placeholderTextColor="#999"
              value={year}
              onChangeText={setYear}
              keyboardType="numeric"
              maxLength={4}
              editable={!loading}
            />
          </View>

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Month</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="MM"
              placeholderTextColor="#999"
              value={month}
              onChangeText={setMonth}
              keyboardType="numeric"
              maxLength={2}
              editable={!loading}
            />
          </View>

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Day</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="DD"
              placeholderTextColor="#999"
              value={day}
              onChangeText={setDay}
              keyboardType="numeric"
              maxLength={2}
              editable={!loading}
            />
          </View>
        </View>

        <Text style={styles.label}>{t('compliance.ageGate.country')}</Text>
        <TextInput
          style={styles.input}
          placeholder="Country (optional)"
          placeholderTextColor="#999"
          value={country}
          onChangeText={setCountry}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('compliance.ageGate.confirm')}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By confirming your age, you certify that you are at least 18 years old and agree
          to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  dateField: {
    flex: 1,
    marginHorizontal: 4,
  },
  dateLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#E94057',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
