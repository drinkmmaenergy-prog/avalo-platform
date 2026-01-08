/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Tax Center Main Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { taxProfileGet, taxProfileCheckEligibility } from "@/lib/api/tax-engine";

interface TaxProfile {
  legalFullName: string;
  taxResidencyCountry: string;
  accountType: 'individual' | 'business';
  profileCompleted: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended';
  payoutAccountVerified: boolean;
  locked: boolean;
}

export default function TaxCenterScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileData = await taxProfileGet();
      setProfile(profileData);

      const eligibilityData = await taxProfileCheckEligibility();
      setEligibility(eligibilityData);
    } catch (error: any) {
      if (error.code === 'not-found') {
        setProfile(null);
      } else {
        Alert.alert('Error', 'Failed to load tax profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'verified':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'rejected':
        return '#EF4444';
      case 'suspended':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'pending':
        return 'Pending Review';
      case 'rejected':
        return 'Rejected';
      case 'suspended':
        return 'Suspended';
      default:
        return 'Not Started';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading Tax Center...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="receipt-outline" size={48} color="#6366F1" />
            <Text style={styles.headerTitle}>Tax Center</Text>
            <Text style={styles.headerSubtitle}>
              Manage your tax compliance and generate reports
            </Text>
          </View>

          <View style={styles.setupCard}>
            <Ionicons name="alert-circle-outline" size={32} color="#F59E0B" />
            <Text style={styles.setupTitle}>Tax Profile Required</Text>
            <Text style={styles.setupText}>
              Complete your tax profile to receive payouts and generate tax reports
            </Text>
            <TouchableOpacity
              style={styles.setupButton}
              onPress={() => router.push('/profile/tax-center/setup' as any)}
            >
              <Text style={styles.setupButtonText}>Set Up Tax Profile</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>What You'll Need:</Text>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.infoText}>Legal full name</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.infoText}>Country of tax residency</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.infoText}>Payout account details</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.infoText}>Tax ID (if required)</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="receipt-outline" size={48} color="#6366F1" />
          <Text style={styles.headerTitle}>Tax Center</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile.verificationStatus) }]}>
              <Text style={styles.statusBadgeText}>{getStatusText(profile.verificationStatus)}</Text>
            </View>
          </View>
          
          <View style={styles.statusDetails}>
            <View style={styles.statusRow}>
              <Text style={styles.statusKey}>Account Type:</Text>
              <Text style={styles.statusValue}>
                {profile.accountType === 'business' ? 'Business' : 'Individual'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusKey}>Country:</Text>
              <Text style={styles.statusValue}>{profile.taxResidencyCountry}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusKey}>Payout Eligible:</Text>
              <Text style={[styles.statusValue, { color: eligibility?.eligible ? '#10B981' : '#EF4444' }]}>
                {eligibility?.eligible ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>

          {!eligibility?.eligible && eligibility?.reason && (
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={20} color="#F59E0B" />
              <Text style={styles.warningText}>{eligibility.reason}</Text>
            </View>
          )}

          {profile.locked && (
            <View style={styles.errorBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#EF4444" />
              <Text style={styles.errorText}>Profile locked. Contact support.</Text>
            </View>
          )}
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/profile/tax-center/profile' as any)}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="person-outline" size={24} color="#6366F1" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Tax Profile</Text>
              <Text style={styles.menuSubtitle}>View and update your information</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/profile/tax-center/reports' as any)}
            disabled={!profile.profileCompleted || profile.verificationStatus !== 'verified'}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="document-text-outline" size={24} color="#6366F1" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Tax Reports</Text>
              <Text style={styles.menuSubtitle}>Generate and download reports</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/profile/tax-center/summary' as any)}
            disabled={!profile.profileCompleted || profile.verificationStatus !== 'verified'}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="stats-chart-outline" size={24} color="#6366F1" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Tax Summary</Text>
              <Text style={styles.menuSubtitle}>View yearly tax breakdown</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/profile/tax-center/requirements' as any)}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="information-circle-outline" size={24} color="#6366F1" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Compliance Requirements</Text>
              <Text style={styles.menuSubtitle}>What's required for your region</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={styles.privacySection}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#10B981" />
          <Text style={styles.privacyText}>
            Your personal information is encrypted and never shared with other users. 
            Tax reports contain only anonymized revenue data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32
  },
  header: {
    alignItems: 'center',
    marginBottom: 24
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8
  },
  setupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12
  },
  setupText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8
  },
  setupButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12
  },
  infoText: {
    fontSize: 15,
    color: '#4B5563'
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827'
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  statusDetails: {
    gap: 12
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statusKey: {
    fontSize: 15,
    color: '#6B7280'
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827'
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E'
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991B1B'
  },
  menuSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  menuContent: {
    flex: 1
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  menuSubtitle: {
    fontSize: 14,
    color: '#6B7280'
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 12,
    gap: 12
  },
  privacyText: {
    flex: 1,
    fontSize: 14,
    color: '#065F46',
    lineHeight: 20
  }
});
