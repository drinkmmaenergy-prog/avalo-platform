/**
 * SubscribeButton Component
 * Phase 33-3: Subscription CTA for non-subscribers
 * 
 * Displays subscribe button or active subscription status with countdown
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { TokenPurchaseModal } from './TokenPurchaseModal';
import {
  isSubscribed,
  subscribe,
  getTimeRemaining,
  getCreatorPrice,
} from '../services/subscriptionService';
import { getTokenBalance } from '../services/tokenService';

interface SubscribeButtonProps {
  userId: string; // Current viewer
  creatorId: string;
  creatorName: string;
  onSubscribe?: () => void;
}

export function SubscribeButton({
  userId,
  creatorId,
  creatorName,
  onSubscribe,
}: SubscribeButtonProps) {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<{ days: number; hours: number } | null>(null);
  const [price, setPrice] = useState(0);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    checkSubscriptionStatus();
    loadPrice();
  }, [userId, creatorId]);

  useEffect(() => {
    // Update time remaining every minute
    if (subscribed) {
      const interval = setInterval(updateTimeRemaining, 60000);
      return () => clearInterval(interval);
    }
  }, [subscribed]);

  useEffect(() => {
    // Pulse animation for subscribe button
    if (!subscribed && !loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [subscribed, loading]);

  const checkSubscriptionStatus = async () => {
    setLoading(true);
    const status = await isSubscribed(userId, creatorId);
    setSubscribed(status);
    
    if (status) {
      await updateTimeRemaining();
    }
    
    setLoading(false);
  };

  const updateTimeRemaining = async () => {
    const remaining = await getTimeRemaining(userId, creatorId);
    setTimeRemaining(remaining);
    
    // If subscription expired, refresh status
    if (!remaining) {
      setSubscribed(false);
    }
  };

  const loadPrice = async () => {
    const creatorPrice = await getCreatorPrice(creatorId);
    setPrice(creatorPrice);
  };

  const handleSubscribePress = async () => {
    if (price === 0) {
      Alert.alert(
        t('subscriptions.noPriceSet'),
        t('subscriptions.creatorHasntSetPrice')
      );
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubscribe = async () => {
    setShowConfirmModal(false);

    // Check if user has enough tokens
    const balance = await getTokenBalance(userId);
    
    if (balance < price) {
      Alert.alert(
        t('subscriptions.notEnoughTokens'),
        t('subscriptions.notEnoughTokensMessage', {
          required: price,
          balance: balance,
        }),
        [
          {
            text: t('subscriptions.buyTokens'),
            onPress: () => setShowPurchaseModal(true),
          },
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
        ]
      );
      return;
    }

    // Process subscription
    const result = await subscribe(userId, creatorId, price);
    
    if (result.success) {
      setSubscribed(true);
      await updateTimeRemaining();
      onSubscribe?.();
      
      Alert.alert(
        t('subscriptions.subscribeSuccess'),
        t('subscriptions.subscribeSuccessMessage', { name: creatorName })
      );
    } else {
      Alert.alert(
        t('common.error'),
        result.error || t('subscriptions.subscribeFailed')
      );
    }
  };

  if (loading) {
    return null;
  }

  // Don't show button on own profile
  if (userId === creatorId) {
    return null;
  }

  // Don't show if creator hasn't set a price
  if (price === 0) {
    return null;
  }

  // Active subscription view
  if (subscribed && timeRemaining) {
    return (
      <View style={styles.container}>
        <View style={styles.activeContainer}>
          <View style={styles.activeHeader}>
            <Text style={styles.activeIcon}>✓</Text>
            <Text style={styles.activeTitle}>
              {t('subscriptions.subscribed')}
            </Text>
          </View>
          <Text style={styles.activeExpiry}>
            {t('subscriptions.activeUntil', {
              days: timeRemaining.days,
              hours: timeRemaining.hours,
            })}
          </Text>
        </View>
      </View>
    );
  }

  // Subscribe button
  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handleSubscribePress}
        >
          <View style={styles.subscribeContent}>
            <Text style={styles.subscribeIcon}>⭐</Text>
            <View style={styles.subscribeTextContainer}>
              <Text style={styles.subscribeTitle}>
                {t('subscriptions.subscribe')}
              </Text>
              <Text style={styles.subscribePrice}>
                {price} tokens/month
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>⭐</Text>
            <Text style={styles.modalTitle}>
              {t('subscriptions.confirmTitle')}
            </Text>
            <Text style={styles.modalText}>
              {t('subscriptions.confirmMessage', {
                name: creatorName,
                price: price,
              })}
            </Text>

            {/* Benefits List */}
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>💬</Text>
                <Text style={styles.benefitText}>
                  {t('subscriptions.benefit1')}
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🎭</Text>
                <Text style={styles.benefitText}>
                  {t('subscriptions.benefit2')}
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>📸</Text>
                <Text style={styles.benefitText}>
                  {t('subscriptions.benefit3')}
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>⚡</Text>
                <Text style={styles.benefitText}>
                  {t('subscriptions.benefit4')}
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalCancelText}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleConfirmSubscribe}
              >
                <Text style={styles.modalConfirmText}>
                  {t('subscriptions.confirmSubscribe')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onPurchase={(packId) => {
          setShowPurchaseModal(false);
          // After purchase, try subscribing again
          setTimeout(() => handleConfirmSubscribe(), 500);
        }}
        reason={t('subscriptions.needMoreTokens')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  subscribeButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  subscribeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscribeIcon: {
    fontSize: 28,
  },
  subscribeTextContainer: {
    flex: 1,
  },
  subscribeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
    marginBottom: 2,
  },
  subscribePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F0F0F',
    opacity: 0.7,
  },
  activeContainer: {
    backgroundColor: '#1F2A2E',
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activeIcon: {
    fontSize: 20,
    color: '#40E0D0',
  },
  activeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  activeExpiry: {
    fontSize: 13,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0F0F0F',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#CCC',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  benefitsList: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    fontSize: 20,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: '#999',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#40E0D0',
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
