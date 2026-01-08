import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Appeal Screen - Allow users to submit appeals for restrictions
 * UI-only implementation - no automated unbans
 */
export default function AppealScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.uid) {
      Alert.alert(t('common.error'), 'User not authenticated');
      return;
    }

    if (message.trim().length < 20) {
      Alert.alert(
        t('common.error'),
        'Please provide at least 20 characters explaining your appeal.'
      );
      return;
    }

    try {
      setSubmitting(true);

      // Save appeal to Firestore
      await addDoc(collection(db, 'appeals'), {
        userId: user.uid,
        message: message.trim(),
        createdAt: serverTimestamp(),
        platform: 'mobile',
        status: 'PENDING',
      });

      Alert.alert(
        t('restrictions.appealSubmitted'),
        t('restrictions.appealSubmittedMessage'),
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
        'Failed to submit appeal. Please try again later.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>
            {t('restrictions.appealTitle')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📝</Text>
        </View>

        {/* Description */}
        <Text style={[styles.title, isDark && styles.textDark]}>
          {t('restrictions.appealTitle')}
        </Text>
        <Text style={[styles.description, isDark && styles.textSecondaryDark]}>
          {t('restrictions.appealDescription')}
        </Text>

        {/* Message Input */}
        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.textDark]}>
            {t('restrictions.appealDescription')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              isDark && styles.textInputDark,
              isDark && styles.textDark,
            ]}
            placeholder={t('restrictions.appealPlaceholder')}
            placeholderTextColor={isDark ? '#888' : '#999'}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={[styles.charCount, isDark && styles.textSecondaryDark]}>
            {message.length} / 2000
          </Text>
        </View>

        {/* Optional Screenshot Note */}
        <View style={[styles.noteContainer, isDark && styles.noteContainerDark]}>
          <Text style={[styles.noteText, isDark && styles.textSecondaryDark]}>
            💡 {t('restrictions.appealOptionalScreenshot')}
          </Text>
          <Text style={[styles.noteSubtext, isDark && styles.textSecondaryDark]}>
            (Feature coming soon)
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting || message.trim().length < 20}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {t('restrictions.appealSubmit')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Important Notice */}
        <View style={[styles.warningContainer, isDark && styles.warningContainerDark]}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={[styles.warningText, isDark && styles.textSecondaryDark]}>
            Appeals are reviewed manually by our team. Response time may vary.
            Submitting multiple appeals will not speed up the process.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backButtonText: {
    fontSize: 28,
    color: '#40E0D0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSpacer: {
    width: 44,
  },

  // Icon
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 64,
  },

  // Title & Description
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },

  // Input
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 160,
  },
  textInputDark: {
    backgroundColor: '#1e1e1e',
    borderColor: '#333',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 6,
  },

  // Note Container
  noteContainer: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#40E0D0',
  },
  noteContainerDark: {
    backgroundColor: '#1a2530',
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  noteSubtext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },

  // Submit Button
  submitButton: {
    backgroundColor: '#40E0D0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#a0a0a0',
    shadowColor: '#000',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Warning Container
  warningContainer: {
    backgroundColor: '#fff9e6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#ffb800',
  },
  warningContainerDark: {
    backgroundColor: '#2a2416',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },

  // Theme
  textDark: {
    color: '#ffffff',
  },
  textSecondaryDark: {
    color: '#aaa',
  },
});
