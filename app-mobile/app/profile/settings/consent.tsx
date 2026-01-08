/**
 * PACK 171 - Consent History Viewer
 * Full transparency of all user consents with revoke capability
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface ConsentLog {
  id: string;
  userId: string;
  purpose: string;
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  deviceId: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
  };
  ipAddress: string;
  explanation: string;
  featureUsing: string;
}

const CONSENT_PURPOSES = {
  data_processing: {
    title: 'Data Processing',
    icon: '🔄',
    description: 'Process your data for core app features',
  },
  analytics: {
    title: 'Analytics',
    icon: '📊',
    description: 'Collect usage data to improve the app',
  },
  marketing: {
    title: 'Marketing',
    icon: '📢',
    description: 'Send promotional emails and offers',
  },
  third_party_sharing: {
    title: 'Third-Party Sharing',
    icon: '🔗',
    description: 'Share data with integrated services',
  },
  location_tracking: {
    title: 'Location Tracking',
    icon: '📍',
    description: 'Track your precise location',
  },
  payment_processing: {
    title: 'Payment Processing',
    icon: '💳',
    description: 'Process payments and transactions',
  },
  content_personalization: {
    title: 'Content Personalization',
    icon: '✨',
    description: 'Personalize content based on your activity',
  },
};

export default function ConsentHistoryScreen() {
  const router = useRouter();
  const [consents, setConsents] = useState<ConsentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConsentHistory();
  }, []);

  const loadConsentHistory = async () => {
    try {
      setLoading(true);
      const getConsentHistory = httpsCallable(functions, 'getConsentHistory');
      const result = await getConsentHistory();
      const data = result.data as { success: boolean; consents: any[] };
      
      if (data.success) {
        setConsents(data.consents.map(c => ({
          ...c,
          grantedAt: new Date(c.grantedAt),
          revokedAt: c.revokedAt ? new Date(c.revokedAt) : undefined,
        })));
      }
    } catch (error) {
      console.error('Failed to load consent history:', error);
      Alert.alert('Error', 'Failed to load consent history');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConsentHistory();
    setRefreshing(false);
  };

  const revokeConsent = async (consentLog: ConsentLog) => {
    Alert.alert(
      'Revoke Consent',
      `Are you sure you want to revoke consent for ${CONSENT_PURPOSES[consentLog.purpose as keyof typeof CONSENT_PURPOSES]?.title || consentLog.purpose}?\n\nThis will immediately disable the associated feature.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const updateConsent = httpsCallable(functions, 'updateConsent');
              await updateConsent({
                purpose: consentLog.purpose,
                granted: false,
                deviceInfo: {
                  platform: 'mobile',
                  osVersion: 'unknown',
                  appVersion: '1.0.0',
                },
                explanation: 'User revoked consent',
                featureUsing: consentLog.featureUsing,
              });

              Alert.alert('Success', 'Consent revoked successfully');
              await loadConsentHistory();
            } catch (error) {
              console.error('Failed to revoke consent:', error);
              Alert.alert('Error', 'Failed to revoke consent');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const ConsentCard = ({ consent }: { consent: ConsentLog }) => {
    const purposeInfo = CONSENT_PURPOSES[consent.purpose as keyof typeof CONSENT_PURPOSES] || {
      title: consent.purpose,
      icon: '📋',
      description: 'Unknown purpose',
    };

    const isActive = consent.granted && !consent.revokedAt;

    return (
      <View style={[styles.consentCard, !isActive && styles.consentCardRevoked]}>
        <View style={styles.consentHeader}>
          <View style={styles.consentTitleRow}>
            <Text style={styles.consentIcon}>{purposeInfo.icon}</Text>
            <View style={styles.consentTitleInfo}>
              <Text style={styles.consentTitle}>{purposeInfo.title}</Text>
              <Text style={styles.consentDescription}>{purposeInfo.description}</Text>
            </View>
            <View style={[styles.statusBadge, isActive ? styles.statusBadgeActive : styles.statusBadgeRevoked]}>
              <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextRevoked]}>
                {isActive ? '✓ Active' : '✗ Revoked'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.consentDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Granted:</Text>
            <Text style={styles.detailValue}>{formatDate(consent.grantedAt)}</Text>
          </View>
          {consent.revokedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Revoked:</Text>
              <Text style={styles.detailValue}>{formatDate(consent.revokedAt)}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device:</Text>
            <Text style={styles.detailValue}>
              {consent.deviceInfo.platform} {consent.deviceInfo.osVersion}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Feature:</Text>
            <Text style={styles.detailValue}>{consent.featureUsing}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason:</Text>
            <Text style={styles.detailValue}>{consent.explanation}</Text>
          </View>
        </View>

        {isActive && (
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={() => revokeConsent(consent)}
          >
            <Text style={styles.revokeButtonText}>Revoke Consent</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const activeConsents = consents.filter(c => c.granted && !c.revokedAt);
  const revokedConsents = consents.filter(c => !c.granted || c.revokedAt);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Consent History</Text>
        <Text style={styles.subtitle}>Full transparency of all permissions</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>✅</Text>
          <Text style={styles.infoText}>
            This is your complete consent history. You can revoke any active consent at any time with immediate effect.
          </Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activeConsents.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{revokedConsents.length}</Text>
            <Text style={styles.statLabel}>Revoked</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{consents.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {loading && consents.length === 0 ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading consent history...</Text>
          </View>
        ) : consents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No consent history yet</Text>
            <Text style={styles.emptySubtext}>
              As you use features that require permissions, they'll appear here
            </Text>
          </View>
        ) : (
          <>
            {activeConsents.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active Consents</Text>
                </View>
                {activeConsents.map((consent) => (
                  <ConsentCard key={consent.id} consent={consent} />
                ))}
              </>
            )}

            {revokedConsents.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Revoked Consents</Text>
                </View>
                {revokedConsents.map((consent) => (
                  <ConsentCard key={consent.id} consent={consent} />
                ))}
              </>
            )}
          </>
        )}

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            💡 Privacy Note: Revoking consent immediately disables the feature. No penalties or ranking changes apply.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#F0FFFE',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  sectionHeader: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  consentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  consentCardRevoked: {
    opacity: 0.6,
  },
  consentHeader: {
    marginBottom: 12,
  },
  consentTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  consentIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  consentTitleInfo: {
    flex: 1,
  },
  consentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  consentDescription: {
    fontSize: 13,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeActive: {
    backgroundColor: '#E8F8F5',
  },
  statusBadgeRevoked: {
    backgroundColor: '#FFE8E8',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#4ECDC4',
  },
  statusTextRevoked: {
    color: '#FF6B6B',
  },
  consentDetails: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    width: 80,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  revokeButton: {
    backgroundColor: '#FFE8E8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  revokeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  noteCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
