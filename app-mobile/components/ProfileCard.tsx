/**
 * ProfileCard Component
 * Phase 27: Optimized with React.memo and turquoise CTA
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { ProfileData } from '../lib/profileService';

interface ProfileCardProps {
  profile: ProfileData;
  onViewProfile: () => void;
  onSendIcebreaker: () => void;
}

const ProfileCard = memo(({
  profile,
  onViewProfile,
  onSendIcebreaker,
}: ProfileCardProps) => {
  return (
    <View style={styles.container}>
      {/* Card Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={onViewProfile}
        activeOpacity={0.8}
      >
        {/* Profile Photo */}
        {profile.photos && profile.photos.length > 0 ? (
          <Image
            source={{ uri: profile.photos[0] }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.photo, styles.placeholderPhoto]}>
            <Text style={styles.placeholderText}>📷</Text>
          </View>
        )}

        {/* Profile Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.age && <Text style={styles.age}>, {profile.age}</Text>}
          </View>

          {profile.city && (
            <Text style={styles.location}>📍 {profile.city}</Text>
          )}

          {profile.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.interestsRow}>
              {profile.interests.slice(0, 3).map((interest, index) => (
                <View key={index} style={styles.interestBadge}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={onViewProfile}
        >
          <Text style={styles.viewButtonText}>View Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.icebreakerButton}
          onPress={onSendIcebreaker}
        >
          <Text style={styles.icebreakerButtonText}>Send Icebreaker</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    padding: 12,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 12,
  },
  placeholderPhoto: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    opacity: 0.3,
  },
  info: {
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
    color: '#333',
  },
  age: {
    fontSize: 16,
    color: '#666',
  },
  location: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bio: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    lineHeight: 18,
  },
  interestsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  interestBadge: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  interestText: {
    fontSize: 11,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
    padding: 12,
  },
  viewButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  icebreakerButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  icebreakerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
