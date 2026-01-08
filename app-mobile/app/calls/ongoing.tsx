/**
 * PACK 75 - Ongoing Call Screen
 * 
 * Displays active voice/video call with controls
 * Shows live duration, token cost counter, and call controls
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  SafeAreaView,
  Modal
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  CallSession,
  endCall,
  markCallActive,
  subscribeToCallSession,
  formatCallDuration,
  calculateCallCost
} from "@/services/callService";

export default function OngoingCallScreen() {
  const { callId, mode, otherUserName, otherUserAvatar, tokensPerMinute } = useLocalSearchParams<{
    callId: string;
    mode: 'VOICE' | 'VIDEO';
    otherUserName?: string;
    otherUserAvatar?: string;
    tokensPerMinute: string;
  }>();

  const { t } = useTranslation();
  const { user } = useAuth();
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(mode === 'VIDEO');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasMarkedActive = useRef(false);

  const tokens = tokensPerMinute ? parseInt(tokensPerMinute, 10) : 0;

  useEffect(() => {
    if (!callId || !user?.uid) return;

    // Subscribe to call session updates
    const unsubscribe = subscribeToCallSession(
      callId,
      (session) => {
        setCallSession(session);

        // If call ended, show summary and go back
        if (session.status === 'ENDED' || session.status === 'CANCELLED' || session.status === 'INSUFFICIENT_FUNDS') {
          handleCallEnded(session);
        }

        // Mark call as active when we enter this screen
        if (!hasMarkedActive.current && (session.status === 'ACCEPTED' || session.status === 'ACTIVE')) {
          hasMarkedActive.current = true;
          markCallActive(callId, user.uid).catch(err => {
            console.error('Failed to mark call active:', err);
          });
        }
      },
      (error) => {
        console.error('Call subscription error:', error);
        Alert.alert('Error', 'Lost connection to call');
        router.back();
      }
    );

    return () => unsubscribe();
  }, [callId, user?.uid]);

  useEffect(() => {
    // Start duration timer
    if (callSession?.status === 'ACTIVE') {
      intervalRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          // Calculate estimated cost in real-time
          const cost = calculateCallCost(newDuration, tokens);
          setEstimatedCost(cost);
          return newDuration;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [callSession?.status, tokens]);

  const handleCallEnded = (session: CallSession) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const wasInsufficientFunds = session.status === 'INSUFFICIENT_FUNDS';
    const minutes = session.billedMinutes || 0;
    const charged = session.totalTokensCharged || 0;

    // Show summary
    const message = wasInsufficientFunds
      ? t('call.ended.insufficientFunds')
      : t('call.summary.title');

    const details = `${t('call.summary.duration', { minutes })}\n${t('call.summary.tokensCharged', { tokens: charged })}`;

    setTimeout(() => {
      Alert.alert(message, details, [
        {
          text: t('common.ok'),
          onPress: () => router.back()
        }
      ]);
    }, 500);
  };

  const handleEndCall = () => {
    setShowEndConfirm(true);
  };

  const confirmEndCall = async () => {
    if (!callId || !user?.uid) return;

    setShowEndConfirm(false);

    try {
      await endCall(callId, user.uid);
      // Navigation handled by subscription
    } catch (error: any) {
      console.error('End call error:', error);
      Alert.alert('Error', 'Failed to end call');
      router.back();
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    // TODO: Integrate with actual RTC provider SDK
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    // TODO: Integrate with actual RTC provider SDK
  };

  const toggleCamera = () => {
    if (mode === 'VIDEO') {
      setCameraEnabled(!cameraEnabled);
      // TODO: Integrate with actual RTC provider SDK
    }
  };

  const isVideo = mode === 'VIDEO';
  const isActive = callSession?.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, isVideo ? styles.videoContent : styles.voiceContent]}>
        {/* Top Bar - User Info */}
        <View style={styles.topBar}>
          <View style={styles.userInfo}>
            {otherUserAvatar ? (
              <Image source={{ uri: otherUserAvatar }} style={styles.smallAvatar} />
            ) : (
              <View style={[styles.smallAvatar, styles.avatarPlaceholder]}>
                <MaterialIcons name="person" size={24} color="#fff" />
              </View>
            )}
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{otherUserName || 'User'}</Text>
              <Text style={styles.callStatus}>
                {isActive ? t('calls.callDuration', { duration: formatCallDuration(duration) }) : 'Connecting...'}
              </Text>
            </View>
          </View>
        </View>

        {/* Center - Avatar/Video Placeholder */}
        <View style={styles.centerContent}>
          {isVideo ? (
            <View style={styles.videoContainer}>
              <View style={styles.videoPlaceholder}>
                <MaterialIcons name="videocam" size={64} color="rgba(255,255,255,0.5)" />
                <Text style={styles.videoPlaceholderText}>Video feed placeholder</Text>
                <Text style={styles.videoPlaceholderSubtext}>Integrate RTC provider SDK</Text>
              </View>
            </View>
          ) : (
            <View style={styles.avatarLarge}>
              {otherUserAvatar ? (
                <Image source={{ uri: otherUserAvatar }} style={styles.largeAvatarImage} />
              ) : (
                <View style={[styles.largeAvatarImage, styles.avatarPlaceholder]}>
                  <MaterialIcons name="person" size={80} color="#fff" />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Pricing Info */}
        <View style={styles.pricingBar}>
          <MaterialIcons name="info-outline" size={16} color="#fff" />
          <Text style={styles.pricingText}>
            {tokens} tokens/min • Est. {estimatedCost} tokens
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {/* Mute Toggle */}
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={toggleMute}
          >
            <MaterialIcons 
              name={isMuted ? 'mic-off' : 'mic'} 
              size={28} 
              color="#fff" 
            />
            <Text style={styles.controlLabel}>
              {isMuted ? t('calls.unmute') : t('calls.mute')}
            </Text>
          </TouchableOpacity>

          {/* Speaker Toggle (Voice only) */}
          {!isVideo && (
            <TouchableOpacity
              style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
              onPress={toggleSpeaker}
            >
              <MaterialIcons 
                name={isSpeakerOn ? 'volume-up' : 'volume-down'} 
                size={28} 
                color="#fff" 
              />
              <Text style={styles.controlLabel}>{t('calls.speaker')}</Text>
            </TouchableOpacity>
          )}

          {/* Camera Toggle (Video only) */}
          {isVideo && (
            <TouchableOpacity
              style={[styles.controlButton, !cameraEnabled && styles.controlButtonActive]}
              onPress={toggleCamera}
            >
              <MaterialIcons 
                name={cameraEnabled ? 'videocam' : 'videocam-off'} 
                size={28} 
                color="#fff" 
              />
              <Text style={styles.controlLabel}>{t('calls.camera')}</Text>
            </TouchableOpacity>
          )}

          {/* End Call Button */}
          <TouchableOpacity
            style={styles.endCallButton}
            onPress={handleEndCall}
          >
            <MaterialIcons name="call-end" size={32} color="#fff" />
            <Text style={styles.endCallLabel}>{t('calls.endCall')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* End Call Confirmation Modal */}
      <Modal
        visible={showEndConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <MaterialIcons name="call-end" size={48} color="#ff3b30" />
            <Text style={styles.modalTitle}>End call?</Text>
            <Text style={styles.modalText}>
              You will be charged for {Math.ceil(duration / 60)} minute(s)
            </Text>
            <Text style={styles.modalCost}>
              Approximately {estimatedCost} tokens
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowEndConfirm(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Continue call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={confirmEndCall}
              >
                <Text style={styles.modalButtonTextConfirm}>End call</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  voiceContent: {
    backgroundColor: '#1a1a2e',
  },
  videoContent: {
    backgroundColor: '#000',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  callStatus: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLarge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeAvatarImage: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  videoPlaceholderText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 16,
  },
  videoPlaceholderSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
  },
  pricingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    gap: 8,
  },
  pricingText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
  },
  controlLabel: {
    fontSize: 11,
    color: '#fff',
    marginTop: 6,
    fontWeight: '500',
  },
  endCallButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff3b30',
  },
  endCallLabel: {
    fontSize: 11,
    color: '#fff',
    marginTop: 6,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalCost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff3b30',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F5F5F5',
  },
  modalButtonConfirm: {
    backgroundColor: '#ff3b30',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
