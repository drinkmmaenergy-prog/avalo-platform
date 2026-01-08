/**
 * PACK 75 - Call Preflight Modal
 * Pre-call confirmation modal with pricing and safety info
 * Updated for PACK 75 voice & video calling system
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../hooks/useTranslation';
import {
  CallType,
  createCall,
  startRinging,
  checkCallBalance
} from '../services/callService';

interface CallPreflightModalProps {
  visible: boolean;
  onClose: () => void;
  callType: CallType;
  otherUserId: string;
  otherUserName: string;
  currentUserId: string;
  onCallStarted?: (callId: string) => void;
}

export function CallPreflightModal({
  visible,
  onClose,
  callType,
  otherUserId,
  otherUserName,
  currentUserId,
  onCallStarted,
}: CallPreflightModalProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    sufficient: boolean;
    balance: number;
    required: number;
  } | null>(null);
  const [tokensPerMin, setTokensPerMin] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (visible) {
      checkUserBalance();
    }
  }, [visible, currentUserId, callType]);

  const checkUserBalance = async () => {
    setChecking(true);
    try {
      // Determine tokens per minute based on call type
      // These match the pricing in monetization.ts CALL_CONFIG
      const tokensPerMinute = callType === 'VOICE' ? 10 : 15;
      setTokensPerMin(tokensPerMinute);
      
      const balance = await checkCallBalance(currentUserId, tokensPerMinute);
      setBalanceInfo(balance);
    } catch (error) {
      console.error('Error checking balance:', error);
      Alert.alert(
        t('common.error'),
        'Failed to check token balance'
      );
      onClose();
    } finally {
      setChecking(false);
    }
  };

  const handleStartCall = async () => {
    if (!balanceInfo?.sufficient) return;

    setLoading(true);
    try {
      // Create call session
      const session = await createCall({
        callerUserId: currentUserId,
        calleeUserId: otherUserId,
        mode: callType,
        origin: 'DIRECT'
      });

      // Start ringing
      await startRinging(session.callId, currentUserId);

      // Close modal and notify parent
      onClose();
      if (onCallStarted) {
        onCallStarted(session.callId);
      }

      // For now, show success message
      // Full RTC integration will be added in future pack
      Alert.alert(
        t('common.success'),
        `${callTypeLabel} call to ${otherUserName} initiated. Call ID: ${session.callId}`
      );

    } catch (error: any) {
      console.error('Error starting call:', error);
      
      // Handle specific errors
      if (error.message?.includes('Insufficient') || error.message?.includes('balance')) {
        Alert.alert(
          t('tokens.insufficientTokens'),
          t('call.insufficientTokens'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('tokens.buyTokens'),
              onPress: handleTopUp
            },
          ]
        );
      } else if (error.message?.includes('Rate limit')) {
        Alert.alert(
          t('common.error'),
          'You are calling too frequently. Please wait a moment.'
        );
      } else if (error.message?.includes('blocked')) {
        Alert.alert(
          t('common.error'),
          'Cannot call this user'
        );
      } else {
        Alert.alert(
          t('common.error'),
          error.message || 'Failed to start call'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = () => {
    onClose();
    router.push('/(tabs)/wallet' as any);
  };

  const callTypeLabel = callType === 'VOICE'
    ? t('call.button.voice')
    : t('call.button.video');
  const callTypeTitle = callType === 'VOICE'
    ? t('calls.voiceCall')
    : t('calls.videoCall');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {checking ? (
            <View style={styles.checkingContainer}>
              <ActivityIndicator size="large" color="#FF6B6B" />
              <Text style={styles.checkingText}>Sprawdzanie dostępności...</Text>
            </View>
          ) : balanceInfo?.sufficient ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.icon}>{callType === 'VOICE' ? '📞' : '📹'}</Text>
                <Text style={styles.title}>{t('call.start.confirm.title')}</Text>
                <Text style={styles.subtitle}>
                  {t('call.start.confirm.body', { tokensPerMinute: tokensPerMin })}
                </Text>
              </View>

              {/* Pricing Info */}
              <View style={styles.pricingSection}>
                <View style={styles.pricingRow}>
                  <Text style={styles.label}>{t('chatPricing.costLabel')}:</Text>
                  <Text style={styles.price}>{tokensPerMin} {t('common.tokens')} / min</Text>
                </View>
                <View style={styles.pricingRow}>
                  <Text style={styles.label}>{t('tokens.tokenBalance')}:</Text>
                  <Text style={styles.balance}>{balanceInfo.balance} {t('common.tokens')}</Text>
                </View>
              </View>

              {/* Safety Info */}
              <View style={styles.safetySection}>
                <Text style={styles.safetyTitle}>⚠️ {t('safety.safetyStatus')}</Text>
                <Text style={styles.safetyText}>
                  {t('call.safety.tip')}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleStartCall}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {t('call.button.voice') === callTypeLabel ? t('call.button.voice') : t('call.button.video')}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Insufficient Balance */}
              <View style={styles.header}>
                <Text style={styles.icon}>💰</Text>
                <Text style={styles.title}>{t('tokens.insufficientTokens')}</Text>
                <Text style={styles.subtitle}>
                  {t('call.insufficientTokens')}
                </Text>
              </View>

              <View style={styles.balanceInfoSection}>
                <View style={styles.balanceInfoRow}>
                  <Text style={styles.label}>{t('tokens.tokenBalance')}:</Text>
                  <Text style={styles.insufficientBalance}>
                    {balanceInfo?.balance || 0} {t('common.tokens')}
                  </Text>
                </View>
                <View style={styles.balanceInfoRow}>
                  <Text style={styles.label}>Required:</Text>
                  <Text style={styles.requiredBalance}>
                    {balanceInfo?.required || 0} {t('common.tokens')}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleTopUp}
                >
                  <Text style={styles.primaryButtonText}>{t('tokens.buyTokens')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  checkingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  checkingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  pricingSection: {
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  balance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  payer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
  },
  safetySection: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F57C00',
    marginBottom: 6,
  },
  safetyText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  balanceInfoSection: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    marginTop: 16,
  },
  balanceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  insufficientBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  requiredBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
