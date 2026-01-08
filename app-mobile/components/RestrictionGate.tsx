import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useUserRestriction } from '../hooks/useUserRestriction';
import { useTranslation } from '../hooks/useTranslation';

interface RestrictionGateProps {
  children: ReactNode;
}

/**
 * RestrictionGate - Global component that detects and reacts to user restriction states
 * 
 * Status behaviors:
 * - ACTIVE: Allow full access (pass through)
 * - WARNING: Show yellow banner, allow access
 * - SOFT_RESTRICTED: Show modal, block certain actions
 * - SHADOWBAN: Allow access but UI-only visibility limitation
 * - HARD_BANNED: Show full-screen block with logout button
 */
export const RestrictionGate: React.FC<RestrictionGateProps> = ({ children }) => {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const {
    isActive,
    isWarning,
    isSoftRestricted,
    isHardBanned,
    canAppeal,
    restrictionMessage,
    restrictionEndsAt,
    trust,
  } = useUserRestriction(user?.uid);

  const handleLogout = () => {
    // Navigate to signin - actual logout will be handled there
    router.replace('/auth/signin' as any);
  };

  const handleAppeal = () => {
    router.push('/restriction/appeal' as any);
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return new Intl.DateTimeFormat(t('common.appName') === 'Avalo' ? 'en-US' : 'pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  // ACTIVE or SHADOWBAN: Pass through (shadowban is UI-only, handled elsewhere)
  if (isActive || trust?.status === 'SHADOWBAN') {
    return (
      <>
        {isWarning && <WarningBanner message={restrictionMessage} isDark={isDark} t={t} />}
        {children}
      </>
    );
  }

  // WARNING: Show banner but allow access
  if (isWarning) {
    return (
      <>
        <WarningBanner message={restrictionMessage} isDark={isDark} t={t} />
        {children}
      </>
    );
  }

  // SOFT_RESTRICTED: Show modal
  if (isSoftRestricted) {
    return (
      <>
        {children}
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
              <Text style={[styles.modalIcon, styles.warningColor]}>⚠️</Text>
              <Text style={[styles.modalTitle, isDark && styles.textDark]}>
                {t('restrictions.softRestrictedTitle')}
              </Text>
              <Text style={[styles.modalMessage, isDark && styles.textDark]}>
                {t('restrictions.softRestrictedMessage')}
              </Text>
              
              {restrictionMessage && (
                <View style={styles.reasonContainer}>
                  <Text style={[styles.reasonText, isDark && styles.textDark]}>
                    {t('restrictions.restrictionReason', { message: restrictionMessage })}
                  </Text>
                </View>
              )}

              {restrictionEndsAt && (
                <Text style={[styles.expiryText, isDark && styles.textDark]}>
                  {t('restrictions.restrictionUntil', { date: formatDate(restrictionEndsAt) })}
                </Text>
              )}

              <View style={styles.buttonContainer}>
                {canAppeal && (
                  <TouchableOpacity
                    style={[styles.button, styles.appealButton]}
                    onPress={handleAppeal}
                  >
                    <Text style={styles.buttonText}>{t('restrictions.appealButton')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.button, styles.understoodButton, isDark && styles.understoodButtonDark]}
                  onPress={() => {}}
                >
                  <Text style={[styles.understoodButtonText, isDark && styles.understoodButtonTextDark]}>
                    {t('restrictions.understood')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // HARD_BANNED: Full-screen block
  if (isHardBanned) {
    return (
      <View style={[styles.fullScreenBlock, isDark && styles.fullScreenBlockDark]}>
        <ScrollView contentContainerStyle={styles.fullScreenContent}>
          <Text style={styles.blockIcon}>🚫</Text>
          <Text style={[styles.blockTitle, isDark && styles.textDark]}>
            {t('restrictions.hardBannedTitle')}
          </Text>
          <Text style={[styles.blockMessage, isDark && styles.textDark]}>
            {t('restrictions.hardBannedMessage')}
          </Text>

          {restrictionMessage && (
            <View style={[styles.reasonContainer, styles.blockReasonContainer]}>
              <Text style={[styles.reasonText, isDark && styles.textDark]}>
                {t('restrictions.restrictionReason', { message: restrictionMessage })}
              </Text>
            </View>
          )}

          {restrictionEndsAt ? (
            <Text style={[styles.expiryText, isDark && styles.textDark]}>
              {t('restrictions.restrictionUntil', { date: formatDate(restrictionEndsAt) })}
            </Text>
          ) : (
            <Text style={[styles.permanentText, isDark && styles.textDark]}>
              {t('restrictions.restrictionPermanent')}
            </Text>
          )}

          <View style={styles.blockButtonContainer}>
            {canAppeal && (
              <TouchableOpacity
                style={[styles.button, styles.appealButton, styles.blockButton]}
                onPress={handleAppeal}
              >
                <Text style={styles.buttonText}>{t('restrictions.appealButton')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.logoutButton, styles.blockButton]}
              onPress={handleLogout}
            >
              <Text style={styles.buttonText}>{t('restrictions.logoutButton')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Fallback: Allow access
  return <>{children}</>;
};

// Warning Banner Component
const WarningBanner: React.FC<{
  message: string | null;
  isDark: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}> = ({ message, isDark, t }) => (
  <View style={[styles.warningBanner, isDark && styles.warningBannerDark]}>
    <Text style={styles.warningBannerIcon}>⚠️</Text>
    <View style={styles.warningBannerContent}>
      <Text style={styles.warningBannerTitle}>{t('restrictions.warningTitle')}</Text>
      <Text style={styles.warningBannerText}>
        {message || t('restrictions.warningMessage')}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  // Warning Banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#40E0D0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#2eb8aa',
  },
  warningBannerDark: {
    backgroundColor: '#2d9d91',
  },
  warningBannerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningBannerContent: {
    flex: 1,
  },
  warningBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  warningBannerText: {
    fontSize: 13,
    color: '#1a1a1a',
  },

  // Modal (Soft Restricted)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalContentDark: {
    backgroundColor: '#1a1a1a',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },

  // Full Screen Block (Hard Banned)
  fullScreenBlock: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  fullScreenBlockDark: {
    backgroundColor: '#121212',
  },
  fullScreenContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  blockIcon: {
    fontSize: 72,
    marginBottom: 24,
  },
  blockTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  blockMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },

  // Shared Styles
  reasonContainer: {
    backgroundColor: '#fff5f5',
    borderLeftWidth: 4,
    borderLeftColor: '#FF0033',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
  },
  blockReasonContainer: {
    marginTop: 8,
  },
  reasonText: {
    fontSize: 14,
    color: '#c41e3a',
    fontWeight: '600',
  },
  expiryText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  permanentText: {
    fontSize: 14,
    color: '#FF0033',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  
  // Buttons
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  blockButtonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  blockButton: {
    paddingVertical: 16,
  },
  appealButton: {
    backgroundColor: '#40E0D0',
  },
  logoutButton: {
    backgroundColor: '#FF0033',
  },
  understoodButton: {
    backgroundColor: '#f0f0f0',
  },
  understoodButtonDark: {
    backgroundColor: '#2a2a2a',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  understoodButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  understoodButtonTextDark: {
    color: '#ffffff',
  },

  // Theme Colors
  warningColor: {
    color: '#40E0D0',
  },
  textDark: {
    color: '#ffffff',
  },
});

export default RestrictionGate;
