/**
 * PACK 91 — Region & Content Policy Settings
 * 
 * Displays user's detected region and applicable content policies.
 * Provides transparency about content restrictions.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";

interface RegionalPolicy {
  countryCode: string;
  policyId: string;
  allowNSFWSoft: boolean;
  allowNSFWStrong: boolean;
  monetizeNSFWSoft: boolean;
  monetizeNSFWStrong: boolean;
  showInDiscoveryNSFW: boolean;
  minAgeForSensitive: number;
  minAgeForNSFWSoft: number;
  minAgeForNSFWStrong: number;
}

export default function RegionPolicySettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [policy, setPolicy] = useState<RegionalPolicy | null>(null);
  const [userAge, setUserAge] = useState<number | null>(null);

  useEffect(() => {
    loadPolicyInfo();
  }, [user]);

  const loadPolicyInfo = async () => {
    try {
      setLoading(true);
      // In production, this would call a Cloud Function
      // For now, show placeholder data
      
      // TODO: Call getUserPolicyContext Cloud Function
      // const result = await functions.httpsCallable('getUserPolicyContext')();
      
      // Placeholder data
      setPolicy({
        countryCode: 'PL',
        policyId: 'EU',
        allowNSFWSoft: true,
        allowNSFWStrong: true,
        monetizeNSFWSoft: true,
        monetizeNSFWStrong: true,
        showInDiscoveryNSFW: true,
        minAgeForSensitive: 18,
        minAgeForNSFWSoft: 18,
        minAgeForNSFWStrong: 18,
      });
      
      setUserAge(25); // Calculate from user.dateOfBirth
    } catch (error) {
      console.error('[RegionPolicy] Failed to load:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPolicyInfo();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading policy information...</Text>
      </View>
    );
  }

  if (!policy) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Failed to load policy information</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPolicyInfo}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Region & Content Policy</Text>
      </View>

      {/* Current Region */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Region</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="globe" size={24} color="#3B82F6" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Detected Country</Text>
              <Text style={styles.cardValue}>{getCountryName(policy.countryCode)}</Text>
            </View>
          </View>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="shield-checkmark" size={24} color="#10B981" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Policy Region</Text>
              <Text style={styles.cardValue}>{policy.policyId}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.helperText}>
          Your region determines which content is available and monetizable based on local laws.
        </Text>
      </View>

      {/* Age Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Age Verification</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="person-circle" size={24} color="#8B5CF6" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Verified Age</Text>
              <Text style={styles.cardValue}>{userAge ? `${userAge} years old` : 'Not verified'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Content Availability */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Content Availability</Text>
        <View style={styles.card}>
          <PolicyItem
            icon="checkmark-circle"
            iconColor="#10B981"
            label="Safe content"
            value="Always available"
          />
          <PolicyItem
            icon={policy.allowNSFWSoft ? 'checkmark-circle' : 'close-circle'}
            iconColor={policy.allowNSFWSoft ? '#10B981' : '#EF4444'}
            label="Adult content (soft)"
            value={policy.allowNSFWSoft ? `Available (${policy.minAgeForNSFWSoft}+)` : 'Not available'}
          />
          <PolicyItem
            icon={policy.allowNSFWStrong ? 'checkmark-circle' : 'close-circle'}
            iconColor={policy.allowNSFWStrong ? '#10B981' : '#EF4444'}
            label="Explicit content"
            value={policy.allowNSFWStrong ? `Available (${policy.minAgeForNSFWStrong}+)` : 'Not available'}
          />
        </View>
      </View>

      {/* Monetization Rules */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monetization Rules</Text>
        <View style={styles.card}>
          <PolicyItem
            icon="checkmark-circle"
            iconColor="#10B981"
            label="Safe content"
            value="Can be monetized"
          />
          <PolicyItem
            icon={policy.monetizeNSFWSoft ? 'checkmark-circle' : 'close-circle'}
            iconColor={policy.monetizeNSFWSoft ? '#10B981' : '#EF4444'}
            label="Adult content (soft)"
            value={policy.monetizeNSFWSoft ? 'Can be monetized' : 'Cannot be monetized'}
          />
          <PolicyItem
            icon={policy.monetizeNSFWStrong ? 'checkmark-circle' : 'close-circle'}
            iconColor={policy.monetizeNSFWStrong ? '#10B981' : '#EF4444'}
            label="Explicit content"
            value={policy.monetizeNSFWStrong ? 'Can be monetized' : 'Cannot be monetized'}
          />
        </View>
      </View>

      {/* Discovery Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discovery Feed</Text>
        <View style={styles.card}>
          <PolicyItem
            icon={policy.showInDiscoveryNSFW ? 'eye' : 'eye-off'}
            iconColor={policy.showInDiscoveryNSFW ? '#3B82F6' : '#6B7280'}
            label="Adult content in feeds"
            value={policy.showInDiscoveryNSFW ? 'Shown in discovery' : 'Hidden from discovery'}
          />
        </View>
        <Text style={styles.helperText}>
          {policy.showInDiscoveryNSFW
            ? 'Adult content may appear in your discovery feeds.'
            : 'Adult content is hidden from discovery feeds but may be accessible directly.'}
        </Text>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#3B82F6" />
        <Text style={styles.infoText}>
          Content policies are determined by your location and local laws. Some content or features
          may be limited based on regional regulations and app store requirements.
        </Text>
      </View>

      {/* Footer Spacing */}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

interface PolicyItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
}

function PolicyItem({ icon, iconColor, label, value }: PolicyItemProps) {
  return (
    <View style={styles.policyItem}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={styles.policyItemContent}>
        <Text style={styles.policyItemLabel}>{label}</Text>
        <Text style={styles.policyItemValue}>{value}</Text>
      </View>
    </View>
  );
}

function getCountryName(code: string): string {
  const countries: Record<string, string> = {
    PL: 'Poland',
    US: 'United States',
    GB: 'United Kingdom',
    DE: 'Germany',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    // Add more as needed
  };
  
  return countries[code] || code;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cardIcon: {
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
  },
  policyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  policyItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  policyItemLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  policyItemValue: {
    fontSize: 13,
    color: '#6B7280',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 8,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
});
