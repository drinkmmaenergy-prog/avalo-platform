/**
 * PACK 242 - Dynamic Chat Pricing Settings Screen
 * Allows eligible creators to manage their chat entry price
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface PriceTier {
  level: number;
  name: string;
  tokenCost: number;
  description: string;
}

interface EligibilityData {
  eligible: boolean;
  reasons: string[];
  requirements: {
    activeDays: number;
    uniquePaidChatPartners: number;
    calendarBookings: number;
    replyRate: number;
    avgReplyTimeHours: number;
    safetyViolations: number;
    reviewRating: number;
    lastMonthEarnings: number;
  };
  canUse: boolean;
}

const PRICE_TIERS: PriceTier[] = [
  { level: 0, name: 'Level 0 (Default)', tokenCost: 100, description: 'Default entry price' },
  { level: 1, name: 'Level 1', tokenCost: 150, description: 'First tier for proven performers' },
  { level: 2, name: 'Level 2', tokenCost: 200, description: 'Mid tier for consistent earners' },
  { level: 3, name: 'Level 3', tokenCost: 300, description: 'High tier for top performers' },
  { level: 4, name: 'Level 4', tokenCost: 400, description: 'Elite tier for exceptional earners' },
  { level: 5, name: 'Level 5 (Maximum)', tokenCost: 500, description: 'Maximum tier for highest performers' }
];

export default function DynamicPricingScreen() {
  const router = useRouter();
  const functions = getFunctions();
  
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [currentPrice, setCurrentPrice] = useState(100);
  const [selectedLevel, setSelectedLevel] = useState(0);

  useEffect(() => {
    loadEligibilityAndPrice();
  }, []);

  const loadEligibilityAndPrice = async () => {
    try {
      setLoading(true);
      
      // Check eligibility
      const checkEligibility = httpsCallable(functions, 'checkPack242EligibilityCallable');
      const eligibilityResult = await checkEligibility();
      const eligibilityData = (eligibilityResult.data as any).data as EligibilityData;
      setEligibility(eligibilityData);
      
      // Get current price
      const getPrice = httpsCallable(functions, 'getPack242ChatPriceCallable');
      const priceResult = await getPrice();
      const price = (priceResult.data as any).price;
      setCurrentPrice(price);
      
      // Find current level
      const currentTier = PRICE_TIERS.find(t => t.tokenCost === price);
      if (currentTier) {
        setSelectedLevel(currentTier.level);
      }
    } catch (error: any) {
      console.error('Error loading pricing data:', error);
      Alert.alert('Error', error.message || 'Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePriceTier = async (newLevel: number) => {
    if (newLevel === selectedLevel) return;
    
    // Confirm change
    const tier = PRICE_TIERS[newLevel];
    Alert.alert(
      'Confirm Price Change',
      `Change your chat entry price to ${tier.tokenCost} tokens?\n\nNote: You cannot lower your price after increasing it, and you can only change your price once every 30 days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              setChanging(true);
              const changePrice = httpsCallable(functions, 'changePack242PriceTierCallable');
              const result = await changePrice({ newLevel });
              const data = result.data as any;
              
              if (data.success) {
                Alert.alert('Success', data.message);
                setSelectedLevel(newLevel);
                setCurrentPrice(tier.tokenCost);
              } else {
                Alert.alert('Error', data.message);
              }
            } catch (error: any) {
              console.error('Error changing price tier:', error);
              Alert.alert('Error', error.message || 'Failed to change price tier');
            } finally {
              setChanging(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Dynamic Pricing' }} />
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  if (!eligibility?.canUse) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Dynamic Pricing' }} />
        <ScrollView style={styles.content}>
          <View style={styles.notEligibleCard}>
            <Text style={styles.notEligibleTitle}>Not Available</Text>
            <Text style={styles.notEligibleText}>
              Dynamic pricing is not available for your account type.
              {'\n\n'}
              Men require the Influencer Badge to access this feature.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Dynamic Pricing' }} />
      <ScrollView style={styles.content}>
        {/* Current Price Card */}
        <View style={styles.currentPriceCard}>
          <Text style={styles.currentPriceLabel}>Your Current Chat Price</Text>
          <Text style={styles.currentPriceValue}>{currentPrice} tokens</Text>
          <Text style={styles.currentPriceSubtext}>
            Earners receive 65% ({Math.floor(currentPrice * 0.65)} tokens)
          </Text>
        </View>

        {/* Eligibility Status */}
        <View style={[styles.statusCard, eligibility?.eligible ? styles.eligibleCard : styles.ineligibleCard]}>
          <Text style={styles.statusTitle}>
            {eligibility?.eligible ? '✓ Eligible for Dynamic Pricing' : '✗ Not Eligible'}
          </Text>
          {!eligibility?.eligible && (
            <View style={styles.reasonsList}>
              <Text style={styles.reasonsTitle}>Requirements not met:</Text>
              {eligibility?.reasons.map((reason, index) => (
                <Text key={index} style={styles.reasonText}>• {reason}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Requirements Progress */}
        {eligibility && (
          <View style={styles.requirementsCard}>
            <Text style={styles.sectionTitle}>Your Performance</Text>
            
            <RequirementRow
              label="Account Age"
              value={`${eligibility.requirements.activeDays} days`}
              required="≥ 60 days"
              met={eligibility.requirements.activeDays >= 60}
            />
            
            <RequirementRow
              label="Paid Chat Partners"
              value={eligibility.requirements.uniquePaidChatPartners.toString()}
              required="≥ 250 (or 100+ bookings)"
              met={eligibility.requirements.uniquePaidChatPartners >= 250 || eligibility.requirements.calendarBookings >= 100}
            />
            
            <RequirementRow
              label="Reply Rate"
              value={`${eligibility.requirements.replyRate.toFixed(1)}%`}
              required="≥ 70%"
              met={eligibility.requirements.replyRate >= 70}
            />
            
            <RequirementRow
              label="Avg Reply Time"
              value={`${eligibility.requirements.avgReplyTimeHours.toFixed(1)}h`}
              required="≤ 6 hours"
              met={eligibility.requirements.avgReplyTimeHours <= 6}
            />
            
            <RequirementRow
              label="Safety Violations"
              value={eligibility.requirements.safetyViolations.toString()}
              required="0"
              met={eligibility.requirements.safetyViolations === 0}
            />
            
            <RequirementRow
              label="Review Rating"
              value={`${eligibility.requirements.reviewRating.toFixed(1)}★`}
              required="≥ 4.3★"
              met={eligibility.requirements.reviewRating >= 4.3}
            />
            
            <RequirementRow
              label="Monthly Earnings"
              value={`${eligibility.requirements.lastMonthEarnings.toLocaleString()} tokens`}
              required="≥ 35,000 tokens"
              met={eligibility.requirements.lastMonthEarnings >= 35000}
            />
          </View>
        )}

        {/* Price Tiers */}
        {eligibility?.eligible && (
          <View style={styles.tiersCard}>
            <Text style={styles.sectionTitle}>Select Your Price Tier</Text>
            <Text style={styles.tiersSubtext}>
              Note: You cannot lower your price after increasing it.
              Price changes have a 30-day cooldown.
            </Text>
            
            {PRICE_TIERS.map((tier) => (
              <TouchableOpacity
                key={tier.level}
                style={[
                  styles.tierOption,
                  tier.level === selectedLevel && styles.tierOptionSelected,
                  tier.level < selectedLevel && styles.tierOptionDisabled
                ]}
                onPress={() => handleChangePriceTier(tier.level)}
                disabled={changing || tier.level < selectedLevel}
              >
                <View style={styles.tierHeader}>
                  <Text style={[
                    styles.tierName,
                    tier.level === selectedLevel && styles.tierNameSelected
                  ]}>
                    {tier.name}
                  </Text>
                  <Text style={[
                    styles.tierPrice,
                    tier.level === selectedLevel && styles.tierPriceSelected
                  ]}>
                    {tier.tokenCost} tokens
                  </Text>
                </View>
                <Text style={styles.tierDescription}>{tier.description}</Text>
                {tier.level === selectedLevel && (
                  <Text style={styles.currentTierBadge}>CURRENT</Text>
                )}
                {tier.level < selectedLevel && (
                  <Text style={styles.lockedTierBadge}>LOCKED (cannot decrease)</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

function RequirementRow({ label, value, required, met }: {
  label: string;
  value: string;
  required: string;
  met: boolean;
}) {
  return (
    <View style={styles.requirementRow}>
      <View style={styles.requirementInfo}>
        <Text style={styles.requirementLabel}>{label}</Text>
        <Text style={styles.requirementRequired}>{required}</Text>
      </View>
      <View style={styles.requirementStatus}>
        <Text style={[styles.requirementValue, met && styles.requirementValueMet]}>
          {value}
        </Text>
        <Text style={[styles.requirementCheck, met && styles.requirementCheckMet]}>
          {met ? '✓' : '✗'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  currentPriceCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  currentPriceLabel: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  currentPriceValue: {
    color: '#FF6B9D',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  currentPriceSubtext: {
    color: '#666',
    fontSize: 12,
  },
  statusCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  eligibleCard: {
    backgroundColor: '#1A3A1A',
    borderColor: '#4CAF50',
    borderWidth: 1,
  },
  ineligibleCard: {
    backgroundColor: '#3A1A1A',
    borderColor: '#FF5252',
    borderWidth: 1,
  },
  statusTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  reasonsList: {
    marginTop: 8,
  },
  reasonsTitle: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 4,
  },
  reasonText: {
    color: '#999',
    fontSize: 12,
    marginBottom: 2,
  },
  requirementsCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  requirementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  requirementInfo: {
    flex: 1,
  },
  requirementLabel: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 2,
  },
  requirementRequired: {
    color: '#666',
    fontSize: 12,
  },
  requirementStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requirementValue: {
    color: '#999',
    fontSize: 14,
  },
  requirementValueMet: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  requirementCheck: {
    color: '#FF5252',
    fontSize: 18,
    fontWeight: 'bold',
  },
  requirementCheckMet: {
    color: '#4CAF50',
  },
  tiersCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tiersSubtext: {
    color: '#999',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  tierOption: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tierOptionSelected: {
    backgroundColor: '#FF6B9D22',
    borderColor: '#FF6B9D',
  },
  tierOptionDisabled: {
    opacity: 0.5,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tierNameSelected: {
    color: '#FF6B9D',
  },
  tierPrice: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tierPriceSelected: {
    color: '#FF6B9D',
  },
  tierDescription: {
    color: '#999',
    fontSize: 14,
  },
  currentTierBadge: {
    color: '#FF6B9D',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  },
  lockedTierBadge: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  notEligibleCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
  },
  notEligibleTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  notEligibleText: {
    color: '#999',
    fontSize: 14,
    lineHeight: 22,
  },
  spacer: {
    height: 40,
  },
});
