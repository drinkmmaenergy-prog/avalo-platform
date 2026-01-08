/**
 * Academy Completion Modal Component
 * Shows congratulations when user completes all Academy modules
 * Allows them to claim their 50 token reward
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

interface AcademyCompletionModalProps {
  visible: boolean;
  onClaim: () => void;
  onClose: () => void;
  claiming: boolean;
  alreadyClaimed: boolean;
}

export default function AcademyCompletionModal({
  visible,
  onClaim,
  onClose,
  claiming,
  alreadyClaimed,
}: AcademyCompletionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.emoji}>🎓</Text>
          <Text style={styles.title}>Congratulations!</Text>
          <Text style={styles.subtitle}>
            You are now certified as an Avalo Creator
          </Text>

          <View style={styles.rewardBox}>
            <Text style={styles.rewardIcon}>💎</Text>
            <Text style={styles.rewardText}>50 Tokens Reward</Text>
            <Text style={styles.rewardSubtext}>
              Plus "Academy" badge on your profile
            </Text>
          </View>

          {alreadyClaimed ? (
            <View style={styles.claimedContainer}>
              <Text style={styles.claimedText}>✓ Reward Already Claimed</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.claimButton, claiming && styles.claimButtonDisabled]}
              onPress={onClaim}
              disabled={claiming}
            >
              {claiming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.claimButtonText}>Claim 50 Tokens</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            disabled={claiming}
          >
            <Text style={styles.closeButtonText}>
              {alreadyClaimed ? 'Close' : 'Claim Later'}
            </Text>
          </TouchableOpacity>

          <View style={styles.achievementContainer}>
            <Text style={styles.achievementTitle}>What You've Mastered:</Text>
            <View style={styles.achievementList}>
              <Text style={styles.achievementItem}>✓ Earn-to-Chat strategies</Text>
              <Text style={styles.achievementItem}>✓ AI Companion monetization</Text>
              <Text style={styles.achievementItem}>✓ LIVE streaming techniques</Text>
              <Text style={styles.achievementItem}>✓ Drops marketplace tactics</Text>
              <Text style={styles.achievementItem}>✓ Growth missions & ranking</Text>
              <Text style={styles.achievementItem}>✓ Tips & ads optimization</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  emoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  rewardBox: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  rewardIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  rewardText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#40E0D0',
    marginBottom: 4,
  },
  rewardSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  claimButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  claimedContainer: {
    backgroundColor: '#2A4A2A',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  claimedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  closeButton: {
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 15,
    color: '#999',
  },
  achievementContainer: {
    marginTop: 24,
    width: '100%',
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  achievementList: {
    gap: 8,
  },
  achievementItem: {
    fontSize: 13,
    color: '#999',
    lineHeight: 20,
  },
});
