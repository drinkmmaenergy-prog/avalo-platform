/**
 * Season Pass Ribbon Component
 * 
 * Displayed on creator profiles to show:
 * - Active season information
 * - User's current progress
 * - Time remaining
 * - Join/Continue CTA
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../contexts/AuthContext';
import seasonPassService, {
  Season,
  UserSeasonProgress,
  getTimeRemaining,
  calculateProgressPercentage,
  getNextTierInfo,
} from '../services/seasonPassService';

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  white: '#FFFFFF',
  lightGray: '#CCCCCC',
};

interface SeasonPassRibbonProps {
  creatorId: string;
  onPress: () => void;
}

export default function SeasonPassRibbon({
  creatorId,
  onPress,
}: SeasonPassRibbonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [progress, setProgress] = useState<UserSeasonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [shineAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    loadSeasonData();

    // Refresh every minute to update time
    const interval = setInterval(loadSeasonData, 60000);
    return () => clearInterval(interval);
  }, [creatorId, user?.uid]);

  useEffect(() => {
    if (season) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Shine animation
      Animated.loop(
        Animated.timing(shineAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [season]);

  const loadSeasonData = async () => {
    try {
      setLoading(true);
      
      // Check for active season
      const activeSeason = await seasonPassService.getSeason(creatorId);
      
      if (!activeSeason || activeSeason.status !== 'active') {
        setSeason(null);
        setProgress(null);
        return;
      }

      setSeason(activeSeason);

      // Load user progress if logged in
      if (user?.uid) {
        const userProgress = await seasonPassService.getUserProgress(
          creatorId,
          user.uid
        );
        setProgress(userProgress);
      }
    } catch (error) {
      console.error('Error loading season data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
  }) => {
    if (timeRemaining.days > 0) {
      return t('seasonPass.daysLeftShort', { days: timeRemaining.days });
    }
    if (timeRemaining.hours > 0) {
      return t('seasonPass.hoursLeftShort', { hours: timeRemaining.hours });
    }
    return t('seasonPass.minutesLeftShort', { minutes: timeRemaining.minutes });
  };

  if (loading || !season) {
    return null;
  }

  const timeRemaining = getTimeRemaining(season);
  const isParticipating = !!progress;
  const progressPercentage = progress
    ? calculateProgressPercentage(progress.totalPoints, season.tiers)
    : 0;
  const nextTier = progress
    ? getNextTierInfo(progress.totalPoints, season.tiers)
    : null;

  const shineTranslateX = shineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 300],
  });

  return (
    <Animated.View style={[styles.ribbon, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        style={styles.ribbonContent}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Shine effect */}
        <Animated.View
          style={[
            styles.shineEffect,
            {
              transform: [{ translateX: shineTranslateX }],
            },
          ]}
        />

        <View style={styles.leftSection}>
          <View style={styles.seasonIcon}>
            <Text style={styles.seasonEmoji}>🏆</Text>
          </View>
          
          <View style={styles.textContainer}>
            <View style={styles.seasonHeader}>
              <Text style={styles.seasonBadge}>
                {t('seasonPass.seasonActive')}
              </Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            
            <Text style={styles.seasonName} numberOfLines={1}>
              {season.name}
            </Text>
            
            {isParticipating && progress ? (
              <View style={styles.progressInfo}>
                <Text style={styles.progressText}>
                  {t('seasonPass.level')} {progress.currentTier}/{season.tiers.length}
                </Text>
                <Text style={styles.pointsText}>
                  {progress.totalPoints} {t('seasonPass.points')}
                </Text>
              </View>
            ) : (
              <Text style={styles.participantsText}>
                {season.participantCount} {t('seasonPass.participating')}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightSection}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>{t('seasonPass.endsIn')}</Text>
            <Text style={styles.timeValue}>
              {formatTimeRemaining(timeRemaining)}
            </Text>
          </View>

          {isParticipating && progress ? (
            <View style={styles.continueButton}>
              <Text style={styles.continueButtonText}>
                {nextTier?.nextTier
                  ? t('seasonPass.continueProgress')
                  : t('seasonPass.completed')}
              </Text>
              <Text style={styles.arrow}>→</Text>
            </View>
          ) : (
            <View style={styles.joinButton}>
              <Text style={styles.joinButtonText}>
                {t('seasonPass.joinSeason')}
              </Text>
              <Text style={styles.arrow}>✨</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Progress bar */}
      {isParticipating && progress && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: `${progressPercentage}%` },
              ]}
            />
          </View>
          {nextTier?.nextTier && (
            <Text style={styles.nextTierText}>
              {nextTier.pointsNeeded} {t('seasonPass.pointsToNext')}
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  ribbonContent: {
    flexDirection: 'row',
    backgroundColor: COLORS.darkGray,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderRadius: 18,
    overflow: 'hidden',
  },
  shineEffect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    backgroundColor: COLORS.gold,
    opacity: 0.1,
    transform: [{ skewX: '-20deg' }],
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    marginRight: 12,
  },
  seasonIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gold + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  seasonEmoji: {
    fontSize: 28,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  seasonBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    marginRight: 4,
  },
  liveText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  seasonName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gold,
  },
  pointsText: {
    fontSize: 12,
    color: COLORS.turquoise,
  },
  participantsText: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  rightSection: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  timeBox: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.gold + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeLabel: {
    fontSize: 9,
    color: COLORS.lightGray,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  timeValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.turquoise,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
  },
  continueButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  arrow: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: COLORS.darkGray,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.gold + '30',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 3,
  },
  nextTierText: {
    fontSize: 10,
    color: COLORS.lightGray,
    marginTop: 4,
    textAlign: 'center',
  },
});
