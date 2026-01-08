import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useAccountSafety } from "@/hooks/useAccountSafety";

export default function SafetyStatusScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { data, loading, isActive, refresh } = useAccountSafety(user?.uid);

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date);
  };

  const getStatusColor = (): string => {
    if (!data) return '#4CAF50';
    
    switch (data.status) {
      case 'ACTIVE':
        return '#4CAF50'; // Green
      case 'WARNING':
        return '#FFA500'; // Orange
      case 'RESTRICTED':
        return '#FF8C00'; // Dark Orange
      case 'SUSPENDED':
        return '#FF0033'; // Red
      case 'BANNED_PERMANENT':
        return '#000000'; // Black
      case 'REVIEW':
        return '#3B82F6'; // Blue
      default:
        return '#4CAF50';
    }
  };

  const getStatusIcon = (): string => {
    if (!data) return '✅';
    
    switch (data.status) {
      case 'ACTIVE':
        return '✅';
      case 'WARNING':
        return '⚠️';
      case 'RESTRICTED':
        return '🔒';
      case 'SUSPENDED':
        return '⛔';
      case 'BANNED_PERMANENT':
        return '🚫';
      case 'REVIEW':
        return '🔍';
      default:
        return '✅';
    }
  };

  const getStatusTitle = (): string => {
    if (!data) return t('safety.accountActive');
    
    switch (data.status) {
      case 'ACTIVE':
        return t('safety.accountActive');
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
        return t('safety.accountActive');
    }
  };

  const getStatusDescription = (): string => {
    if (!data) return t('safety.accountActiveMessage');
    
    if (data.reason) return data.reason;
    
    switch (data.status) {
      case 'ACTIVE':
        return t('safety.accountActiveMessage');
      case 'WARNING':
        return t('safety.warningMessage');
      case 'RESTRICTED':
        return t('safety.restrictedMessage');
      case 'SUSPENDED':
        return t('safety.suspendedMessage');
      case 'BANNED_PERMANENT':
        return t('safety.bannedMessage');
      case 'REVIEW':
        return t('safety.reviewMessage');
      default:
        return t('safety.accountActiveMessage');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Stack.Screen
          options={{
            title: t('safety.safetyStatus'),
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

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <Stack.Screen
        options={{
          title: t('safety.safetyStatus'),
          headerBackTitle: t('common.back'),
        }}
      />

      {/* Status Header */}
      <View style={[styles.statusCard, { borderLeftColor: getStatusColor() }]}>
        <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
        <Text style={[styles.statusTitle, isDark && styles.textDark]}>
          {getStatusTitle()}
        </Text>
        <Text style={[styles.statusDescription, isDark && styles.textDarkSecondary]}>
          {getStatusDescription()}
        </Text>

        {data?.statusExpiresAt && (
          <View style={styles.expiryContainer}>
            <Text style={[styles.expiryLabel, isDark && styles.textDarkSecondary]}>
              {t('safety.statusExpiresAt')}:
            </Text>
            <Text style={[styles.expiryDate, isDark && styles.textDark]}>
              {formatDate(new Date(data.statusExpiresAt))}
            </Text>
          </View>
        )}

        {data?.status === 'BANNED_PERMANENT' && (
          <View style={styles.permanentBadge}>
            <Text style={styles.permanentBadgeText}>
              {t('safety.permanent')}
            </Text>
          </View>
        )}
      </View>

      {/* Violation Count */}
      {data?.violationCount !== undefined && data.violationCount > 0 && (
        <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
          <Text style={[styles.infoTitle, isDark && styles.textDark]}>
            {t('safety.violationHistory')}
          </Text>
          <Text style={[styles.infoValue, isDark && styles.textDarkSecondary]}>
            {t('safety.totalViolations', { count: data.violationCount })}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {!isActive && (
          <TouchableOpacity
            style={[styles.button, styles.appealButton]}
            onPress={() => router.push('/safety/appeal' as any)}
          >
            <Text style={styles.buttonText}>
              {t('safety.submitAppeal')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.historyButton]}
          onPress={() => router.push('/safety/history' as any)}
        >
          <Text style={styles.buttonText}>
            {t('safety.viewHistory')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.rulesButton]}
          onPress={() => router.push('/legal/community' as any)}
        >
          <Text style={styles.buttonText}>
            {t('safety.communityRules')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Information Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoBoxTitle}>ℹ️ {t('safety.whatHappensNow')}</Text>
        {isActive ? (
          <Text style={styles.infoBoxText}>
            {t('safety.accountActiveInfo')}
          </Text>
        ) : (
          <>
            <Text style={styles.infoBoxText}>
              {t('safety.restrictedAccountInfo')}
            </Text>
            {data?.statusExpiresAt && (
              <Text style={styles.infoBoxText}>
                • {t('safety.restrictionWillExpire')}
              </Text>
            )}
            <Text style={styles.infoBoxText}>
              • {t('safety.canSubmitAppeal')}
            </Text>
            <Text style={styles.infoBoxText}>
              • {t('safety.reviewCommunityRules')}
            </Text>
          </>
        )}
      </View>

      {/* Refresh Button */}
      <TouchableOpacity
        style={styles.refreshButton}
        onPress={() => refresh()}
      >
        <Text style={styles.refreshButtonText}>
          🔄 {t('safety.refreshStatus')}
        </Text>
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
  statusCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIcon: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  statusDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  expiryContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  expiryLabel: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
    marginBottom: 4,
  },
  expiryDate: {
    fontSize: 15,
    color: '#78350F',
    fontWeight: '700',
  },
  permanentBadge: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  permanentBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  infoCard: {
    marginHorizontal: 16,
    marginVertical: 8,
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
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#6B7280',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  appealButton: {
    backgroundColor: '#40E0D0',
  },
  historyButton: {
    backgroundColor: '#3B82F6',
  },
  rulesButton: {
    backgroundColor: '#8B5CF6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  infoBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoBoxTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoBoxText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20,
    marginBottom: 4,
  },
  refreshButton: {
    margin: 16,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
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
