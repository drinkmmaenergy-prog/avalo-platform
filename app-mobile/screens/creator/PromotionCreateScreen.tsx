/**
 * PACK 61: Promotion Create Screen
 * Create a new promotion campaign
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { createCampaign, PromotionPlacement } from '../../services/promotionService';

export default function PromotionCreateScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [budget, setBudget] = useState('');
  const [nsfw, setNsfw] = useState(false);
  
  const [placements, setPlacements] = useState<{[key in PromotionPlacement]: boolean}>({
    DISCOVERY: true,
    MARKETPLACE: false,
    HOME_CARD: false
  });

  const togglePlacement = (placement: PromotionPlacement) => {
    setPlacements(prev => ({ ...prev, [placement]: !prev[placement] }));
  };

  const getSelectedPlacements = (): PromotionPlacement[] => {
    return (Object.keys(placements) as PromotionPlacement[]).filter(p => placements[p]);
  };

  const handleCreate = async () => {
    if (!user?.uid) return;

    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter campaign name');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter campaign title');
      return;
    }
    const budgetNum = parseInt(budget, 10);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      Alert.alert('Error', 'Please enter valid budget (tokens)');
      return;
    }
    const selectedPlacements = getSelectedPlacements();
    if (selectedPlacements.length === 0) {
      Alert.alert('Error', 'Please select at least one placement');
      return;
    }

    setLoading(true);
    try {
      // Default: start now, end in 30 days
      const startAt = new Date().toISOString();
      const endAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const result = await createCampaign({
        ownerUserId: user.uid,
        name: name.trim(),
        placementTypes: selectedPlacements,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        deepLink: deepLink.trim() || undefined,
        nsfw,
        startAt,
        endAt,
        initialBudgetTokens: budgetNum
      });

      if (result.success) {
        Alert.alert('Success', 'Campaign created successfully', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to create campaign');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Campaign</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campaign Details</Text>
          
          <Text style={styles.label}>Campaign Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Internal name for your campaign"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What users will see"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Subtitle</Text>
          <TextInput
            style={styles.input}
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="Additional description (optional)"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Deep Link</Text>
          <TextInput
            style={styles.input}
            value={deepLink}
            onChangeText={setDeepLink}
            placeholder="profile/USER_ID or other internal link"
            placeholderTextColor="#9ca3af"
          />

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.label}>NSFW Content</Text>
              <Text style={styles.helpText}>Only show to verified 18+ users</Text>
            </View>
            <Switch
              value={nsfw}
              onValueChange={setNsfw}
              trackColor={{ false: '#d1d5db', true: '#ec4899' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Placements</Text>
          <Text style={styles.helpText}>Where your promotion will appear</Text>
          
          <TouchableOpacity
            style={styles.placementOption}
            onPress={() => togglePlacement('DISCOVERY')}
          >
            <View style={styles.placementIcon}>
              <Ionicons name="search" size={20} color="#ec4899" />
            </View>
            <View style={styles.placementInfo}>
              <Text style={styles.placementName}>Discovery Feed</Text>
              <Text style={styles.placementDesc}>Show in main discovery feed</Text>
            </View>
            <Ionicons
              name={placements.DISCOVERY ? 'checkbox' : 'square-outline'}
              size={24}
              color={placements.DISCOVERY ? '#ec4899' : '#9ca3af'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.placementOption}
            onPress={() => togglePlacement('MARKETPLACE')}
          >
            <View style={styles.placementIcon}>
              <Ionicons name="storefront" size={20} color="#ec4899" />
            </View>
            <View style={styles.placementInfo}>
              <Text style={styles.placementName}>Creator Marketplace</Text>
              <Text style={styles.placementDesc}>Show in marketplace</Text>
            </View>
            <Ionicons
              name={placements.MARKETPLACE ? 'checkbox' : 'square-outline'}
              size={24}
              color={placements.MARKETPLACE ? '#ec4899' : '#9ca3af'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.placementOption}
            onPress={() => togglePlacement('HOME_CARD')}
          >
            <View style={styles.placementIcon}>
              <Ionicons name="home" size={20} color="#ec4899" />
            </View>
            <View style={styles.placementInfo}>
              <Text style={styles.placementName}>Home Screen</Text>
              <Text style={styles.placementDesc}>Show on home dashboard</Text>
            </View>
            <Ionicons
              name={placements.HOME_CARD ? 'checkbox' : 'square-outline'}
              size={24}
              color={placements.HOME_CARD ? '#ec4899' : '#9ca3af'}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget</Text>
          <Text style={styles.helpText}>Tokens will be deducted per impression</Text>
          
          <Text style={styles.label}>Initial Budget (tokens) *</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="e.g., 100"
            keyboardType="numeric"
            placeholderTextColor="#9ca3af"
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#3b82f6" />
            <Text style={styles.infoText}>
              Approximately 1-2 tokens per impression. Budget can be increased later.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Campaign</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  backButton: {
    padding: 8
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center'
  },
  scrollView: {
    flex: 1
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff'
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16
  },
  switchLabel: {
    flex: 1
  },
  placementOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  placementIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fce7f3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  placementInfo: {
    flex: 1
  },
  placementName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827'
  },
  placementDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1e40af',
    marginLeft: 8
  },
  createButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24
  },
  createButtonDisabled: {
    opacity: 0.6
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});
