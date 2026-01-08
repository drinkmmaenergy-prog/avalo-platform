/**
 * Local Event Access Modal Component
 * Phase 34: Local Fan Events & Meet-Ups
 * 
 * Shows event details and unlock conditions based on user's access status
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Clipboard,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import {
  LocalFanEvent,
  checkUnlockEligibility,
  unlockEventAccess,
  shouldShowExactLocation,
  getTimeUntilEvent,
  getParticipants,
  UnlockCondition,
} from '../services/localEventService';

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  cardBackground: '#181818',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
  green: '#34C759',
  red: '#FF6B6B',
};

interface LocalEventAccessModalProps {
  visible: boolean;
  event: LocalFanEvent | null;
  creatorName: string;
  userId: string;
  isUnlocked: boolean;
  onClose: () => void;
  onUnlockSuccess?: () => void;
}

export default function LocalEventAccessModal({
  visible,
  event,
  creatorName,
  userId,
  isUnlocked,
  onClose,
  onUnlockSuccess,
}: LocalEventAccessModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<{
    canUnlock: boolean;
    satisfiedConditions: UnlockCondition[];
  }>({ canUnlock: false, satisfiedConditions: [] });
  const [scaleAnim] = useState(new Animated.Value(0));
  const [seatsLeft, setSeatsLeft] = useState(0);

  useEffect(() => {
    if (visible && event) {
      loadEligibility();
      loadSeatsInfo();
      
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible, event]);

  const loadEligibility = async () => {
    if (!event || !userId) return;
    
    try {
      const result = await checkUnlockEligibility(event.creatorId, userId);
      setEligibility(result);
    } catch (error) {
      console.error('Error checking eligibility:', error);
    }
  };

  const loadSeatsInfo = async () => {
    if (!event) return;
    
    try {
      const participants = await getParticipants(event.id);
      setSeatsLeft(event.maxSeats - participants.length);
    } catch (error) {
      console.error('Error loading seats info:', error);
    }
  };

  const handleUnlock = async () => {
    if (!event || !userId) return;

    setLoading(true);
    
    try {
      // Determine which condition to use
      const condition = eligibility.satisfiedConditions[0];
      if (!condition) {
        Alert.alert(
          t('common.error'),
          t('localEvents.noConditionMet')
        );
        return;
      }

      // Map condition to reason
      const reasonMap: Record<UnlockCondition, 'SUBSCRIPTION' | 'LIVE' | 'PPV' | 'AI' | 'SEASON'> = {
        'SUBSCRIPTION': 'SUBSCRIPTION',
        'LIVE': 'LIVE',
        'PPV': 'PPV',
        'AI': 'AI',
        'SEASON_TIER_2': 'SEASON',
      };

      const reason = reasonMap[condition];
      const result = await unlockEventAccess(event.id, userId, reason);

      if (result.success) {
        Alert.alert(
          t('common.success'),
          t('localEvents.unlockSuccess'),
          [
            {
              text: 'OK',
              onPress: () => {
                onUnlockSuccess?.();
                onClose();
              },
            },
          ]
        );
      } else {
        let errorMessage = t('common.error');
        
        switch (result.reason) {
          case 'FULL':
            errorMessage = t('localEvents.unlockFull');
            break;
          case 'EXPIRED':
            errorMessage = t('localEvents.unlockExpired');
            break;
          case 'CLOSED':
            errorMessage = t('localEvents.unlockClosed');
            break;
          case 'NO_EVENT':
            errorMessage = t('localEvents.unlockNoEvent');
            break;
          case 'NO_CONDITION_MET':
            errorMessage = t('localEvents.noConditionMet');
            break;
        }
        
        Alert.alert(t('common.error'), errorMessage);
      }
    } catch (error) {
      console.error('Error unlocking event:', error);
      Alert.alert(t('common.error'), t('errors.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (event?.exactLocation) {
      Clipboard.setString(event.exactLocation);
      Alert.alert(t('common.success'), t('localEvents.copyAddress'));
    }
  };

  const getConditionLabel = (condition: UnlockCondition): string => {
    switch (condition) {
      case 'SUBSCRIPTION':
        return t('localEvents.conditionSubscription');
      case 'LIVE':
        return t('localEvents.conditionLive');
      case 'PPV':
        return t('localEvents.conditionPPV');
      case 'AI':
        return t('localEvents.conditionAI');
      case 'SEASON_TIER_2':
        return t('localEvents.conditionSeason');
      default:
        return condition;
    }
  };

  const getConditionIcon = (condition: UnlockCondition): string => {
    switch (condition) {
      case 'SUBSCRIPTION':
        return '⭐';
      case 'LIVE':
        return '📹';
      case 'PPV':
        return '🎬';
      case 'AI':
        return '🤖';
      case 'SEASON_TIER_2':
        return '🏆';
      default:
        return '✓';
    }
  };

  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!event) return null;

  const showExact = shouldShowExactLocation(event, isUnlocked);
  const allConditions: UnlockCondition[] = ['SUBSCRIPTION', 'LIVE', 'PPV', 'AI', 'SEASON_TIER_2'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.icon}>📍</Text>
              <Text style={styles.title}>{event.title}</Text>
              <Text style={styles.creatorName}>{creatorName}</Text>
            </View>

            {/* Event Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📅 {t('localEvents.dateLabel')}</Text>
                <Text style={styles.infoValue}>{formatDateTime(event.dateTimestamp)}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>🌆 {t('localEvents.cityLabel')}</Text>
                <Text style={styles.infoValue}>{event.city}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📍 {t('localEvents.roughLocationLabel')}</Text>
                <Text style={styles.infoValue}>{event.roughLocation}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>👥 {t('localEvents.maxSeatsLabel')}</Text>
                <Text style={styles.infoValue}>
                  {t('localEvents.seatCountLabel', { 
                    current: event.maxSeats - seatsLeft, 
                    max: event.maxSeats 
                  })}
                </Text>
              </View>
            </View>

            {/* Not Unlocked State */}
            {!isUnlocked && (
              <View style={styles.unlockSection}>
                <Text style={styles.sectionTitle}>
                  {t('localEvents.modalUnlockInstruction')}
                </Text>
                
                {allConditions.map((condition) => {
                  const isSatisfied = eligibility.satisfiedConditions.includes(condition);
                  
                  return (
                    <View
                      key={condition}
                      style={[
                        styles.conditionItem,
                        isSatisfied && styles.conditionItemSatisfied,
                      ]}
                    >
                      <View style={[
                        styles.conditionIconContainer,
                        isSatisfied && styles.conditionIconContainerSatisfied,
                      ]}>
                        <Text style={styles.conditionIcon}>
                          {isSatisfied ? '✓' : getConditionIcon(condition)}
                        </Text>
                      </View>
                      <Text style={[
                        styles.conditionLabel,
                        isSatisfied && styles.conditionLabelSatisfied,
                      ]}>
                        {getConditionLabel(condition)}
                      </Text>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[
                    styles.unlockButton,
                    (!eligibility.canUnlock || loading) && styles.unlockButtonDisabled,
                  ]}
                  onPress={handleUnlock}
                  disabled={!eligibility.canUnlock || loading}
                >
                  <Text style={styles.unlockButtonText}>
                    {loading ? t('common.processing') : t('localEvents.unlockNow')}
                  </Text>
                </TouchableOpacity>

                {!eligibility.canUnlock && (
                  <Text style={styles.noConditionText}>
                    {t('localEvents.noConditionMet')}
                  </Text>
                )}
              </View>
            )}

            {/* Unlocked but >24h State */}
            {isUnlocked && !showExact && (
              <View style={styles.waitingSection}>
                <View style={styles.successBanner}>
                  <Text style={styles.successIcon}>✓</Text>
                  <Text style={styles.successText}>
                    {t('localEvents.unlockSuccess')}
                  </Text>
                </View>
                
                <View style={styles.waitingCard}>
                  <Text style={styles.waitingIcon}>🔒</Text>
                  <Text style={styles.waitingText}>
                    {t('localEvents.modalUnlockedWaitingExact')}
                  </Text>
                </View>
              </View>
            )}

            {/* Unlocked and <24h State */}
            {isUnlocked && showExact && (
              <View style={styles.exactLocationSection}>
                <View style={styles.successBanner}>
                  <Text style={styles.successIcon}>✓</Text>
                  <Text style={styles.successText}>
                    {t('localEvents.unlockSuccess')}
                  </Text>
                </View>

                <Text style={styles.exactLocationTitle}>
                  {t('localEvents.modalUnlockedExactVisible')}
                </Text>
                
                <View style={styles.exactLocationCard}>
                  <Text style={styles.exactLocationIcon}>📍</Text>
                  <View style={styles.exactLocationInfo}>
                    <Text style={styles.exactLocationText}>
                      {event.exactLocation || event.roughLocation}
                    </Text>
                  </View>
                </View>

                {event.exactLocation && (
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={handleCopyAddress}
                  >
                    <Text style={styles.copyButtonText}>
                      {t('localEvents.copyAddress')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Event Description */}
            {event.description && (
              <View style={styles.descriptionCard}>
                <Text style={styles.descriptionText}>{event.description}</Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Action */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>
                {t('common.close')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
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
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  creatorName: {
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 4,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '500',
  },
  unlockSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 16,
  },
  conditionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
  },
  conditionItemSatisfied: {
    borderColor: COLORS.turquoise,
    backgroundColor: COLORS.turquoise + '10',
  },
  conditionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.mediumGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  conditionIconContainerSatisfied: {
    backgroundColor: COLORS.turquoise,
  },
  conditionIcon: {
    fontSize: 20,
  },
  conditionLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.lightGray,
    fontWeight: '600',
  },
  conditionLabelSatisfied: {
    color: COLORS.white,
    fontWeight: '700',
  },
  unlockButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  unlockButtonDisabled: {
    opacity: 0.5,
  },
  unlockButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 0.5,
  },
  noConditionText: {
    fontSize: 14,
    color: COLORS.red,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  waitingSection: {
    marginBottom: 24,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green + '20',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  successIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  successText: {
    fontSize: 16,
    color: COLORS.green,
    fontWeight: 'bold',
  },
  waitingCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.turquoise,
  },
  waitingIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  waitingText: {
    fontSize: 15,
    color: COLORS.lightGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  exactLocationSection: {
    marginBottom: 24,
  },
  exactLocationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 16,
  },
  exactLocationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.gold + '15',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: COLORS.gold,
    marginBottom: 16,
  },
  exactLocationIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  exactLocationInfo: {
    flex: 1,
  },
  exactLocationText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: 24,
  },
  copyButton: {
    backgroundColor: COLORS.turquoise,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  descriptionCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 15,
    color: COLORS.lightGray,
    lineHeight: 22,
  },
  actionContainer: {
    padding: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  closeButton: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
