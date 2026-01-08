/**
 * DepositRequiredModal Component
 * Aggressive monetization modal that appears after free messages
 * Forces user to deposit tokens to continue AI chat
 * 
 * Monetization priorities:
 * - 100 tokens required (35% instant fee)
 * - Primary CTA: Continue Chat (big blue)
 * - Secondary: Buy Tokens
 * - Tertiary: Upgrade VIP/Royal (show discounts)
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
} from 'react-native';
import {
  AI_CHAT_DEPOSIT,
  AI_MEMBERSHIP_BENEFITS,
  calculateAvaloTotalEarnings,
} from '../config/aiMonetization';

interface DepositRequiredModalProps {
  visible: boolean;
  onContinue: () => void;
  onBuyTokens: () => void;
  onUpgrade: (tier: 'vip' | 'royal') => void;
  onCancel: () => void;
  currentBalance: number;
  botName: string;
}

export function DepositRequiredModal({
  visible,
  onContinue,
  onBuyTokens,
  onUpgrade,
  onCancel,
  currentBalance,
  botName,
}: DepositRequiredModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const hasEnoughBalance = currentBalance >= AI_CHAT_DEPOSIT.REQUIRED_DEPOSIT;
  const neededTokens = Math.max(0, AI_CHAT_DEPOSIT.REQUIRED_DEPOSIT - currentBalance);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, isDark && styles.containerDark]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.emoji]}>💬</Text>
              <Text style={[styles.title, isDark && styles.textDark]}>
                Continue Chat with {botName}?
              </Text>
              <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>
                Your free messages are up!
              </Text>
            </View>

            {/* Deposit Info */}
            <View style={styles.depositInfo}>
              <View style={styles.depositRow}>
                <Text style={[styles.depositLabel, isDark && styles.textSecondaryDark]}>
                  Required Deposit:
                </Text>
                <Text style={[styles.depositValue, isDark && styles.textDark]}>
                  {AI_CHAT_DEPOSIT.REQUIRED_DEPOSIT} tokens
                </Text>
              </View>
              
              <View style={styles.depositRow}>
                <Text style={[styles.depositLabel, isDark && styles.textSecondaryDark]}>
                  Your Balance:
                </Text>
                <Text
                  style={[
                    styles.depositValue,
                    hasEnoughBalance ? styles.balanceGood : styles.balanceLow,
                  ]}
                >
                  {currentBalance} tokens
                </Text>
              </View>

              {!hasEnoughBalance && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ You need {neededTokens} more tokens
                  </Text>
                </View>
              )}

              {/* How it works */}
              <View style={styles.howItWorks}>
                <Text style={[styles.howTitle, isDark && styles.textDark]}>
                  💡 How it works:
                </Text>
                <Text style={[styles.howText, isDark && styles.textSecondaryDark]}>
                  • Platform fee: {AI_CHAT_DEPOSIT.INSTANT_PLATFORM_FEE} tokens (instant)
                </Text>
                <Text style={[styles.howText, isDark && styles.textSecondaryDark]}>
                  • Chat balance: {AI_CHAT_DEPOSIT.ESCROW_AMOUNT} tokens (for messages)
                </Text>
                <Text style={[styles.howText, isDark && styles.textSecondaryDark]}>
                  • Unused tokens refunded when you close chat
                </Text>
              </View>
            </View>

            {/* Primary CTA - Continue Chat */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !hasEnoughBalance && styles.primaryButtonDisabled,
              ]}
              onPress={onContinue}
              disabled={!hasEnoughBalance}
            >
              <Text style={styles.primaryButtonText}>
                {hasEnoughBalance ? '🚀 Continue Chat' : '❌ Not Enough Tokens'}
              </Text>
            </TouchableOpacity>

            {/* Secondary CTA - Buy Tokens */}
            {!hasEnoughBalance && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onBuyTokens}
              >
                <Text style={styles.secondaryButtonText}>
                  💰 Buy Tokens
                </Text>
              </TouchableOpacity>
            )}

            {/* Membership Upgrade CTAs */}
            <View style={styles.upgradeSection}>
              <Text style={[styles.upgradeTitle, isDark && styles.textDark]}>
                ⚡ Save with Membership
              </Text>

              {/* VIP Option */}
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={() => onUpgrade('vip')}
              >
                <View style={styles.upgradeHeader}>
                  <Text style={styles.upgradeName}>👑 VIP</Text>
                  <Text style={styles.upgradePrice}>$19.99/mo</Text>
                </View>
                <Text style={styles.upgradeFeature}>
                  {AI_MEMBERSHIP_BENEFITS.VIP.DISPLAY}
                </Text>
              </TouchableOpacity>

              {/* Royal Option - Highlighted */}
              <TouchableOpacity
                style={[styles.upgradeCard, styles.upgradeCardRoyal]}
                onPress={() => onUpgrade('royal')}
              >
                <View style={styles.royalBadge}>
                  <Text style={styles.royalBadgeText}>BEST VALUE</Text>
                </View>
                <View style={styles.upgradeHeader}>
                  <Text style={styles.upgradeName}>💎 Royal</Text>
                  <Text style={styles.upgradePrice}>$49.99/mo</Text>
                </View>
                <Text style={styles.upgradeFeature}>
                  {AI_MEMBERSHIP_BENEFITS.ROYAL.DISPLAY_PRIMARY}
                </Text>
                <Text style={styles.upgradeFeature}>
                  {AI_MEMBERSHIP_BENEFITS.ROYAL.DISPLAY_SECONDARY}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
            >
              <Text style={[styles.cancelText, isDark && styles.textSecondaryDark]}>
                Maybe Later
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  containerDark: {
    backgroundColor: '#1C1C1E',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  depositInfo: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  depositRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  depositLabel: {
    fontSize: 15,
    color: '#666666',
  },
  depositValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  balanceGood: {
    color: '#34C759',
  },
  balanceLow: {
    color: '#FF3B30',
  },
  warningBox: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  howItWorks: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#D1D1D6',
  },
  howTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  howText: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#8E8E93',
    shadowOpacity: 0,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  upgradeSection: {
    marginBottom: 20,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  upgradeCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  upgradeCardRoyal: {
    backgroundColor: '#FFF4E6',
    borderWidth: 2,
    borderColor: '#FFB800',
  },
  royalBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#FFB800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  royalBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
  },
  upgradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  upgradeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  upgradePrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  upgradeFeature: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 2,
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});

export default DepositRequiredModal;
