import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export enum MissionStatus {
  LOCKED = 'LOCKED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CLAIMED = 'CLAIMED',
}

export type MissionType =
  | 'swipes'
  | 'matches'
  | 'messages'
  | 'creator-earnings'
  | 'ppv-sales'
  | 'tips'
  | 'daily-tasks'
  | 'referrals';

export interface CreatorMissionCardProps {
  title: string;
  description?: string;
  rewardTokens: number;
  progress?: number; // 0-1
  status: MissionStatus;
  type: MissionType;
  onPress?: () => void;
}

export default function CreatorMissionCard({
  title,
  description,
  rewardTokens,
  progress = 0,
  status,
  onPress,
}: CreatorMissionCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>

      <View style={styles.bottom}>
        <Text style={styles.reward}>{rewardTokens} tokens</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
        </View>
        <Text style={styles.status}>{status}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0B0C12',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 12,
  },
  top: { marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  description: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  bottom: { flexDirection: 'column' },
  reward: { color: '#22c55e', fontSize: 13, marginBottom: 4 },
  progressTrack: {
    height: 6,
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#1F2937',
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  status: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
