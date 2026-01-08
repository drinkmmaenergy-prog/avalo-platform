/**
 * PACK 75 - Incoming Call Screen
 * 
 * Displays incoming voice/video call with answer/decline options
 * Shows pricing and safety tip
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  CallSession,
  acceptCall,
  rejectCall,
  subscribeToCallSession
} from "@/services/callService";

export default function IncomingCallScreen() {
  const { callId, callerName, callerAvatar, mode, tokensPerMinute } = useLocalSearchParams<{
    callId: string;
    callerName: string;
    callerAvatar?: string;
    mode: 'VOICE' | 'VIDEO';
    tokensPerMinute: string;
  }>();

  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [callSession, setCallSession] = useState<CallSession | null>(null);

  useEffect(() => {
    if (!callId) return;

    // Subscribe to call session updates
    const unsubscribe = subscribeToCallSession(
      callId,
      (session) => {
        setCallSession(session);

        // If call was cancelled or missed, go back
        if (session.status === 'CANCELLED' || session.status === 'MISSED' || session.status === 'ENDED') {
          router.back();
        }

        // If accepted, navigate to ongoing call screen
        if (session.status === 'ACCEPTED' || session.status === 'ACTIVE') {
          // For now, just go back - full ongoing screen in next step
          router.back();
        }
      },
      (error) => {
        console.error('Call subscription error:', error);
      }
    );

    return () => unsubscribe();
  }, [callId]);

  const handleAccept = async () => {
    if (!callId || !user?.uid || loading) return;

    try {
      setLoading(true);
      await acceptCall(callId, user.uid);
      // Navigation handled by subscription
    } catch (error: any) {
      console.error('Accept call error:', error);
      alert(error.message || 'Failed to accept call');
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!callId || !user?.uid || loading) return;

    try {
      setLoading(true);
      await rejectCall(callId, user.uid);
      router.back();
    } catch (error: any) {
      console.error('Decline call error:', error);
      setLoading(false);
      router.back();
    }
  };

  const isVideo = mode === 'VIDEO';
  const tokens = tokensPerMinute ? parseInt(tokensPerMinute, 10) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.gradient, isVideo ? styles.videoGradient : styles.voiceGradient]}>
        <View style={styles.content}>
          {/* Caller Avatar */}
          <View style={styles.avatarContainer}>
            {callerAvatar ? (
              <Image source={{ uri: callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <MaterialIcons name="person" size={80} color="#fff" />
              </View>
            )}
          </View>

          {/* Caller Name */}
          <Text style={styles.callerName}>{callerName || 'Unknown'}</Text>

          {/* Call Type */}
          <View style={styles.callTypeContainer}>
            <MaterialIcons 
              name={isVideo ? 'videocam' : 'phone'} 
              size={24} 
              color="#fff" 
            />
            <Text style={styles.callType}>
              {isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
            </Text>
          </View>

          {/* Pricing Info */}
          <View style={styles.pricingContainer}>
            <MaterialIcons name="info-outline" size={16} color="#fff" />
            <Text style={styles.pricingText}>
              {t('call.start.confirm.body', { tokensPerMinute: tokens })}
            </Text>
          </View>

          {/* Safety Tip */}
          <View style={styles.safetyContainer}>
            <Text style={styles.safetyText}>
              {t('call.safety.tip')}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Decline Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={handleDecline}
              disabled={loading}
            >
              <MaterialIcons name="call-end" size={32} color="#fff" />
              <Text style={styles.actionButtonText}>{t('calls.decline')}</Text>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <>
                  <MaterialIcons name="call" size={32} color="#fff" />
                  <Text style={styles.actionButtonText}>{t('calls.answer')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  videoGradient: {
    backgroundColor: '#667eea',
  },
  voiceGradient: {
    backgroundColor: '#f093fb',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  callTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  callType: {
    fontSize: 18,
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  },
  pricingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    maxWidth: '90%',
  },
  pricingText: {
    fontSize: 14,
    color: '#fff',
    marginLeft: 8,
    flex: 1,
  },
  safetyContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 32,
    maxWidth: '90%',
  },
  safetyText: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 32,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    marginHorizontal: 16,
  },
  declineButton: {
    backgroundColor: '#ff3b30',
  },
  acceptButton: {
    backgroundColor: '#34c759',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
});
