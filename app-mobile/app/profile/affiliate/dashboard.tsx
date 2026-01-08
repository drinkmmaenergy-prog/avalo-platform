/**
 * PACK 167 - Affiliate Dashboard
 * Main dashboard for creators to view affiliate performance
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

interface AffiliateStats {
  totalLinks: number;
  activeLinks: number;
  totalClicks: number;
  totalConversions: number;
  conversionRate: number;
  totalRevenue: number;
  totalCommissions: number;
  pendingCommissions: number;
  paidCommissions: number;
}

interface AffiliateLink {
  id: string;
  productName: string;
  shortCode: string;
  fullUrl: string;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  isActive: boolean;
  createdAt: Date;
}

export default function AffiliateDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [topLinks, setTopLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, 'affiliate_analytics', user.uid));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          setStats({
            totalLinks: data.totalLinks || 0,
            activeLinks: data.activeLinks || 0,
            totalClicks: data.totalClicks || 0,
            totalConversions: data.totalConversions || 0,
            conversionRate: data.conversionRate || 0,
            totalRevenue: data.totalRevenue || 0,
            totalCommissions: data.totalCommissions || 0,
            pendingCommissions: data.pendingCommissions || 0,
            paidCommissions: data.paidCommissions || 0,
          });
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
      setLoading(false);
    };

    loadStats();

    const unsubscribeLinks = onSnapshot(
      query(
        collection(db, 'affiliate_links'),
        where('creatorId', '==', user.uid)
      ),
      (snapshot) => {
        const links = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              productName: data.productName || '',
              shortCode: data.shortCode || '',
              fullUrl: data.fullUrl || '',
              totalClicks: data.totalClicks || 0,
              totalConversions: data.totalConversions || 0,
              totalRevenue: data.totalRevenue || 0,
              isActive: data.isActive || false,
              createdAt: data.createdAt?.toDate() || new Date(),
            } as AffiliateLink;
          })
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 5);
        
        setTopLinks(links);
      }
    );

    return () => {
      unsubscribeLinks();
    };
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Affiliate Dashboard</Text>
        <Text style={styles.subtitle}>Track your referral performance</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="link-outline" size={24} color="#007AFF" />
          <Text style={styles.statValue}>{stats?.totalLinks || 0}</Text>
          <Text style={styles.statLabel}>Total Links</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="eye-outline" size={24} color="#34C759" />
          <Text style={styles.statValue}>{stats?.totalClicks || 0}</Text>
          <Text style={styles.statLabel}>Total Clicks</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="cart-outline" size={24} color="#FF9500" />
          <Text style={styles.statValue}>{stats?.totalConversions || 0}</Text>
          <Text style={styles.statLabel}>Conversions</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="trending-up-outline" size={24} color="#5856D6" />
          <Text style={styles.statValue}>
            {((stats?.conversionRate || 0) * 100).toFixed(1)}%
          </Text>
          <Text style={styles.statLabel}>Conv. Rate</Text>
        </View>
      </View>

      <View style={styles.revenueCard}>
        <View style={styles.revenueHeader}>
          <Ionicons name="cash-outline" size={32} color="#34C759" />
          <Text style={styles.revenueTitle}>Earnings</Text>
        </View>
        
        <View style={styles.revenueRow}>
          <Text style={styles.revenueLabel}>Total Revenue:</Text>
          <Text style={styles.revenueValue}>
            ${(stats?.totalRevenue || 0).toFixed(2)}
          </Text>
        </View>

        <View style={styles.revenueRow}>
          <Text style={styles.revenueLabel}>Your Commissions:</Text>
          <Text style={styles.revenueValue}>
            ${(stats?.totalCommissions || 0).toFixed(2)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.revenueRow}>
          <Text style={styles.revenueLabelPending}>Pending:</Text>
          <Text style={styles.revenueValuePending}>
            ${(stats?.pendingCommissions || 0).toFixed(2)}
          </Text>
        </View>

        <View style={styles.revenueRow}>
          <Text style={styles.revenueLabelPaid}>Paid Out:</Text>
          <Text style={styles.revenueValuePaid}>
            ${(stats?.paidCommissions || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Performing Links</Text>
        {topLinks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="link-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyText}>No affiliate links yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first affiliate link to start earning
            </Text>
          </View>
        ) : (
          topLinks.map((link) => (
            <TouchableOpacity
              key={link.id}
              style={styles.linkCard}
              activeOpacity={0.7}
            >
              <View style={styles.linkHeader}>
                <Text style={styles.linkName} numberOfLines={1}>
                  {link.productName}
                </Text>
                <View
                  style={[
                    styles.badge,
                    link.isActive ? styles.activeBadge : styles.inactiveBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      link.isActive ? styles.activeBadgeText : styles.inactiveBadgeText,
                    ]}
                  >
                    {link.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>

              <Text style={styles.linkUrl} numberOfLines={1}>
                {link.fullUrl}
              </Text>

              <View style={styles.linkStats}>
                <View style={styles.linkStat}>
                  <Text style={styles.linkStatValue}>{link.totalClicks}</Text>
                  <Text style={styles.linkStatLabel}>Clicks</Text>
                </View>
                <View style={styles.linkStat}>
                  <Text style={styles.linkStatValue}>{link.totalConversions}</Text>
                  <Text style={styles.linkStatLabel}>Sales</Text>
                </View>
                <View style={styles.linkStat}>
                  <Text style={styles.linkStatValue}>
                    ${link.totalRevenue.toFixed(0)}
                  </Text>
                  <Text style={styles.linkStatLabel}>Revenue</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Create Link</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.8}
        >
          <Ionicons name="analytics-outline" size={24} color="#007AFF" />
          <Text style={styles.secondaryButtonText}>View Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.8}
        >
          <Ionicons name="wallet-outline" size={24} color="#007AFF" />
          <Text style={styles.secondaryButtonText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Commissions become available 30 days after conversion
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  revenueCard: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  revenueTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginLeft: 12,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  revenueLabel: {
    fontSize: 15,
    color: '#3C3C43',
  },
  revenueValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  revenueLabelPending: {
    fontSize: 15,
    color: '#FF9500',
  },
  revenueValuePending: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF9500',
  },
  revenueLabelPaid: {
    fontSize: 15,
    color: '#34C759',
  },
  revenueValuePaid: {
    fontSize: 15,
    fontWeight: '600',
    color: '#34C759',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 12,
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#3C3C43',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginRight: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadge: {
    backgroundColor: '#E8F5E9',
  },
  inactiveBadge: {
    backgroundColor: '#F5F5F5',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeBadgeText: {
    color: '#34C759',
  },
  inactiveBadgeText: {
    color: '#8E8E93',
  },
  linkUrl: {
    fontSize: 13,
    color: '#007AFF',
    marginBottom: 12,
  },
  linkStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  linkStat: {
    alignItems: 'center',
  },
  linkStatValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  linkStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  actionButtons: {
    padding: 16,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
});
