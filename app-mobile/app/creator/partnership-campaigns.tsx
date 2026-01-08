/**
 * PACK 109 — Partnership Campaigns Screen
 * 
 * Shows campaigns, smart links, and basic metrics for talents who are
 * also Avalo creators.
 * 
 * CRITICAL: This is read-only analytics. No bonuses, no special advantages.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
  Clipboard,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { Ionicons } from '@expo/vector-icons';

// ============================================================================
// TYPES
// ============================================================================

type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

type CampaignObjective =
  | 'SIGNUPS'
  | 'AWARENESS'
  | 'CONTENT_DROP'
  | 'ENGAGEMENT'
  | 'LIVE_EVENT'
  | 'CREATOR_RECRUITMENT';

interface CreatorCampaignSummary {
  campaignId: string;
  campaignName: string;
  description: string;
  objectives: CampaignObjective[];
  startDate: Date;
  endDate: Date;
  status: CampaignStatus;
  smartLinks: {
    web: string;
    tiktok?: string;
    instagram?: string;
    youtube?: string;
  };
  metrics: {
    visits: number;
    signups: number;
    follows: number;
    firstPaidInteractions: number;
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PartnershipCampaignsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [campaigns, setCampaigns] = useState<CreatorCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const getCreatorCampaigns = httpsCallable(functions, 'getCreatorCampaigns');
      const result = await getCreatorCampaigns({});

      const data = result.data as any;

      if (data.success) {
        // Convert date strings to Date objects
        const campaignsWithDates = data.campaigns.map((c: any) => ({
          ...c,
          startDate: new Date(c.startDate),
          endDate: new Date(c.endDate),
        }));
        setCampaigns(campaignsWithDates);
      } else {
        setError(data.error || 'Failed to load campaigns');
      }
    } catch (err: any) {
      console.error('Error loading campaigns:', err);
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (link: string, platform: string) => {
    try {
      Clipboard.setString(link);
      Alert.alert('Copied!', `${platform} link copied to clipboard`);
    } catch (err) {
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  const handleShareLink = async (link: string, campaignName: string) => {
    try {
      await Share.share({
        message: `Check out ${campaignName} on Avalo: ${link}`,
        url: link,
      });
    } catch (err) {
      console.error('Error sharing link:', err);
    }
  };

  const getStatusColor = (status: CampaignStatus): string => {
    switch (status) {
      case 'ACTIVE':
        return '#10b981';
      case 'PLANNED':
        return '#3b82f6';
      case 'COMPLETED':
        return '#6b7280';
      case 'PAUSED':
        return '#f59e0b';
      case 'CANCELLED':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getObjectiveLabel = (objective: CampaignObjective): string => {
    const labels: Record<CampaignObjective, string> = {
      SIGNUPS: 'Drive Signups',
      AWARENESS: 'Brand Awareness',
      CONTENT_DROP: 'Content Launch',
      ENGAGEMENT: 'Boost Engagement',
      LIVE_EVENT: 'Live Event',
      CREATOR_RECRUITMENT: 'Recruit Creators',
    };
    return labels[objective] || objective;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Partnership Campaigns',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ff006e" />
          <Text style={styles.loadingText}>Loading campaigns...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Partnership Campaigns',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCampaigns}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (campaigns.length === 0) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Partnership Campaigns',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="megaphone-outline" size={64} color="#6b7280" />
          <Text style={styles.emptyTitle}>No Active Campaigns</Text>
          <Text style={styles.emptyText}>
            You're not currently enrolled in any partnership campaigns.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Partnership Campaigns',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#3b82f6" />
          <Text style={styles.infoBannerText}>
            Track your campaign performance and share your smart links to grow your audience.
            All earnings follow standard 65/35 split.
          </Text>
        </View>

        {/* Campaigns List */}
        {campaigns.map((campaign) => (
          <View key={campaign.campaignId} style={styles.campaignCard}>
            {/* Campaign Header */}
            <View style={styles.campaignHeader}>
              <View style={styles.campaignTitleRow}>
                <Text style={styles.campaignName}>{campaign.campaignName}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(campaign.status)}20` },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(campaign.status) },
                    ]}
                  >
                    {campaign.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.campaignDescription}>{campaign.description}</Text>

              {/* Objectives */}
              <View style={styles.objectivesContainer}>
                {campaign.objectives.map((objective, index) => (
                  <View key={index} style={styles.objectiveBadge}>
                    <Text style={styles.objectiveText}>
                      {getObjectiveLabel(objective)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Date Range */}
              <Text style={styles.dateRange}>
                {campaign.startDate.toLocaleDateString()} -{' '}
                {campaign.endDate.toLocaleDateString()}
              </Text>
            </View>

            {/* Metrics Summary */}
            <View style={styles.metricsContainer}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{campaign.metrics.visits}</Text>
                <Text style={styles.metricLabel}>Visits</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{campaign.metrics.signups}</Text>
                <Text style={styles.metricLabel}>Signups</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{campaign.metrics.follows}</Text>
                <Text style={styles.metricLabel}>Follows</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>
                  {campaign.metrics.firstPaidInteractions}
                </Text>
                <Text style={styles.metricLabel}>Paid</Text>
              </View>
            </View>

            {/* Smart Links Section */}
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() =>
                setExpandedCampaign(
                  expandedCampaign === campaign.campaignId
                    ? null
                    : campaign.campaignId
                )
              }
            >
              <Text style={styles.expandButtonText}>
                {expandedCampaign === campaign.campaignId
                  ? 'Hide Smart Links'
                  : 'Show Smart Links'}
              </Text>
              <Ionicons
                name={
                  expandedCampaign === campaign.campaignId
                    ? 'chevron-up'
                    : 'chevron-down'
                }
                size={20}
                color="#ff006e"
              />
            </TouchableOpacity>

            {expandedCampaign === campaign.campaignId && (
              <View style={styles.smartLinksContainer}>
                {/* Web Link */}
                <View style={styles.linkRow}>
                  <View style={styles.linkInfo}>
                    <Ionicons name="globe-outline" size={24} color="#6b7280" />
                    <View style={styles.linkTextContainer}>
                      <Text style={styles.linkLabel}>Web Link</Text>
                      <Text style={styles.linkUrl} numberOfLines={1}>
                        {campaign.smartLinks.web}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.linkActions}>
                    <TouchableOpacity
                      onPress={() => handleCopyLink(campaign.smartLinks.web, 'Web')}
                      style={styles.iconButton}
                    >
                      <Ionicons name="copy-outline" size={20} color="#ff006e" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        handleShareLink(campaign.smartLinks.web, campaign.campaignName)
                      }
                      style={styles.iconButton}
                    >
                      <Ionicons name="share-outline" size={20} color="#ff006e" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* TikTok Link */}
                {campaign.smartLinks.tiktok && (
                  <View style={styles.linkRow}>
                    <View style={styles.linkInfo}>
                      <Ionicons name="logo-tiktok" size={24} color="#6b7280" />
                      <View style={styles.linkTextContainer}>
                        <Text style={styles.linkLabel}>TikTok Link</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>
                          {campaign.smartLinks.tiktok}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.linkActions}>
                      <TouchableOpacity
                        onPress={() =>
                          handleCopyLink(campaign.smartLinks.tiktok!, 'TikTok')
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="copy-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          handleShareLink(
                            campaign.smartLinks.tiktok!,
                            campaign.campaignName
                          )
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="share-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Instagram Link */}
                {campaign.smartLinks.instagram && (
                  <View style={styles.linkRow}>
                    <View style={styles.linkInfo}>
                      <Ionicons name="logo-instagram" size={24} color="#6b7280" />
                      <View style={styles.linkTextContainer}>
                        <Text style={styles.linkLabel}>Instagram Link</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>
                          {campaign.smartLinks.instagram}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.linkActions}>
                      <TouchableOpacity
                        onPress={() =>
                          handleCopyLink(campaign.smartLinks.instagram!, 'Instagram')
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="copy-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          handleShareLink(
                            campaign.smartLinks.instagram!,
                            campaign.campaignName
                          )
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="share-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* YouTube Link */}
                {campaign.smartLinks.youtube && (
                  <View style={styles.linkRow}>
                    <View style={styles.linkInfo}>
                      <Ionicons name="logo-youtube" size={24} color="#6b7280" />
                      <View style={styles.linkTextContainer}>
                        <Text style={styles.linkLabel}>YouTube Link</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>
                          {campaign.smartLinks.youtube}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.linkActions}>
                      <TouchableOpacity
                        onPress={() =>
                          handleCopyLink(campaign.smartLinks.youtube!, 'YouTube')
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="copy-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          handleShareLink(
                            campaign.smartLinks.youtube!,
                            campaign.campaignName
                          )
                        }
                        style={styles.iconButton}
                      >
                        <Ionicons name="share-outline" size={20} color="#ff006e" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9ca3af',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#ff006e',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  campaignCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  campaignHeader: {
    marginBottom: 16,
  },
  campaignTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  campaignName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  campaignDescription: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 12,
  },
  objectivesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  objectiveBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  objectiveText: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  dateRange: {
    fontSize: 12,
    color: '#9ca3af',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  metricLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 16,
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff006e',
    marginRight: 8,
  },
  smartLinksContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  linkInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 12,
    color: '#9ca3af',
  },
  linkActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
  },
});
