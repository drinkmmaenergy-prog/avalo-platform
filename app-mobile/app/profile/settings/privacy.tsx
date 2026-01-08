/**
 * PACK 171 - Privacy Dashboard
 * User-first privacy controls with private defaults
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

type VisibilityLevel = 'public' | 'friends' | 'private';

interface PrivacySettings {
  posts: VisibilityLevel;
  reels: VisibilityLevel;
  stories: VisibilityLevel;
  clubs: VisibilityLevel;
  purchases: VisibilityLevel;
  events: VisibilityLevel;
  reviews: VisibilityLevel;
  incognitoMode: boolean;
  showOnlineStatus: boolean;
  allowMessageRequests: boolean;
  searchable: boolean;
}

export default function PrivacyDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    posts: 'private',
    reels: 'private',
    stories: 'private',
    clubs: 'private',
    purchases: 'private',
    events: 'private',
    reviews: 'private',
    incognitoMode: false,
    showOnlineStatus: true,
    allowMessageRequests: true,
    searchable: true,
  });

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    try {
      setSettings({
        posts: 'private',
        reels: 'private',
        stories: 'private',
        clubs: 'private',
        purchases: 'private',
        events: 'private',
        reviews: 'private',
        incognitoMode: false,
        showOnlineStatus: true,
        allowMessageRequests: true,
        searchable: true,
      });
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    }
  };

  const updateVisibility = async (field: keyof PrivacySettings, value: VisibilityLevel) => {
    try {
      setLoading(true);
      const updateSettings = httpsCallable(functions, 'updateSettings');
      
      const newSettings = { ...settings, [field]: value };
      setSettings(newSettings);

      await updateSettings({
        category: 'privacy',
        updates: newSettings,
      });

      Alert.alert('Success', 'Privacy settings updated');
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleSetting = async (field: keyof PrivacySettings) => {
    try {
      setLoading(true);
      const updateSettings = httpsCallable(functions, 'updateSettings');
      
      const newSettings = { ...settings, [field]: !settings[field] };
      setSettings(newSettings);

      await updateSettings({
        category: 'privacy',
        updates: newSettings,
      });
    } catch (error) {
      console.error('Failed to toggle setting:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const VisibilitySelector = ({
    label,
    description,
    field,
  }: {
    label: string;
    description: string;
    field: keyof PrivacySettings;
  }) => {
    const value = settings[field] as VisibilityLevel;

    return (
      <View style={styles.visibilityCard}>
        <Text style={styles.visibilityLabel}>{label}</Text>
        <Text style={styles.visibilityDescription}>{description}</Text>
        <View style={styles.visibilityOptions}>
          <TouchableOpacity
            style={[styles.visibilityOption, value === 'private' && styles.visibilityOptionActive]}
            onPress={() => updateVisibility(field, 'private')}
            disabled={loading}
          >
            <Text style={[styles.visibilityOptionText, value === 'private' && styles.visibilityOptionTextActive]}>
              🔒 Private
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visibilityOption, value === 'friends' && styles.visibilityOptionActive]}
            onPress={() => updateVisibility(field, 'friends')}
            disabled={loading}
          >
            <Text style={[styles.visibilityOptionText, value === 'friends' && styles.visibilityOptionTextActive]}>
              👥 Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visibilityOption, value === 'public' && styles.visibilityOptionActive]}
            onPress={() => updateVisibility(field, 'public')}
            disabled={loading}
          >
            <Text style={[styles.visibilityOptionText, value === 'public' && styles.visibilityOptionTextActive]}>
              🌍 Public
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const ToggleSetting = ({
    label,
    description,
    field,
  }: {
    label: string;
    description: string;
    field: keyof PrivacySettings;
  }) => {
    const value = settings[field] as boolean;

    return (
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>{label}</Text>
          <Text style={styles.toggleDescription}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={() => toggleSetting(field)}
          disabled={loading}
          trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
          thumbColor={value ? '#fff' : '#fff'}
        />
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Settings</Text>
        <Text style={styles.subtitle}>Control who sees your content</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoText}>
            All visibility settings default to Private for your safety. You're in control of who sees what.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Content Visibility</Text>
        </View>

        <VisibilitySelector
          label="Posts"
          description="Who can see your regular posts"
          field="posts"
        />

        <VisibilitySelector
          label="Reels"
          description="Who can see your reels"
          field="reels"
        />

        <VisibilitySelector
          label="Stories"
          description="Who can see your stories"
          field="stories"
        />

        <VisibilitySelector
          label="Club Participation"
          description="Who can see which clubs you're in"
          field="clubs"
        />

        <VisibilitySelector
          label="Purchases"
          description="Who can see your purchases and transactions"
          field="purchases"
        />

        <VisibilitySelector
          label="Event Attendance"
          description="Who can see which events you're attending"
          field="events"
        />

        <VisibilitySelector
          label="Product Reviews"
          description="Who can see your reviews of digital products"
          field="reviews"
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity Settings</Text>
        </View>

        <ToggleSetting
          label="Show Online Status"
          description="Let others see when you're online"
          field="showOnlineStatus"
        />

        <ToggleSetting
          label="Allow Message Requests"
          description="Allow people who aren't your friends to send you messages"
          field="allowMessageRequests"
        />

        <ToggleSetting
          label="Searchable Profile"
          description="Allow your profile to appear in search results"
          field="searchable"
        />

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            💡 Privacy Note: Your privacy choices never affect your ranking or visibility in feed algorithms. We don't penalize privacy.
          </Text>
        </View>

        <View style={styles.quickActionsCard}>
          <Text style={styles.quickActionsTitle}>Quick Privacy Actions</Text>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/profile/settings/incognito' as any)}
          >
            <Text style={styles.quickActionIcon}>👁️</Text>
            <View style={styles.quickActionInfo}>
              <Text style={styles.quickActionLabel}>Incognito Mode</Text>
              <Text style={styles.quickActionDescription}>Hide from Discovery & Swipe</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
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
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#F0FFFE',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  sectionHeader: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  visibilityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  visibilityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  visibilityDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  visibilityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  visibilityOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  visibilityOptionActive: {
    backgroundColor: '#F0FFFE',
    borderColor: '#4ECDC4',
  },
  visibilityOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  visibilityOptionTextActive: {
    color: '#4ECDC4',
  },
  toggleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 15,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: '#666',
  },
  noteCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 15,
    marginVertical: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  quickActionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  quickActionIcon: {
    fontSize: 28,
    marginRight: 15,
  },
  quickActionInfo: {
    flex: 1,
  },
  quickActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  quickActionDescription: {
    fontSize: 13,
    color: '#666',
  },
  chevron: {
    fontSize: 24,
    color: '#CCC',
    marginLeft: 10,
  },
});
