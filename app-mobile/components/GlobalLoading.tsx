/**
 * Global Loading Indicator
 * Phase 27: Full-screen and inline loading states
 */

import React from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Text,
} from 'react-native';

interface GlobalLoadingProps {
  visible: boolean;
  message?: string;
  fullScreen?: boolean;
}

export function GlobalLoading({
  visible,
  message,
  fullScreen = true,
}: GlobalLoadingProps) {
  if (!visible) return null;

  const content = (
    <View style={[styles.container, !fullScreen && styles.inline]}>
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#40E0D0" />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </View>
  );

  if (fullScreen) {
    return (
      <Modal
        transparent
        visible={visible}
        animationType="fade"
        statusBarTranslucent
      >
        {content}
      </Modal>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  inline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  loadingBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
});
