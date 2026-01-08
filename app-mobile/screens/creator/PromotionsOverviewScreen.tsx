/**
 * PACK 61: Promotions Overview Screen
 * Lists all promotion campaigns for a creator
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyCampaigns, PromotionCampaign } from '../../services/promotionService';

export default function PromotionsOverviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCampaigns = async () => {
    if (!user?.uid) return;
    
    try {
      const data = await getMyCampaigns(user.uid);
      setCampaigns(data);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [user?.uid]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCampaigns();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '#10b981';
      case 'PAUSED': return '#f59e0b';
      case 'DRAFT': return '#6b7280';
      case 'ENDED': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getBudgetRemaining = (campaign: PromotionCampaign) => {
    return campaign.budgetTokensTotal - campaign.budgetTokensSpent;
  };

  const renderCampaignCard = (campaign: PromotionCampaign) => (
    <TouchableOpacity
      key={campaign.campaignId}
      style={styles.card}
      onPress={() => router.push({
        pathname: '/creator/promotion-details',
        params: { campaignId: campaign.campaignId }
      })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.campaignName}>{campaign.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(campaign.status) }]}>
          <Text style={styles.statusText}>{t(`promotions.status.${campaign.status}`)}</Text>
        </View>
      </View>
      
      <Text style={styles.campaignTitle}>{campaign.title}</Text>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="eye-outline" size={16} color="#6b7280" />
          <Text style={styles.statLabel}>{t('promotions.impressions')}</Text>
          <Text style={styles.statValue}>{campaign.impressions}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="hand-left-outline" size={16} color="#6b7280" />
          <Text style={styles.statLabel}>{t('promotions.clicks')}</Text>
          <Text style={styles.statValue}>{campaign.clicks}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="wallet-outline" size={16} color="#6b7280" />
          <Text style={styles.statLabel}>{t('promotions.budget')}</Text>
          <Text style={styles.statValue}>{getBudgetRemaining(campaign)} / {campaign.budgetTokensTotal}</Text>
        </View>
      </View>
      
      <View style={styles.placementsRow}>
        {campaign.placementTypes.map((placement) => (
          <View key={placement} style={styles.placementBadge}>
            <Text style={styles.placementText}>{t(`promotions.placement.${placement.toLowerCase()}`)}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('promotions.title')}</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/creator/promotion-create')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {campaigns.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="megaphone-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No campaigns yet</Text>
            <Text style={styles.emptyText}>
              Create your first promotion campaign to boost your visibility
            </Text>
            <TouchableOpacity
              style={styles.createFirstButton}
              onPress={() => router.push('/creator/promotion-create')}
            >
              <Text style={styles.createFirstButtonText}>{t('promotions.createCampaign')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.campaignsList}>
            {campaigns.map(renderCampaignCard)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  backButton: {
    padding: 8
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center'
  },
  createButton: {
    backgroundColor: '#ec4899',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollView: {
    flex: 1
  },
  campaignsList: {
    padding: 16
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  campaignName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  campaignTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb'
  },
  statItem: {
    flex: 1,
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2
  },
  placementsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  placementBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  placementText: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '500'
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24
  },
  createFirstButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24
  },
  createFirstButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});
