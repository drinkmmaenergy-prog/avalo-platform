/**
 * PACK 195: Contract Generator
 * Create professional contracts with anti-exploitation protection
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

const CONTRACT_TYPES = [
  { value: 'brand_collaboration', label: 'Brand Collaboration' },
  { value: 'licensing_agreement', label: 'Licensing Agreement' },
  { value: 'digital_product_rights', label: 'Digital Product Rights' },
  { value: 'model_release', label: 'Model Release (SFW Only)' },
  { value: 'event_hosting', label: 'Event Hosting' },
  { value: 'nda', label: 'Non-Disclosure Agreement' },
  { value: 'image_rights', label: 'Image Rights' },
];

export default function CreateContract() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const [contractType, setContractType] = useState('brand_collaboration');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [exclusivity, setExclusivity] = useState(false);
  const [exclusivityDays, setExclusivityDays] = useState('');

  const [exploitationCheck, setExploitationCheck] = useState<any>(null);

  const validateForm = () => {
    if (!counterpartyName.trim()) {
      Alert.alert('Error', 'Please enter counterparty name');
      return false;
    }
    if (!counterpartyEmail.trim()) {
      Alert.alert('Error', 'Please enter counterparty email');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter contract description');
      return false;
    }
    if (!scope.trim()) {
      Alert.alert('Error', 'Please enter contract scope');
      return false;
    }
    return true;
  };

  const checkExploitation = async () => {
    if (!validateForm()) return;

    setChecking(true);
    try {
      const checkFunction = httpsCallable(
        functions,
        'checkContractExploitationFunction'
      );

      const result = await checkFunction({
        type: contractType,
        terms: {
          description,
          scope: scope.split('\n').filter((s) => s.trim()),
          paymentAmount: paymentAmount ? parseFloat(paymentAmount) : undefined,
          exclusivity: exclusivity
            ? {
                enabled: true,
                duration: exclusivityDays
                  ? parseInt(exclusivityDays)
                  : undefined,
              }
            : { enabled: false },
        },
      });

      setExploitationCheck(result.data);

      if ((result.data as any).blockers.length > 0) {
        Alert.alert(
          'Contract Blocked',
          `This contract contains predatory terms:\n\n${(result.data as any).blockers.join('\n')}`,
          [{ text: 'OK' }]
        );
      } else if ((result.data as any).warnings.length > 0) {
        Alert.alert(
          'Warnings Detected',
          `Please review these concerns:\n\n${(result.data as any).warnings.join('\n')}`,
          [
            { text: 'Review Contract', style: 'cancel' },
            { text: 'Continue Anyway', onPress: () => {} },
          ]
        );
      } else {
        Alert.alert('Safe Contract', 'No exploitation concerns detected!', [
          { text: 'OK' },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setChecking(false);
    }
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    if (!exploitationCheck || exploitationCheck.blockers.length > 0) {
      Alert.alert(
        'Safety Check Required',
        'Please run the anti-exploitation check first'
      );
      return;
    }

    setLoading(true);
    try {
      const generateContract = httpsCallable(
        functions,
        'generateContractFunction'
      );

      await generateContract({
        type: contractType,
        creator: {
          legalName: 'Current User',
          email: 'user@example.com',
        },
        counterparty: {
          userId: 'temp',
          legalName: counterpartyName,
          email: counterpartyEmail,
        },
        terms: {
          description,
          scope: scope.split('\n').filter((s) => s.trim()),
          paymentAmount: paymentAmount ? parseFloat(paymentAmount) : undefined,
          paymentCurrency: 'USD',
          exclusivity: exclusivity
            ? {
                enabled: true,
                duration: exclusivityDays
                  ? parseInt(exclusivityDays)
                  : undefined,
              }
            : { enabled: false },
        },
      });

      Alert.alert('Success', 'Contract created successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Contract</Text>
        <Text style={styles.subtitle}>
          All contracts include anti-exploitation protection
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Contract Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CONTRACT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeChip,
                contractType === type.value && styles.typeChipActive,
              ]}
              onPress={() => setContractType(type.value)}
            >
              <Text
                style={[
                  styles.typeChipText,
                  contractType === type.value && styles.typeChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Counterparty Name *</Text>
        <TextInput
          style={styles.input}
          value={counterpartyName}
          onChangeText={setCounterpartyName}
          placeholder="Company or individual name"
        />

        <Text style={styles.label}>Counterparty Email *</Text>
        <TextInput
          style={styles.input}
          value={counterpartyEmail}
          onChangeText={setCounterpartyEmail}
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Contract Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what this contract is for..."
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Scope of Work *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={scope}
          onChangeText={setScope}
          placeholder="Enter each deliverable on a new line..."
          multiline
          numberOfLines={6}
        />

        <Text style={styles.label}>Payment Amount (USD)</Text>
        <TextInput
          style={styles.input}
          value={paymentAmount}
          onChangeText={setPaymentAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Duration (Days)</Text>
        <TextInput
          style={styles.input}
          value={duration}
          onChangeText={setDuration}
          placeholder="90"
          keyboardType="number-pad"
        />

        <View style={styles.checkboxRow}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setExclusivity(!exclusivity)}
          >
            <View
              style={[
                styles.checkboxBox,
                exclusivity && styles.checkboxBoxChecked,
              ]}
            >
              {exclusivity && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Include Exclusivity Clause</Text>
          </TouchableOpacity>
        </View>

        {exclusivity && (
          <>
            <Text style={styles.label}>Exclusivity Duration (Days)</Text>
            <TextInput
              style={styles.input}
              value={exclusivityDays}
              onChangeText={setExclusivityDays}
              placeholder="180"
              keyboardType="number-pad"
            />
            <Text style={styles.warning}>
              ⚠️ Exclusivity over 180 days will trigger warnings
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.checkButton, checking && styles.buttonDisabled]}
          onPress={checkExploitation}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>🛡️ Check for Exploitation</Text>
          )}
        </TouchableOpacity>

        {exploitationCheck && (
          <View
            style={[
              styles.resultCard,
              exploitationCheck.passed
                ? styles.resultCardSafe
                : styles.resultCardDanger,
            ]}
          >
            <Text style={styles.resultTitle}>
              {exploitationCheck.passed
                ? '✅ Safe Contract'
                : '❌ Contract Blocked'}
            </Text>
            {exploitationCheck.warnings.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Warnings:</Text>
                {exploitationCheck.warnings.map((w: string, i: number) => (
                  <Text key={i} style={styles.resultItem}>
                    • {w}
                  </Text>
                ))}
              </View>
            )}
            {exploitationCheck.blockers.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Blockers:</Text>
                {exploitationCheck.blockers.map((b: string, i: number) => (
                  <Text key={i} style={styles.resultItem}>
                    • {b}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.createButton,
            (loading ||
              !exploitationCheck ||
              exploitationCheck.blockers.length > 0) &&
              styles.buttonDisabled,
          ]}
          onPress={handleCreate}
          disabled={
            loading ||
            !exploitationCheck ||
            exploitationCheck.blockers.length > 0
          }
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Create Contract</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    marginRight: 8,
    marginBottom: 8,
  },
  typeChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeChipText: {
    fontSize: 14,
    color: '#666',
  },
  typeChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  checkboxRow: {
    marginTop: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#DDD',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxCheck: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
  },
  warning: {
    fontSize: 14,
    color: '#FF9500',
    marginTop: 8,
  },
  checkButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  resultCardSafe: {
    backgroundColor: '#E8F5E9',
  },
  resultCardDanger: {
    backgroundColor: '#FFEBEE',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultSection: {
    marginTop: 8,
  },
  resultSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  resultItem: {
    fontSize: 14,
    marginLeft: 8,
    marginTop: 4,
  },
});
