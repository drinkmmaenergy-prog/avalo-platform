/**
 * Call History Screen
 * Display past calls with details
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, or } from 'firebase/firestore';

interface CallHistoryItem {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  otherUserId: string;
  otherUserName: string;
  otherUserPhoto: string | null;
  startedAt: Date;
  durationMinutes: number;
  totalTokens: number;
  isOutgoing: boolean;
  wasEarner: boolean;
  state: 'ACTIVE' | 'ENDED';
}

export default function CallHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.uid) {
      loadCallHistory();
    }
  }, [user?.uid]);

  const loadCallHistory = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      // Query calls where user was either payer or earner
      const callsRef = collection(db, 'calls');
      const q = query(
        callsRef,
        or(
          where('payerId', '==', user.uid),
          where('earnerId', '==', user.uid)
        ),
        orderBy('startedAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const callsData: CallHistoryItem[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Determine other user
        const isPayer = data.payerId === user.uid;
        const otherUserId = isPayer ? data.earnerId : data.payerId;
        
        if (!otherUserId) continue; // Skip if no other user

        // Load other user info
        let otherUserName = 'Użytkownik';
        let otherUserPhoto: string | null = null;

        try {
          const userDoc = await import('firebase/firestore').then((m) => 
            m.getDoc(m.doc(db, 'users', otherUserId))
          );
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            otherUserName = userData.displayName || userData.name || 'Użytkownik';
            if (userData.photos && userData.photos.length > 0) {
              otherUserPhoto = userData.photos[0];
            }
          }
        } catch (error) {
          console.error('Error loading user info:', error);
        }

        callsData.push({
          callId: doc.id,
          callType: data.callType,
          otherUserId,
          otherUserName,
          otherUserPhoto,
          startedAt: data.startedAt?.toDate() || new Date(),
          durationMinutes: data.durationMinutes || 0,
          totalTokens: data.totalTokens || 0,
          isOutgoing: data.payerId === user.uid,
          wasEarner: data.earnerId === user.uid,
          state: data.state,
        });
      }

      setCalls(callsData);
    } catch (error) {
      console.error('Error loading call history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins} min temu`;
    } else if (diffHours < 24) {
      return `${diffHours} godz. temu`;
    } else if (diffDays < 7) {
      return `${diffDays} dni temu`;
    } else {
      return date.toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) {
      return '< 1 min';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins} min`;
  };

  const renderCallItem = ({ item }: { item: CallHistoryItem }) => {
    const callIcon = item.callType === 'VOICE' ? '📞' : '📹';
    const statusText = item.wasEarner
      ? 'Otrzymałeś'
      : item.state === 'ENDED'
      ? 'Ty płaciłeś'
      : 'Nieudane';

    return (
      <TouchableOpacity
        style={styles.callItem}
        onPress={() => {
          // Could navigate to call details or user profile
          router.push(`/profile/${item.otherUserId}` as any);
        }}
      >
        <View style={styles.callItemLeft}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.otherUserPhoto ? (
              <Image
                source={{ uri: item.otherUserPhoto }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {item.otherUserName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.callTypeIconContainer}>
              <Text style={styles.callTypeIcon}>{callIcon}</Text>
            </View>
          </View>

          {/* Call Info */}
          <View style={styles.callInfo}>
            <Text style={styles.callerName}>{item.otherUserName}</Text>
            <View style={styles.callDetails}>
              <Text style={styles.callDate}>{formatDate(item.startedAt)}</Text>
              <Text style={styles.callDuration}>
                • {formatDuration(item.durationMinutes)}
              </Text>
            </View>
          </View>
        </View>

        {/* Status & Cost */}
        <View style={styles.callItemRight}>
          <Text
            style={[
              styles.statusText,
              item.wasEarner && styles.statusEarned,
            ]}
          >
            {statusText}
          </Text>
          {item.state === 'ENDED' && (
            <Text
              style={[
                styles.tokensText,
                item.wasEarner && styles.tokensEarned,
              ]}
            >
              {item.wasEarner ? '+' : '-'}{item.totalTokens} 💎
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Historia połączeń</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#40E0D0" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historia połączeń</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Call List */}
      {calls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📞</Text>
          <Text style={styles.emptyTitle}>Brak połączeń</Text>
          <Text style={styles.emptyText}>
            Tutaj zobaczysz historię swoich połączeń głosowych i wideo
          </Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          renderItem={renderCallItem}
          keyExtractor={(item) => item.callId}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  listContainer: {
    padding: 16,
  },
  callItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  callItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F0F0',
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  callTypeIconContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  callTypeIcon: {
    fontSize: 12,
  },
  callInfo: {
    flex: 1,
  },
  callerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  callDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callDate: {
    fontSize: 14,
    color: '#666',
  },
  callDuration: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  callItemRight: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statusEarned: {
    color: '#4CAF50',
  },
  tokensText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  tokensEarned: {
    color: '#4CAF50',
  },
});
