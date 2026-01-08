/**
 * SuggestedProfileCard Component
 * PACK 36: Smart Suggestions Profile Card
 * Displays profile with compatibility badge and swipe CTA
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SuggestedProfile, SuggestionConfidence } from '../hooks/useSmartSuggestions';

interface SuggestedProfileCardProps {
  profile: SuggestedProfile;
  onSwipeAction: (profileId: string) => Promise<void>;
}

const BADGE_COLORS = {
  top: {
    bg: '#D4AF37',
    text: '#000',
    label: '🎯 Top Pick',
  },
  promising: {
    bg: '#40E0D0',
    text: '#000',
    label: '💫 Promising',
  },
  worth: {
    bg: '#4A90E2',
    text: '#fff',
    label: '👀 Worth Checking',
  },
};

export default function SuggestedProfileCard({ profile, onSwipeAction }: SuggestedProfileCardProps) {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Smooth fade + slide animation on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSwipe = async () => {
    // Small pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Trigger swipe action
    await onSwipeAction(profile.uid);

    // Navigate to swipe screen
    router.push('/(tabs)/swipe' as any);
  };

  const handleProfilePress = () => {
    router.push(`/profile/${profile.uid}` as any);
  };

  const badgeConfig = BADGE_COLORS[profile.confidence];
  const photoUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0] : null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: pulseAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={handleProfilePress}
        activeOpacity={0.9}
      >
        {/* Photo Thumbnail */}
        <View style={styles.photoContainer}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.placeholderPhoto]}>
              <Text style={styles.placeholderText}>📷</Text>
            </View>
          )}

          {/* Compatibility Badge */}
          <View style={[styles.badge, { backgroundColor: badgeConfig.bg }]}>
            <Text style={[styles.badgeText, { color: badgeConfig.text }]}>
              {badgeConfig.label}
            </Text>
          </View>
        </View>

        {/* Profile Info */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.name}
            </Text>
            {profile.age && (
              <Text style={styles.age}>, {profile.age}</Text>
            )}
          </View>

          {profile.city && (
            <Text style={styles.location} numberOfLines={1}>
              📍 {profile.city}
            </Text>
          )}

          {/* Score indicator */}
          <Text style={styles.score}>
            Match Score: {profile.score}%
          </Text>
        </View>
      </TouchableOpacity>

      {/* Swipe CTA Button */}
      <TouchableOpacity
        style={[styles.swipeButton, { backgroundColor: badgeConfig.bg }]}
        onPress={handleSwipe}
        activeOpacity={0.8}
      >
        <Text style={[styles.swipeButtonText, { color: badgeConfig.text }]}>
          ❤️ Like
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 18,
    backgroundColor: '#181818',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  card: {
    flexDirection: 'row',
    padding: 12,
  },
  photoContainer: {
    position: 'relative',
    marginRight: 12,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  placeholderPhoto: {
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 40,
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  age: {
    fontSize: 16,
    color: '#ccc',
    marginLeft: 2,
  },
  location: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 6,
  },
  score: {
    fontSize: 12,
    color: '#D4AF37',
    fontWeight: '600',
  },
  swipeButton: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  swipeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
