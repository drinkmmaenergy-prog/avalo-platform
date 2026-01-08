/**
 * Live Earnings Badge Component
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 * 
 * Displays earnings updates inside chat overlay for creators.
 * Shows "+X tokens • 65% after commission" badge.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';

interface LiveEarningsBadgeProps {
  totalEarnings: number;
  lastEntry?: number;
  showAnimation?: boolean;
}

export function LiveEarningsBadge({
  totalEarnings,
  lastEntry,
  showAnimation = true,
}: LiveEarningsBadgeProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [shimmerAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (!showAnimation) return;

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous shimmer effect
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    shimmer.start();
    return () => shimmer.stop();
  }, [showAnimation, fadeAnim, scaleAnim, shimmerAnim]);

  // Trigger pulse animation when new entry comes in
  useEffect(() => {
    if (lastEntry && lastEntry > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [lastEntry, scaleAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.badge}>
        {/* Shimmer overlay */}
        <Animated.View
          style={[
            styles.shimmer,
            {
              transform: [{ translateX: shimmerTranslate }],
            },
          ]}
        />

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.icon}>💰</Text>
          <View style={styles.textContainer}>
            <Text style={styles.earningsText}>
              +{totalEarnings} tokens
            </Text>
            <Text style={styles.commissionText}>
              65% after commission
            </Text>
          </View>
        </View>

        {/* New entry notification */}
        {lastEntry && lastEntry > 0 && (
          <View style={styles.newEntryBadge}>
            <Text style={styles.newEntryText}>+{lastEntry}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 80,
    right: 16,
    zIndex: 1000,
  },
  badge: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 12,
    paddingRight: 16,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 50,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 24,
    marginRight: 8,
  },
  textContainer: {
    gap: 2,
  },
  earningsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  commissionText: {
    fontSize: 10,
    color: '#333333',
    fontWeight: '600',
  },
  newEntryBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#40E0D0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: '#0F0F0F',
  },
  newEntryText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});

/**
 * Mini Earnings Badge (for compact display)
 */
export function LiveEarningsBadgeMini({ totalEarnings }: { totalEarnings: number }) {
  return (
    <View style={miniStyles.container}>
      <Text style={miniStyles.icon}>💰</Text>
      <Text style={miniStyles.text}>+{totalEarnings}</Text>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});

/**
 * Earnings Summary Card (for end of stream)
 */
export function LiveEarningsSummary({
  totalEarnings,
  viewerCount,
  duration,
}: {
  totalEarnings: number;
  viewerCount: number;
  duration?: string;
}) {
  return (
    <View style={summaryStyles.container}>
      <Text style={summaryStyles.title}>🎉 Stream Ended</Text>
      
      <View style={summaryStyles.statsGrid}>
        <View style={summaryStyles.statBox}>
          <Text style={summaryStyles.statValue}>{totalEarnings}</Text>
          <Text style={summaryStyles.statLabel}>Tokens Earned</Text>
          <Text style={summaryStyles.statSub}>65% after commission</Text>
        </View>

        <View style={summaryStyles.statBox}>
          <Text style={summaryStyles.statValue}>{viewerCount}</Text>
          <Text style={summaryStyles.statLabel}>Total Viewers</Text>
        </View>

        {duration && (
          <View style={summaryStyles.statBox}>
            <Text style={summaryStyles.statValue}>{duration}</Text>
            <Text style={summaryStyles.statLabel}>Duration</Text>
          </View>
        )}
      </View>

      <View style={summaryStyles.breakdown}>
        <Text style={summaryStyles.breakdownTitle}>Revenue Breakdown</Text>
        <View style={summaryStyles.breakdownRow}>
          <Text style={summaryStyles.breakdownLabel}>Your share (65%)</Text>
          <Text style={summaryStyles.breakdownValue}>
            +{totalEarnings} tokens
          </Text>
        </View>
        <View style={summaryStyles.breakdownRow}>
          <Text style={summaryStyles.breakdownLabel}>Platform fee (35%)</Text>
          <Text style={summaryStyles.breakdownValue}>
            {Math.round(totalEarnings / 0.65 * 0.35)} tokens
          </Text>
        </View>
        <View style={[summaryStyles.breakdownRow, summaryStyles.breakdownTotal]}>
          <Text style={summaryStyles.breakdownLabelBold}>Total Revenue</Text>
          <Text style={summaryStyles.breakdownValueBold}>
            {Math.round(totalEarnings / 0.65)} tokens
          </Text>
        </View>
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    gap: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  statSub: {
    fontSize: 9,
    color: '#666666',
    textAlign: 'center',
    marginTop: 2,
  },
  breakdown: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 16,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#AAAAAA',
  },
  breakdownValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: '#333333',
    marginTop: 8,
    paddingTop: 12,
  },
  breakdownLabelBold: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  breakdownValueBold: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
});
