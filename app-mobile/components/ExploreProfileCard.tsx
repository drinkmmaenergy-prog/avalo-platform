import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { ProfileData } from '../lib/profileService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with padding

interface ExploreProfileCardProps {
  profile: ProfileData;
  onPress: () => void;
  showBoostBadge?: boolean;
  showCreatorBadge?: boolean;
  showLiveBadge?: boolean;
  showPPVBadge?: boolean;
  showAIBadge?: boolean;
}

export const ExploreProfileCard: React.FC<ExploreProfileCardProps> = ({
  profile,
  onPress,
  showBoostBadge = false,
  showCreatorBadge = false,
  showLiveBadge = false,
  showPPVBadge = false,
  showAIBadge = false,
}) => {
  const mainPhoto = profile.photos && profile.photos.length > 0 ? profile.photos[0] : null;

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Photo */}
      {mainPhoto ? (
        <Image
          source={{ uri: mainPhoto }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.photo, styles.placeholderPhoto]}>
          <Text style={styles.placeholderText}>📷</Text>
        </View>
      )}

      {/* Top badges row */}
      <View style={styles.topBadges}>
        {showBoostBadge && (
          <View style={[styles.badge, styles.boostBadge]}>
            <Text style={styles.badgeText}>⚡</Text>
          </View>
        )}
        {showCreatorBadge && (
          <View style={[styles.badge, styles.creatorBadge]}>
            <Text style={styles.badgeText}>💎</Text>
          </View>
        )}
      </View>

      {/* Bottom info overlay */}
      <View style={styles.infoOverlay}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.name}
          </Text>
          {profile.age && (
            <Text style={styles.age}>, {profile.age}</Text>
          )}
        </View>

        {profile.city && (
          <Text style={styles.city} numberOfLines={1}>
            📍 {profile.city}
          </Text>
        )}

        {/* Feature chips */}
        <View style={styles.chipsRow}>
          {showLiveBadge && (
            <View style={[styles.chip, styles.liveChip]}>
              <Text style={styles.chipText}>LIVE</Text>
            </View>
          )}
          {showPPVBadge && (
            <View style={[styles.chip, styles.ppvChip]}>
              <Text style={styles.chipText}>PPV</Text>
            </View>
          )}
          {showAIBadge && (
            <View style={[styles.chip, styles.aiChip]}>
              <Text style={styles.chipText}>AI</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.4,
    backgroundColor: '#181818',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  placeholderPhoto: {
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    opacity: 0.3,
  },
  topBadges: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boostBadge: {
    backgroundColor: '#40E0D0',
  },
  creatorBadge: {
    backgroundColor: '#D4AF37',
  },
  badgeText: {
    fontSize: 14,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  age: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  city: {
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveChip: {
    backgroundColor: '#40E0D0',
  },
  ppvChip: {
    backgroundColor: '#40E0D0',
  },
  aiChip: {
    backgroundColor: '#40E0D0',
  },
  chipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
