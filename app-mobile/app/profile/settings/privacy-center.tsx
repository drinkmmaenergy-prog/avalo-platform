/**
 * PACK 155: Privacy Center
 * GDPR/CCPA/LGPD/PDPA Compliance Dashboard
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";

interface RetentionSummary {
  userId: string;
  categories: {
    category: string;
    itemCount: number;
    oldestItem: string;
    scheduledDeletionDate?: string;
    retentionPolicy: {
      category: string;
      retentionMonths: number | null;
      deleteLogic: string;
      description: string;
    };
  }[];
  hasLegalHold: boolean;
}

interface ConsentSettings {
  locationTracking: boolean;
  analyticsData: boolean;
  emailMarketing: boolean;
  pushNotifications: boolean;
  cookieConsent: boolean;
  personalization: boolean;
  thirdPartySharing: boolean;
}

export default function PrivacyCenterScreen() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummary | null>(null);
  const [consentSettings, setConsentSettings] = useState<ConsentSettings | null>(null);

  useEffect(() => {
    loadPrivacyData();
  }, []);

  const loadPrivacyData = async () => {
    try {
      setLoading(true);

      const getRetentionSummary = httpsCallable(functions, 'getRetentionSummary');
      const getConsentSettings = httpsCallable(functions, 'getConsentSettings');

      const [summaryResult, consentResult] = await Promise.all([
        getRetentionSummary(),
        getConsentSettings()
      ]);

      setRetentionSummary(summaryResult.data as RetentionSummary);
      setConsentSettings(consentResult.data as ConsentSettings);
    } catch (error) {
      console.error('Error loading privacy data:', error);
      Alert.alert('Error', 'Failed to load privacy information');
    } finally {
      setLoading(false);
    }
  };

  const toggleConsent = async (key: keyof ConsentSettings) => {
    if (!consentSettings) return;

    try {
      const newSettings = {
        ...consentSettings,
        [key]: !consentSettings[key]
      };

      const updateConsent = httpsCallable(functions, 'updateConsentSettings');
      await updateConsent(newSettings);

      setConsentSettings(newSettings);

      Alert.alert('Success', 'Privacy settings updated');
    } catch (error) {
      console.error('Error updating consent:', error);
      Alert.alert('Error', 'Failed to update privacy settings');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Privacy Center' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading privacy information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Privacy Center',
          headerLargeTitle: true
        }} 
      />
      
      <ScrollView style={styles.scrollView}>
        {retentionSummary?.hasLegalHold && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={24} color="#FF9500" />
            <Text style={styles.warningText}>
              Your account has an active legal hold. Some data operations may be restricted.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Data</Text>
          <Text style={styles.sectionDescription}>
            View what data we store and when it will be automatically deleted
          </Text>

          {retentionSummary?.categories.map((category, index) => (
            <View key={index} style={styles.dataCard}>
              <View style={styles.dataHeader}>
                <Text style={styles.dataTitle}>
                  {getCategoryName(category.category)}
                </Text>
                <Text style={styles.dataCount}>{category.itemCount} items</Text>
              </View>
              
              <Text style={styles.dataDescription}>
                {category.retentionPolicy.description}
              </Text>

              {category.scheduledDeletionDate && (
                <View style={styles.deletionInfo}>
                  <Ionicons name="time-outline" size={16} color="#666" />
                  <Text style={styles.deletionText}>
                    Auto-delete: {formatDate(category.scheduledDeletionDate)}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Controls</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/profile/settings/data-export' as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="download-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Download Your Data</Text>
              <Text style={styles.actionDescription}>
                Export all your personal information
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/profile/settings/delete-account' as any)}
          >
            <View style={[styles.actionIcon, styles.dangerIcon]}>
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, styles.dangerText]}>Delete Account</Text>
              <Text style={styles.actionDescription}>
                Permanently remove your account and data
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consent Management</Text>
          
          {consentSettings && (
            <>
              <ConsentToggle
                label="Location Tracking"
                description="Allow us to collect your location data"
                value={consentSettings.locationTracking}
                onToggle={() => toggleConsent('locationTracking')}
              />
              
              <ConsentToggle
                label="Analytics Data"
                description="Help improve the app with usage data"
                value={consentSettings.analyticsData}
                onToggle={() => toggleConsent('analyticsData')}
              />
              
              <ConsentToggle
                label="Email Marketing"
                description="Receive promotional emails and updates"
                value={consentSettings.emailMarketing}
                onToggle={() => toggleConsent('emailMarketing')}
              />
              
              <ConsentToggle
                label="Personalization"
                description="Personalized content and recommendations"
                value={consentSettings.personalization}
                onToggle={() => toggleConsent('personalization')}
              />
              
              <ConsentToggle
                label="Third-Party Sharing"
                description="Share data with trusted partners"
                value={consentSettings.thirdPartySharing}
                onToggle={() => toggleConsent('thirdPartySharing')}
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal Information</Text>
          
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/legal/privacy' as any)}
          >
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#007AFF" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/legal/terms' as any)}
          >
            <Text style={styles.linkText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
          <Text style={styles.infoText}>
            We comply with GDPR, CCPA, LGPD, and PDPA regulations. 
            You have the right to access, export, and delete your personal data at any time.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConsentToggle({ 
  label, 
  description, 
  value, 
  onToggle 
}: { 
  label: string; 
  description: string; 
  value: boolean; 
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.consentRow} onPress={onToggle}>
      <View style={styles.consentContent}>
        <Text style={styles.consentLabel}>{label}</Text>
        <Text style={styles.consentDescription}>{description}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </TouchableOpacity>
  );
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    chats_calls: 'Chats & Calls',
    public_posts: 'Public Posts',
    paid_content: 'Paid Content',
    identity_docs: 'Identity Documents',
    ai_companion: 'AI Companion',
    safety_cases: 'Safety Cases',
    analytics_data: 'Analytics Data',
    location_data: 'Location Data',
    device_data: 'Device Data'
  };
  return names[category] || category;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666'
  },
  scrollView: {
    flex: 1
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#856404'
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16
  },
  dataCard: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 16,
    marginTop: 16
  },
  dataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  dataTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  dataCount: {
    fontSize: 14,
    color: '#666'
  },
  dataDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8
  },
  deletionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  deletionText: {
    fontSize: 12,
    color: '#666'
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 12
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  dangerIcon: {
    backgroundColor: '#FFEBEE'
  },
  actionContent: {
    flex: 1
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2
  },
  dangerText: {
    color: '#FF3B30'
  },
  actionDescription: {
    fontSize: 14,
    color: '#666'
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 12
  },
  consentContent: {
    flex: 1,
    marginRight: 12
  },
  consentLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2
  },
  consentDescription: {
    fontSize: 14,
    color: '#666'
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  toggleActive: {
    backgroundColor: '#34C759'
  },
  toggleThumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }]
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 12
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF'
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F4FD',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#014361',
    lineHeight: 20
  }
});
