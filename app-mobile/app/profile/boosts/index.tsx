/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Main boost marketplace screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";
import { BoostCard } from "@/components/BoostCard";

interface BoostConfig {
  type: string;
  name: string;
  description: string;
  effect: string;
  duration: number;
  tokenPrice: number;
  icon: string;
  benefits: string[];
}

interface ActiveBoost {
  boostId: string;
  userId: string;
  type: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  tokensPaid: number;
}

interface AvailableBoostsResponse {
  boosts: Record<string, BoostConfig>;
  activeBoosts: ActiveBoost[];
  eligible: boolean;
  reason?: string;
}

export default function BoostsMarketplace() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [boosts, setBoosts] = useState<Record<string, BoostConfig>>({});
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>([]);
  const [eligible, setEligible] = useState(true);
  const [ineligibilityReason, setIneligibilityReason] = useState<string>('');
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadBoosts();
  }, []);

  const loadBoosts = async () => {
    try {
      const getAvailableBoosts = httpsCallable<{}, AvailableBoostsResponse>(
        functions,
        'getAvailableBoostsV1'
      );

      const result = await getAvailableBoosts({});
      
      setBoosts(result.data.boosts);
      setActiveBoosts(result.data.activeBoosts);
      setEligible(result.data.eligible);
      setIneligibilityReason(result.data.reason || '');
    } catch (error) {
      console.error('Error loading boosts:', error);
      Alert.alert('Error', 'Failed to load boosts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBoosts();
  };

  const handlePurchaseBoost = async (boostType: string, config: BoostConfig) => {
    if (!eligible) {
      Alert.alert(
        'Not Available',
        ineligibilityReason || 'Boosts are not currently available for your account'
      );
      return;
    }

    // Show confirmation
    Alert.alert(
      `Purchase ${config.name}?`,
      `This will cost ${config.tokenPrice} tokens and last for ${Math.floor(config.duration / (1000 * 60 * 60))} hours.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: () => confirmPurchase(boostType, config)
        }
      ]
    );
  };

  const confirmPurchase = async (boostType: string, config: BoostConfig) => {
    setPurchasing(boostType);

    try {
      const purchaseBoost = httpsCallable(functions, 'purchaseBoostV1');

      await purchaseBoost({
        boostType,
        targetLocation: boostType === 'location_jump' ? undefined : undefined // Handle location selection
      });

      Alert.alert(
        'Boost Activated! 🚀',
        `Your ${config.name} is now active. Check your stats to see the results!`
      );

      // Reload boosts to update active status
      loadBoosts();
    } catch (error: any) {
      console.error('Error purchasing boost:', error);
      Alert.alert(
        'Purchase Failed',
        error.message || 'Failed to purchase boost. Please try again.'
      );
    } finally {
      setPurchasing(null);
    }
  };

  const isBoostActive = (boostType: string): boolean => {
    return activeBoosts.some(
      boost => boost.type === boostType && boost.isActive
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9333EA" />
        <Text style={styles.loadingText}>Loading boosts...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Boost Marketplace',
          headerStyle: { backgroundColor: '#9333EA' },
          headerTintColor: '#fff',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                // Navigate to stats screen when implemented
                Alert.alert('Stats', 'Boost stats coming soon!');
              }}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>📊 Stats</Text>
            </TouchableOpacity>
          )
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>🚀 Boost Your Visibility</Text>
          <Text style={styles.subtitle}>
            Get more profile views, likes, and matches
          </Text>
        </View>

        {!eligible && (
          <View style={styles.ineligibleBanner}>
            <Text style={styles.ineligibleText}>
              ⚠️ {ineligibilityReason}
            </Text>
          </View>
        )}

        {activeBoosts.length > 0 && (
          <View style={styles.activeBanner}>
            <Text style={styles.activeBannerText}>
              🔥 You have {activeBoosts.length} active boost{activeBoosts.length > 1 ? 's' : ''} - Track your performance in real-time!
            </Text>
          </View>
        )}

        <View style={styles.boostsContainer}>
          {Object.entries(boosts).map(([type, config]) => (
            <BoostCard
              key={type}
              type={type}
              name={config.name}
              description={config.description}
              effect={config.effect}
              duration={config.duration}
              tokenPrice={config.tokenPrice}
              icon={config.icon}
              benefits={config.benefits}
              isActive={isBoostActive(type)}
              onPress={() => handlePurchaseBoost(type, config)}
              disabled={!eligible || purchasing === type}
            />
          ))}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How Boosts Work</Text>
          <Text style={styles.infoText}>
            • Boosts temporarily increase your profile visibility{'\n'}
            • They don't affect chat pricing or free chat rules{'\n'}
            • All revenue goes to platform improvements{'\n'}
            • Real-time stats show your boost performance{'\n'}
            • Combine multiple boosts for maximum effect
          </Text>
        </View>

        <View style={styles.safetySection}>
          <Text style={styles.safetyTitle}>✅ Safe & Fair</Text>
          <Text style={styles.safetyText}>
            Boosts only work for verified accounts in good standing.
            They don't override safety features or affect your account security.
          </Text>
        </View>
      </ScrollView>

      {purchasing && (
        <View style={styles.purchasingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.purchasingText}>Activating boost...</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  content: {
    padding: 16
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
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280'
  },
  headerButton: {
    marginRight: 16
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  ineligibleBanner: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5'
  },
  ineligibleText: {
    color: '#991B1B',
    fontSize: 14,
    textAlign: 'center'
  },
  activeBanner: {
    backgroundColor: '#F3E8FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#9333EA'
  },
  activeBannerText: {
    color: '#6B21A8',
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  viewStatsLink: {
    color: '#9333EA',
    fontSize: 14,
    fontWeight: '600'
  },
  boostsContainer: {
    marginBottom: 24
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22
  },
  safetySection: {
    backgroundColor: '#ECFDF5',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8
  },
  safetyText: {
    fontSize: 14,
    color: '#047857',
    lineHeight: 20
  },
  purchasingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  purchasingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600'
  }
});
