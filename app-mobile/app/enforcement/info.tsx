/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Enforcement Info Screen
 * 
 * Shows current enforcement state and allows users to view restrictions
 * and submit appeals if eligible
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";

interface EnforcementState {
  accountStatus: string;
  visibilityTier: string;
  reasonCodes: string[];
  lastUpdatedAt: any;
  canAppeal?: boolean;
}

interface ModerationCase {
  caseId: string;
  status: string;
  priority: string;
  reasonCodes: string[];
  openedAt: any;
  resolution?: {
    outcome: string;
    reviewNote: string;
  };
}

export default function EnforcementInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const caseId = params.caseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [enforcementState, setEnforcementState] = useState<EnforcementState | null>(null);
  const [moderationCase, setModerationCase] = useState<ModerationCase | null>(null);

  useEffect(() => {
    loadEnforcementInfo();
  }, [caseId]);

  const loadEnforcementInfo = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      // Load enforcement state
      const stateDoc = await getDoc(doc(db, 'user_enforcement_state', userId));
      if (stateDoc.exists()) {
        setEnforcementState(stateDoc.data() as EnforcementState);
      }

      // Load moderation case if provided
      if (caseId) {
        const caseDoc = await getDoc(doc(db, 'moderation_cases', caseId));
        if (caseDoc.exists()) {
          setModerationCase(caseDoc.data() as ModerationCase);
        }
      }
    } catch (error) {
      console.error('Error loading enforcement info:', error);
      Alert.alert('Error', 'Failed to load enforcement information');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = () => {
    if (!caseId) {
      Alert.alert('Error', 'No case ID available for appeal');
      return;
    }
    router.push({ pathname: '/enforcement/appeal' as any, params: { caseId } });
  };

  const getStatusMessage = (status: string): string => {
    switch (status) {
      case 'ACTIVE':
        return 'Your account is in good standing';
      case 'SOFT_RESTRICTED':
        return 'Your account has minor restrictions';
      case 'HARD_RESTRICTED':
        return 'Your account has significant restrictions';
      case 'SUSPENDED':
        return 'Your account is currently suspended';
      default:
        return 'Account status unknown';
    }
  };

  const getVisibilityMessage = (tier: string): string => {
    switch (tier) {
      case 'NORMAL':
        return 'Your profile has normal visibility';
      case 'LOW':
        return 'Your profile has reduced visibility in discovery';
      case 'HIDDEN':
        return 'Your profile is hidden from discovery';
      default:
        return 'Visibility status unknown';
    }
  };

  const getReasonMessage = (code: string): string => {
    const reasonMap: Record<string, string> = {
      'NSFW_POLICY': 'Content policy violation',
      'HARASSMENT': 'Harassment or abusive behavior',
      'SPAM': 'Spam or repetitive content',
      'SCAM': 'Suspected scam activity',
      'IDENTITY_FRAUD': 'Identity verification issue',
      'KYC_MISMATCH': 'Identity verification mismatch',
      'MINOR_SAFETY': 'Minor safety concern',
      'CRIMINAL_ACTIVITY': 'Suspected illegal activity',
      'MONETIZATION_BYPASS': 'Monetization policy violation',
      'HIGH_RISK_CONTENT': 'High risk content detected',
      'PERSISTENT_VIOLATIONS': 'Multiple policy violations',
      'RISK_SCORE_HIGH': 'Elevated risk score',
      // PACK 104: Anti-Ring & Anti-Collusion Detection
      'COLLUSION_RISK': 'Unusual activity pattern detected',
      'COLLUSION_RISK_LOW': 'Activity under review',
      'COLLUSION_RISK_MEDIUM': 'Suspicious activity detected',
      'COLLUSION_RISK_HIGH': 'High-risk activity detected',
      'COMMERCIAL_SPAM_RISK': 'Automated behavior detected',
    };
    return reasonMap[code] || code;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading enforcement information...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Account Status</Text>

        {/* Account Status Card */}
        {enforcementState && (
          <View style={styles.card}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusLabel}>Current Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  enforcementState.accountStatus === 'ACTIVE' && styles.statusBadgeActive,
                  enforcementState.accountStatus === 'SUSPENDED' && styles.statusBadgeSuspended,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {enforcementState.accountStatus}
                </Text>
              </View>
            </View>

            <Text style={styles.statusMessage}>
              {getStatusMessage(enforcementState.accountStatus)}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Visibility</Text>
            <Text style={styles.infoText}>
              {getVisibilityMessage(enforcementState.visibilityTier)}
            </Text>

            {enforcementState.reasonCodes && enforcementState.reasonCodes.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>Reason for Restrictions</Text>
                {enforcementState.reasonCodes.map((code, index) => (
                  <Text key={index} style={styles.reasonText}>
                    • {getReasonMessage(code)}
                  </Text>
                ))}
              </>
            )}

            {enforcementState.lastUpdatedAt && (
              <>
                <View style={styles.divider} />
                <Text style={styles.timestampText}>
                  Last updated:{' '}
                  {new Date(enforcementState.lastUpdatedAt.toMillis()).toLocaleString()}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Moderation Case Card */}
        {moderationCase && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Case Information</Text>

            <View style={styles.caseInfo}>
              <Text style={styles.infoLabel}>Case ID:</Text>
              <Text style={styles.infoValue}>{moderationCase.caseId}</Text>
            </View>

            <View style={styles.caseInfo}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={styles.infoValue}>{moderationCase.status}</Text>
            </View>

            <View style={styles.caseInfo}>
              <Text style={styles.infoLabel}>Priority:</Text>
              <Text style={styles.infoValue}>{moderationCase.priority}</Text>
            </View>

            {moderationCase.resolution && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>Resolution</Text>
                <Text style={styles.infoText}>{moderationCase.resolution.reviewNote}</Text>
              </>
            )}
          </View>
        )}

        {/* Information Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What This Means</Text>
          <Text style={styles.infoText}>
            Account restrictions are applied to ensure a safe environment for all users. While
            restrictions are in place, some features may be limited.
          </Text>
          <Text style={[styles.infoText, { marginTop: 12 }]}>
            Our team reviews all cases carefully. If you believe this is an error, you can submit
            an appeal below.
          </Text>
        </View>

        {/* Appeal Button */}
        {moderationCase && moderationCase.status === 'RESOLVED' && (
          <TouchableOpacity style={styles.appealButton} onPress={handleSubmitAppeal}>
            <Text style={styles.appealButtonText}>Submit Appeal</Text>
          </TouchableOpacity>
        )}

        {/* Support Link */}
        <TouchableOpacity
          style={styles.supportButton}
          onPress={() => router.push('/support/center' as any)}
        >
          <Text style={styles.supportButtonText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FF9500',
  },
  statusBadgeActive: {
    backgroundColor: '#34C759',
  },
  statusBadgeSuspended: {
    backgroundColor: '#FF3B30',
  },
  statusBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusMessage: {
    fontSize: 16,
    color: '#000',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  reasonText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 6,
  },
  timestampText: {
    fontSize: 13,
    color: '#999',
  },
  caseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#000',
  },
  appealButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  appealButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  supportButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
    marginBottom: 32,
  },
  supportButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
