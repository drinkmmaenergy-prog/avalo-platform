import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { EmotionalSummary } from '../services/emotionalInboxService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 64; // 32px padding on each side

interface EmotionalInboxCardProps {
  summaries: EmotionalSummary[];
  onRefresh?: () => void;
}

/**
 * Circular progress indicator for engagement score
 */
const CircularScore: React.FC<{ score: number; riskLevel: string }> = ({
  score,
  riskLevel,
}) => {
  const color =
    riskLevel === 'HIGH' ? '#E53935' : riskLevel === 'MEDIUM' ? '#40E0D0' : '#D4AF37';

  return (
    <View style={styles.circularScore}>
      <View style={[styles.scoreCircle, { borderColor: color }]}>
        <Text style={[styles.scoreText, { color }]}>{score}</Text>
      </View>
    </View>
  );
};

/**
 * Individual summary card
 */
const SummaryCard: React.FC<{
  summary: EmotionalSummary;
  onPress: () => void;
  t: (key: string, params?: any) => string;
}> = ({ summary, onPress, t }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  React.useEffect(() => {
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

  const riskColors = {
    HIGH: '#E53935',
    MEDIUM: '#40E0D0',
    LOW: '#D4AF37',
  };

  const backgroundColor = riskColors[summary.riskLevel];

  return (
    <Animated.View
      style={[
        styles.summaryCard,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.cardHeader, { backgroundColor }]}>
        <View style={styles.userInfo}>
          {summary.avatar ? (
            <Image source={{ uri: summary.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {summary.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.username} numberOfLines={1}>
              {summary.username}
            </Text>
            <Text style={styles.riskBadge}>
              {t(`emotionalInbox.risk_${summary.riskLevel.toLowerCase()}`)}
            </Text>
          </View>
        </View>
        <CircularScore score={summary.engagementScore} riskLevel={summary.riskLevel} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.tagContainer}>
          <Text style={[styles.tagText, { color: backgroundColor }]}>
            {t(`emotionalInbox.insight_${summary.tag.toLowerCase()}`)}
          </Text>
        </View>

        <Text style={styles.recommendation} numberOfLines={3}>
          {t(summary.recommendation)}
        </Text>

        <TouchableOpacity style={styles.ctaButton} onPress={onPress}>
          <Text style={styles.ctaButtonText}>{t('emotionalInbox.cta_openChat')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

/**
 * Main Emotional Inbox Card component
 */
export const EmotionalInboxCard: React.FC<EmotionalInboxCardProps> = ({
  summaries,
  onRefresh,
}) => {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Simple translation function - in production use proper i18n
  const t = (key: string, params?: any) => {
    // This is a placeholder - actual implementation should use i18n
    const translations: { [key: string]: string } = {
      'emotionalInbox.title': '🔥 Emotional Insights',
      'emotionalInbox.insight_gaining_traction': 'Gaining Traction',
      'emotionalInbox.insight_stable': 'Stable Connection',
      'emotionalInbox.insight_cooling_down': 'Cooling Down',
      'emotionalInbox.insight_at_risk': 'At Risk',
      'emotionalInbox.risk_low': 'Low Risk',
      'emotionalInbox.risk_medium': 'Medium Risk',
      'emotionalInbox.risk_high': 'High Risk',
      'emotionalInbox.cta_openChat': 'Open Chat',
      'emotionalInbox.recommendations.gaining':
        'This connection is growing stronger! They respond quickly and show genuine interest. Keep the momentum going.',
      'emotionalInbox.recommendations.stable':
        'Your connection is consistent and healthy. Continue engaging naturally to maintain this positive dynamic.',
      'emotionalInbox.recommendations.cooling':
        'Activity has slowed down recently. Consider reaching out with something they find interesting.',
      'emotionalInbox.recommendations.atRisk':
        'Warning — This connection is fading. Response times are much slower than before. Start a conversation about a topic they care about.',
    };
    return translations[key] || key;
  };

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + 16));
    setActiveIndex(index);
  };

  const handleChatPress = (chatId: string) => {
    router.push(`/chat/${chatId}` as any);
  };

  if (!summaries || summaries.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('emotionalInbox.title')}</Text>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={CARD_WIDTH + 16}
        decelerationRate="fast"
      >
        {summaries.map((summary, index) => (
          <View key={summary.chatId} style={styles.cardWrapper}>
            <SummaryCard
              summary={summary}
              onPress={() => handleChatPress(summary.chatId)}
              t={t}
            />
          </View>
        ))}
      </ScrollView>

      {summaries.length > 1 && (
        <View style={styles.pagination}>
          {summaries.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                activeIndex === index && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginRight: 16,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  riskBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
    opacity: 0.9,
  },
  circularScore: {
    marginLeft: 12,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
    backgroundColor: '#fff',
  },
  tagContainer: {
    marginBottom: 12,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recommendation: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginBottom: 16,
  },
  ctaButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D0D0',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#000',
    width: 24,
  },
});
