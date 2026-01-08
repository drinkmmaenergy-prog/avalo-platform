/**
 * Referral Leaderboard Card Component
 * Displays simple local leaderboard
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { getMockLeaderboard, type ReferralState } from '../services/referralService';

interface ReferralLeaderboardCardProps {
  state: ReferralState;
}

export default function ReferralLeaderboardCard({ state }: ReferralLeaderboardCardProps) {
  const { t } = useTranslation();
  const leaderboard = getMockLeaderboard(state.code, state.invitedCount);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('referrals.leaderboard')}</Text>
        <Text style={styles.subtitle}>{t('referrals.topInviters')}</Text>
      </View>

      <View style={styles.leaderboardList}>
        {leaderboard.map((entry, index) => (
          <View
            key={entry.code}
            style={[
              styles.leaderboardItem,
              entry.isUser && styles.leaderboardItemUser,
              index === 0 && styles.leaderboardItemFirst,
            ]}
          >
            <View style={styles.leaderboardRank}>
              <Text style={[styles.rankText, index === 0 && styles.rankTextFirst]}>
                {index === 0 ? '🏆' : `#${index + 1}`}
              </Text>
            </View>
            <View style={styles.leaderboardInfo}>
              <Text style={[styles.codeText, entry.isUser && styles.codeTextUser]}>
                {entry.isUser ? `${entry.code} (${t('referrals.you')})` : entry.code}
              </Text>
            </View>
            <View style={styles.leaderboardCount}>
              <Text style={[styles.countText, index === 0 && styles.countTextFirst]}>
                {entry.count}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.infoText}>
        {t('referrals.costInfo')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  leaderboardList: {
    marginBottom: 12,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F9F9F9',
  },
  leaderboardItemUser: {
    backgroundColor: '#E8F8F5',
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  leaderboardItemFirst: {
    backgroundColor: '#FFF8E1',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  leaderboardRank: {
    width: 40,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  rankTextFirst: {
    fontSize: 20,
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: 8,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  codeTextUser: {
    color: '#40E0D0',
  },
  leaderboardCount: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  countTextFirst: {
    color: '#D4AF37',
  },
  infoText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
