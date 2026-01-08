/**
 * VIP Paywall Screen 2.0
 * 
 * Premium subscription offering with UX and comfort benefits only
 * Zero monetization, ranking, or NSFW advantages
 * 
 * Features:
 * - Luxury presentation with ethical messaging
 * - Clear "zero pay-to-win" communication
 * - Subscription tiers (VIP and Royal Club)
 * - No token bonuses or discounts
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface VIPFeature {
  icon: string;
  title: string;
  description: string;
  tier: 'VIP' | 'BOTH';
}

interface MembershipTier {
  id: 'VIP' | 'ROYAL_CLUB';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  features: string[];
  highlightColor: string;
}

const VIP_FEATURES: VIPFeature[] = [
  {
    icon: '🎨',
    title: 'Exclusive Themes & Skins',
    description: 'Customize your profile and chat with premium themes',
    tier: 'VIP',
  },
  {
    icon: '🚫',
    title: 'Ad-Free Experience',
    description: 'Browse without interruptions or advertisements',
    tier: 'VIP',
  },
  {
    icon: '⚡',
    title: 'Priority CDN Routing',
    description: 'Faster loading times in heavy traffic regions',
    tier: 'VIP',
  },
  {
    icon: '💬',
    title: 'Chat Enhancements',
    description: 'Animated stickers, premium reactions, and chat wallpapers',
    tier: 'VIP',
  },
  {
    icon: '🔒',
    title: 'Private Vault',
    description: 'Save bookmarks, memories, and notes privately',
    tier: 'VIP',
  },
  {
    icon: '📦',
    title: 'Unlimited Archive',
    description: 'Never lose access to your past conversations',
    tier: 'VIP',
  },
  {
    icon: '🛡️',
    title: 'Unlimited Blocklist',
    description: 'Block without limits for enhanced safety',
    tier: 'VIP',
  },
  {
    icon: '☁️',
    title: 'Extended Cloud Backup',
    description: '10GB media storage for VIP, 50GB for Royal Club',
    tier: 'BOTH',
  },
];

const NOT_INCLUDED: string[] = [
  '❌ No free tokens or bonuses',
  '❌ No token purchase discounts',
  '❌ No visibility boost in feed',
  '❌ No ranking advantages',
  '❌ No priority matching',
  '❌ No increased earnings',
  '❌ Same token price as everyone',
];

const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    id: 'VIP',
    name: 'VIP',
    monthlyPrice: 9.99,
    annualPrice: 119.88,
    currency: 'EUR',
    features: [
      'VIP badge on profile',
      'Premium profile themes',
      'VIP styling in feed',
      'Priority support',
      'All comfort features',
    ],
    highlightColor: '#FFD700',
  },
  {
    id: 'ROYAL_CLUB',
    name: 'Royal Club',
    monthlyPrice: 29.99,
    annualPrice: 359.88,
    currency: 'EUR',
    features: [
      'Royal Club animated badge',
      'Exclusive profile frames',
      'Custom profile intro animation',
      'Royal styling in feed',
      'Priority support',
      'Invitation to closed events',
      'Early access to new features',
      'All VIP features included',
    ],
    highlightColor: '#9B59B6',
  },
];

export default function VIPPaywallScreen() {
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<'VIP' | 'ROYAL_CLUB'>('VIP');
  const [selectedCycle, setSelectedCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<any>(null);

  useEffect(() => {
    loadVIPStatus();
  }, []);

  const loadVIPStatus = async () => {
    try {
      // TODO: Load from Cloud Function
      // const status = await getVIPSubscriptionStatus();
      // setCurrentStatus(status);
    } catch (error) {
      console.error('Failed to load VIP status:', error);
    }
  };

  const handleSubscribe = async () => {
    try {
      setLoading(true);

      // TODO: Call Cloud Function to create subscription session
      // const result = await subscribeToMembership({
      //   tier: selectedTier,
      //   billingCycle: selectedCycle,
      //   currency: 'EUR',
      //   successUrl: 'avalo://vip/success',
      //   cancelUrl: 'avalo://vip/paywall',
      // });
      
      // Open Stripe checkout
      // Linking.openURL(result.sessionUrl);

      Alert.alert(
        'Coming Soon',
        'VIP subscriptions will be available soon. Stay tuned!'
      );
    } catch (error) {
      console.error('Failed to subscribe:', error);
      Alert.alert('Error', 'Failed to start subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTierData = MEMBERSHIP_TIERS.find(t => t.id === selectedTier)!;
  const price = selectedCycle === 'MONTHLY' 
    ? selectedTierData.monthlyPrice 
    : selectedTierData.annualPrice;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <Text style={styles.title}>VIP Access 2.0</Text>
        <Text style={styles.subtitle}>Premium Comfort · Zero Pay-to-Win</Text>
        
        <View style={styles.ethicsBadge}>
          <Text style={styles.ethicsBadgeText}>
            ✓ No Monetization Advantages  ✓ Fair for Everyone
          </Text>
        </View>
      </View>

      {/* Tier Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choose Your Tier</Text>
        
        <View style={styles.tiersRow}>
          {MEMBERSHIP_TIERS.map((tier) => (
            <TouchableOpacity
              key={tier.id}
              style={[
                styles.tierCard,
                selectedTier === tier.id && styles.tierCardSelected,
                { borderColor: tier.highlightColor },
              ]}
              onPress={() => setSelectedTier(tier.id)}
            >
              <Text style={[styles.tierName, { color: tier.highlightColor }]}>
                {tier.name}
              </Text>
              <Text style={styles.tierPrice}>
                €{selectedCycle === 'MONTHLY' ? tier.monthlyPrice : tier.annualPrice}
              </Text>
              <Text style={styles.tierCycle}>
                {selectedCycle === 'MONTHLY' ? '/month' : '/year'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Billing Cycle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Billing Cycle</Text>
        
        <View style={styles.cycleRow}>
          <TouchableOpacity
            style={[
              styles.cycleButton,
              selectedCycle === 'MONTHLY' && styles.cycleButtonSelected,
            ]}
            onPress={() => setSelectedCycle('MONTHLY')}
          >
            <Text style={[
              styles.cycleText,
              selectedCycle === 'MONTHLY' && styles.cycleTextSelected,
            ]}>
              Monthly
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.cycleButton,
              selectedCycle === 'ANNUAL' && styles.cycleButtonSelected,
            ]}
            onPress={() => setSelectedCycle('ANNUAL')}
          >
            <Text style={[
              styles.cycleText,
              selectedCycle === 'ANNUAL' && styles.cycleTextSelected,
            ]}>
              Annual (12 months)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What You Get</Text>
        
        {VIP_FEATURES.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* What's NOT Included */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What's NOT Included</Text>
        <Text style={styles.ethicsDescription}>
          VIP is about comfort and experience, not competitive advantages:
        </Text>
        
        {NOT_INCLUDED.map((item, index) => (
          <View key={index} style={styles.notIncludedRow}>
            <Text style={styles.notIncludedText}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Ethics Statement */}
      <View style={styles.ethicsCard}>
        <Text style={styles.ethicsTitle}>Our Promise</Text>
        <Text style={styles.ethicsText}>
          VIP membership provides premium comfort and UX improvements only. 
          It does NOT give you any advantage in:
        </Text>
        <Text style={styles.ethicsText}>
          • Earning money{'\n'}
          • Getting visibility{'\n'}
          • Match priority{'\n'}
          • Creator attention
        </Text>
        <Text style={styles.ethicsText}>
          Everyone pays the same token price. Everyone gets the same 65/35 split. 
          VIP just makes the app more comfortable to use.
        </Text>
      </View>

      {/* Subscribe Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            { backgroundColor: selectedTierData.highlightColor },
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
                Subscribe to {selectedTierData.name}
              </Text>
              <Text style={styles.subscribeButtonPrice}>
                €{price.toFixed(2)} / {selectedCycle === 'MONTHLY' ? 'month' : 'year'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        
        <Text style={styles.subscribeNote}>
          Cancel anytime · No refunds on subscriptions
        </Text>
      </View>

      <View style={styles.spacer} />
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
    paddingBottom: 30,
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  ethicsBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  ethicsBadgeText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  tiersRow: {
    flexDirection: 'row',
    gap: 15,
  },
  tierCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 3,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  tierCardSelected: {
    backgroundColor: '#F8F8FF',
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  tierPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  tierCycle: {
    fontSize: 14,
    color: '#666',
  },
  cycleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cycleButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  cycleButtonSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FFFE',
  },
  cycleText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  cycleTextSelected: {
    color: '#4ECDC4',
  },
  featureRow: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
  },
  featureIcon: {
    fontSize: 28,
    marginRight: 15,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  ethicsDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  notIncludedRow: {
    marginBottom: 8,
  },
  notIncludedText: {
    fontSize: 14,
    color: '#FF5252',
    fontWeight: '500',
  },
  ethicsCard: {
    backgroundColor: '#FFF3E0',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFB74D',
  },
  ethicsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 10,
  },
  ethicsText: {
    fontSize: 14,
    color: '#5D4037',
    lineHeight: 22,
    marginBottom: 10,
  },
  subscribeButton: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subscribeButtonPrice: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  subscribeNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
  spacer: {
    height: 40,
  },
});
