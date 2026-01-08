/**
 * PACK 107 — Membership Upsell Screen
 * 
 * Shows available VIP and Royal Club tiers with pricing
 * Allows users to subscribe to prestige memberships
 * 
 * NON-NEGOTIABLE: Purely cosmetic benefits, NO economic advantages
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from "@/lib/firebase";

// Membership tier configuration
const MEMBERSHIP_TIERS = {
  VIP: {
    name: 'VIP',
    icon: '✨',
    monthlyPrice: '€9.99',
    annualPrice: '€119.88',
    color: '#FFD700',
    gradient: ['#FFD700', '#FFA500'],
    features: [
      { icon: 'shield-checkmark', text: 'VIP badge on profile', highlight: true },
      { icon: 'color-palette', text: 'Premium profile themes' },
      { icon: 'sparkles', text: 'VIP styling in feed' },
      { icon: 'headset', text: 'Priority support' },
    ],
    notIncluded: [
      'No free tokens',
      'No token discounts',
      'No visibility boost',
      'No ranking advantage',
    ],
  },
  ROYAL_CLUB: {
    name: 'Royal Club',
    icon: '👑',
    monthlyPrice: '€29.99',
    annualPrice: '€359.88',
    color: '#9B59B6',
    gradient: ['#9B59B6', '#8E44AD'],
    features: [
      { icon: 'rose', text: 'Royal Club animated badge', highlight: true },
      { icon: 'images', text: 'Exclusive profile frames' },
      { icon: 'play-circle', text: 'Custom profile intro animation' },
      { icon: 'trending-up', text: 'Royal styling in feed' },
      { icon: 'headset', text: 'Priority support' },
      { icon: 'mail', text: 'Invitation to closed events' },
      { icon: 'rocket', text: 'Early access to new features' },
    ],
    notIncluded: [
      'No free tokens',
      'No token discounts',
      'No visibility boost',
      'No ranking advantage',
    ],
  },
};

type BillingCycle = 'MONTHLY' | 'ANNUAL';

export default function MembershipUpsellScreen() {
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<'VIP' | 'ROYAL_CLUB'>('VIP');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [loading, setLoading] = useState(false);
  const [currentMembership, setCurrentMembership] = useState<any>(null);

  useEffect(() => {
    loadCurrentMembership();
  }, []);

  const loadCurrentMembership = async () => {
    try {
      const functions = getFunctions(app, 'europe-west3');
      const getMembershipStatus = httpsCallable(functions, 'pack107_getUserMembershipStatus');
      const result = await getMembershipStatus({});
      if (result.data) {
        setCurrentMembership(result.data);
      }
    } catch (error) {
      console.log('No current membership');
    }
  };

  const handleSubscribe = async () => {
    if (loading) return;

    // Check if user already has this membership
    if (currentMembership?.tier === selectedTier && currentMembership?.status === 'ACTIVE') {
      Alert.alert(
        'Already Subscribed',
        `You already have an active ${MEMBERSHIP_TIERS[selectedTier].name} membership.`
      );
      return;
    }

    setLoading(true);

    try {
      const functions = getFunctions(app, 'europe-west3');
      const subscribeToMembership = httpsCallable(functions, 'pack107_subscribeToMembership');
      const result = await subscribeToMembership({
        tier: selectedTier,
        billingCycle,
        currency: 'EUR', // Will be localized based on user's region
        successUrl: 'avalo://membership/success',
        cancelUrl: 'avalo://membership/upsell',
      });

      // Open Stripe Checkout in browser
      const data = result.data as { sessionUrl?: string; sessionId?: string };
      if (data.sessionUrl) {
        const supported = await Linking.canOpenURL(data.sessionUrl);
        if (supported) {
          await Linking.openURL(data.sessionUrl);
        } else {
          Alert.alert('Error', 'Unable to open payment page');
        }
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      Alert.alert(
        'Subscription Error',
        error.message || 'Failed to start subscription. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const renderTierCard = (tier: 'VIP' | 'ROYAL_CLUB') => {
    const config = MEMBERSHIP_TIERS[tier];
    const isSelected = selectedTier === tier;
    const price = billingCycle === 'MONTHLY' ? config.monthlyPrice : config.annualPrice;

    return (
      <TouchableOpacity
        key={tier}
        style={[
          styles.tierCard,
          isSelected && styles.tierCardSelected,
          { borderColor: config.color },
        ]}
        onPress={() => setSelectedTier(tier)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.tierHeader}>
          <Text style={styles.tierIcon}>{config.icon}</Text>
          <Text style={[styles.tierName, { color: config.color }]}>
            {config.name}
          </Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={24} color={config.color} />
          )}
        </View>

        {/* Price */}
        <View style={styles.tierPrice}>
          <Text style={styles.priceAmount}>{price}</Text>
          <Text style={styles.pricePeriod}>
            /{billingCycle === 'MONTHLY' ? 'month' : 'year'}
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {config.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Ionicons
                name={feature.icon as any}
                size={18}
                color={feature.highlight ? config.color : '#666'}
              />
              <Text
                style={[
                  styles.featureText,
                  feature.highlight && styles.featureTextHighlight,
                ]}
              >
                {feature.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Not Included Section */}
        <View style={styles.notIncludedContainer}>
          <Text style={styles.notIncludedTitle}>What's NOT included:</Text>
          {config.notIncluded.map((item, index) => (
            <View key={index} style={styles.notIncludedRow}>
              <Ionicons name="close-circle" size={16} color="#999" />
              <Text style={styles.notIncludedText}>{item}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Membership',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Prestige Identity</Text>
          <Text style={styles.headerSubtitle}>
            Elevate your profile with exclusive cosmetic features
          </Text>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle" size={24} color="#4A90E2" />
          <Text style={styles.noticeText}>
            Memberships are for status & personal branding only. They provide ZERO
            economic advantages—no free tokens, discounts, or visibility boosts.
          </Text>
        </View>

        {/* Billing Cycle Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[
              styles.billingButton,
              billingCycle === 'MONTHLY' && styles.billingButtonActive,
            ]}
            onPress={() => setBillingCycle('MONTHLY')}
          >
            <Text
              style={[
                styles.billingButtonText,
                billingCycle === 'MONTHLY' && styles.billingButtonTextActive,
              ]}
            >
              Monthly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.billingButton,
              billingCycle === 'ANNUAL' && styles.billingButtonActive,
            ]}
            onPress={() => setBillingCycle('ANNUAL')}
          >
            <Text
              style={[
                styles.billingButtonText,
                billingCycle === 'ANNUAL' && styles.billingButtonTextActive,
              ]}
            >
              Annual
            </Text>
            <Text style={styles.billingNote}>(12 months)</Text>
          </TouchableOpacity>
        </View>

        {/* Tier Cards */}
        <View style={styles.tiersContainer}>
          {renderTierCard('VIP')}
          {renderTierCard('ROYAL_CLUB')}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            { backgroundColor: MEMBERSHIP_TIERS[selectedTier].color },
            loading && styles.subscribeButtonDisabled,
          ]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.subscribeButtonText}>
                Subscribe to {MEMBERSHIP_TIERS[selectedTier].name}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions can be cancelled anytime. No refunds on unused time.
          </Text>
          <Text style={styles.footerText}>
            Pricing shown in EUR. Your local currency may vary based on exchange rates.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#999',
  },
  noticeBox: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4A90E2',
    marginBottom: 24,
  },
  noticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  billingButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  billingButtonActive: {
    backgroundColor: '#FFD700',
  },
  billingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  billingButtonTextActive: {
    color: '#000',
  },
  billingNote: {
    fontSize: 12,
    color: '#000',
    marginTop: 2,
  },
  tiersContainer: {
    marginBottom: 24,
  },
  tierCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#333',
  },
  tierCardSelected: {
    borderWidth: 3,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  tierName: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  tierPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  pricePeriod: {
    fontSize: 16,
    color: '#999',
    marginLeft: 4,
  },
  featuresContainer: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#CCC',
    marginLeft: 12,
    flex: 1,
  },
  featureTextHighlight: {
    color: '#fff',
    fontWeight: '600',
  },
  notIncludedContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  notIncludedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  notIncludedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notIncludedText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 24,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
});
