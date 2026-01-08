/**
 * PACK 283 - Discovery Visitors List
 * Shows who viewed your profile (Visitors feature)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { colors, spacing, fontSizes, fontWeights, radius } from "@/shared/theme";
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";

interface Visitor {
  viewerId: string;
  name: string;
  age: number;
  city: string;
  viewedAt: {
    _seconds: number;
    _nanoseconds: number;
  };
  incognito: boolean;
  mainPhotoUrl?: string;
  verified: boolean;
}

export default function VisitorsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();
  
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  
  useEffect(() => {
    loadVisitors(true);
  }, []);
  
  const loadVisitors = async (reset: boolean = false) => {
    if (loading) return;
    
    try {
      if (reset) {
        setLoading(true);
        setVisitors([]);
        setCursor(null);
      }
      
      const getProfileVisitors = httpsCallable(functions, 'pack283_getProfileVisitors');
      const result = await getProfileVisitors({
        limit: 50,
        cursor: reset ? null : cursor,
      });
      
      const data = result.data as any;
      
      if (data.success) {
        const newVisitors = data.visitors || [];
        
        if (reset) {
          setVisitors(newVisitors);
        } else {
          setVisitors(prev => [...prev, ...newVisitors]);
        }
        
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch (error) {
      console.error('Error loading visitors:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    setRefreshing(true);
    loadVisitors(true);
  };
  
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadVisitors(false);
    }
  };
  
  const handleVisitorPress = (visitor: Visitor) => {
    if (visitor.incognito) {
      return; // Can't view incognito profiles
    }
    
    router.push(`/profile/${visitor.viewerId}` as any);
  };
  
  const formatTimeAgo = (timestamp: { _seconds: number; _nanoseconds: number }): string => {
    const now = Date.now();
    const viewedTime = timestamp._seconds * 1000;
    const diff = now - viewedTime;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return 'Over a month ago';
  };
  
  const renderVisitor = ({ item }: { item: Visitor }) => (
    <TouchableOpacity
      style={styles.visitorCard}
      onPress={() => handleVisitorPress(item)}
      disabled={item.incognito}
      activeOpacity={item.incognito ? 1 : 0.7}
    >
      {/* Photo */}
      <View style={styles.photoContainer}>
        {item.incognito ? (
          <View style={styles.incognitoPhoto}>
            <Text style={styles.incognitoIcon}>👁️</Text>
          </View>
        ) : (
          <Image
            source={{ uri: item.mainPhotoUrl || 'https://via.placeholder.com/100' }}
            style={styles.photo}
          />
        )}
        
        {/* Verified badge */}
        {item.verified && !item.incognito && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedIcon}>✓</Text>
          </View>
        )}
      </View>
      
      {/* Info */}
      <View style={styles.visitorInfo}>
        <View style={styles.visitorHeader}>
          <Text style={styles.visitorName} numberOfLines={1}>
            {item.name}
          </Text>
          {!item.incognito && (
            <Text style={styles.visitorAge}>, {item.age}</Text>
          )}
        </View>
        
        {!item.incognito && item.city && (
          <Text style={styles.visitorCity} numberOfLines={1}>
            {item.city}
          </Text>
        )}
        
        <Text style={styles.viewedAt}>
          {formatTimeAgo(item.viewedAt)}
        </Text>
      </View>
      
      {/* Arrow */}
      {!item.incognito && (
        <Text style={styles.arrow}>›</Text>
      )}
    </TouchableOpacity>
  );
  
  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.emptyText}>Loading visitors...</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>👀</Text>
        <Text style={styles.emptyTitle}>No visitors yet</Text>
        <Text style={styles.emptyText}>
          When someone views your profile, they'll appear here
        </Text>
      </View>
    );
  };
  
  const renderFooter = () => {
    if (!loading || visitors.length === 0) return null;
    
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader
        title="Visitors"
      />
      
      {/* Free Feature Notice */}
      <View style={styles.freeNotice}>
        <Text style={styles.freeNoticeText}>
          🆓 See who viewed your profile - 100% FREE
        </Text>
      </View>
      
      <FlatList
        data={visitors}
        renderItem={renderVisitor}
        keyExtractor={(item, index) => `${item.viewerId}-${index}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
      
      <BottomNavigation />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  freeNotice: {
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  freeNoticeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.white,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.massive,
  },
  visitorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photoContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.backgroundElevated,
  },
  incognitoPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.backgroundElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incognitoIcon: {
    fontSize: 28,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  verifiedIcon: {
    fontSize: 10,
    color: colors.white,
    fontWeight: fontWeights.bold,
  },
  visitorInfo: {
    flex: 1,
  },
  visitorHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  visitorName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  visitorAge: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  visitorCity: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  viewedAt: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  arrow: {
    fontSize: 32,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    minHeight: 300,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});
