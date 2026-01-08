/**
 * Create LIVE Screen
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 * 
 * Creator LIVE setup screen: choose entry fee and start LIVE.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { createLive, ENTRY_FEE_PRESETS } from "@/services/liveService";

export default function CreateLiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [selectedFee, setSelectedFee] = useState<number>(25);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleStartLive = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to start a LIVE');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for your LIVE stream');
      return;
    }

    try {
      setIsCreating(true);

      // Create LIVE session
      const session = await createLive(
        user.uid,
        'Creator', // Will be replaced with actual profile name in production
        title.trim(),
        selectedFee
      );

      // Navigate to LIVE room
      router.replace(`/live/${session.liveId}` as any);
    } catch (error) {
      console.error('Error creating LIVE:', error);
      Alert.alert('Error', 'Failed to start LIVE. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🎥</Text>
          <Text style={styles.headerTitle}>Setup Your LIVE</Text>
          <Text style={styles.headerSubtitle}>
            Configure your stream settings before going live
          </Text>
        </View>

        {/* Title Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Stream Title *</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Give your LIVE a catchy title..."
            placeholderTextColor="#666666"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            autoFocus
          />
          <Text style={styles.characterCount}>
            {title.length}/100 characters
          </Text>
        </View>

        {/* Entry Fee Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Entry Fee</Text>
          <Text style={styles.sectionDescription}>
            Set the token price for viewers to join your stream
          </Text>
          
          <View style={styles.presetGrid}>
            {ENTRY_FEE_PRESETS.map((fee) => (
              <TouchableOpacity
                key={fee}
                style={[
                  styles.presetButton,
                  selectedFee === fee && styles.presetButtonSelected,
                ]}
                onPress={() => setSelectedFee(fee)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetAmount,
                    selectedFee === fee && styles.presetAmountSelected,
                  ]}
                >
                  {fee}
                </Text>
                <Text
                  style={[
                    styles.presetLabel,
                    selectedFee === fee && styles.presetLabelSelected,
                  ]}
                >
                  tokens
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Revenue Preview */}
          <View style={styles.revenuePreview}>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Per viewer entry:</Text>
              <Text style={styles.revenueValue}>{selectedFee} tokens</Text>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Your share (65%):</Text>
              <Text style={styles.revenueValueGold}>
                {Math.round(selectedFee * 0.65)} tokens
              </Text>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Platform fee (35%):</Text>
              <Text style={styles.revenueValueMuted}>
                {Math.round(selectedFee * 0.35)} tokens
              </Text>
            </View>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>💎</Text>
            <Text style={styles.infoTitle}>VIP Discount</Text>
            <Text style={styles.infoText}>
              VIP subscribers get 20% off, but entry is never completely free
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>⏱️</Text>
            <Text style={styles.infoTitle}>Session-Based Access</Text>
            <Text style={styles.infoText}>
              Each viewer must pay separately. Access ends when stream ends
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>💰</Text>
            <Text style={styles.infoTitle}>Instant Earnings</Text>
            <Text style={styles.infoText}>
              You receive 65% of each entry fee immediately in your wallet
            </Text>
          </View>
        </View>

        {/* Quick Tips */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>💡 Quick Tips</Text>
          <Text style={styles.tip}>• Choose a clear, engaging title</Text>
          <Text style={styles.tip}>• Lower fees = more viewers</Text>
          <Text style={styles.tip}>• Higher fees = more revenue per viewer</Text>
          <Text style={styles.tip}>• Test different prices to find your sweet spot</Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.startButton,
            (!title.trim() || isCreating) && styles.startButtonDisabled,
          ]}
          onPress={handleStartLive}
          disabled={!title.trim() || isCreating}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>
            {isCreating ? 'Starting...' : '🔴 Start LIVE'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#AAAAAA',
    marginBottom: 16,
  },
  titleInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#333333',
  },
  characterCount: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  presetButton: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  presetButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  presetAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  presetAmountSelected: {
    color: '#0F0F0F',
  },
  presetLabel: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  presetLabelSelected: {
    color: '#0F0F0F',
  },
  revenuePreview: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  revenueLabel: {
    fontSize: 13,
    color: '#AAAAAA',
  },
  revenueValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  revenueValueGold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  revenueValueMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  infoSection: {
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  infoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#AAAAAA',
    lineHeight: 18,
  },
  tipsSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  tip: {
    fontSize: 12,
    color: '#AAAAAA',
    lineHeight: 20,
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#AAAAAA',
  },
  startButton: {
    flex: 2,
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
