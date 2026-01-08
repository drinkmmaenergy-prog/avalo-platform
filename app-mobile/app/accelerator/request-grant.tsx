import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';

interface GrantItem {
  item: string;
  cost: number;
  vendor: string;
}

export default function RequestGrantScreen() {
  const [grantType, setGrantType] = useState<'equipment' | 'marketing' | 'production' | 'studio_access'>('equipment');
  const [purpose, setPurpose] = useState('');
  const [justification, setJustification] = useState('');
  const [items, setItems] = useState<GrantItem[]>([
    { item: '', cost: 0, vendor: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grantTypes = [
    { value: 'equipment', label: 'Equipment', icon: '🎥', maxAmount: 5000 },
    { value: 'marketing', label: 'Marketing', icon: '📢', maxAmount: 3000 },
    { value: 'production', label: 'Production', icon: '🎬', maxAmount: 4000 },
    { value: 'studio_access', label: 'Studio Access', icon: '🏢', maxAmount: 2000 },
  ];

  const addItem = () => {
    setItems([...items, { item: '', cost: 0, vendor: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof GrantItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  };

  const handleSubmit = async () => {
    const totalAmount = calculateTotal();
    const selectedType = grantTypes.find(t => t.value === grantType);

    if (!purpose || !justification) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    if (items.some(item => !item.item || !item.cost)) {
      Alert.alert('Incomplete Items', 'Please complete all item details');
      return;
    }

    if (totalAmount === 0) {
      Alert.alert('Invalid Amount', 'Total grant amount must be greater than $0');
      return;
    }

    if (selectedType && totalAmount > selectedType.maxAmount) {
      Alert.alert(
        'Amount Exceeds Limit',
        `${selectedType.label} grants are limited to $${selectedType.maxAmount.toLocaleString()}`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        'https://us-central1-avalo-c8c46.cloudfunctions.net/requestGrant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              grantType,
              amount: totalAmount,
              purpose,
              justification,
              itemsRequested: items,
            },
          }),
        }
      );

      const result = await response.json();

      if (result.result.success) {
        Alert.alert(
          'Grant Request Submitted!',
          'Your grant request has been submitted for review. We will notify you of the decision.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.result.message || 'Failed to submit grant request');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit grant request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Request Grant</Text>
        <Text style={styles.subtitle}>
          Professional funding for your creator business
        </Text>
      </View>

      <View style={styles.ethicsBanner}>
        <Text style={styles.ethicsText}>
          ✓ Grants are merit-based • No favoritism • Full ownership retained
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Grant Type</Text>
        <View style={styles.typeGrid}>
          {grantTypes.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeCard,
                grantType === type.value && styles.typeCardActive,
              ]}
              onPress={() => setGrantType(type.value as any)}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <Text
                style={[
                  styles.typeLabel,
                  grantType === type.value && styles.typeLabelActive,
                ]}
              >
                {type.label}
              </Text>
              <Text style={styles.typeLimit}>
                Up to ${type.maxAmount.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Purpose *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={purpose}
          onChangeText={setPurpose}
          placeholder="Describe what this grant will be used for..."
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Justification *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={justification}
          onChangeText={setJustification}
          placeholder="Explain how this investment will grow your business..."
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.itemsHeader}>
          <Text style={styles.sectionTitle}>Items Requested</Text>
          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>+ Add Item</Text>
          </TouchableOpacity>
        </View>

        {items.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemNumber}>Item {index + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(index)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.itemLabel}>Item Name *</Text>
            <TextInput
              style={styles.input}
              value={item.item}
              onChangeText={(text) => updateItem(index, 'item', text)}
              placeholder="e.g., Sony A7 III Camera"
            />

            <Text style={styles.itemLabel}>Cost *</Text>
            <TextInput
              style={styles.input}
              value={item.cost > 0 ? item.cost.toString() : ''}
              onChangeText={(text) => updateItem(index, 'cost', parseFloat(text) || 0)}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.itemLabel}>Vendor</Text>
            <TextInput
              style={styles.input}
              value={item.vendor}
              onChangeText={(text) => updateItem(index, 'vendor', text)}
              placeholder="e.g., B&H Photo, Amazon"
            />
          </View>
        ))}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Amount:</Text>
          <Text style={styles.totalAmount}>
            ${calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>Grant Guidelines:</Text>
        <Text style={styles.disclaimerText}>
          • Grants are reviewed based on business merit and growth potential
        </Text>
        <Text style={styles.disclaimerText}>
          • All equipment and materials remain your property
        </Text>
        <Text style={styles.disclaimerText}>
          • Funding decisions are never based on appearance or personal relationships
        </Text>
        <Text style={styles.disclaimerText}>
          • Review typically takes 5-7 business days
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Submitting...' : 'Submit Grant Request'}
        </Text>
      </TouchableOpacity>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  ethicsBanner: {
    backgroundColor: '#dcfce7',
    padding: 12,
    alignItems: 'center',
  },
  ethicsText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  typeCard: {
    width: '50%',
    padding: 6,
  },
  typeCardActive: {
    opacity: 1,
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: 8,
    textAlign: 'center',
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  typeLabelActive: {
    color: '#3b82f6',
  },
  typeLimit: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  removeText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '600',
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
  },
  disclaimer: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 16,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 6,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spacer: {
    height: 40,
  },
});
