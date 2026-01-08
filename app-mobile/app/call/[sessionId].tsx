/**
 * In-Call Screen
 * Active call interface with controls, timer, and token info
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  endCall,
  updateCallActivity,
  formatCallDuration,
  calculateEstimatedCost,
} from '../../services/callService';
import { getTokenBalance } from '../../services/tokenService';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type CallState = 'CONNECTING' | 'CONNECTED' | 'ENDED';

interface CallData {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  payerId: string;
  earnerId: string | null;
  pricePerMinute: number;
  state: 'ACTIVE' | 'ENDED';
  startedAt: any;
}

export default function CallScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [callState, setCallState] = useState<CallState>('CONNECTING');
  const [callData, setCallData] = useState<CallData | null>(null);
  const [otherUserName, setOtherUserName] = useState<string>('Użytkownik');
  const [otherUserPhoto, setOtherUserPhoto] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activityRef = useRef<NodeJS.Timeout | null>(null);
  const callDataUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sessionId || !user?.uid) {
      Alert.alert('Błąd', 'Nieprawidłowe połączenie');
      router.back();
      return;
    }

    // Subscribe to call data
    const callRef = doc(db, 'calls', sessionId);
    const unsubscribe = onSnapshot(
      callRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          Alert.alert('Błąd', 'Połączenie nie istnieje');
          router.back();
          return;
        }

        const data = snapshot.data() as CallData;
        setCallData(data);

        // If call ended by other party
        if (data.state === 'ENDED' && callState !== 'ENDED') {
          handleCallEnded();
        }

        // Determine other user
        const otherUserId = data.payerId === user.uid ? data.earnerId : data.payerId;
        if (otherUserId) {
          loadOtherUserInfo(otherUserId);
        }

        // Move to connected state
        if (callState === 'CONNECTING') {
          setCallState('CONNECTED');
        }
      },
      (error) => {
        console.error('Error subscribing to call:', error);
        Alert.alert('Błąd', 'Nie udało się połączyć');
        router.back();
      }
    );

    callDataUnsubscribeRef.current = unsubscribe;

    return () => {
      if (callDataUnsubscribeRef.current) {
        callDataUnsubscribeRef.current();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (activityRef.current) {
        clearInterval(activityRef.current);
      }
    };
  }, [sessionId, user?.uid]);

  useEffect(() => {
    if (callState === 'CONNECTED' && callData) {
      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start activity heartbeat (every 2 minutes)
      activityRef.current = setInterval(() => {
        if (sessionId) {
          updateCallActivity(sessionId).catch((error) => {
            console.error('Error updating activity:', error);
          });
        }
      }, 120000);

      // Load initial balance
      if (user?.uid) {
        loadTokenBalance();
      }

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        if (activityRef.current) {
          clearInterval(activityRef.current);
        }
      };
    }
  }, [callState, callData]);

  // Check balance every 30 seconds
  useEffect(() => {
    if (callState === 'CONNECTED' && user?.uid) {
      const balanceInterval = setInterval(() => {
        loadTokenBalance();
      }, 30000);

      return () => clearInterval(balanceInterval);
    }
  }, [callState, user?.uid]);

  // Check if balance is too low
  useEffect(() => {
    if (callData && tokenBalance > 0) {
      const currentMinutes = Math.ceil(elapsedSeconds / 60);
      const estimatedCost = calculateEstimatedCost(currentMinutes, callData.pricePerMinute);
      const remainingBalance = tokenBalance - estimatedCost;

      // If balance will run out soon (less than 1 minute worth)
      if (remainingBalance < callData.pricePerMinute && callState === 'CONNECTED') {
        Alert.alert(
          'Za mało tokenów',
          'Skończyły Ci się tokeny. Połączenie zostanie zakończone.',
          [{ text: 'OK', onPress: handleEndCall }]
        );
      }
    }
  }, [elapsedSeconds, tokenBalance, callData]);

  const loadTokenBalance = async () => {
    if (!user?.uid) return;
    try {
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const loadOtherUserInfo = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await import('firebase/firestore').then((m) => m.getDoc(userRef));
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        setOtherUserName(userData.displayName || userData.name || 'Użytkownik');
        if (userData.photos && userData.photos.length > 0) {
          setOtherUserPhoto(userData.photos[0]);
        }
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const handleCallEnded = () => {
    setCallState('ENDED');
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (activityRef.current) {
      clearInterval(activityRef.current);
    }

    setTimeout(() => {
      router.back();
    }, 2000);
  };

  const handleEndCall = async () => {
    if (!sessionId || !user?.uid || isEnding) return;

    setIsEnding(true);

    try {
      await endCall(sessionId, user.uid);
      
      Alert.alert(
        'Połączenie zakończone',
        `Czas trwania: ${formatCallDuration(elapsedSeconds)}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error ending call:', error);
      
      if (error.message?.includes('already ended')) {
        router.back();
      } else {
        Alert.alert('Błąd', 'Nie udało się zakończyć połączenia. Spróbuj ponownie.');
        setIsEnding(false);
      }
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    // TODO: Integrate with actual audio/video SDK
  };

  const toggleCamera = () => {
    setIsCameraOff(!isCameraOff);
    // TODO: Integrate with actual video SDK
  };

  const estimatedMinutesRemaining = callData
    ? Math.floor(tokenBalance / callData.pricePerMinute)
    : 0;

  const callTypeLabel = callData?.callType === 'VOICE' ? 'Głosowe' : 'Wideo';

  if (callState === 'CONNECTING') {
    return (
      <View style={styles.container}>
        <View style={styles.connectingContainer}>
          <ActivityIndicator size="large" color="#40E0D0" />
          <Text style={styles.connectingText}>Łączenie...</Text>
        </View>
      </View>
    );
  }

  if (callState === 'ENDED') {
    return (
      <View style={styles.container}>
        <View style={styles.endedContainer}>
          <Text style={styles.endedIcon}>📞</Text>
          <Text style={styles.endedText}>Połączenie zakończone</Text>
          <Text style={styles.endedDuration}>{formatCallDuration(elapsedSeconds)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* User Info */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {otherUserPhoto ? (
            <Image source={{ uri: otherUserPhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {otherUserName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.userName}>{otherUserName}</Text>
        <View style={styles.callTypeTag}>
          <Text style={styles.callTypeText}>{callTypeLabel}</Text>
        </View>
      </View>

      {/* Timer and Status */}
      <View style={styles.statusSection}>
        <Text style={styles.statusLabel}>Połączono</Text>
        <Text style={styles.timer}>{formatCallDuration(elapsedSeconds)}</Text>
      </View>

      {/* Token Info */}
      <View style={styles.tokenSection}>
        <View style={styles.tokenRow}>
          <Text style={styles.tokenLabel}>Twoje saldo:</Text>
          <Text style={styles.tokenValue}>{tokenBalance} tokenów</Text>
        </View>
        <View style={styles.tokenRow}>
          <Text style={styles.tokenLabel}>Szacunkowy pozostały czas:</Text>
          <Text style={styles.tokenValue}>~{estimatedMinutesRemaining} min</Text>
        </View>
        {callData && (
          <View style={styles.tokenRow}>
            <Text style={styles.tokenLabelSmall}>
              Koszt: {callData.pricePerMinute} tokenów/min
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
          <Text style={styles.controlLabel}>
            {isMuted ? 'Wyciszony' : 'Mikrofon'}
          </Text>
        </TouchableOpacity>

        {callData?.callType === 'VIDEO' && (
          <TouchableOpacity
            style={[styles.controlButton, isCameraOff && styles.controlButtonActive]}
            onPress={toggleCamera}
          >
            <Text style={styles.controlIcon}>{isCameraOff ? '📷' : '📹'}</Text>
            <Text style={styles.controlLabel}>
              {isCameraOff ? 'Kamera wył.' : 'Kamera'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* End Call Button */}
      <View style={styles.endCallContainer}>
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={handleEndCall}
          disabled={isEnding}
        >
          {isEnding ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.endCallIcon}>📞</Text>
              <Text style={styles.endCallText}>Zakończ połączenie</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  connectingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
  },
  endedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endedIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  endedText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  endedDuration: {
    fontSize: 18,
    color: '#999',
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
  },
  avatarContainer: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  callTypeTag: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(64, 224, 208, 0.2)',
  },
  callTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
  statusSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusLabel: {
    fontSize: 16,
    color: '#999',
    marginBottom: 8,
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  tokenSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 40,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tokenLabel: {
    fontSize: 16,
    color: '#999',
  },
  tokenValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tokenLabelSmall: {
    fontSize: 14,
    color: '#666',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 60,
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
  },
  controlIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  controlLabel: {
    fontSize: 12,
    color: '#fff',
  },
  endCallContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
  },
  endCallButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 18,
    borderRadius: 30,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  endCallIcon: {
    fontSize: 24,
    transform: [{ rotate: '135deg' }],
  },
  endCallText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});