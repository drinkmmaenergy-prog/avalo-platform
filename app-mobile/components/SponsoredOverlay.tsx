/**
 * Sponsored Overlay Component - Phase 18
 * TikTok-style overlay for LIVE rooms
 * Shows brand logo + optional branded gift animations
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Linking } from 'react-native';

interface SponsoredOverlayProps {
  campaignId: string;
  impressionId?: string;
  brandName: string;
  imageUrl: string;
  targetUrl?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onImpression: (campaignId: string) => void;
  onClick: (campaignId: string, impressionId: string) => void;
}

export default function SponsoredOverlay({
  campaignId,
  impressionId,
  brandName,
  imageUrl,
  targetUrl,
  position = 'top-right',
  onImpression,
  onClick,
}: SponsoredOverlayProps) {
  const [fadeAnim] = useState(new Animated.Value(0));

  // Register impression on mount
  useEffect(() => {
    onImpression(campaignId);
    
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [campaignId, onImpression, fadeAnim]);

  const handleClick = () => {
    if (impressionId) {
      onClick(campaignId, impressionId);
    }
    
    if (targetUrl) {
      Linking.openURL(targetUrl).catch(err => 
        console.error('Failed to open URL:', err)
      );
    }
  };

  const getPositionStyle = () => {
    switch (position) {
      case 'top-left':
        return { top: 60, left: 16 };
      case 'top-right':
        return { top: 60, right: 16 };
      case 'bottom-left':
        return { bottom: 100, left: 16 };
      case 'bottom-right':
        return { bottom: 100, right: 16 };
      default:
        return { top: 60, right: 16 };
    }
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        getPositionStyle(),
        { opacity: fadeAnim }
      ]}
    >
      <TouchableOpacity 
        style={styles.overlay}
        onPress={handleClick}
        activeOpacity={0.8}
      >
        {/* Brand logo */}
        <Image 
          source={{ uri: imageUrl }} 
          style={styles.brandLogo}
          resizeMode="contain"
        />
        
        {/* Sponsored label */}
        <View style={styles.labelContainer}>
          <Text style={styles.sponsoredText}>Sponsored</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 100,
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  brandLogo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 4,
  },
  labelContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sponsoredText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
