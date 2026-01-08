import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export default function ImportSeed() {
  const router = useRouter();
  const { user } = useAuth();
  const [importData, setImportData] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to import an AI Seed');
      return;
    }

    if (!importData.trim()) {
      Alert.alert('Error', 'Please paste the AI Seed export data');
      return;
    }

    setLoading(true);

    try {
      const exportData = JSON.parse(importData);

      if (!exportData.personality || !exportData.lore || !exportData.versionSignature) {
        throw new Error('Invalid AI Seed export format');
      }

      const importAiSeed = httpsCallable(functions, 'importAiSeed');
      const result = await importAiSeed({
        userId: user.uid,
        exportData,
        source: 'file',
      });

      const data = result.data as { success: boolean; seedId: string; message: string };

      if (data.success) {
        Alert.alert('Success', 'AI Seed imported successfully!', [
          {
            text: 'OK',
            onPress: () => router.push('/ai-federation/my-seeds' as any),
          },
        ]);
      }
    } catch (error: any) {
      if (error.message.includes('JSON')) {
        Alert.alert('Error', 'Invalid export data format. Please check the data and try again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to import AI Seed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Import AI Seed</Text>
        <Text style={styles.subtitle}>Import an AI character from export data</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Check</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            All imported AI Seeds are automatically screened for:
          </Text>
          <View style={styles.checklistItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.checklistText}>Age compliance (18+ only)</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.checklistText}>No NSFW content</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.checklistText}>No celebrity impersonation</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.checklistText}>No extremist content</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import Data</Text>
        <Text style={styles.label}>Paste AI Seed Export JSON:</Text>
        <TextInput
          style={styles.textArea}
          value={importData}
          onChangeText={setImportData}
          placeholder="Paste the exported AI Seed JSON data here..."
          placeholderTextColor="#666"
          multiline
          numberOfLines={12}
        />
        <Text style={styles.hint}>
          Tip: Copy the entire JSON data from the exported file
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleImport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Import AI Seed</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#00b894',
    borderRadius: 8,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkmark: {
    color: '#00b894',
    fontSize: 16,
    marginRight: 12,
    fontWeight: 'bold',
  },
  checklistText: {
    fontSize: 14,
    color: '#fff',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 200,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    padding: 20,
  },
  button: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
