/**
 * PACK 180: Guardian Settings Screen
 * User preferences for Social Guardian interventions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';

type InterventionLevel = 'minimal' | 'moderate' | 'proactive';

export default function GuardianSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [interventionLevel, setInterventionLevel] = useState<InterventionLevel>('moderate');
  const [autoRewriteSuggestions, setAutoRewriteSuggestions] = useState(true);
  const [notifyOnIntervention, setNotifyOnIntervention] = useState(true);
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    try {
      const functions = getFunctions();
      const getSettings = httpsCallable(functions, 'getGuardianSettings');
      const result = await getSettings();
      const data = result.data as any;
      
      if (data) {
        setEnabled(data.enabled ?? true);
        setInterventionLevel(data.interventionLevel || 'moderate');
        setAutoRewriteSuggestions(data.autoRewriteSuggestions ?? true);
        setNotifyOnIntervention(data.notifyOnIntervention ?? true);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const saveSettings = async () => {
    setSaving(true);
    try {
      const functions = getFunctions();
      const updateSettings = httpsCallable(functions, 'updateGuardianSettings');
      await updateSettings({
        enabled,
        interventionLevel,
        autoRewriteSuggestions,
        notifyOnIntervention
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleLevelSelect = (level: InterventionLevel) => {
    setInterventionLevel(level);
    saveSettings();
  };
  
  const toggleEnabled = (value: boolean) => {
    setEnabled(value);
    setTimeout(() => saveSettings(), 100);
  };
  
  const toggleAutoRewrite = (value: boolean) => {
    setAutoRewriteSuggestions(value);
    setTimeout(() => saveSettings(), 100);
  };
  
  const toggleNotify = (value: boolean) => {
    setNotifyOnIntervention(value);
    setTimeout(() => saveSettings(), 100);
  };
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }
  
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Guardian Settings',
          headerBackTitle: 'Back'
        }}
      />
      
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={32} color="#3B82F6" />
          </View>
          <Text style={styles.headerTitle}>Social Guardian</Text>
          <Text style={styles.headerDescription}>
            AI-powered conversation safety that prevents toxic escalation without monitoring consensual chats
          </Text>
        </View>
        
        {/* Enable/Disable */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable Guardian</Text>
              <Text style={styles.settingDescription}>
                Monitor conversations for safety risks
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={toggleEnabled}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={enabled ? '#3B82F6' : '#F3F4F6'}
            />
          </View>
        </View>
        
        {enabled && (
          <>
            {/* Intervention Level */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Intervention Level</Text>
              <Text style={styles.sectionDescription}>
                Choose how proactively Guardian should intervene
              </Text>
              
              <TouchableOpacity
                style={[
                  styles.levelButton,
                  interventionLevel === 'minimal' && styles.levelButtonActive
                ]}
                onPress={() => handleLevelSelect('minimal')}
              >
                <View style={styles.levelIcon}>
                  <Ionicons 
                    name="chatbubble-ellipses-outline" 
                    size={24} 
                    color={interventionLevel === 'minimal' ? '#3B82F6' : '#6B7280'} 
                  />
                </View>
                <View style={styles.levelContent}>
                  <Text style={[
                    styles.levelLabel,
                    interventionLevel === 'minimal' && styles.levelLabelActive
                  ]}>
                    Minimal
                  </Text>
                  <Text style={styles.levelDescription}>
                    Only intervene for critical safety risks
                  </Text>
                </View>
                {interventionLevel === 'minimal' && (
                  <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.levelButton,
                  interventionLevel === 'moderate' && styles.levelButtonActive
                ]}
                onPress={() => handleLevelSelect('moderate')}
              >
                <View style={styles.levelIcon}>
                  <Ionicons 
                    name="shield-half-outline" 
                    size={24} 
                    color={interventionLevel === 'moderate' ? '#3B82F6' : '#6B7280'} 
                  />
                </View>
                <View style={styles.levelContent}>
                  <Text style={[
                    styles.levelLabel,
                    interventionLevel === 'moderate' && styles.levelLabelActive
                  ]}>
                    Moderate (Recommended)
                  </Text>
                  <Text style={styles.levelDescription}>
                    Balance between safety and freedom
                  </Text>
                </View>
                {interventionLevel === 'moderate' && (
                  <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.levelButton,
                  interventionLevel === 'proactive' && styles.levelButtonActive
                ]}
                onPress={() => handleLevelSelect('proactive')}
              >
                <View style={styles.levelIcon}>
                  <Ionicons 
                    name="shield-checkmark" 
                    size={24} 
                    color={interventionLevel === 'proactive' ? '#3B82F6' : '#6B7280'} 
                  />
                </View>
                <View style={styles.levelContent}>
                  <Text style={[
                    styles.levelLabel,
                    interventionLevel === 'proactive' && styles.levelLabelActive
                  ]}>
                    Proactive
                  </Text>
                  <Text style={styles.levelDescription}>
                    Early intervention for potential issues
                  </Text>
                </View>
                {interventionLevel === 'proactive' && (
                  <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                )}
              </TouchableOpacity>
            </View>
            
            {/* Additional Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Features</Text>
              
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Message Rewrite Suggestions</Text>
                  <Text style={styles.settingDescription}>
                    Offer to help rewrite tense messages
                  </Text>
                </View>
                <Switch
                  value={autoRewriteSuggestions}
                  onValueChange={toggleAutoRewrite}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={autoRewriteSuggestions ? '#3B82F6' : '#F3F4F6'}
                />
              </View>
              
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Intervention Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Get notified when Guardian intervenes
                  </Text>
                </View>
                <Switch
                  value={notifyOnIntervention}
                  onValueChange={toggleNotify}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={notifyOnIntervention ? '#3B82F6' : '#F3F4F6'}
                />
              </View>
            </View>
          </>
        )}
        
        {/* Privacy Notice */}
        <View style={styles.privacySection}>
          <Ionicons name="lock-closed" size={20} color="#6B7280" />
          <Text style={styles.privacyTitle}>Privacy First</Text>
          <Text style={styles.privacyText}>
            • Guardian only monitors for safety risks{'\n'}
            • No surveillance of consensual adult conversations{'\n'}
            • Your messages are never used for AI training{'\n'}
            • No behavioral scoring or ranking impact
          </Text>
        </View>
        
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  },
  header: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8
  },
  headerDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12
  },
  settingInfo: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20
  },
  levelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent'
  },
  levelButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6'
  },
  levelIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  levelContent: {
    flex: 1
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4
  },
  levelLabelActive: {
    color: '#1F2937'
  },
  levelDescription: {
    fontSize: 14,
    color: '#6B7280'
  },
  privacySection: {
    padding: 20,
    alignItems: 'center'
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 12
  },
  privacyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 24,
    textAlign: 'left'
  },
  savingIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  savingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8
  }
});
