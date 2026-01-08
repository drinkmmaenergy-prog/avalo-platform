/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Two-Factor Settings Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTwoFactorSettings } from "@/hooks/useTwoFactorSettings";
import { StepUpVerificationModal } from "@/components/StepUpVerificationModal";

export default function TwoFactorSettingsScreen() {
  const router = useRouter();
  const {
    settings,
    loading,
    error,
    refresh,
    enable2FA,
    disable2FA,
    enableLoading,
    disableLoading,
  } = useTwoFactorSettings();

  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [enablingStep, setEnablingStep] = useState<'input' | 'confirm'>('input');

  /**
   * Handle enable 2FA button
   */
  const handleEnablePress = () => {
    setShowEnableModal(true);
    setEnablingStep('input');
    setEmailInput('');
  };

  /**
   * Confirm email and enable 2FA
   */
  const handleConfirmEnable = async () => {
    if (!emailInput.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      await enable2FA(emailInput.trim().toLowerCase());
      
      Alert.alert(
        'Two-Factor Authentication Enabled',
        'Your account is now protected with two-factor authentication.',
        [{ text: 'OK', onPress: () => setShowEnableModal(false) }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to enable 2FA');
    }
  };

  /**
   * Handle disable 2FA with step-up verification
   */
  const handleDisablePress = () => {
    Alert.alert(
      'Disable Two-Factor Authentication?',
      'This will reduce your account security. You will need to verify your identity to proceed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => setShowDisableModal(true),
        },
      ]
    );
  };

  /**
   * Complete disable after step-up verification
   */
  const handleDisableSuccess = async () => {
    try {
      await disable2FA();
      
      setShowDisableModal(false);
      
      Alert.alert(
        'Two-Factor Authentication Disabled',
        'Your account is no longer protected with two-factor authentication.'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to disable 2FA');
    }
  };

  if (loading && !settings) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen
          options={{
            title: 'Two-Factor Authentication',
            headerBackTitle: 'Security',
          }}
        />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error && !settings) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen
          options={{
            title: 'Two-Factor Authentication',
            headerBackTitle: 'Security',
          }}
        />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const is2FAEnabled = settings?.enabled || false;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Two-Factor Authentication',
          headerBackTitle: 'Security',
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={[styles.statusValue, is2FAEnabled && styles.statusValueEnabled]}>
                {is2FAEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={[styles.statusBadge, is2FAEnabled && styles.statusBadgeEnabled]}>
              <Text style={[styles.statusBadgeText, is2FAEnabled && styles.statusBadgeTextEnabled]}>
                {is2FAEnabled ? '✓' : '○'}
              </Text>
            </View>
          </View>

          {is2FAEnabled && settings?.method && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Method</Text>
                <Text style={styles.detailValue}>Email OTP</Text>
              </View>
              {settings.maskedAddress && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Delivery Address</Text>
                  <Text style={styles.detailValue}>{settings.maskedAddress}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Description */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>What is Two-Factor Authentication?</Text>
          <Text style={styles.infoText}>
            Two-factor authentication adds an extra layer of security to your account. 
            When enabled, you'll need to enter a verification code sent to your email 
            when performing sensitive actions like:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Creating or changing payout methods</Text>
            <Text style={styles.bulletItem}>• Requesting payouts</Text>
            <Text style={styles.bulletItem}>• Submitting identity verification</Text>
            <Text style={styles.bulletItem}>• Logging out from all devices</Text>
            <Text style={styles.bulletItem}>• Changing account settings</Text>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionSection}>
          {is2FAEnabled ? (
            <TouchableOpacity
              style={[styles.disableButton, disableLoading && styles.buttonDisabled]}
              onPress={handleDisablePress}
              disabled={disableLoading}
            >
              {disableLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.disableButtonText}>Disable 2FA</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.enableButton, enableLoading && styles.buttonDisabled]}
              onPress={handleEnablePress}
              disabled={enableLoading}
            >
              {enableLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.enableButtonText}>Enable 2FA</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Security Notice */}
        <View style={styles.noticeSection}>
          <Text style={styles.noticeTitle}>⚠️ Security Notice</Text>
          <Text style={styles.noticeText}>
            {is2FAEnabled
              ? 'Disabling 2FA will reduce your account security. Make sure you recognize all active sessions and devices.'
              : 'Enabling 2FA is recommended for all users who handle payouts or sensitive account operations.'}
          </Text>
        </View>
      </ScrollView>

      {/* Enable 2FA Modal */}
      {showEnableModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Enable Two-Factor Authentication</Text>
            <Text style={styles.modalDescription}>
              Enter the email address where you want to receive verification codes:
            </Text>
            
            <TextInput
              style={styles.emailInput}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="your@email.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!enableLoading}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowEnableModal(false)}
                disabled={enableLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmButton, enableLoading && styles.buttonDisabled]}
                onPress={handleConfirmEnable}
                disabled={enableLoading}
              >
                {enableLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Enable</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Step-Up Verification Modal for Disable */}
      <StepUpVerificationModal
        visible={showDisableModal}
        action="2FA_DISABLE"
        reasonCodes={['2FA_ENABLED']}
        onSuccess={handleDisableSuccess}
        onCancel={() => setShowDisableModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  statusValueEnabled: {
    color: '#34C759',
  },
  statusBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeEnabled: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeText: {
    fontSize: 24,
    color: '#999',
  },
  statusBadgeTextEnabled: {
    color: '#34C759',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
  },
  bulletItem: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  actionSection: {
    marginBottom: 16,
  },
  enableButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disableButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  disableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  noticeSection: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
