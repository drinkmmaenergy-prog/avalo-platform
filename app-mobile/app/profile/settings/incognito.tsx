/**
 * Incognito Mode Settings Screen
 * 
 * When enabled: user is hidden in Swipe + Discovery + Feed
 * User can still see others and send first message
 * Badge "Incognito" shown only to user (not to others)
 */

import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function IncognitoSettingsScreen() {
  const router = useRouter();
  const [incognitoEnabled, setIncognitoEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadIncognitoSettings();
  }, []);

  const loadIncognitoSettings = async () => {
    try {
      // TODO: Load from Firestore
      // const userId = await getCurrentUserId();
      // const userDoc = await getDoc(doc(db, 'users', userId));
      // setIncognitoEnabled(userDoc.data()?.privacy?.incognito?.enabled || false);
      setIncognitoEnabled(false);
    } catch (error) {
      console.error('Failed to load incognito settings:', error);
    }
  };

  const toggleIncognito = async () => {
    try {
      setLoading(true);
      
      // TODO: Call Cloud Function to toggle incognito
      // const userId = await getCurrentUserId();
      // await toggleIncognitoMode(userId, !incognitoEnabled);
      
      setIncognitoEnabled(!incognitoEnabled);
      
      Alert.alert(
        'Success',
        !incognitoEnabled 
          ? 'Incognito mode enabled. You are now hidden from Discovery and Swipe.'
          : 'Incognito mode disabled. You are now visible to others.'
      );
    } catch (error) {
      console.error('Failed to toggle incognito:', error);
      Alert.alert('Error', 'Failed to update incognito mode. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Incognito Mode</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Incognito Mode</Text>
              <Text style={styles.toggleDescription}>
                {incognitoEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <Switch
              value={incognitoEnabled}
              onValueChange={toggleIncognito}
              disabled={loading}
              trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              thumbColor={incognitoEnabled ? '#fff' : '#fff'}
            />
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How Incognito Mode Works</Text>
          
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>👁️</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Hidden Profile</Text>
              <Text style={styles.featureDescription}>
                Your profile won't appear in Discovery, Swipe, or Feed
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>👀</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>You Can Still Browse</Text>
              <Text style={styles.featureDescription}>
                You can see other profiles and send first messages
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔒</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Private Badge</Text>
              <Text style={styles.featureDescription}>
                Only you can see your Incognito badge
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💬</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Existing Matches</Text>
              <Text style={styles.featureDescription}>
                Your existing conversations remain active
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            💡 Note: Incognito mode is free for all users. You can enable or disable it anytime.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
