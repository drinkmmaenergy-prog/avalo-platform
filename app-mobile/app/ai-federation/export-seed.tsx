import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AiSeed } from "@/types/pack189-ai-federation.types";

export default function ExportSeed() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const [seed, setSeed] = useState<AiSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSeed();
  }, [id]);

  const loadSeed = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      const seedDoc = await getDoc(doc(db, 'ai_seeds', id));
      if (seedDoc.exists()) {
        setSeed({
          id: seedDoc.id,
          ...seedDoc.data(),
          createdAt: seedDoc.data().createdAt?.toDate(),
          updatedAt: seedDoc.data().updatedAt?.toDate(),
        } as AiSeed);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load AI Seed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!seed || !user) return;

    setExporting(true);

    try {
      const exportAiSeed = httpsCallable(functions, 'exportAiSeed');
      const result = await exportAiSeed({ seedId: seed.id });
      const data = result.data as { success: boolean; exportData: any; message: string };

      if (data.success) {
        const exportJson = JSON.stringify(data.exportData, null, 2);

        Alert.alert(
          'Export Successful',
          'Your AI Seed has been exported. You can now share it with others.',
          [
            {
              text: 'Share',
              onPress: () => handleShare(exportJson),
            },
            {
              text: 'OK',
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to export AI Seed');
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async (exportData: string) => {
    try {
      await Share.share({
        message: `AI Seed Export: ${seed?.name}\n\n${exportData}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6c5ce7" />
      </View>
    );
  }

  if (!seed) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>AI Seed not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Export AI Seed</Text>
        <Text style={styles.subtitle}>Create a portable version of your AI character</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seed Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{seed.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version:</Text>
          <Text style={styles.infoValue}>{seed.version}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Archetype:</Text>
          <Text style={styles.infoValue}>{seed.personality.archetype}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export Contents</Text>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Personality traits</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Interests and skill affinities</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Communication style</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Lore and backstory</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Voice pack metadata</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Avatar metadata</Text>
        </View>
        <View style={styles.checklistItem}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.checklistText}>Safety ruleset</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy Protection</Text>
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>What's NOT Exported:</Text>
          <View style={styles.checklistItem}>
            <Text style={styles.crossmark}>✗</Text>
            <Text style={styles.checklistText}>Chat history</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.crossmark}>✗</Text>
            <Text style={styles.checklistText}>Your personal information</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.crossmark}>✗</Text>
            <Text style={styles.checklistText}>Your location data</Text>
          </View>
          <View style={styles.checklistItem}>
            <Text style={styles.crossmark}>✗</Text>
            <Text style={styles.checklistText}>Payment information</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          This export is safe to share. It contains only the AI character data, no personal information.
        </Text>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.exportButtonText}>Export & Share</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: '#999',
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkmark: {
    color: '#00b894',
    fontSize: 18,
    marginRight: 12,
    fontWeight: 'bold',
  },
  crossmark: {
    color: '#d63031',
    fontSize: 18,
    marginRight: 12,
    fontWeight: 'bold',
  },
  checklistText: {
    fontSize: 16,
    color: '#fff',
  },
  warningBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#d63031',
    borderRadius: 8,
    padding: 16,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#d63031',
    marginBottom: 12,
  },
  footer: {
    padding: 20,
  },
  footerNote: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  exportButton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
