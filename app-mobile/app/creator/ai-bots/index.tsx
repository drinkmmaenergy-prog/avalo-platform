/**
 * Creator AI Bots Dashboard
 * Shows all creator's AI bots with earnings and analytics
 * Instagram-style card grid layout with aggressive monetization
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getCreatorBotDashboard,
  AIBot,
} from "@/services/aiBotService";
import BotCard from "@/components/BotCard";
import { formatTokens, UI_TRIGGERS } from "@/config/aiMonetization";

export default function CreatorAIBotsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [showLowEarningsModal, setShowLowEarningsModal] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await getCreatorBotDashboard();
      setDashboardData(data);

      // Check for low earnings trigger
      const last7DaysEarnings = data.bots.reduce(
        (sum: number, bot: AIBot) => sum + (bot.stats?.totalEarnings || 0),
        0
      );
      if (last7DaysEarnings < UI_TRIGGERS.LOW_EARNINGS_THRESHOLD) {
        setShowLowEarningsModal(true);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const calculateLast7Days = (bots: AIBot[]) => {
    // This would normally come from analytics
    return bots.reduce((sum, bot) => sum + (bot.stats?.totalEarnings || 0), 0);
  };

  const calculateLast30Days = (bots: AIBot[]) => {
    // This would normally come from analytics
    return bots.reduce((sum, bot) => sum + (bot.stats?.totalEarnings || 0), 0);
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Text style={[styles.loadingText, isDark && styles.textDark]}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  const last7Days = calculateLast7Days(dashboardData?.bots || []);
  const last30Days = calculateLast30Days(dashboardData?.bots || []);
  const avgPerBot = dashboardData?.activeBots > 0
    ? dashboardData.totalEarnings / dashboardData.activeBots
    : 0;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            AI Bots Dashboard
          </Text>
          <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>
            Manage your AI companions
          </Text>
        </View>

        {/* Earnings Panel */}
        <View style={[styles.earningsPanel, isDark && styles.panelDark]}>
          <Text style={[styles.panelTitle, isDark && styles.textDark]}>
            💰 Current Earnings
          </Text>
          
          <View style={styles.earningsGrid}>
            <View style={styles.earningItem}>
              <Text style={[styles.earningValue, isDark && styles.textDark]}>
                {formatTokens(last7Days)}
              </Text>
              <Text style={[styles.earningLabel, isDark && styles.textSecondaryDark]}>
                Last 7 Days
              </Text>
            </View>
            
            <View style={styles.earningItem}>
              <Text style={[styles.earningValue, isDark && styles.textDark]}>
                {formatTokens(last30Days)}
              </Text>
              <Text style={[styles.earningLabel, isDark && styles.textSecondaryDark]}>
                Last 30 Days
              </Text>
            </View>
            
            <View style={styles.earningItem}>
              <Text style={[styles.earningValue, isDark && styles.textDark]}>
                {formatTokens(dashboardData?.totalEarnings || 0)}
              </Text>
              <Text style={[styles.earningLabel, isDark && styles.textSecondaryDark]}>
                Lifetime
              </Text>
            </View>
          </View>

          <View style={styles.avgEarnings}>
            <Text style={[styles.avgLabel, isDark && styles.textSecondaryDark]}>
              Avg per bot:
            </Text>
            <Text style={[styles.avgValue, isDark && styles.textDark]}>
              {formatTokens(Math.round(avgPerBot))} tokens
            </Text>
          </View>
        </View>

        {/* Leaderboard Panel */}
        <View style={[styles.leaderboardPanel, isDark && styles.panelDark]}>
          <Text style={[styles.panelTitle, isDark && styles.textDark]}>
            🏆 Leaderboard
          </Text>
          <Text style={[styles.leaderboardText, isDark && styles.textSecondaryDark]}>
            Your position: <Text style={styles.boldText}>#47</Text>
          </Text>
          <Text style={[styles.leaderboardSubtext, isDark && styles.textSecondaryDark]}>
            Top 10 get 500 token bonus!
          </Text>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={() => router.push('/creator/ai-bots/new')}
          >
            <Text style={styles.primaryCtaText}>✨ Create New AI Bot</Text>
          </TouchableOpacity>

          <View style={styles.secondaryCtaRow}>
            <TouchableOpacity
              style={[styles.secondaryCta, isDark && styles.secondaryCtaDark]}
              onPress={() => {/* TODO: Implement boost */}}
            >
              <Text style={[styles.secondaryCtaText, isDark && styles.textDark]}>
                🚀 Boost Bot
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryCta, isDark && styles.secondaryCtaDark]}
              onPress={() => {/* TODO: Implement withdraw */}}
            >
              <Text style={[styles.secondaryCtaText, isDark && styles.textDark]}>
                💸 Withdraw
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Creator Academy CTA */}
        <TouchableOpacity
          style={styles.academyCta}
          onPress={() => router.push('/creator/academy')}
        >
          <Text style={styles.academyCtaIcon}>🎓</Text>
          <View style={styles.academyCtaContent}>
            <Text style={styles.academyCtaTitle}>Learn How to Maximize Earnings</Text>
            <Text style={styles.academyCtaSubtitle}>Creator Academy →</Text>
          </View>
        </TouchableOpacity>

        {/* Bots List */}
        <View style={styles.botsSection}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Your AI Bots ({dashboardData?.totalBots || 0})
          </Text>

          {dashboardData?.bots && dashboardData.bots.length > 0 ? (
            <View style={styles.botsList}>
              {dashboardData.bots.map((bot: AIBot) => (
                <BotCard
                  key={bot.botId}
                  bot={bot}
                  onPress={() => router.push(`/creator/ai-bots/${bot.botId}`)}
                  showStats
                  creatorView
                />
              ))}
            </View>
          ) : (
            <View style={[styles.emptyState, isDark && styles.panelDark]}>
              <Text style={styles.emptyEmoji}>🤖</Text>
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                No AI Bots Yet
              </Text>
              <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
                Create your first AI companion and start earning!
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/creator/ai-bots/new')}
              >
                <Text style={styles.emptyButtonText}>Create First Bot</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Low Earnings Modal */}
      <Modal
        visible={showLowEarningsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLowEarningsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <Text style={styles.modalEmoji}>📸</Text>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>
              Boost Your Earnings
            </Text>
            <Text style={[styles.modalText, isDark && styles.textSecondaryDark]}>
              {UI_TRIGGERS.LOW_CONVERSION_MESSAGE}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowLowEarningsModal(false);
                router.push('/creator/ai-bots/new');
              }}
            >
              <Text style={styles.modalButtonText}>Improve My Bots</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowLowEarningsModal(false)}
            >
              <Text style={[styles.modalCancelText, isDark && styles.textSecondaryDark]}>
                Maybe Later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  earningsPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  panelDark: {
    backgroundColor: '#1C1C1E',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  earningsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  earningItem: {
    alignItems: 'center',
  },
  earningValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  earningLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  avgEarnings: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 8,
  },
  avgLabel: {
    fontSize: 14,
    color: '#666666',
  },
  avgValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  leaderboardPanel: {
    backgroundColor: '#FFF4E6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFB800',
  },
  leaderboardText: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 4,
  },
  leaderboardSubtext: {
    fontSize: 14,
    color: '#666666',
  },
  boldText: {
    fontWeight: '700',
    color: '#007AFF',
  },
  ctaContainer: {
    marginBottom: 24,
  },
  primaryCta: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryCtaText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryCtaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryCta: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  secondaryCtaDark: {
    backgroundColor: '#1C1C1E',
  },
  secondaryCtaText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  botsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  botsList: {
    gap: 16,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalContentDark: {
    backgroundColor: '#1C1C1E',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalCancelButton: {
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
  academyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2A2A',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#40E0D0',
  },
  academyCtaIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  academyCtaContent: {
    flex: 1,
  },
  academyCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  academyCtaSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
  },
});
