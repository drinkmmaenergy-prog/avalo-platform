/**
 * Sponsored Card Component - Phase 18
 * For displaying sponsored ads in swipe/discovery
 * Used for: VIP/Royal luxury brand placements (Tinder-style)
 */

import React, { useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';

interface SponsoredCardProps {
  campaignId: string;
  impressionId?: string;
  title: string;
  description: string;
  imageUrl: string;
  brandName: string;
  callToAction: string;
  targetUrl?: string;
  onImpression: (campaignId: string) => void;
  onClick: (campaignId: string, impressionId: string) => void;
}

export default function SponsoredCard({
  campaignId,
  impressionId,
  title,
  description,
  imageUrl,
  brandName,
  callToAction,
  targetUrl,
  onImpression,
  onClick,
}: SponsoredCardProps) {
  // Register impression on mount
  useEffect(() => {
    onImpression(campaignId);
  }, [campaignId, onImpression]);

  const handleClick = () => {
    if (impressionId) {
      onClick(campaignId, impressionId);
    }
    
    // Open target URL if provided
    if (targetUrl) {
      Linking.openURL(targetUrl).catch(err => 
        console.error('Failed to open URL:', err)
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Sponsored badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Sponsored</Text>
      </View>

      {/* Ad image */}
      <Image 
        source={{ uri: imageUrl }} 
        style={styles.image}
        resizeMode="cover"
      />

      {/* Ad content */}
      <View style={styles.content}>
        <Text style={styles.brandName}>{brandName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>

        {/* CTA button */}
        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={handleClick}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>{callToAction}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginVertical: 8,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  image: {
    width: '100%',
    height: 280,
  },
  content: {
    padding: 16,
  },
  brandName: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 14,
  },
  ctaButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
