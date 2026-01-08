/**
 * PACK 419 — Restriction Banner Component
 * 
 * Displays contextual banner when user encounters a restriction
 * Shows high-level reason, expiry (if temp), and link to details
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { EnforcementScope, EnforcementReasonCode } from '../../../shared/types/pack419-enforcement.types';

export interface RestrictionBannerProps {
  /** Enforcement decision ID */
  enforcementId: string;
  /** Feature scope that is restricted */
  scope: EnforcementScope;
  /** Reason code for the restriction */
  reasonCode: EnforcementReasonCode;
  /** Expiry timestamp (null for permanent) */
  expiresAt?: number | null;
  /** Whether user can appeal */
  isAppealable: boolean;
  /** Existing appeal ID if any */
  appealId?: string | null;
}

export function RestrictionBanner({
  enforcementId,
  scope,
  reasonCode,
  expiresAt,
  isAppealable,
  appealId,
}: RestrictionBannerProps) {
  const router = useRouter();

  const getScopeMessage = (scope: EnforcementScope): string => {
    const messages: Record<EnforcementScope, string> = {
      CHAT: 'Your chat access is temporarily restricted',
      CALLS: 'Your calling features are restricted',
      MEETINGS: 'Your meeting access is restricted',
      EVENTS: 'Your event participation is restricted',
      FEED: 'Your feed posting is restricted',
      DISCOVERY: 'Your discovery access is restricted',
      SWIPE: 'Your swipe features are restricted',
      AI_COMPANIONS: 'Your AI companion access is restricted',
      MONETIZATION: 'Your monetization features are restricted',
      ACCOUNT_FULL: 'Your account access is restricted',
    };
    return messages[scope] || 'Access restricted';
  };

  const getReasonMessage = (reasonCode: EnforcementReasonCode): string => {
    const messages: Record<string, string> = {
      HARASSMENT: 'due to harassment reports',
      SPAM: 'due to spam activity',
      SCAM: 'due to fraudulent activity',
      FAKE_ID: 'due to identity verification issues',
      HATE_SPEECH: 'due to policy violation',
      NSFW_VIOLATION: 'due to content policy violation',
      TOS_VIOLATION: 'due to terms of service violation',
      SUSPICIOUS_ACTIVITY: 'due to suspicious activity',
      PAYMENT_FRAUD: 'due to payment issues',
      ACCOUNT_ABUSE: 'due to account policy violation',
      IMPERSONATION: 'due to impersonation reports',
      CHARGEBACK_ABUSE: 'due to payment disputes',
    };
    return messages[reasonCode] || 'due to a policy violation';
  };

  const getExpiryMessage = (): string | null => {
    if (!expiresAt) return null;

    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining <= 0) return null;

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `Expires in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return 'Expires soon';
    }
  };

  const isPermanent = !expiresAt;
  const expiryMessage = getExpiryMessage();

  return (
    <View style={[styles.container, isPermanent ? styles.permanentBanner : styles.tempBanner]}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>⚠️</Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>{getScopeMessage(scope)}</Text>
        <Text style={styles.reason}>{getReasonMessage(reasonCode)}</Text>
        
        {expiryMessage && (
          <Text style={styles.expiry}>{expiryMessage}</Text>
        )}
        
        {isPermanent && (
          <Text style={styles.permanent}>Permanent restriction</Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => router.push(`/enforcement/${enforcementId}`)}
          >
            <Text style={styles.detailsButtonText}>View Details</Text>
          </TouchableOpacity>

          {isAppealable && !appealId && (
            <TouchableOpacity
              style={styles.appealButton}
              onPress={() => router.push(`/enforcement/${enforcementId}?appeal=true`)}
            >
              <Text style={styles.appealButtonText}>Appeal</Text>
            </TouchableOpacity>
          )}

          {appealId && (
            <View style={styles.appealStatus}>
              <Text style={styles.appealStatusText}>Appeal submitted</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tempBanner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  permanentBanner: {
    backgroundColor: '#F8D7DA',
    borderLeftWidth: 4,
    borderLeftColor: '#DC3545',
  },
  iconContainer: {
    marginRight: 12,
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  reason: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 8,
  },
  expiry: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
    marginBottom: 12,
  },
  permanent: {
    fontSize: 13,
    color: '#721C24',
    fontWeight: '600',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  detailsButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CED4DA',
  },
  detailsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#495057',
  },
  appealButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007BFF',
    borderRadius: 8,
  },
  appealButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  appealStatus: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E7F3FF',
    borderRadius: 8,
  },
  appealStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0056B3',
  },
});
