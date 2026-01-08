/**
 * Create New Drop Screen
 * Form for creators to create a new drop
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { createDrop, type CreateDropInput } from "@/services/dropsService";

export default function CreateDropScreen() {
  const [loading, setLoading] = useState(false);
  const [dropType, setDropType] = useState<'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP'>('STANDARD_DROP');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceTokens, setPriceTokens] = useState('100');
  const [maxQuantity, setMaxQuantity] = useState('');
  const [is18Plus, setIs18Plus] = useState(false);
  const [tags, setTags] = useState('');

  const handleCreate = async () => {
    // Validate inputs
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    const price = parseInt(priceTokens);
    if (isNaN(price) || price < 20 || price > 5000) {
      Alert.alert('Error', 'Price must be between 20 and 5000 tokens');
      return;
    }

    const quantity = maxQuantity ? parseInt(maxQuantity) : null;
    if (quantity !== null && (isNaN(quantity) || quantity < 1)) {
      Alert.alert('Error', 'Max quantity must be at least 1 or leave empty for unlimited');
      return;
    }

    try {
      setLoading(true);

      const dropData: CreateDropInput = {
        type: dropType,
        title: title.trim(),
        description: description.trim(),
        coverImageUrl: 'https://via.placeholder.com/400', // Placeholder
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        priceTokens: price,
        maxQuantity: quantity,
        is18Plus,
        visibility: 'public',
        contentItems: [], // Simplified - in production, add content selection
      };

      await createDrop(dropData);
      Alert.alert('Success', 'Drop created successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create drop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Drop</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form}>
        <View style={styles.section}>
          <Text style={styles.label}>Drop Type</Text>
          <View style={styles.typeButtons}>
            {(['STANDARD_DROP', 'FLASH_DROP', 'LOOTBOX_DROP', 'COOP_DROP'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  dropType === type && styles.typeButtonActive,
                ]}
                onPress={() => setDropType(type)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    dropType === type && styles.typeButtonTextActive,
                  ]}
                >
                  {type.replace('_DROP', '')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter drop title"
            placeholderTextColor="#666"
            maxLength={100}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what's included in this drop"
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            maxLength={1000}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Price (Tokens) *</Text>
          <TextInput
            style={styles.input}
            value={priceTokens}
            onChangeText={setPriceTokens}
            placeholder="100"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>
            Recommended: 20-5000 tokens
            {'\n'}You'll receive 70%, Avalo keeps 30%
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Max Quantity (Optional)</Text>
          <TextInput
            style={styles.input}
            value={maxQuantity}
            onChangeText={setMaxQuantity}
            placeholder="Leave empty for unlimited"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Tags (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="exclusive, photos, premium"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>18+ Content</Text>
              <Text style={styles.hint}>Only visible to verified adults</Text>
            </View>
            <Switch
              value={is18Plus}
              onValueChange={setIs18Plus}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor={is18Plus ? '#fff' : '#999'}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.createButtonText}>
            {loading ? 'Creating...' : 'Create Drop'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
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
    paddingTop: 60,
    backgroundColor: '#111',
  },
  backButton: {
    fontSize: 16,
    color: '#00ff88',
    width: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  typeButtonActive: {
    backgroundColor: '#00ff88',
    borderColor: '#00ff88',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#fff',
  },
  typeButtonTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  createButton: {
    backgroundColor: '#00ff88',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
