/**
 * PACK 237: Recovery Mode Screen
 * 
 * Shows recovery feed with affirmations, self-esteem boosters, and restart progression.
 * Displays blocked features and provides gentle path back to discovery.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { RECOVERY_STAGE_INFO, RecoveryState, RecoveryFeedItem, RestartPathOffer } from "@/lib/pack237-types";

export default function RecoveryModeScreen() {
  const router = useRouter();
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [feedItems, setFeedItems] = useState<RecoveryFeedItem[]>([]);
  const [offers, setOffers] = useState<RestartPathOffer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecoveryData();
  }, []);

  const loadRecoveryData = async () => {
    try {
      // Load recovery state
      const stateResponse = await fetch('/api/breakup-recovery/state');
      if (stateResponse.ok) {
        const state = await stateResponse.json();
        setRecoveryState(state);
      }

      // Load recovery feed
      const feedResponse = await fetch('/api/breakup-recovery/feed');
      if (feedResponse.ok) {
        const feed = await feedResponse.json();
        setFeedItems(feed);
      }

      // Load restart path offers
      const offersResponse = await fetch('/api/breakup-recovery/offers');
      if (offersResponse.ok) {
        const offersList = await offersResponse.json();
        setOffers(offersList);
      }
    } catch (error) {
      console.error('Error loading recovery data:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecoveryData();
    setRefreshing(false);
  };

  const handleFeedItemAction = async (item: RecoveryFeedItem) => {
    if (!item.actionType) return;

    switch (item.actionType) {
      case 'view_discovery':
        if (!recoveryState?.featuresBlocked.discoveryFeed) {
          router.push('/discovery');
        }
        break;
      case 'boost_profile':
      case 'polish_bio':
      case 'choose_traits':
        // Navigate to offer purchase
        router.push(`/breakup-recovery/offer/${item.itemId}`);
        break;
    }
  };

  const getDaysRemaining = () => {
    if (!recoveryState) return 0;
    const now = new Date();
    const end = new Date(recoveryState.endDate);
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  };

  const getCurrentStageInfo = () => {
    if (!recoveryState) return RECOVERY_STAGE_INFO[0];
    return RECOVERY_STAGE_INFO.find(s => s.stage === recoveryState.restartStage) || RECOVERY_STAGE_INFO[0];
  };

  if (!recoveryState) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading recovery mode...</Text>
        </View>
      </View>
    );
  }

  const stageInfo = getCurrentStageInfo();
  const daysRemaining = getDaysRemaining();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🌱</Text>
        <Text style={styles.headerTitle}>Recovery Mode</Text>
        <Text style={styles.headerSubtitle}>Taking time to rebuild and restart</Text>
      </View>

      {/* Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressStage}>{stageInfo.label}</Text>
          <Text style={styles.progressDays}>{daysRemaining} days left</Text>
        </View>
        <Text style={styles.progressDescription}>{stageInfo.description}</Text>
        
        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${(recoveryState.restartStage / 4) * 100}%` }
            ]}
          />
        </View>
        
        <View style={styles.progressStages}>
          {RECOVERY_STAGE_INFO.map((stage) => (
            <View
              key={stage.stage}
              style={[
                styles.progressDot,
                stage.stage <= recoveryState.restartStage && styles.progressDotActive
              ]}
            />
          ))}
        </View>
      </View>

      {/* Currently Available Features */}
      <View style={styles.featuresCard}>
        <Text style={styles.featuresTitle}>Currently Available</Text>
        <View style={styles.featuresList}>
          {stageInfo.features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recovery Feed */}
      <View style={styles.feedSection}>
        <Text style={styles.feedTitle}>Your Recovery Feed</Text>
        {feedItems.map((item) => (
          <View key={item.itemId} style={styles.feedItem}>
            {item.icon && <Text style={styles.feedIcon}>{item.icon}</Text>}
            <View style={styles.feedContent}>
              <Text style={styles.feedItemTitle}>{item.title}</Text>
              <Text style={styles.feedItemMessage}>{item.message}</Text>
              {item.actionLabel && (
                <TouchableOpacity
                  style={styles.feedAction}
                  onPress={() => handleFeedItemAction(item)}
                >
                  <Text style={styles.feedActionText}>{item.actionLabel}</Text>
                  {item.actionPrice && (
                    <Text style={styles.feedActionPrice}>{item.actionPrice} tokens</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Restart Path Offers */}
      {offers.length > 0 && (
        <View style={styles.offersSection}>
          <Text style={styles.offersTitle}>Boost Your Restart</Text>
          {offers.map((offer) => (
            <TouchableOpacity
              key={offer.offerId}
              style={styles.offerCard}
              onPress={() => router.push(`/breakup-recovery/offer/${offer.offerId}`)}
            >
              <View style={styles.offerContent}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
              </View>
              <View style={styles.offerPrice}>
                <Text style={styles.offerPriceText}>{offer.price}</Text>
                <Text style={styles.offerPriceLabel}>tokens</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* What's Coming Next */}
      {recoveryState.restartStage < 4 && (
        <View style={styles.nextCard}>
          <Text style={styles.nextTitle}>🔓 Coming Next</Text>
          <Text style={styles.nextStage}>
            {RECOVERY_STAGE_INFO[recoveryState.restartStage + 1].label}
          </Text>
          <Text style={styles.nextDescription}>
            {RECOVERY_STAGE_INFO[recoveryState.restartStage + 1].description}
          </Text>
        </View>
      )}

      {/* Restart Ready Button */}
      {recoveryState.restartStage === 4 && (
        <TouchableOpacity
          style={styles.restartButton}
          onPress={() => router.push('/discovery')}
        >
          <Text style={styles.restartButtonText}>
            ✨ Every ending creates space for something new
          </Text>
          <Text style={styles.restartButtonSubtext}>Start Exploring</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    fontSize: 16,
    color: '#6c757d'
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 8
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6c757d'
  },
  progressCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  progressStage: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529'
  },
  progressDays: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0d6efd',
    backgroundColor: '#e7f1ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  progressDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 16
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0d6efd',
    borderRadius: 4
  },
  progressStages: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dee2e6'
  },
  progressDotActive: {
    backgroundColor: '#0d6efd'
  },
  featuresCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 16
  },
  featuresList: {
    gap: 12
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  featureCheck: {
    fontSize: 18,
    color: '#198754'
  },
  featureText: {
    fontSize: 14,
    color: '#495057',
    flex: 1
  },
  feedSection: {
    padding: 16
  },
  feedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 16
  },
  feedItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12
  },
  feedIcon: {
    fontSize: 32
  },
  feedContent: {
    flex: 1
  },
  feedItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4
  },
  feedItemMessage: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20
  },
  feedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef'
  },
  feedActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0d6efd'
  },
  feedActionPrice: {
    fontSize: 12,
    color: '#6c757d'
  },
  offersSection: {
    padding: 16,
    paddingTop: 0
  },
  offersTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 16
  },
  offerCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0d6efd'
  },
  offerContent: {
    flex: 1,
    marginRight: 16
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4
  },
  offerDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 18
  },
  offerPrice: {
    alignItems: 'center',
    backgroundColor: '#e7f1ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  offerPriceText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0d6efd'
  },
  offerPriceLabel: {
    fontSize: 12,
    color: '#0d6efd'
  },
  nextCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107'
  },
  nextTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8
  },
  nextStage: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4
  },
  nextDescription: {
    fontSize: 14,
    color: '#6c757d'
  },
  restartButton: {
    margin: 16,
    padding: 24,
    backgroundColor: '#0d6efd',
    borderRadius: 16,
    alignItems: 'center'
  },
  restartButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4
  },
  restartButtonSubtext: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9
  }
});
