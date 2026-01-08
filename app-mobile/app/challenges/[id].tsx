/**
 * PACK 120 — Challenge Details Screen
 * View challenge details and submit content
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { useToast } from "@/hooks/useToast";

interface CampaignDetails {
  campaignId: string;
  brandName: string;
  brandLogoRef: string;
  campaignTitle: string;
  campaignDescription: string;
  theme: string;
  startAt: { _seconds: number };
  endAt: { _seconds: number };
  contentRules: string[];
  mediaType: string;
  status: string;
}

export default function ChallengeDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      loadCampaignDetails();
    }
  }, [id]);

  const loadCampaignDetails = async () => {
    try {
      // In a real implementation, you'd have a getCampaignDetails function
      // For now, we'll use listBrandCampaigns and filter
      const listCampaigns = httpsCallable(functions, 'pack120_listBrandCampaigns');
      const result: any = await listCampaigns({
        status: 'ACTIVE',
        limit: 100,
      });

      if (result.data.success) {
        const found = result.data.campaigns.find(
          (c: any) => c.campaignId === id
        );
        if (found) {
          setCampaign(found);
        } else {
          showToast('Campaign not found', 'error');
          router.back();
        }
      }
    } catch (error) {
      console.error('Error loading campaign:', error);
      showToast('Failed to load campaign', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitContent = () => {
    showToast(
      'Content submission coming soon! Create a story and submit it to this challenge.',
      'info'
    );
  };

  const formatDate = (timestamp: { _seconds: number }) => {
    const date = new Date(timestamp._seconds * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (endTimestamp: { _seconds: number }) => {
    const now = Date.now();
    const end = endTimestamp._seconds * 1000;
    const diff = end - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Challenge Details' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Challenge Details' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Campaign not found</Text>
        </View>
      </View>
    );
  }

  const daysRemaining = getDaysRemaining(campaign.endAt);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: campaign.brandName,
          headerBackTitle: 'Challenges',
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          {campaign.brandLogoRef ? (
            <Image
              source={{ uri: campaign.brandLogoRef }}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.brandLogo, styles.placeholderLogo]}>
              <Text style={styles.placeholderText}>
                {campaign.brandName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>{campaign.brandName}</Text>
            <Text style={styles.campaignTheme}>
              {campaign.theme.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Campaign Title */}
        <Text style={styles.campaignTitle}>{campaign.campaignTitle}</Text>

        {/* Time Remaining */}
        <View style={styles.timeRemainingCard}>
          <Text style={styles.timeRemainingLabel}>Time Remaining</Text>
          <Text style={styles.timeRemainingValue}>
            {daysRemaining} {daysRemaining === 1 ? 'Day' : 'Days'}
          </Text>
          <Text style={styles.timeRemainingEnd}>
            Ends {formatDate(campaign.endAt)}
          </Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About This Challenge</Text>
          <Text style={styles.descriptionText}>{campaign.campaignDescription}</Text>
        </View>

        {/* Media Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Type</Text>
          <View style={styles.mediaTypeBadge}>
            <Text style={styles.mediaTypeText}>{campaign.mediaType}</Text>
          </View>
        </View>

        {/* Rules */}
        {campaign.contentRules && campaign.contentRules.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Challenge Rules</Text>
            {campaign.contentRules.map((rule, index) => (
              <View key={index} style={styles.ruleItem}>
                <Text style={styles.ruleBullet}>•</Text>
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Compliance Notice */}
        <View style={styles.complianceNotice}>
          <Text style={styles.complianceTitle}>📋 Participation Info</Text>
          <Text style={styles.complianceText}>
            • Participation is free and voluntary{'\n'}
            • No token rewards or economic incentives{'\n'}
            • No ranking boost in discovery{'\n'}
            • Winners may receive non-economic recognition{'\n'}
            • All content subject to safety moderation
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmitContent}
          disabled={submitting || daysRemaining === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              {daysRemaining === 0 ? 'Challenge Ended' : 'Create & Submit Content'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  brandLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#374151',
  },
  placeholderLogo: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  brandInfo: {
    marginLeft: 16,
    flex: 1,
  },
  brandName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  campaignTheme: {
    color: '#9CA3AF',
    fontSize: 14,
    textTransform: 'capitalize',
    marginTop: 4,
  },
  campaignTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    lineHeight: 32,
  },
  timeRemainingCard: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  timeRemainingLabel: {
    color: '#FFF',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 8,
  },
  timeRemainingValue: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  timeRemainingEnd: {
    color: '#FFF',
    fontSize: 14,
    opacity: 0.9,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  descriptionText: {
    color: '#D1D5DB',
    fontSize: 16,
    lineHeight: 24,
  },
  mediaTypeBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  mediaTypeText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  ruleItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  ruleBullet: {
    color: '#8B5CF6',
    fontSize: 16,
    marginRight: 12,
    fontWeight: 'bold',
  },
  ruleText: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  complianceNotice: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  complianceTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  complianceText: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 22,
  },
  submitButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
