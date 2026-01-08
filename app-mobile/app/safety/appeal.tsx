import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from "@/lib/firebase";

const MIN_APPEAL_LENGTH = 100;
const MAX_APPEAL_LENGTH = 2000;

export default function SafetyAppealScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { data, loading: statusLoading } = useAccountSafety(user?.uid);

  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasExistingAppeal, setHasExistingAppeal] = useState(false);
  const [existingAppealStatus, setExistingAppealStatus] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      checkExistingAppeal();
    }
  }, [user?.uid]);

  const checkExistingAppeal = async () => {
    if (!user?.uid) return;

    try {
      setChecking(true);
      const appealsRef = collection(db, 'appeals');
      const q = query(
        appealsRef,
        where('userId', '==', user.uid),
        where('status', 'in', ['PENDING', 'NEED_MORE_INFO'])
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        setHasExistingAppeal(true);
        const appeal = snapshot.docs[0].data();
        setExistingAppealStatus(appeal.status);
      } else {
        setHasExistingAppeal(false);
        setExistingAppealStatus(null);
      }
    } catch (error) {
      console.error('Error checking existing appeal:', error);
    } finally {
      setChecking(false);
    }
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return t('safety.notApplicable');
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getStatusLabel = (): string => {
    if (!data) return t('safety.accountActive');
    
    switch (data.status) {
      case 'WARNING':
        return t('safety.warningTitle');
      case 'RESTRICTED':
        return t('safety.restrictedTitle');
      case 'SUSPENDED':
        return t('safety.suspendedTitle');
      case 'BANNED_PERMANENT':
        return t('safety.bannedTitle');
      case 'REVIEW':
        return t('safety.reviewTitle');
      default:
        return data.status;
    }
  };

  const handleSubmitAppeal = async () => {
    if (!user?.uid || !data) return;

    // Validate input
    if (appealText.trim().length < MIN_APPEAL_LENGTH) {
      Alert.alert(
        t('common.error'),
        t('safety.appealTooShort', { min: MIN_APPEAL_LENGTH })
      );
      return;
    }

    if (appealText.trim().length > MAX_APPEAL_LENGTH) {
      Alert.alert(
        t('common.error'),
        t('safety.appealTooLong', { max: MAX_APPEAL_LENGTH })
      );
      return;
    }

    try {
      setSubmitting(true);

      // Create appeal document
      const appealsRef = collection(db, 'appeals');
      await addDoc(appealsRef, {
        userId: user.uid,
        accountStatusAtSubmission: data.status,
        statusExpiresAt: data.statusExpiresAt || null,
        statusReason: data.reason || null,
        violationCount: data.violationCount || 0,
        messageFromUser: appealText.trim(),
        status: 'PENDING',
        moderatorNote: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        platform: 'mobile',
      });

      Alert.alert(
        t('safety.appealSubmitted'),
        t('safety.appealSubmittedMessage'),
        [
          {
            text: t('common.ok'),
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting appeal:', error);
      Alert.alert(
        t('common.error'),
        t('safety.appealSubmissionFailed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (statusLoading || checking) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Stack.Screen
          options={{
            title: t('safety.submitAppeal'),
            headerBackTitle: t('common.back'),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#40E0D0" />
          <Text style={[styles.loadingText, isDark && styles.textDark]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
    );
  }

  // Check if user can appeal
  if (data?.status === 'ACTIVE') {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Stack.Screen
          options={{
            title: t('safety.submitAppeal'),
            headerBackTitle: t('common.back'),
          }}
        />
        <View style={styles.messageContainer}>
          <Text style={styles.messageIcon}>✅</Text>
          <Text style={[styles.messageTitle, isDark && styles.textDark]}>
            {t('safety.noAppealNeeded')}
          </Text>
          <Text style={[styles.messageText, isDark && styles.textDarkSecondary]}>
            {t('safety.accountIsActive')}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (hasExistingAppeal) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Stack.Screen
          options={{
            title: t('safety.submitAppeal'),
            headerBackTitle: t('common.back'),
          }}
        />
        <View style={styles.messageContainer}>
          <Text style={styles.messageIcon}>⏳</Text>
          <Text style={[styles.messageTitle, isDark && styles.textDark]}>
            {t('safety.appealPending')}
          </Text>
          <Text style={[styles.messageText, isDark && styles.textDarkSecondary]}>
            {existingAppealStatus === 'NEED_MORE_INFO'
              ? t('safety.appealNeedsMoreInfo')
              : t('safety.appealUnderReview')}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <Stack.Screen
        options={{
          title: t('safety.submitAppeal'),
          headerBackTitle: t('common.back'),
        }}
      />

      {/* Appeal Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>
          {t('safety.appealDecision')}
        </Text>
        <Text style={[styles.headerSubtitle, isDark && styles.textDarkSecondary]}>
          {t('safety.appealDescription')}
        </Text>
      </View>

      {/* Current Status Info */}
      <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
        <Text style={[styles.infoLabel, isDark && styles.textDarkSecondary]}>
          {t('safety.currentStatus')}
        </Text>
        <Text style={[styles.infoValue, isDark && styles.textDark]}>
          {getStatusLabel()}
        </Text>

        {data?.reason && (
          <>
            <Text style={[styles.infoLabel, isDark && styles.textDarkSecondary, styles.infoLabelSpaced]}>
              {t('safety.reason')}
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {data.reason}
            </Text>
          </>
        )}

        {data?.statusExpiresAt && (
          <>
            <Text style={[styles.infoLabel, isDark && styles.textDarkSecondary, styles.infoLabelSpaced]}>
              {t('safety.expiresAt')}
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {formatDate(new Date(data.statusExpiresAt))}
            </Text>
          </>
        )}

        {data?.violationCount !== undefined && data.violationCount > 0 && (
          <>
            <Text style={[styles.infoLabel, isDark && styles.textDarkSecondary, styles.infoLabelSpaced]}>
              {t('safety.violations')}
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {data.violationCount}
            </Text>
          </>
        )}
      </View>

      {/* Appeal Form */}
      <View style={styles.formContainer}>
        <Text style={[styles.formLabel, isDark && styles.textDark]}>
          {t('safety.yourAppeal')} *
        </Text>
        <Text style={[styles.formHint, isDark && styles.textDarkSecondary]}>
          {t('safety.explainAppeal')}
        </Text>

        <View style={[styles.textInputContainer, isDark && styles.textInputContainerDark]}>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            placeholder={t('safety.appealPlaceholder')}
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
            multiline
            numberOfLines={10}
            value={appealText}
            onChangeText={setAppealText}
            maxLength={MAX_APPEAL_LENGTH}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.characterCount}>
          <Text
            style={[
              styles.characterCountText,
              appealText.length < MIN_APPEAL_LENGTH && styles.characterCountError,
              isDark && styles.textDarkSecondary,
            ]}
          >
            {appealText.length} / {MAX_APPEAL_LENGTH}
          </Text>
          {appealText.length < MIN_APPEAL_LENGTH && (
            <Text style={styles.characterCountMin}>
              {t('safety.minimumRequired', { min: MIN_APPEAL_LENGTH })}
            </Text>
          )}
        </View>
      </View>

      {/* Important Notes */}
      <View style={styles.notesBox}>
        <Text style={styles.notesTitle}>⚠️ {t('safety.importantNotes')}</Text>
        <Text style={styles.notesText}>
          • {t('safety.appealNote1')}
        </Text>
        <Text style={styles.notesText}>
          • {t('safety.appealNote2')}
        </Text>
        <Text style={styles.notesText}>
          • {t('safety.appealNote3')}
        </Text>
        {data?.status === 'BANNED_PERMANENT' && (
          <Text style={styles.notesText}>
            • {t('safety.appealNotePermanent')}
          </Text>
        )}
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          (submitting || appealText.trim().length < MIN_APPEAL_LENGTH) &&
            styles.submitButtonDisabled,
        ]}
        onPress={handleSubmitAppeal}
        disabled={submitting || appealText.trim().length < MIN_APPEAL_LENGTH}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {t('safety.submitAppeal')}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  messageIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  messageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#40E0D0',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoCardDark: {
    backgroundColor: '#1a1a1a',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoLabelSpaced: {
    marginTop: 12,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  formContainer: {
    padding: 16,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  formHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  textInputContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  textInputContainerDark: {
    backgroundColor: '#1a1a1a',
    borderColor: '#374151',
  },
  textInput: {
    padding: 16,
    fontSize: 15,
    color: '#111827',
    minHeight: 200,
  },
  textInputDark: {
    color: '#ffffff',
  },
  characterCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  characterCountText: {
    fontSize: 13,
    color: '#6B7280',
  },
  characterCountError: {
    color: '#DC2626',
  },
  characterCountMin: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  notesBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 4,
  },
  submitButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#40E0D0',
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSecondary: {
    color: '#9CA3AF',
  },
  bottomSpacing: {
    height: 32,
  },
});
