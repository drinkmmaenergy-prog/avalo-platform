/**
 * PACK 95 — Security Sessions Screen
 * UI for viewing and managing active sessions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { auth } from "@/lib/firebase";
import { useSessions } from "@/hooks/useSessions";
import { SessionInfo, sessionSecurityService } from "@/services/sessionSecurityService";

export default function SecuritySessionsScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { sessions, loading, error, refresh, logoutSession, logoutAll, logoutAllLoading } = useSessions(userId);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  /**
   * Handle logout from a specific session
   */
  const handleLogoutSession = (session: SessionInfo) => {
    if (session.isCurrentSession) {
      Alert.alert(
        'Logout Current Session',
        'This will log you out from this device. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              try {
                await logoutSession(session.sessionId);
                // This will log out the current user
                await auth.signOut();
                router.replace('/');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to logout');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Logout Device',
        `Logout from ${session.deviceModel || session.platform}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              try {
                await logoutSession(session.sessionId);
                Alert.alert('Success', 'Device logged out successfully');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to logout device');
              }
            },
          },
        ]
      );
    }
  };

  /**
   * Handle logout from all devices
   */
  const handleLogoutAll = () => {
    Alert.alert(
      'Logout All Devices',
      'This will log you out from all devices except this one. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout All',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutAll(true); // Keep current session
              Alert.alert('Success', 'Logged out from all other devices');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to logout all devices');
            }
          },
        },
      ]
    );
  };

  /**
   * Render a session item
   */
  const renderSessionItem = ({ item }: { item: SessionInfo }) => {
    const deviceInfo = item.deviceModel || item.platform;
    const location = item.ipCountry || 'Unknown location';
    const timeAgo = sessionSecurityService.formatSessionInfo(item);

    return (
      <View style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionIcon}>
            <Text style={styles.sessionIconText}>
              {item.platform === 'android' ? '📱' : item.platform === 'ios' ? '📱' : '💻'}
            </Text>
          </View>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionDevice}>
              {deviceInfo}
              {item.isCurrentSession && (
                <Text style={styles.currentBadge}> • Current</Text>
              )}
            </Text>
            <Text style={styles.sessionLocation}>{location}</Text>
            <Text style={styles.sessionTime}>{timeAgo}</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => handleLogoutSession(item)}
        >
          <Text style={styles.logoutButtonText}>
            {item.isCurrentSession ? 'Logout' : 'Remove'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading sessions...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No active sessions</Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Devices & Sessions',
          headerBackTitle: 'Back',
        }}
      />
      
      <View style={styles.container}>
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            These are devices currently logged into your account. Remove any you don't recognize.
          </Text>
        </View>

        {/* Sessions list */}
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.sessionId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#007AFF"
            />
          }
        />

        {/* Logout all button */}
        {sessions.length > 1 && (
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.logoutAllButton, logoutAllLoading && styles.buttonDisabled]}
              onPress={handleLogoutAll}
              disabled={logoutAllLoading}
            >
              {logoutAllLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.logoutAllButtonText}>
                  Logout From All Other Devices
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  infoBanner: {
    backgroundColor: '#E8F4FD',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D0E8F9',
  },
  infoBannerText: {
    fontSize: 14,
    color: '#1A73E8',
    lineHeight: 20,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  sessionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionIconText: {
    fontSize: 24,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDevice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  currentBadge: {
    fontSize: 14,
    fontWeight: '500',
    color: '#34C759',
  },
  sessionLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  sessionTime: {
    fontSize: 12,
    color: '#999',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  logoutButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  logoutAllButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutAllButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
