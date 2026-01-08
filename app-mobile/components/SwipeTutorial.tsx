/**
 * Swipe Tutorial Overlay
 * First-time tutorial explaining swipe gestures
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';

interface SwipeTutorialProps {
  visible: boolean;
  onClose: () => void;
}

export default function SwipeTutorial({ visible, onClose }: SwipeTutorialProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>How to Swipe</Text>
          
          <View style={styles.gesturesContainer}>
            {/* Swipe Left */}
            <View style={styles.gestureRow}>
              <View style={styles.iconCircle}>
                <Text style={styles.icon}>←</Text>
              </View>
              <View style={styles.gestureInfo}>
                <Text style={styles.gestureName}>Swipe Left</Text>
                <Text style={styles.gestureDesc}>Skip this profile</Text>
              </View>
            </View>

            {/* Swipe Right */}
            <View style={styles.gestureRow}>
              <View style={[styles.iconCircle, styles.likeCircle]}>
                <Text style={styles.icon}>→</Text>
              </View>
              <View style={styles.gestureInfo}>
                <Text style={styles.gestureName}>Swipe Right</Text>
                <Text style={styles.gestureDesc}>Like this person</Text>
              </View>
            </View>

            {/* Swipe Up */}
            <View style={styles.gestureRow}>
              <View style={[styles.iconCircle, styles.superCircle]}>
                <Text style={styles.icon}>↑</Text>
              </View>
              <View style={styles.gestureInfo}>
                <Text style={styles.gestureName}>Swipe Up (SuperLike)</Text>
                <Text style={styles.gestureDesc}>Send a SuperLike for 50 tokens</Text>
              </View>
            </View>

            {/* Tap to View */}
            <View style={styles.gestureRow}>
              <View style={styles.iconCircle}>
                <Text style={styles.icon}>👆</Text>
              </View>
              <View style={styles.gestureInfo}>
                <Text style={styles.gestureName}>Tap Card</Text>
                <Text style={styles.gestureDesc}>View full profile</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.gotItButton}
            onPress={onClose}
          >
            <Text style={styles.gotItText}>Got it!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  gesturesContainer: {
    gap: 20,
    marginBottom: 24,
  },
  gestureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeCircle: {
    backgroundColor: '#FFE5E5',
  },
  superCircle: {
    backgroundColor: '#E3F2FD',
  },
  icon: {
    fontSize: 28,
  },
  gestureInfo: {
    flex: 1,
  },
  gestureName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  gestureDesc: {
    fontSize: 14,
    color: '#666',
  },
  gotItButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  gotItText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
