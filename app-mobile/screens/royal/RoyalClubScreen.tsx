/**
 * PACK 50 — Royal Club Hub Screen
 * Display Royal tier status and benefits
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
import { useNavigation } from '@react-navigation/native';
import {
  RoyalState,
  RoyalPreview,
  fetchRoyalState,
  refreshRoyalState,
  fetchRoyalPreview,
  refreshRoyalPreview,
  getRoyalTierDisplayName,
  getRoyalTierColor,
  isRoyalTier,
} from '../../services/royalService';

interface Props {
  userId: string;
}

export default function RoyalClubScreen({ userId }: Props) {
  const navigation = useNavigation();
  const [state, setState] = useState<RoyalState | null>(null);
  const [preview, setPreview] = useState<RoyalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Try to load from cache first
      const cachedState = await fetchRoyalState(userId);
      const cachedPreview = await fetchRoyalPreview(userId);

      if (cachedState) setState(cachedState);
      if (cachedPreview) setPreview(cachedPreview);

      // Then refresh from backend
      const [freshState, freshPreview] = await Promise.all([
        refreshRoyalState(userId),
        refreshRoyalPreview(userId),
      ]);

      setState(freshState);
      setPreview(freshPreview);
    } catch (error) {
      console.error('[RoyalClubScreen] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpgrade = () => {
    // Navigate to Stripe checkout/billing screen
    // TODO: Implement Stripe Royal subscription flow
    console.log('[RoyalClubScreen] Navigate to Royal subscription upgrade');
  };

  const handleBrowseCreators = () => {
    // Navigate to main discovery/swipe
    navigation.navigate('Discovery' as never);
  };

  if (loading && !state) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>Loading Royal Club...</Text>
      </View>
    );
  }

  const tierColor = state ? getRoyalTierColor(state.tier) : '#666666';
  const tierName = state ? getRoyalTierDisplayName(state.tier) : 'None';
  const isRoyal = state ? isRoyalTier(state.tier) : false;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Royal Club</Text>
      </View>

      {/* Tier Badge */}
      <View style={[styles.tierBadge, { borderColor: tierColor }]}>
        <View style={[styles.tierIcon, { backgroundColor: tierColor }]}>
          <Text style={styles.tierIconText}>👑</Text>
        </View>
        <Text style={[styles.tierName, { color: tierColor }]}>{tierName}</Text>
        {state?.source === 'SUBSCRIPTION' && (
          <Text style={styles.tierSource}>Subscription Member</Text>
        )}
        {state?.source === 'SPEND_BASED' && (
          <Text style={styles.tierSource}>Earned by Activity</Text>
        )}
      </View>

      {/* Stats */}
      {state && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {state.spendLast30DaysTokens.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Tokens (Last 30 Days)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {state.spendLast90DaysTokens.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Tokens (Last 90 Days)</Text>
          </View>
        </View>
      )}

      {/* Next Tier Preview */}
      {preview && preview.nextTier && (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Next Tier</Text>
          <Text style={styles.previewTier}>
            {getRoyalTierDisplayName(preview.nextTier)}
          </Text>
          {preview.tokensNeededForNextTier && preview.tokensNeededForNextTier > 0 && (
            <Text style={styles.previewTokens}>
              {preview.tokensNeededForNextTier.toLocaleString()} tokens needed
            </Text>
          )}
        </View>
      )}

      {/* Benefits Section */}
      <View style={styles.benefitsSection}>
        <Text style={styles.sectionTitle}>Royal Club Benefits</Text>
        <View style={styles.benefitsList}>
          <BenefitItem
            icon="✨"
            title="VIP Badge"
            description="Display your Royal status on your profile"
            active={isRoyal}
          />
          <BenefitItem
            icon="⭐"
            title="Priority Recognition"
            description="Stand out in discovery and chats"
            active={isRoyal}
          />
          <BenefitItem
            icon="🎯"
            title="Exclusive Access"
            description="Early access to new features"
            active={isRoyal}
          />
          <BenefitItem
            icon="💬"
            title="Priority Support"
            description="Get help faster when you need it"
            active={isRoyal}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleBrowseCreators}>
          <Text style={styles.primaryButtonText}>Browse Creators</Text>
        </TouchableOpacity>

        {(!state || state.tier !== 'ROYAL_PLATINUM') && (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleUpgrade}>
            <Text style={styles.secondaryButtonText}>Upgrade to Royal</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer Note */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Royal Club is a recognition layer for our most active members. Token prices
          and message costs remain the same for all users.
        </Text>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// BENEFIT ITEM COMPONENT
// ============================================================================

interface BenefitItemProps {
  icon: string;
  title: string;
  description: string;
  active: boolean;
}

function BenefitItem({ icon, title, description, active }: BenefitItemProps) {
  return (
    <View style={[styles.benefitItem, !active && styles.benefitItemInactive]}>
      <Text style={styles.benefitIcon}>{icon}</Text>
      <View style={styles.benefitContent}>
        <Text style={[styles.benefitTitle, !active && styles.benefitTitleInactive]}>
          {title}
        </Text>
        <Text style={[styles.benefitDescription, !active && styles.benefitDescriptionInactive]}>
          {description}
        </Text>
      </View>
      {active && <Text style={styles.benefitCheck}>✓</Text>}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#111111',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tierBadge: {
    margin: 20,
    padding: 30,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  tierIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierIconText: {
    fontSize: 40,
  },
  tierName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tierSource: {
    fontSize: 14,
    color: '#999999',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
  previewCard: {
    margin: 20,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 14,
    color: '#999999',
    marginBottom: 8,
  },
  previewTier: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  previewTokens: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  benefitsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
  },
  benefitItemInactive: {
    opacity: 0.5,
  },
  benefitIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  benefitTitleInactive: {
    color: '#666666',
  },
  benefitDescription: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  benefitDescriptionInactive: {
    color: '#555555',
  },
  benefitCheck: {
    fontSize: 20,
    color: '#4CAF50',
    marginLeft: 8,
  },
  actionsSection: {
    padding: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#D4AF37',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#D4AF37',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 18,
  },
});
