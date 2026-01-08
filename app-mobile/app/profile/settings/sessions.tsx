/**
 * PACK 171 - Session Device Manager
 * Cross-device session control with security features
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

interface SessionDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'web';
  platform: string;
  osVersion: string;
  appVersion: string;
  ipAddress: string;
  location?: {
    city: string;
    country: string;
  };
  lastActive: Date;
  loginAt: Date;
  isCurrentDevice: boolean;
  trusted: boolean;
}

const DEVICE_TYPE_ICONS = {
  mobile: '📱',
  tablet: '📲',
  desktop: '💻',
  web: '🌐',
};

export default function SessionDeviceManagerScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const getSessionDevices = httpsCallable(functions, 'getSessionDevices');
      const result = await getSessionDevices();
      const data = result.data as { success: boolean; sessions: any[] };
      
      if (data.success) {
        setSessions(data.sessions.map(s => ({
          ...s,
          lastActive: new Date(s.lastActive),
          loginAt: new Date(s.loginAt),
        })));
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      Alert.alert('Error', 'Failed to load session devices');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const terminateSession = async (session: SessionDevice) => {
    Alert.alert(
      'Terminate Session',
      `Are you sure you want to sign out this device?\n\n${session.deviceName}\n${session.platform}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const terminateSessionFn = httpsCallable(functions, 'terminateSession');
              await terminateSessionFn({
                action: 'terminate',
                sessionId: session.id,
              });

              Alert.alert('Success', 'Device signed out successfully');
              await loadSessions();
            } catch (error) {
              console.error('Failed to terminate session:', error);
              Alert.alert('Error', 'Failed to sign out device');
            }
          },
        },
      ]
    );
  };

  const terminateAllSessions = async () => {
    const otherSessions = sessions.filter(s => !s.isCurrentDevice);
    
    if (otherSessions.length === 0) {
      Alert.alert('Info', 'No other sessions to sign out');
      return;
    }

    Alert.alert(
      'Sign Out All Devices',
      `This will sign out ${otherSessions.length} other device(s). Your current device will remain signed in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            try {
              const terminateSessionFn = httpsCallable(functions, 'terminateSession');
              await terminateSessionFn({
                action: 'terminate_all',
              });

              Alert.alert('Success', `Signed out ${otherSessions.length} device(s)`);
              await loadSessions();
            } catch (error) {
              console.error('Failed to terminate all sessions:', error);
              Alert.alert('Error', 'Failed to sign out devices');
            }
          },
        },
      ]
    );
  };

  const toggleTrust = async (session: SessionDevice) => {
    try {
      const terminateSessionFn = httpsCallable(functions, 'terminateSession');
      await terminateSessionFn({
        action: session.trusted ? 'untrust' : 'trust',
        sessionId: session.id,
      });

      await loadSessions();
    } catch (error) {
      console.error('Failed to toggle trust:', error);
      Alert.alert('Error', 'Failed to update device trust');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const SessionCard = ({ session }: { session: SessionDevice }) => {
    const deviceIcon = DEVICE_TYPE_ICONS[session.deviceType] || '📱';

    return (
      <View style={[styles.sessionCard, session.isCurrentDevice && styles.sessionCardCurrent]}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionIconContainer}>
            <Text style={styles.sessionIcon}>{deviceIcon}</Text>
          </View>
          <View style={styles.sessionInfo}>
            <View style={styles.sessionTitleRow}>
              <Text style={styles.sessionTitle}>{session.deviceName}</Text>
              {session.isCurrentDevice && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
              {session.trusted && !session.isCurrentDevice && (
                <View style={styles.trustedBadge}>
                  <Text style={styles.trustedBadgeText}>✓ Trusted</Text>
                </View>
              )}
            </View>
            <Text style={styles.sessionPlatform}>
              {session.platform} {session.osVersion}
            </Text>
            <Text style={styles.sessionLocation}>
              {session.location
                ? `${session.location.city}, ${session.location.country}`
                : session.ipAddress}
            </Text>
          </View>
        </View>

        <View style={styles.sessionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last Active:</Text>
            <Text style={styles.detailValue}>{formatDate(session.lastActive)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Signed In:</Text>
            <Text style={styles.detailValue}>{formatDate(session.loginAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>App Version:</Text>
            <Text style={styles.detailValue}>{session.appVersion}</Text>
          </View>
        </View>

        {!session.isCurrentDevice && (
          <View style={styles.sessionActions}>
            <TouchableOpacity
              style={styles.trustButton}
              onPress={() => toggleTrust(session)}
            >
              <Text style={styles.trustButtonText}>
                {session.trusted ? '✗ Untrust' : '✓ Trust'} Device
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={() => terminateSession(session)}
            >
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const currentSession = sessions.find(s => s.isCurrentDevice);
  const otherSessions = sessions.filter(s => !s.isCurrentDevice);

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
        <Text style={styles.title}>Session Devices</Text>
        <Text style={styles.subtitle}>Manage all logged-in devices</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>💻</Text>
          <Text style={styles.infoText}>
            View and manage all devices where you're signed in. Sign out suspicious devices immediately.
          </Text>
        </View>

        {otherSessions.length > 0 && (
          <TouchableOpacity
            style={styles.signOutAllButton}
            onPress={terminateAllSessions}
          >
            <Text style={styles.signOutAllButtonText}>
              Sign Out All Other Devices ({otherSessions.length})
            </Text>
          </TouchableOpacity>
        )}

        {loading && sessions.length === 0 ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>💻</Text>
            <Text style={styles.emptyText}>No active sessions</Text>
          </View>
        ) : (
          <>
            {currentSession && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Current Device</Text>
                </View>
                <SessionCard session={currentSession} />
              </>
            )}

            {otherSessions.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Other Devices</Text>
                </View>
                {otherSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </>
            )}
          </>
        )}

        <View style={styles.securityCard}>
          <Text style={styles.securityTitle}>🛡️ Security Tips</Text>
          <Text style={styles.securityText}>
            • Sign out devices you don't recognize immediately
          </Text>
          <Text style={styles.securityText}>
            • Trust only your personal devices
          </Text>
          <Text style={styles.securityText}>
            • Review this list regularly for suspicious activity
          </Text>
          <Text style={styles.securityText}>
            • Enable 2FA for additional security
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
  signOutAllButton: {
    backgroundColor: '#FFE8E8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  signOutAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  sectionHeader: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sessionCard: {
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
  sessionCardCurrent: {
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  sessionHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  sessionIconContainer: {
    width: 50,
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionIcon: {
    fontSize: 24,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentBadge: {
    backgroundColor: '#E8F8F5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  trustedBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  trustedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  sessionPlatform: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  sessionLocation: {
    fontSize: 13,
    color: '#999',
  },
  sessionDetails: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    width: 90,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  trustButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  trustButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  signOutButton: {
    flex: 1,
    backgroundColor: '#FFE8E8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
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
  },
  securityCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  securityText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 4,
  },
});
