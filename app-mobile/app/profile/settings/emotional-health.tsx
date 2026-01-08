import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { functions, db, auth } from "@/lib/firebase";

interface EmotionalPreferences {
  healthyBoundariesEnabled: boolean;
  reminderFrequency: 'never' | 'occasional' | 'frequent';
  coolingModeEnabled: boolean;
  lastReminderShown?: Date;
}

interface AttachmentMetrics {
  dailyHours: number;
  avgAttachmentRisk: number;
  avgEmotionalIntensity: number;
  consecutiveDays: number;
}

export default function EmotionalHealthSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<EmotionalPreferences>({
    healthyBoundariesEnabled: true,
    reminderFrequency: 'occasional',
    coolingModeEnabled: false
  });
  const [metrics, setMetrics] = useState<AttachmentMetrics | null>(null);
  const [checkingRisk, setCheckingRisk] = useState(false);

  useEffect(() => {
    loadPreferences();
    checkAttachmentRisk();
  }, []);

  const loadPreferences = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const prefsDoc = await getDoc(doc(db, 'user_emotional_preferences', userId));
      if (prefsDoc.exists()) {
        const data = prefsDoc.data();
        setPreferences({
          healthyBoundariesEnabled: data.healthyBoundariesEnabled ?? true,
          reminderFrequency: data.reminderFrequency ?? 'occasional',
          coolingModeEnabled: data.coolingModeEnabled ?? false,
          lastReminderShown: data.lastReminderShown?.toDate()
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAttachmentRisk = async () => {
    try {
      setCheckingRisk(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const detectRisk = httpsCallable(functions, 'detectAttachmentRisk');
      const result = await detectRisk({ userId });
      const data = result.data as any;

      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error('Error checking attachment risk:', error);
    } finally {
      setCheckingRisk(false);
    }
  };

  const savePreferences = async (newPrefs: Partial<EmotionalPreferences>) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const updatedPrefs = { ...preferences, ...newPrefs };
      setPreferences(updatedPrefs);

      await setDoc(doc(db, 'user_emotional_preferences', userId), {
        ...updatedPrefs,
        userId
      }, { merge: true });
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences');
    }
  };

  const handleResetCooling = async () => {
    Alert.alert(
      'Reset Cooling Mode',
      'Are you sure you want to reset cooling mode? This will restore normal conversation tone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            await savePreferences({ coolingModeEnabled: false });
            Alert.alert('Success', 'Cooling mode has been reset');
          }
        }
      ]
    );
  };

  const getRiskLevelColor = (risk: number): string => {
    if (risk >= 0.85) return '#ef4444';
    if (risk >= 0.7) return '#f97316';
    if (risk >= 0.5) return '#eab308';
    return '#22c55e';
  };

  const getRiskLevelText = (risk: number): string => {
    if (risk >= 0.85) return 'Critical';
    if (risk >= 0.7) return 'High';
    if (risk >= 0.5) return 'Medium';
    return 'Healthy';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Emotional Health',
          headerStyle: { backgroundColor: '#8b5cf6' },
          headerTintColor: '#fff'
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.infoCard}>
          <Ionicons name="heart-outline" size={32} color="#8b5cf6" />
          <Text style={styles.infoTitle}>Healthy AI Interactions</Text>
          <Text style={styles.infoText}>
            We care about your wellbeing. These settings help ensure AI interactions stay fun, supportive, and healthy.
          </Text>
        </View>

        {metrics && (
          <View style={styles.metricsCard}>
            <Text style={styles.sectionTitle}>Your Wellness Metrics</Text>
            
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Daily Usage</Text>
              <Text style={styles.metricValue}>
                {metrics.dailyHours.toFixed(1)} hours
              </Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Attachment Risk</Text>
              <View style={styles.riskBadge}>
                <View
                  style={[
                    styles.riskIndicator,
                    { backgroundColor: getRiskLevelColor(metrics.avgAttachmentRisk) }
                  ]}
                />
                <Text style={styles.metricValue}>
                  {getRiskLevelText(metrics.avgAttachmentRisk)}
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Emotional Intensity</Text>
              <Text style={styles.metricValue}>
                {(metrics.avgEmotionalIntensity * 100).toFixed(0)}%
              </Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Consecutive Days</Text>
              <Text style={styles.metricValue}>
                {metrics.consecutiveDays} days
              </Text>
            </View>

            <TouchableOpacity
              style={styles.refreshButton}
              onPress={checkAttachmentRisk}
              disabled={checkingRisk}
            >
              {checkingRisk ? (
                <ActivityIndicator size="small" color="#8b5cf6" />
              ) : (
                <>
                  <Ionicons name="refresh" size={18} color="#8b5cf6" />
                  <Text style={styles.refreshButtonText}>Refresh Metrics</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Settings</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Healthy Boundaries</Text>
              <Text style={styles.settingDescription}>
                Prevents manipulative emotional patterns
              </Text>
            </View>
            <Switch
              value={preferences.healthyBoundariesEnabled}
              onValueChange={(value) =>
                savePreferences({ healthyBoundariesEnabled: value })
              }
              trackColor={{ false: '#d1d5db', true: '#8b5cf6' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Reminder Frequency</Text>
              <Text style={styles.settingDescription}>
                Balance reminders for real-world connections
              </Text>
            </View>
          </View>

          <View style={styles.frequencyOptions}>
            {(['never', 'occasional', 'frequent'] as const).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.frequencyButton,
                  preferences.reminderFrequency === freq && styles.frequencyButtonActive
                ]}
                onPress={() => savePreferences({ reminderFrequency: freq })}
              >
                <Text
                  style={[
                    styles.frequencyButtonText,
                    preferences.reminderFrequency === freq && styles.frequencyButtonTextActive
                  ]}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {preferences.coolingModeEnabled && (
          <View style={styles.coolingCard}>
            <View style={styles.coolingHeader}>
              <Ionicons name="snow-outline" size={24} color="#3b82f6" />
              <Text style={styles.coolingTitle}>Cooling Mode Active</Text>
            </View>
            <Text style={styles.coolingText}>
              Conversation tone has been adjusted to promote healthy balance. This helps ensure
              interactions remain supportive without causing dependency.
            </Text>
            <TouchableOpacity style={styles.resetButton} onPress={handleResetCooling}>
              <Text style={styles.resetButtonText}>Reset to Normal</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About These Settings</Text>
          <Text style={styles.aboutText}>
            AI companions should enhance your life, not replace real human connections. These
            safety features:
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Detect unhealthy attachment patterns</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Block manipulative emotional tactics</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Prevent burnout from intense conversations</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Encourage balance with real-world life</Text>
            </View>
          </View>
        </View>

        <View style={styles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={24} color="#6b7280" />
          <Text style={styles.disclaimerText}>
            These settings cannot be fully disabled to ensure your safety. AI interactions are
            monitored for emotional manipulation patterns regardless of preferences.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb'
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20
  },
  metricsCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  metricLabel: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500'
  },
  metricValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600'
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  riskIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '600'
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  settingInfo: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  settingDescription: {
    fontSize: 13,
    color: '#6b7280'
  },
  frequencyOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center'
  },
  frequencyButtonActive: {
    backgroundColor: '#8b5cf6'
  },
  frequencyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280'
  },
  frequencyButtonTextActive: {
    color: '#fff'
  },
  coolingCard: {
    backgroundColor: '#eff6ff',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f6'
  },
  coolingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  coolingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e40af'
  },
  coolingText: {
    fontSize: 14,
    color: '#1e3a8a',
    lineHeight: 20,
    marginBottom: 16
  },
  resetButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center'
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff'
  },
  aboutText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16
  },
  featureList: {
    gap: 12
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: '#374151'
  },
  disclaimerCard: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18
  }
});
