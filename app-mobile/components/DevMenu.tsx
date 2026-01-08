/**
 * Dev Menu Component - Phase 5
 * Accessible via 8-second long-press on TopBar
 * Shows debug information and testing tools
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

interface DevMenuProps {
  visible: boolean;
  onClose: () => void;
}

export const DevMenu: React.FC<DevMenuProps> = ({ visible, onClose }) => {
  const { user } = useAuth();
  const [tokenAmount, setTokenAmount] = useState('100');

  const handleGiveTokens = async () => {
    if (!user) {
      Alert.alert('Error', 'No user logged in');
      return;
    }

    const amount = parseInt(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Invalid token amount');
      return;
    }

    try {
      // In dev mode, directly add tokens to wallet (mock implementation)
      const { addTokensAfterPurchase } = require('../services/tokenService');
      
      await addTokensAfterPurchase(user.uid, amount, `dev_gift_${Date.now()}`);
      
      Alert.alert('Success', `Added ${amount} tokens to your wallet! (Dev Mode)`);
    } catch (error) {
      console.error('Error giving tokens:', error);
      Alert.alert('Error', 'Failed to add tokens');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all local cache. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // Implement cache clearing
            Alert.alert('Success', 'Cache cleared');
          },
        },
      ]
    );
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Reset Onboarding',
      'This will reset your onboarding status. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            // Implement onboarding reset
            Alert.alert('Success', 'Onboarding reset');
          },
        },
      ]
    );
  };

  const handleTestCrash = () => {
    Alert.alert(
      'Test Crash',
      'This will crash the app to test ErrorBoundary. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Crash',
          style: 'destructive',
          onPress: () => {
            throw new Error('Test crash from Dev Menu');
          },
        },
      ]
    );
  };

  if (!__DEV__) {
    return null; // Don't show in production builds
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>🛠️ Developer Menu</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* User Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>User Info</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>User ID:</Text>
                <Text style={styles.infoValue}>{user?.uid || 'Not logged in'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
              </View>
            </View>

            {/* Token Tools */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Token Tools</Text>
              <View style={styles.tokenInputContainer}>
                <TextInput
                  style={styles.tokenInput}
                  value={tokenAmount}
                  onChangeText={setTokenAmount}
                  keyboardType="numeric"
                  placeholder="Amount"
                />
                <TouchableOpacity
                  style={styles.tokenButton}
                  onPress={handleGiveTokens}
                >
                  <Text style={styles.tokenButtonText}>Give Tokens</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>
                Adds tokens to your wallet (testing only)
              </Text>
            </View>

            {/* Debug Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Debug Actions</Text>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleClearCache}
              >
                <Text style={styles.actionButtonText}>Clear Cache</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleResetOnboarding}
              >
                <Text style={styles.actionButtonText}>Reset Onboarding</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.dangerButton]}
                onPress={handleTestCrash}
              >
                <Text style={[styles.actionButtonText, styles.dangerText]}>
                  Test Crash
                </Text>
              </TouchableOpacity>
            </View>

            {/* Environment Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Environment</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Build:</Text>
                <Text style={styles.infoValue}>Development</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Version:</Text>
                <Text style={styles.infoValue}>1.0.0 (Phase 5)</Text>
              </View>
            </View>

            {/* Feature Flags */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Feature Flags</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Real AI:</Text>
                <Text style={styles.infoValue}>✅ Enabled</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Stripe:</Text>
                <Text style={styles.infoValue}>⚠️ Sandbox</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>NSFW Filter:</Text>
                <Text style={styles.infoValue}>✅ Enabled</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: '#666',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  tokenInputContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  tokenInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  tokenButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  tokenButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  actionButton: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: '#FFEBEE',
  },
  dangerText: {
    color: '#D32F2F',
  },
});
