/**
 * Sponsored Post Component - Phase 18
 * Instagram-style native feed ad
 * Used for: Standard users (every 7 posts), VIP/Royal (configurable)
 */

import React, { useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Linking } from 'react-native';

interface SponsoredPostProps {
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

export default function SponsoredPost({
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
}: SponsoredPostProps) {
  // Register impression on mount
  useEffect(() => {
    onImpression(campaignId);
  }, [campaignId, onImpression]);

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

  return (
    <View style={styles.container}>
      {/* Header (Instagram-style) */}
      <View style={styles.header}>
        <View style={styles.brandInfo}>
          <View style={styles.brandIconPlaceholder}>
            <Text style={styles.brandIconText}>{brandName[0]}</Text>
          </View>
          <View style={styles.brandDetails}>
            <Text style={styles.brandName}>{brandName}</Text>
            <Text style={styles.sponsoredLabel}>Sponsored</Text>
          </View>
        </View>
      </View>

      {/* Main image */}
      <Image 
        source={{ uri: imageUrl }} 
        style={styles.image}
        resizeMode="cover"
      />

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
        
        {/* CTA */}
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
    marginVertical: 8,
    borderRadius: 0, // Instagram-style no border radius on main container
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  brandInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  brandIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  brandDetails: {
    flex: 1,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  sponsoredLabel: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  image: {
    width: '100%',
    height: 320,
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 18,
    marginBottom: 12,
  },
  ctaButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  ctaText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
