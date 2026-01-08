/**
 * Enter Referral Code Screen - Phase 32-6
 * Optional screen for users to enter a referral code
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { activateReferralCode } from "@/services/referralService";
import { isValidReferralCode, normalizeReferralCode } from "@/utils/referralCodeGenerator";

export default function EnterReferralCodeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCodeChange = (text: string) => {
    // Only allow A-Z and 0-9
    const normalized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCode(normalized);
    setError('');
  };

  const handleActivateCode = async () => {
    if (!code.trim()) {
      setError(t('referrals.invalidCode'));
      return;
    }

    const normalizedCode = normalizeReferralCode(code);

    if (!isValidReferralCode(normalizedCode)) {
      setError(t('referrals.invalidCode'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await activateReferralCode(normalizedCode);

      if (result.success) {
        Alert.alert(
          '✓',
          t('referrals.codeActivated'),
          [
            {
              text: t('common.ok'),
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        setError(result.error || t('referrals.invalidCode'));
      }
    } catch (error) {
      console.error('Error activating code:', error);
      setError('Failed to activate code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{t('referrals.enterCode')}</Text>
            <Text style={styles.headerSubtitle}>
              {t('referrals.subtitle')}
            </Text>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🎁</Text>
          </View>

          {/* Info */}
          <Text style={styles.infoText}>
            If a friend invited you, enter their referral code here
          </Text>

          {/* Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('referrals.enterCode')}</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              value={code}
              onChangeText={handleCodeChange}
              placeholder={t('referrals.enterCodePlaceholder')}
              placeholderTextColor="#666"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          {/* How it works */}
          <View style={styles.howItWorksContainer}>
            <Text style={styles.howItWorksTitle}>{t('referrals.howItWorks')}</Text>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Ask your friend for their code</Text>
            </View>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Enter the 6-character code above</Text>
            </View>
            <View style={styles.stepContainer}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Your friend unlocks cosmetic rewards</Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.activateButton]}
              onPress={handleActivateCode}
              disabled={loading || !code.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {t('referrals.enterCodeButton')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.skipButton]}
              onPress={handleSkip}
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.skipButtonText]}>
                {t('common.skip')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cost Info */}
          <Text style={styles.costInfo}>{t('referrals.costInfo')}</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 80,
  },
  infoText: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: 32,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CCCCCC',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 4,
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  errorText: {
    fontSize: 14,
    color: '#FF6B6B',
    marginTop: 8,
    textAlign: 'center',
  },
  howItWorksContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 32,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#40E0D0',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#CCCCCC',
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
  activateButton: {
    backgroundColor: '#40E0D0',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#333',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  skipButtonText: {
    color: '#999',
  },
  costInfo: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
