/**
 * PACK 60 — Devices & Sessions Screen
 * View and manage active devices and sessions
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
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchSecurityOverview,
  trustDevice,
  revokeSession,
  SecurityOverview,
} from '../../services/securityService';
import { useTranslation } from 'react-i18next';

export default function DevicesSessionsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadSecurityOverview();
  }, []);

  const loadSecurityOverview = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      const data = await fetchSecurityOverview(user.uid);
      setOverview(data);
    } catch (error: any) {
      console.error('Error loading devices/sessions:', error);
      Alert.alert(t('common.error'), t('security.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleTrustDevice = async (deviceId: string, trusted: boolean) => {
    if (!user?.uid) return;
    try {
      setProcessing(deviceId);
      const updated = await trustDevice(user.uid, deviceId, trusted);
      setOverview(updated);
    } catch (error: any) {
      console.error('Error trusting device:', error);
      Alert.alert(t('common.error'), t('security.errorUpdating'));
    } finally {
      setProcessing(null);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!user?.uid) return;

    Alert.alert(
      t('security.devices.revokeSession'),
      t('security.devices.revokeConfirm'),
      [
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(sessionId);
              const updated = await revokeSession(user.uid, sessionId);
              setOverview(updated);
              Alert.alert(t('common.success'), t('security.devices.revokeSuccess'));
            } catch (error: any) {
              console.error('Error revoking session:', error);
              Alert.alert(t('common.error'), t('security.errorUpdating'));
            } finally {
              setProcessing(null);
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleRevokeAllSessions = async () => {
    if (!user?.uid || !overview) return;

    const currentSession = overview.sessions.find(s => !s.revoked)?.[0];
    const currentSessionId = currentSession?.sessionId;

    Alert.alert(
      t('security.devices.revokeAll'),
      t('security.devices.revokeAllConfirm'),
      [
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing('all');
              const updated = await revokeSession(
                user.uid,
                undefined,
                true,
                currentSessionId
              );
              setOverview(updated);
              Alert.alert(t('common.success'), t('security.devices.revokeAllSuccess'));
            } catch (error: any) {
              console.error('Error revoking all sessions:', error);
              Alert.alert(t('common.error'), t('security.errorUpdating'));
            } finally {
              setProcessing(null);
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ios':
        return '📱';
      case 'android':
        return '🤖';
      case 'web':
        return '🌐';
      default:
        return '💻';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e91e63" />
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('security.errorLoading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Devices Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('security.devices.title')}</Text>

        {overview.devices.map((device) => (
          <View key={device.deviceId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.icon}>{getPlatformIcon(device.platform)}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>
                  {device.model || `${device.platform.toUpperCase()} Device`}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {t('security.devices.lastSeen')}: {formatDate(device.lastSeenAt)}
                </Text>
                {device.lastIpCountry && (
                  <Text style={styles.cardSubtitle}>
                    {t('security.devices.location')}: {device.lastIpCountry}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.cardActions}>
              {device.trusted ? (
                <View style={styles.trustedBadge}>
                  <Text style={styles.trustedText}>
                    ✓ {t('security.devices.trusted')}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.trustButton}
                  onPress={() => handleTrustDevice(device.deviceId, true)}
                  disabled={processing === device.deviceId}
                >
                  <Text style={styles.trustButtonText}>
                    {t('security.devices.trustDevice')}
                  </Text>
                </TouchableOpacity>
              )}

              {device.trusted && (
                <TouchableOpacity
                  style={styles.untrustButton}
                  onPress={() => handleTrustDevice(device.deviceId, false)}
                  disabled={processing === device.deviceId}
                >
                  <Text style={styles.untrustButtonText}>
                    {t('security.devices.untrustDevice')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {overview.devices.length === 0 && (
          <Text style={styles.emptyText}>{t('security.devices.noDevices')}</Text>
        )}
      </View>

      {/* Sessions Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('security.sessions.title')}</Text>
          {overview.sessions.length > 1 && (
            <TouchableOpacity
              style={styles.revokeAllButton}
              onPress={handleRevokeAllSessions}
              disabled={processing === 'all'}
            >
              <Text style={styles.revokeAllButtonText}>
                {t('security.devices.revokeAll')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {overview.sessions.map((session) => (
          <View key={session.sessionId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.icon}>{getPlatformIcon(session.platform)}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>
                  {session.platform.toUpperCase()} Session
                </Text>
                <Text style={styles.cardSubtitle}>
                  {t('security.sessions.created')}: {formatDate(session.createdAt)}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {t('security.sessions.lastActive')}: {formatDate(session.lastActiveAt)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.revokeButton}
              onPress={() => handleRevokeSession(session.sessionId)}
              disabled={processing === session.sessionId}
            >
              <Text style={styles.revokeButtonText}>
                {t('security.devices.revokeSession')}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {overview.sessions.length === 0 && (
          <Text style={styles.emptyText}>{t('security.sessions.noSessions')}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  icon: {
    fontSize: 32,
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  trustedBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  trustedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  trustButton: {
    backgroundColor: '#e91e63',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  trustButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  untrustButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e91e63',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  untrustButtonText: {
    color: '#e91e63',
    fontSize: 14,
    fontWeight: '600',
  },
  revokeButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  revokeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  revokeAllButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  revokeAllButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
  },
});
