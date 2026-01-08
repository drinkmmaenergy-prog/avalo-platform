/**
 * PACK 250 - Post-Purchase Success Modal
 * "Say Something Now" CTA - Drives conversion from media purchase to paid chat
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';

interface PaidMediaPurchaseSuccessProps {
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  productTitle: string;
  productType: string;
  onDismiss: () => void;
}

export function PaidMediaPurchaseSuccess({
  creatorId,
  creatorName,
  creatorAvatar,
  productTitle,
  productType,
  onDismiss,
}: PaidMediaPurchaseSuccessProps) {
  
  const handleStartChat = () => {
    onDismiss();
    // Deep link to paid chat with the creator
    router.push(`/chat/${creatorId}` as any);
  };
  
  const handleViewContent = () => {
    onDismiss();
    // User can now view the purchased content
  };
  
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        
        {/* Title */}
        <Text style={styles.title}>Unlocked!</Text>
        <Text style={styles.subtitle}>
          You now have lifetime access to "{productTitle}"
        </Text>
        
        {/* Creator Info */}
        <View style={styles.creatorCard}>
          <Image 
            source={{ uri: creatorAvatar }} 
            style={styles.creatorAvatar}
          />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorLabel}>From</Text>
            <Text style={styles.creatorName}>{creatorName}</Text>
          </View>
        </View>
        
        {/* Call to Action */}
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaTitle}>
            💬 Say something to {creatorName} now
          </Text>
          <Text style={styles.ctaSubtitle}>
            She'll see you purchased her content
          </Text>
          
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleStartChat}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              Start Paid Chat
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleViewContent}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              View Content
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Dismiss */}
        <TouchableOpacity 
          style={styles.dismissButton}
          onPress={onDismiss}
        >
          <Text style={styles.dismissText}>Maybe Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  modal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 48,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorLabel: {
    fontSize: 12,
    color: '#808080',
    marginBottom: 4,
  },
  creatorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ctaContainer: {
    width: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: 14,
    color: '#BFDBFE',
    marginBottom: 20,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563EB',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dismissButton: {
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 14,
    color: '#808080',
    textAlign: 'center',
  },
});
