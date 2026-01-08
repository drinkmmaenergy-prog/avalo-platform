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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface SafetyFilters {
  hidePolitical: boolean;
  hideReligious: boolean;
  hideDebateThreads: boolean;
  hideProvocativeHashtags: boolean;
  hideConflictComments: boolean;
}

interface SafetyPreferences {
  allowPeacefulBeliefExpression: boolean;
  allowedCreators: string[];
}

interface CultureSafetyProfile {
  filters: SafetyFilters;
  preferences: SafetyPreferences;
  updatedAt: Date;
}

export default function ClimateSafetyScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CultureSafetyProfile | null>(null);
  
  useEffect(() => {
    loadProfile();
  }, []);
  
  const loadProfile = async () => {
    try {
      const getProfile = httpsCallable(functions, 'getUserSafetyProfile');
      const result = await getProfile();
      
      if (result.data) {
        setProfile(result.data as CultureSafetyProfile);
      } else {
        await createDefaultProfile();
      }
    } catch (error) {
      console.error('Error loading safety profile:', error);
      Alert.alert('Error', 'Failed to load safety settings');
    } finally {
      setLoading(false);
    }
  };
  
  const createDefaultProfile = async () => {
    try {
      const createProfile = httpsCallable(functions, 'createUserSafetyProfile');
      await createProfile();
      await loadProfile();
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  };
  
  const updateFilter = async (key: keyof SafetyFilters, value: boolean) => {
    if (!profile) return;
    
    const newFilters = { ...profile.filters, [key]: value };
    setProfile({ ...profile, filters: newFilters });
    
    try {
      setSaving(true);
      const updateProfile = httpsCallable(functions, 'updateUserSafetyProfile');
      await updateProfile({ filters: newFilters });
    } catch (error) {
      console.error('Error updating filter:', error);
      Alert.alert('Error', 'Failed to update settings');
      setProfile(profile);
    } finally {
      setSaving(false);
    }
  };
  
  const updatePreference = async (key: keyof SafetyPreferences, value: any) => {
    if (!profile) return;
    
    const newPreferences = { ...profile.preferences, [key]: value };
    setProfile({ ...profile, preferences: newPreferences });
    
    try {
      setSaving(true);
      const updateProfile = httpsCallable(functions, 'updateUserSafetyProfile');
      await updateProfile({ preferences: newPreferences });
    } catch (error) {
      console.error('Error updating preference:', error);
      Alert.alert('Error', 'Failed to update settings');
      setProfile(profile);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B9D" />
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={48} color="#FF6B9D" />
          <Text style={styles.title}>Climate Safety</Text>
          <Text style={styles.subtitle}>
            Protect your feed from conflict-forming content
          </Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Filters</Text>
          <Text style={styles.sectionSubtitle}>
            Hide conflict-forming topics from your feed
          </Text>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="megaphone-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Hide Political Content</Text>
                  <Text style={styles.filterDescription}>
                    Campaign posts, party endorsements, political debates
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.filters.hidePolitical}
                onValueChange={(val) => updateFilter('hidePolitical', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="book-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Hide Religious Content</Text>
                  <Text style={styles.filterDescription}>
                    Religious superiority disputes, conversion attempts
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.filters.hideReligious}
                onValueChange={(val) => updateFilter('hideReligious', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="chatbubbles-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Hide Debate Threads</Text>
                  <Text style={styles.filterDescription}>
                    Heated arguments, ideological conflicts
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.filters.hideDebateThreads}
                onValueChange={(val) => updateFilter('hideDebateThreads', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="pricetag-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Hide Provocative Hashtags</Text>
                  <Text style={styles.filterDescription}>
                    Conflict-forming trends, culture war tags
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.filters.hideProvocativeHashtags}
                onValueChange={(val) => updateFilter('hideProvocativeHashtags', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="warning-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Hide Conflict Comments</Text>
                  <Text style={styles.filterDescription}>
                    Comments flagged as toxic or conflict-forming
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.filters.hideConflictComments}
                onValueChange={(val) => updateFilter('hideConflictComments', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced Preferences</Text>
          
          <View style={styles.filterCard}>
            <View style={styles.filterRow}>
              <View style={styles.filterInfo}>
                <Ionicons name="heart-outline" size={24} color="#666" />
                <View style={styles.filterText}>
                  <Text style={styles.filterTitle}>Allow Peaceful Expression</Text>
                  <Text style={styles.filterDescription}>
                    Show respectful personal belief sharing from creators
                  </Text>
                </View>
              </View>
              <Switch
                value={profile?.preferences.allowPeacefulBeliefExpression}
                onValueChange={(val) => updatePreference('allowPeacefulBeliefExpression', val)}
                trackColor={{ false: '#767577', true: '#FF6B9D' }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
        </View>
        
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#FF6B9D" />
          <Text style={styles.infoText}>
            These filters help maintain a positive, creative environment. You can still view
            blocked content by visiting specific profiles or opting in to view individual posts.
          </Text>
        </View>
        
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color="#FF6B9D" />
            <Text style={styles.savingText}>Saving changes...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  scrollView: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
    color: '#1a1a1a'
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center'
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12
  },
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  filterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12
  },
  filterText: {
    marginLeft: 12,
    flex: 1
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2
  },
  filterDescription: {
    fontSize: 13,
    color: '#666'
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#fff3f5',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 12,
    lineHeight: 18
  },
  savingIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginBottom: 24
  },
  savingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666'
  }
});
