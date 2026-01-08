/**
 * Edit Drop Screen
 * Allows creators to edit their drop details
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDrop, updateDrop, type DropPublicInfo } from '../../../services/dropsService';

export default function EditDropScreen() {
  const { dropId } = useLocalSearchParams<{ dropId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drop, setDrop] = useState<DropPublicInfo | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    loadDrop();
  }, [dropId]);

  const loadDrop = async () => {
    try {
      setLoading(true);
      const dropData = await getDrop(dropId as string);
      setDrop(dropData);
      setTitle(dropData.title);
      setDescription(dropData.description);
      setTags(dropData.tags.join(', '));
    } catch (error) {
      Alert.alert('Error', 'Failed to load drop');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    try {
      setSaving(true);
      await updateDrop(dropId as string, {
        title: title.trim(),
        description: description.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      });
      Alert.alert('Success', 'Drop updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update drop');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00ff88" style={{ marginTop: 100 }} />
      </View>
    );
  }

  if (!drop) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Drop</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Type:</Text>
          <Text style={styles.infoValue}>{drop.type.replace('_DROP', '')}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Price:</Text>
          <Text style={styles.infoValue}>{drop.priceTokens} tokens</Text>
          <Text style={styles.infoHint}>Cannot be changed after creation</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Sales:</Text>
          <Text style={styles.infoValue}>
            {drop.soldCount} sold
            {drop.stockRemaining !== null && ` / ${drop.stockRemaining + drop.soldCount} total`}
          </Text>
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
          <Text style={styles.label}>Tags (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="exclusive, photos, premium"
            placeholderTextColor="#666"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Changes'}
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
  infoCard: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
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
  saveButton: {
    backgroundColor: '#00ff88',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});