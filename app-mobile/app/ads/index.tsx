/**
 * PACK 145 - Ad Manager Dashboard
 * Main entry point for advertisers to manage campaigns
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected' | 'banned';
  contentType: string;
  budget: {
    totalBudget: number;
    spent: number;
    remaining: number;
    currency: string;
  };
  analytics: {
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
  };
  createdAt: any;
}

export default function AdManagerDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [strikes, setStrikes] = useState<any[]>([]);

  const auth = getAuth();
  const functions = getFunctions();

  useEffect(() => {
    loadCampaigns();
    loadStrikes();
  }, []);

  const loadCampaigns = async () => {
    try {
      const getMyCampaigns = httpsCallable(functions, 'getMyCampaigns');
      const result = await getMyCampaigns({});
      const data = result.data as any;
      
      if (data.success) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStrikes = async () => {
    try {
      const getAdvertiserStrikes = httpsCallable(functions, 'getAdvertiserStrikes');
      const result = await getAdvertiserStrikes({});
      const data = result.data as any;
      
      if (data.success) {
        setStrikes(data.strikes);
      }
    } catch (error) {
      console.error('Error loading strikes:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCampaigns();
    loadStrikes();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'paused':
        return '#f59e0b';
      case 'pending_review':
        return '#3b82f6';
      case 'rejected':
      case 'banned':
        return '#ef4444';
      case 'completed':
        return '#6b7280';
      default:
        return '#9ca3af';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return 'play-circle';
      case 'paused':
        return 'pause-circle';
      case 'pending_review':
        return 'time';
      case 'rejected':
      case 'banned':
        return 'close-circle';
      case 'completed':
        return 'checkmark-circle';
      default:
        return 'document';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading campaigns...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ad Manager</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/ads/create')}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.createButtonText}>New Campaign</Text>
        </TouchableOpacity>
      </View>

      {strikes.length > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={24} color="#ef4444" />
          <Text style={styles.warningText}>
            You have {strikes.length} strike(s). 3 strikes result in a ban.
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/ads/assets')}
          >
            <Ionicons name="images" size={32} color="#007AFF" />
            <Text style={styles.actionTitle}>Ad Assets</Text>
            <Text style={styles.actionSubtitle}>Manage images & videos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/ads/analytics')}
          >
            <Ionicons name="bar-chart" size={32} color="#10b981" />
            <Text style={styles.actionTitle}>Analytics</Text>
            <Text style={styles.actionSubtitle}>View performance</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Campaigns</Text>
          
          {campaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={64} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No campaigns yet</Text>
              <Text style={styles.emptySubtitle}>
                Create your first ad campaign to promote your products, services, or events
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/ads/create')}
              >
                <Text style={styles.emptyButtonText}>Create Campaign</Text>
              </TouchableOpacity>
            </View>
          ) : (
            campaigns.map((campaign) => (
              <TouchableOpacity
                key={campaign.id}
                style={styles.campaignCard}
                onPress={() => router.push(`/ads/campaign/${campaign.id}`)}
              >
                <View style={styles.campaignHeader}>
                  <View style={styles.campaignTitleRow}>
                    <Text style={styles.campaignName}>{campaign.name}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(campaign.status) },
                      ]}
                    >
                      <Ionicons
                        name={getStatusIcon(campaign.status) as any}
                        size={12}
                        color="#fff"
                      />
                      <Text style={styles.statusText}>{campaign.status}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.campaignStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {campaign.analytics.impressions.toLocaleString()}
                    </Text>
                    <Text style={styles.statLabel}>Impressions</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {campaign.analytics.clicks.toLocaleString()}
                    </Text>
                    <Text style={styles.statLabel}>Clicks</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {campaign.analytics.ctr.toFixed(2)}%
                    </Text>
                    <Text style={styles.statLabel}>CTR</Text>
                  </View>
                </View>

                <View style={styles.budgetBar}>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetLabel}>Budget</Text>
                    <Text style={styles.budgetValue}>
                      ${campaign.budget.spent.toFixed(2)} / ${campaign.budget.totalBudget.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(campaign.budget.spent / campaign.budget.totalBudget) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#fee2e2',
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#991b1b',
  },
  scrollView: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 8,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  campaignCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  campaignHeader: {
    marginBottom: 12,
  },
  campaignTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  campaignName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  campaignStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  budgetBar: {
    marginTop: 12,
  },
  budgetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  budgetValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
});
