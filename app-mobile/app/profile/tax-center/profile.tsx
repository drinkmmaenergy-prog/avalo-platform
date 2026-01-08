/**
 * PACK 330 — Tax Profile Setup & Management
 * Mobile UI for creating and updating tax profile
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Picker } from '@react-native-picker/picker';

// Types
interface TaxProfile {
  userId: string;
  countryCode: string;
  taxResidenceCountry: string;
  isBusiness: boolean;
  vatId?: string;
  personalTaxId?: string;
  preferredReportCurrency: 'PLN' | 'EUR' | 'USD' | 'GBP';
  consentToElectronicDocs: boolean;
}

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP'];

const COUNTRIES = [
  { code: 'PL', name: 'Poland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  // Add more as needed
];

export default function TaxProfileScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  
  // Form state
  const [countryCode, setCountryCode] = useState('PL');
  const [taxResidenceCountry, setTaxResidenceCountry] = useState('PL');
  const [isBusiness, setIsBusiness] = useState(false);
  const [vatId, setVatId] = useState('');
  const [personalTaxId, setPersonalTaxId] = useState('');
  const [preferredReportCurrency, setPreferredReportCurrency] = useState<'PLN' | 'EUR' | 'USD' | 'GBP'>('PLN');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const getProfile = httpsCallable(functions, 'taxProfile_get');
      const response: any = await getProfile({});

      if (response.data.success && response.data.profile) {
        const p = response.data.profile;
        setProfile(p);
        setCountryCode(p.countryCode);
        setTaxResidenceCountry(p.taxResidenceCountry);
        setIsBusiness(p.isBusiness);
        setVatId(p.vatId || '');
        setPersonalTaxId(p.personalTaxId || '');
        setPreferredReportCurrency(p.preferredReportCurrency);
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!countryCode || !taxResidenceCountry || !preferredReportCurrency) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (isBusiness && !vatId) {
      Alert.alert('Error', 'VAT ID is required for business accounts');
      return;
    }

    try {
      setSaving(true);
      const setProfile = httpsCallable(functions, 'taxProfile_set');
      const response: any = await setProfile({
        userId: auth.currentUser?.uid,
        countryCode,
        taxResidenceCountry,
        isBusiness,
        vatId: isBusiness ? vatId : undefined,
        personalTaxId: personalTaxId || undefined,
        preferredReportCurrency,
      });

      if (response.data.success) {
        Alert.alert('Success', 'Tax profile saved successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', response.data.error || 'Failed to save tax profile');
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', error.message || 'Failed to save tax profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading tax profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tax Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Warning Box */}
        <View style={styles.warningBox}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#10B981" />
          <Text style={styles.warningText}>
            Your information is encrypted and used only for tax compliance. Identity verification required.
          </Text>
        </View>

        {/* Country Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Country *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={countryCode}
                onValueChange={(value) => setCountryCode(value)}
                style={styles.picker}
              >
                {COUNTRIES.map((country) => (
                  <Picker.Item
                    key={country.code}
                    label={country.name}
                    value={country.code}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tax Residence Country *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={taxResidenceCountry}
                onValueChange={(value) => setTaxResidenceCountry(value)}
                style={styles.picker}
              >
                {COUNTRIES.map((country) => (
                  <Picker.Item
                    key={country.code}
                    label={country.name}
                    value={country.code}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        {/* Account Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Type</Text>
          
          <View style={styles.radioGroup}>
            <TouchableOpacity
              style={[styles.radioOption, !isBusiness && styles.radioOptionSelected]}
              onPress={() => setIsBusiness(false)}
            >
              <View style={styles.radioCircle}>
                {!isBusiness && <View style={styles.radioCircleInner} />}
              </View>
              <Text style={styles.radioLabel}>Individual</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.radioOption, isBusiness && styles.radioOptionSelected]}
              onPress={() => setIsBusiness(true)}
            >
              <View style={styles.radioCircle}>
                {isBusiness && <View style={styles.radioCircleInner} />}
              </View>
              <Text style={styles.radioLabel}>Business / Company</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tax IDs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tax Information</Text>
          
          {isBusiness && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>VAT ID / Business Tax ID *</Text>
              <TextInput
                style={styles.input}
                value={vatId}
                onChangeText={setVatId}
                placeholder="Enter VAT ID"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Personal Tax ID (Optional)</Text>
            <TextInput
              style={styles.input}
              value={personalTaxId}
              onChangeText={setPersonalTaxId}
              placeholder="e.g., NIP, SSN (if required)"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />
            <Text style={styles.hint}>
              Only provide if required by your country's tax laws
            </Text>
          </View>
        </View>

        {/* Currency Preference */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Preferences</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Preferred Currency for Reports *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={preferredReportCurrency}
                onValueChange={(value) => setPreferredReportCurrency(value as any)}
                style={styles.picker}
              >
                {CURRENCIES.map((currency) => (
                  <Picker.Item key={currency} label={currency} value={currency} />
                ))}
              </Picker>
            </View>
            <Text style={styles.hint}>
              Earnings are always calculated at 1 token = 0.20 PLN, but reports can show converted amounts
            </Text>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
          <View style={styles.disclaimerContent}>
            <Text style={styles.disclaimerTitle}>Tax Disclaimer</Text>
            <Text style={styles.disclaimerText}>
              By creating a tax profile, you consent to receive electronic tax documents and understand that you are responsible for declaring income according to your local tax laws. Avalo does not provide tax advice.
            </Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {profile ? 'Update Profile' : 'Create Profile'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#065F46',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  radioOptionSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6366F1',
  },
  radioLabel: {
    fontSize: 16,
    color: '#111827',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  disclaimerContent: {
    flex: 1,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#4338CA',
    lineHeight: 18,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
