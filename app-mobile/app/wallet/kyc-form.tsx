/**
 * PACK 289 — KYC Form Screen
 * 
 * Complete KYC (Know Your Customer) verification form
 * Required before first withdrawal
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
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

// Types
interface KYCFormData {
  fullName: string;
  dateOfBirth: string;
  country: string;
  taxResidence: string;
  idDocument: {
    type: 'ID_CARD' | 'PASSPORT' | 'DRIVING_LICENSE';
    country: string;
    number: string;
    expiresAt: string;
  };
  address: {
    line1: string;
    line2: string;
    city: string;
    postalCode: string;
    country: string;
  };
  payoutMethod: {
    type: 'WISE' | 'BANK_TRANSFER';
    currency: string;
    iban?: string;
    wiseRecipientId?: string;
  };
}

const COUNTRIES = [
  { code: 'PL', name: 'Poland' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
];

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

const ID_TYPES = [
  { value: 'ID_CARD', label: 'ID Card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
];

const PAYOUT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer (IBAN)' },
  { value: 'WISE', label: 'Wise (TransferWise)' },
];

export default function KYCFormScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState<KYCFormData>({
    fullName: '',
    dateOfBirth: '',
    country: 'PL',
    taxResidence: 'PL',
    idDocument: {
      type: 'ID_CARD',
      country: 'PL',
      number: '',
      expiresAt: '',
    },
    address: {
      line1: '',
      line2: '',
      city: '',
      postalCode: '',
      country: 'PL',
    },
    payoutMethod: {
      type: 'BANK_TRANSFER',
      currency: 'PLN',
    },
  });

  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateNestedData = (parent: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...(prev as any)[parent],
        [field]: value,
      },
    }));
  };

  const validateStep1 = (): boolean => {
    if (!formData.fullName || formData.fullName.length < 2) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }
    if (!formData.dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Error', 'Invalid date format (use YYYY-MM-DD)');
      return false;
    }
    if (!formData.country) {
      Alert.alert('Error', 'Please select your country');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!formData.idDocument.number) {
      Alert.alert('Error', 'Please enter your ID document number');
      return false;
    }
    if (!formData.idDocument.expiresAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Error', 'Invalid expiration date format (use YYYY-MM-DD)');
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (!formData.address.line1 || !formData.address.city || !formData.address.postalCode) {
      Alert.alert('Error', 'Please complete your address');
      return false;
    }
    return true;
  };

  const validateStep4 = (): boolean => {
    if (formData.payoutMethod.type === 'BANK_TRANSFER' && !formData.payoutMethod.iban) {
      Alert.alert('Error', 'Please enter your IBAN');
      return false;
    }
    if (formData.payoutMethod.type === 'WISE' && !formData.payoutMethod.wiseRecipientId) {
      Alert.alert('Error', 'Please enter your Wise recipient ID');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    let isValid = false;

    switch (step) {
      case 1:
        isValid = validateStep1();
        break;
      case 2:
        isValid = validateStep2();
        break;
      case 3:
        isValid = validateStep3();
        break;
      case 4:
        isValid = validateStep4();
        break;
    }

    if (isValid && step < 4) {
      setStep(step + 1);
    } else if (isValid && step === 4) {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const submitKYC = httpsCallable(functions, 'kyc_submit');
      const result = await submitKYC(formData);

      if ((result.data as any).success) {
        Alert.alert(
          'Success',
          'KYC submitted for review. You will be notified once verified.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', (result.data as any).error || 'Failed to submit KYC');
      }
    } catch (error) {
      console.error('KYC submission error:', error);
      Alert.alert('Error', 'Failed to submit KYC. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Personal Information</Text>

      <Text style={styles.label}>Full Name (as on ID)</Text>
      <TextInput
        style={styles.input}
        value={formData.fullName}
        onChangeText={(value) => updateFormData('fullName', value)}
        placeholder="John Doe"
        autoCapitalize="words"
      />

      <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={formData.dateOfBirth}
        onChangeText={(value) => updateFormData('dateOfBirth', value)}
        placeholder="1990-01-01"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Country</Text>
      <View style={styles.pickerContainer}>
        {COUNTRIES.map((country) => (
          <TouchableOpacity
            key={country.code}
            style={[
              styles.pickerOption,
              formData.country === country.code && styles.pickerOptionSelected,
            ]}
            onPress={() => updateFormData('country', country.code)}
          >
            <Text
              style={[
                styles.pickerOptionText,
                formData.country === country.code && styles.pickerOptionTextSelected,
              ]}
            >
              {country.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Tax Residence</Text>
      <View style={styles.pickerContainer}>
        {COUNTRIES.map((country) => (
          <TouchableOpacity
            key={country.code}
            style={[
              styles.pickerOption,
              formData.taxResidence === country.code && styles.pickerOptionSelected,
            ]}
            onPress={() => updateFormData('taxResidence', country.code)}
          >
            <Text
              style={[
                styles.pickerOptionText,
                formData.taxResidence === country.code && styles.pickerOptionTextSelected,
              ]}
            >
              {country.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>ID Document</Text>

      <Text style={styles.label}>Document Type</Text>
      <View style={styles.radioGroup}>
        {ID_TYPES.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={styles.radioOption}
            onPress={() => updateNestedData('idDocument', 'type', type.value)}
          >
            <Ionicons
              name={formData.idDocument.type === type.value ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color="#6366f1"
            />
            <Text style={styles.radioLabel}>{type.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Document Number</Text>
      <TextInput
        style={styles.input}
        value={formData.idDocument.number}
        onChangeText={(value) => updateNestedData('idDocument', 'number', value)}
        placeholder="ABC123456"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Expiration Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={formData.idDocument.expiresAt}
        onChangeText={(value) => updateNestedData('idDocument', 'expiresAt', value)}
        placeholder="2030-12-31"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Document Country</Text>
      <View style={styles.pickerContainer}>
        {COUNTRIES.map((country) => (
          <TouchableOpacity
            key={country.code}
            style={[
              styles.pickerOption,
              formData.idDocument.country === country.code && styles.pickerOptionSelected,
            ]}
            onPress={() => updateNestedData('idDocument', 'country', country.code)}
          >
            <Text
              style={[
                styles.pickerOptionText,
                formData.idDocument.country === country.code && styles.pickerOptionTextSelected,
              ]}
            >
              {country.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Address</Text>

      <Text style={styles.label}>Address Line 1</Text>
      <TextInput
        style={styles.input}
        value={formData.address.line1}
        onChangeText={(value) => updateNestedData('address', 'line1', value)}
        placeholder="123 Main Street"
      />

      <Text style={styles.label}>Address Line 2 (Optional)</Text>
      <TextInput
        style={styles.input}
        value={formData.address.line2}
        onChangeText={(value) => updateNestedData('address', 'line2', value)}
        placeholder="Apartment 4B"
      />

      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        value={formData.address.city}
        onChangeText={(value) => updateNestedData('address', 'city', value)}
        placeholder="Warsaw"
      />

      <Text style={styles.label}>Postal Code</Text>
      <TextInput
        style={styles.input}
        value={formData.address.postalCode}
        onChangeText={(value) => updateNestedData('address', 'postalCode', value)}
        placeholder="00-001"
      />

      <Text style={styles.label}>Country</Text>
      <View style={styles.pickerContainer}>
        {COUNTRIES.map((country) => (
          <TouchableOpacity
            key={country.code}
            style={[
              styles.pickerOption,
              formData.address.country === country.code && styles.pickerOptionSelected,
            ]}
            onPress={() => updateNestedData('address', 'country', country.code)}
          >
            <Text
              style={[
                styles.pickerOptionText,
                formData.address.country === country.code && styles.pickerOptionTextSelected,
              ]}
            >
              {country.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Payout Method</Text>

      <Text style={styles.label}>Method</Text>
      <View style={styles.radioGroup}>
        {PAYOUT_METHODS.map((method) => (
          <TouchableOpacity
            key={method.value}
            style={styles.radioOption}
            onPress={() => updateNestedData('payoutMethod', 'type', method.value)}
          >
            <Ionicons
              name={
                formData.payoutMethod.type === method.value ? 'radio-button-on' : 'radio-button-off'
              }
              size={24}
              color="#6366f1"
            />
            <Text style={styles.radioLabel}>{method.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Currency</Text>
      <View style={styles.currencyGrid}>
        {CURRENCIES.map((currency) => (
          <TouchableOpacity
            key={currency}
            style={[
              styles.currencyOption,
              formData.payoutMethod.currency === currency && styles.currencyOptionSelected,
            ]}
            onPress={() => updateNestedData('payoutMethod', 'currency', currency)}
          >
            <Text
              style={[
                styles.currencyText,
                formData.payoutMethod.currency === currency && styles.currencyTextSelected,
              ]}
            >
              {currency}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {formData.payoutMethod.type === 'BANK_TRANSFER' && (
        <>
          <Text style={styles.label}>IBAN</Text>
          <TextInput
            style={styles.input}
            value={formData.payoutMethod.iban}
            onChangeText={(value) => updateNestedData('payoutMethod', 'iban', value)}
            placeholder="PL61109010140000071219812874"
            autoCapitalize="characters"
          />
        </>
      )}

      {formData.payoutMethod.type === 'WISE' && (
        <>
          <Text style={styles.label}>Wise Recipient ID</Text>
          <TextInput
            style={styles.input}
            value={formData.payoutMethod.wiseRecipientId}
            onChangeText={(value) => updateNestedData('payoutMethod', 'wiseRecipientId', value)}
            placeholder="12345678"
            keyboardType="numeric"
          />
          <Text style={styles.helperText}>
            Find this in your Wise account under Recipients
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Verification</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[styles.progressStep, step >= s && styles.progressStepActive]}
          />
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setStep(step - 1)}
              disabled={loading}
            >
              <Text style={styles.buttonSecondaryText}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleNext}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>
                {step === 4 ? 'Submit' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#6366f1" />
          <Text style={styles.infoText}>
            Your information is encrypted and secure. KYC is required for withdrawals.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#6366f1',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepContainer: {
    paddingVertical: 8,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  pickerContainer: {
    gap: 8,
  },
  pickerOption: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerOptionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  pickerOptionTextSelected: {
    color: '#6366f1',
    fontWeight: '600',
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioLabel: {
    fontSize: 16,
    color: '#374151',
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  currencyOption: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  currencyOptionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  currencyTextSelected: {
    color: '#6366f1',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#6366f1',
  },
  buttonSecondary: {
    backgroundColor: '#f3f4f6',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 32,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4f46e5',
    lineHeight: 20,
  },
});
