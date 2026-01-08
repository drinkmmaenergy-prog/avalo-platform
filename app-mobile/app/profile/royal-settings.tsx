/**
 * PACK 253 — Royal Settings
 * Configure Royal benefits and pricing
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Stack } from 'expo-router';

interface RoyalStatusData {
  isRoyal: boolean;
  isDormant: boolean;
  royalSince: number | null;
  royalExpiresAt: number | null;
  currentMetrics: {
    uniquePaidPartners: number;
    totalEarnings: number;
    averageRating: number;
    isVerified: boolean;
  };
  metricsPassingCount: number;
  decayWarning: boolean;
}

export default function RoyalSettingsScreen() {
  const [status, setStatus] = useState<RoyalStatusData | null>(null);
  const [chatPrice, setChatPrice] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const functions = getFunctions();
      const getRoyalStatus = httpsCallable(functions, 'getRoyalStatus');
      const result = await getRoyalStatus({});
      setStatus(result.data as RoyalStatusData);

      // Load current pricing
      // Note: In real implementation, fetch from royal_pricing collection
    } catch (error) {
      console.error('Error loading Royal status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetChatPrice = async () => {
    const price = parseInt(chatPrice);
    
    if (isNaN(price) || price < 100 || price > 500) {
      Alert.alert('Invalid Price', 'Chat price must be between 100 and 500 tokens');
      return;
    }

    try {
      setSaving(true);
      const functions = getFunctions();
      const setRoyalChatPricing = httpsCallable(functions, 'setRoyalChatPricing');
      await setRoyalChatPricing({ chatPrice: price });
      
      Alert.alert('Success', `Chat entry price set to ${price} tokens`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to set chat price');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveChatPrice = async () => {
    Alert.alert(
      'Remove Entry Price',
      'Are you sure you want to remove your chat entry price?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const functions = getFunctions();
              const setRoyalChatPricing = httpsCallable(functions, 'setRoyalChatPricing');
              await setRoyalChatPricing({ chatPrice: 0 });
              setChatPrice('');
              Alert.alert('Success', 'Chat entry price removed');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove chat price');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (!status?.isRoyal) {
    return (
      <View style={styles.notRoyalContainer}>
        <Stack.Screen
          options={{
            title: 'Royal Settings',
            headerStyle: { backgroundColor: '#0F172A' },
            headerTintColor: '#F1F5F9',
          }}
        />
        <MaterialCommunityIcons name="crown-outline" size={64} color="#64748B" />
        <Text style={styles.notRoyalTitle}>Not a Royal Creator</Text>
        <Text style={styles.notRoyalText}>
          Earn Royal status to access these settings
        </Text>
      </View>
    );
  }

  const daysRemaining = status.royalExpiresAt
    ? Math.floor((status.royalExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Royal Settings',
          headerStyle: { backgroundColor: '#0F172A' },
          headerTintColor: '#FFD700',
        }}
      />

      <ScrollView style={styles.scrollView}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <MaterialCommunityIcons name="crown" size={32} color="#FFD700" />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>Royal Status Active</Text>
              <Text style={styles.statusSubtitle}>
                {daysRemaining} days remaining
              </Text>
            </View>
          </View>

          {status.decayWarning && (
            <View style={styles.warningBanner}>
              <MaterialCommunityIcons name="alert" size={20} color="#F59E0B" />
              <Text style={styles.warningText}>
                Maintain at least 2 of your Royal metrics to keep your status
              </Text>
            </View>
          )}

          <View style={styles.metricsStatus}>
            <Text style={styles.metricsTitle}>Current Metrics</Text>
            <View style={styles.metricsList}>
              <MetricStatus
                icon="account-multiple"
                label="Paid Partners"
                value={status.currentMetrics.uniquePaidPartners}
                required={30}
                passing={status.currentMetrics.uniquePaidPartners >= 30}
              />
              <MetricStatus
                icon="currency-usd"
                label="Earnings"
                value={status.currentMetrics.totalEarnings}
                required={10000}
                passing={status.currentMetrics.totalEarnings >= 10000}
              />
              <MetricStatus
                icon="star"
                label="Rating"
                value={status.currentMetrics.averageRating}
                required={4.2}
                passing={status.currentMetrics.averageRating >= 4.2}
                isRating
              />
              <MetricStatus
                icon="shield-check"
                label="Verified"
                value={status.currentMetrics.isVerified ? 1 : 0}
                required={1}
                passing={status.currentMetrics.isVerified}
                isBinary
              />
            </View>
          </View>
        </View>

        {/* Chat Pricing Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="cash-multiple" size={24} color="#FFD700" />
            <Text style={styles.cardTitle}>Custom Chat Pricing</Text>
          </View>
          
          <Text style={styles.cardDescription}>
            Set an entry price for users to start a chat with you. This is optional and can be changed anytime.
          </Text>

          <View style={styles.priceInput}>
            <TextInput
              style={styles.input}
              value={chatPrice}
              onChangeText={setChatPrice}
              placeholder="Enter price (100-500)"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              editable={!saving}
            />
            <Text style={styles.inputSuffix}>tokens</Text>
          </View>

          <View style={styles.priceRange}>
            <Text style={styles.rangeLabel}>Min: 100</Text>
            <Text style={styles.rangeLabel}>Max: 500</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.setButton]}
              onPress={handleSetChatPrice}
              disabled={saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                  <Text style={styles.buttonText}>Set Price</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.removeButton]}
              onPress={handleRemoveChatPrice}
              disabled={saving}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={20} color="#EF4444" />
              <Text style={[styles.buttonText, styles.removeButtonText]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Benefits Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="gift" size={24} color="#FFD700" />
            <Text style={styles.cardTitle}>Your Royal Benefits</Text>
          </View>

          <View style={styles.benefitsList}>
            <BenefitItem
              icon="chart-line"
              title="Better Earnings"
              description="7 words = 1 token (vs 11 for standard)"
            />
            <BenefitItem
              icon="inbox-arrow-up"
              title="Priority Inbox"
              description="Always appear first in user inboxes"
            />
            <BenefitItem
              icon="trending-up"
              title="Discovery Boost"
              description="Top 10% ranking in global discovery"
            />
            <BenefitItem
              icon="chart-box"
              title="Royal Analytics"
              description="Deep insights into your revenue"
            />
            <BenefitItem
              icon="calendar-star"
              title="Exclusive Events"
              description="Access to Royal networking events"
            />
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

interface MetricStatusProps {
  icon: string;
  label: string;
  value: number;
  required: number;
  passing: boolean;
  isRating?: boolean;
  isBinary?: boolean;
}

function MetricStatus({ 
  icon, 
  label, 
  value, 
  required, 
  passing,
  isRating = false,
  isBinary = false,
}: MetricStatusProps) {
  const formatValue = (val: number) => {
    if (isBinary) return passing ? 'Yes' : 'No';
    if (isRating) return val.toFixed(1);
    return val.toLocaleString();
  };

  return (
    <View style={styles.metricItem}>
      <MaterialCommunityIcons
        name={icon as any}
        size={20}
        color={passing ? '#10B981' : '#EF4444'}
      />
      <View style={styles.metricContent}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, passing && styles.metricValuePassing]}>
          {formatValue(value)} / {formatValue(required)}
        </Text>
      </View>
      <MaterialCommunityIcons
        name={passing ? 'check-circle' : 'alert-circle'}
        size={20}
        color={passing ? '#10B981' : '#EF4444'}
      />
    </View>
  );
}

interface BenefitItemProps {
  icon: string;
  title: string;
  description: string;
}

function BenefitItem({ icon, title, description }: BenefitItemProps) {
  return (
    <View style={styles.benefitItem}>
      <MaterialCommunityIcons name={icon as any} size={24} color="#FFD700" />
      <View style={styles.benefitContent}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  notRoyalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 32,
  },
  notRoyalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginTop: 16,
  },
  notRoyalText: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    margin: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 12,
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  warningText: {
    fontSize: 14,
    color: '#F59E0B',
    marginLeft: 8,
    flex: 1,
  },
  metricsStatus: {
    marginTop: 20,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 12,
  },
  metricsList: {
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
  },
  metricContent: {
    marginLeft: 12,
    flex: 1,
  },
  metricLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 2,
  },
  metricValuePassing: {
    color: '#10B981',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginTop: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F1F5F9',
    marginLeft: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 16,
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#F1F5F9',
    paddingVertical: 16,
  },
  inputSuffix: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  priceRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rangeLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  setButton: {
    backgroundColor: '#FFD700',
  },
  removeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  removeButtonText: {
    color: '#EF4444',
  },
  benefitsList: {
    gap: 16,
    marginTop: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  benefitContent: {
    marginLeft: 12,
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  benefitDescription: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 32,
  },
});
