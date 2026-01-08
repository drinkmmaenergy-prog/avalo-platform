/**
 * Skeleton Loader Components
 * Phase 27: Loading placeholders for heavy screens
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

function SkeletonItem({ width: w = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: w, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export function FeedSkeleton() {
  return (
    <View style={styles.feedContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <SkeletonItem width={60} height={60} borderRadius={12} />
            <View style={styles.feedInfo}>
              <SkeletonItem width="60%" height={18} style={{ marginBottom: 8 }} />
              <SkeletonItem width="40%" height={14} />
            </View>
          </View>
          <SkeletonItem width="100%" height={120} style={{ marginTop: 12 }} />
          <View style={styles.feedFooter}>
            <SkeletonItem width="48%" height={36} />
            <SkeletonItem width="48%" height={36} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function LiveRoomSkeleton() {
  return (
    <View style={styles.liveContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.liveCard}>
          <SkeletonItem width={120} height={90} borderRadius={8} />
          <View style={styles.liveInfo}>
            <SkeletonItem width="80%" height={16} style={{ marginBottom: 8 }} />
            <SkeletonItem width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AIBotsSkeleton() {
  return (
    <View style={styles.botsContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.botCard}>
          <SkeletonItem width={48} height={48} borderRadius={24} />
          <View style={styles.botInfo}>
            <SkeletonItem width="60%" height={16} style={{ marginBottom: 8 }} />
            <SkeletonItem width="90%" height={12} style={{ marginBottom: 8 }} />
            <SkeletonItem width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DropsSkeleton() {
  return (
    <View style={styles.dropsContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.dropCard}>
          <SkeletonItem width="100%" height={200} borderRadius={18} />
          <View style={styles.dropInfo}>
            <SkeletonItem width="70%" height={18} style={{ marginBottom: 8 }} />
            <SkeletonItem width="50%" height={14} style={{ marginBottom: 12 }} />
            <View style={styles.dropFooter}>
              <SkeletonItem width="45%" height={12} />
              <SkeletonItem width="45%" height={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProfileCardSkeleton() {
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <SkeletonItem width={80} height={80} borderRadius={12} />
        <View style={styles.profileInfo}>
          <SkeletonItem width="60%" height={18} style={{ marginBottom: 8 }} />
          <SkeletonItem width="40%" height={14} style={{ marginBottom: 8 }} />
          <SkeletonItem width="80%" height={12} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E0E0E0',
  },
  feedContainer: {
    padding: 16,
  },
  feedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  feedHeader: {
    flexDirection: 'row',
  },
  feedInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  liveContainer: {
    padding: 16,
  },
  liveCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  liveInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  botsContainer: {
    padding: 16,
  },
  botCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  botInfo: {
    flex: 1,
    marginLeft: 16,
  },
  dropsContainer: {
    padding: 16,
  },
  dropCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropInfo: {
    padding: 16,
  },
  dropFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
});
