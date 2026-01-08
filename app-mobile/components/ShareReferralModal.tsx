/**
 * Share Referral Modal Component
 * Popup with copy + share buttons
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Share,
  Clipboard,
  Platform,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';

interface ShareReferralModalProps {
  visible: boolean;
  onClose: () => void;
  referralCode: string;
}

export default function ShareReferralModal({
  visible,
  onClose,
  referralCode,
}: ShareReferralModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await Clipboard.setString(referralCode);
      setCopied(true);
      
      // Show feedback
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        Alert.alert('✓', t('referrals.codeCopied'));
      }
      
      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying code:', error);
      Alert.alert('Error', 'Failed to copy code');
    }
  };

  const handleShare = async () => {
    try {
      const message = t('referrals.shareMessage', { code: referralCode });
      
      await Share.share({
        message,
        title: t('referrals.title'),
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.modalContent}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('referrals.inviteButton')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Referral Code Display */}
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>{t('referrals.myCode')}</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{referralCode}</Text>
            </View>
          </View>

          {/* How It Works */}
          <View style={styles.howItWorksContainer}>
            <Text style={styles.howItWorksTitle}>{t('referrals.howItWorks')}</Text>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>{t('referrals.step1')}</Text>
            </View>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>{t('referrals.step2')}</Text>
            </View>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>{t('referrals.step3')}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.copyButton, copied && styles.copiedButton]}
              onPress={handleCopyCode}
            >
              <Text style={styles.buttonText}>
                {copied ? '✓ ' + t('referrals.codeCopied').split('!')[0] : t('referrals.copyCode')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.shareButton]}
              onPress={handleShare}
            >
              <Text style={styles.buttonText}>📤 {t('referrals.inviteButton')}</Text>
            </TouchableOpacity>
          </View>

          {/* Cost Info */}
          <Text style={styles.costInfo}>{t('referrals.costInfo')}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
  },
  codeContainer: {
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  codeBox: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  codeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#D4AF37',
    letterSpacing: 4,
  },
  howItWorksContainer: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#40E0D0',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  copiedButton: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  shareButton: {
    backgroundColor: '#40E0D0',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  costInfo: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
