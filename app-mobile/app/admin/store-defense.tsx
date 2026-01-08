/**
 * PACK 376: App Store Defense Admin Dashboard
 * Monitor reviews, threats, and reputation metrics
 */

import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  TouchableOpacity,
  Alert 
} from 'react-native';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { firestore } from "@/lib/firebase";

interface ReviewThreat {
  id: string;
  reviewId: string;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signals: string[];
  status: string;
  detectedAt: Date;
}

interface ReputationMetric {
  platform: string;
  avgRating: number;
  reviewCount: number;
  status: string;
  date: string;
}

interface ASOMetric {
  platform: string;
  metricType: string;
  value: number;
  keyword?: string;
  date: string;
}

export default function StoreDefenseAdmin() {
  const [threats, setThreats] = useState<ReviewThreat[]>([]);
  const [reputation, setReputation] = useState<ReputationMetric | null>(null);
  const [asoMetrics, setAsoMetrics] = useState<ASOMetric[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<any>({});

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      await Promise.all([
        loadThreats(),
        loadReputation(),
        loadASOMetrics(),
        loadFeatureFlags()
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    }
  };

  const loadThreats = async () => {
    try {
      const threatsRef = collection(firestore, 'reviewThreats');
      const q = query(
        threatsRef,
        where('status', 'in', ['detected', 'investigating']),
        orderBy('detectedAt', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);

      const threatsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        detectedAt: doc.data().detectedAt.toDate()
      })) as ReviewThreat[];

      setThreats(threatsData);
    } catch (error) {
      console.error('Error loading threats:', error);
    }
  };

  const loadReputation = async () => {
    try {
      const repRef = doc(firestore, 'reputationMetrics', 'current');
      const repDoc = await getDoc(repRef);

      if (repDoc.exists()) {
        setReputation(repDoc.data() as ReputationMetric);
      }
    } catch (error) {
      console.error('Error loading reputation:', error);
    }
  };

  const loadASOMetrics = async () => {
    try {
      const metricsRef = collection(firestore, 'asoMetrics');
      const q = query(
        metricsRef,
        orderBy('date', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);

      const metricsData = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as ASOMetric[];

      setAsoMetrics(metricsData);
    } catch (error) {
      console.error('Error loading ASO metrics:', error);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const flagsRef = doc(firestore, 'featureFlags', 'reviews');
      const flagsDoc = await getDoc(flagsRef);

      if (flagsDoc.exists()) {
        setFeatureFlags(flagsDoc.data());
      }
    } catch (error) {
      console.error('Error loading feature flags:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: '#4caf50',
      medium: '#ff9800',
      high: '#f44336',
      critical: '#9c27b0'
    };
    return colors[severity] || '#999';
  };

  const getStatusColor = (status: string) => {
    if (status === 'damage_control') return '#f44336';
    return '#4caf50';
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Store Defense</Text>
        <Text style={styles.headerSubtitle}>PACK 376 - Admin Dashboard</Text>
      </View>

      {/* Reputation Overview */}
      {reputation && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reputation Status</Text>
          <View style={styles.reputationContainer}>
            <View style={styles.ratingBox}>
              <Text style={styles.ratingValue}>{reputation.avgRating.toFixed(2)}</Text>
              <Text style={styles.ratingLabel}>⭐ Average Rating</Text>
            </View>
            <View style={styles.ratingBox}>
              <Text style={styles.ratingValue}>{reputation.reviewCount}</Text>
              <Text style={styles.ratingLabel}>Total Reviews</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(reputation.status) }]}>
            <Text style={styles.statusText}>{reputation.status.toUpperCase()}</Text>
          </View>
          <Text style={styles.cardSubtext}>Platform: {reputation.platform}</Text>
        </View>
      )}

      {/* Feature Flags */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>System Status</Text>
        <View style={styles.flagsContainer}>
          <FlagItem
            label="Review Requests"
            enabled={featureFlags['reviews.ask.enabled']}
          />
          <FlagItem
            label="Review Ingestion"
            enabled={featureFlags['reviews.ingest.enabled']}
          />
          <FlagItem
            label="Anti-Bombing"
            enabled={featureFlags['anti.reviewBomb.enabled']}
          />
          <FlagItem
            label="ASO Autopilot"
            enabled={featureFlags['aso.autopilot.enabled']}
          />
          <FlagItem
            label="Trust Scoring"
            enabled={featureFlags['trustScore.enabled']}
          />
        </View>
        {featureFlags.antiAttackMode && (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>⚠️ ANTI-ATTACK MODE ACTIVE</Text>
          </View>
        )}
      </View>

      {/* Active Threats */}
      {threats.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Active Threats ({threats.length})</Text>
          {threats.map((threat) => (
            <View key={threat.id} style={styles.threatItem}>
              <View style={[styles.severityDot, { backgroundColor: getSeverityColor(threat.severity) }]} />
              <View style={styles.threatContent}>
                <Text style={styles.threatType}>{threat.threatType.replace('_', ' ').toUpperCase()}</Text>
                <Text style={styles.threatDetails}>
                  {threat.signals.join(', ')}
                </Text>
                <Text style={styles.threatTime}>
                  {threat.detectedAt.toLocaleString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ASO Metrics Summary */}
      {asoMetrics.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ASO Metrics</Text>
          {asoMetrics.slice(0, 5).map((metric, index) => (
            <View key={index} style={styles.metricItem}>
              <Text style={styles.metricType}>{metric.metricType}</Text>
              <Text style={styles.metricValue}>
                {metric.keyword ? `"${metric.keyword}": ` : ''}
                {metric.value}
              </Text>
              <Text style={styles.metricDate}>{metric.date}</Text>
            </View>
          ))}
        </View>
      )}

      {/* No Data */}
      {threats.length === 0 && !reputation && asoMetrics.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>🛡️ System operational. No threats detected.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function FlagItem({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <View style={styles.flagItem}>
      <Text style={styles.flagLabel}>{label}</Text>
      <View style={[styles.flagStatus, { backgroundColor: enabled ? '#4caf50' : '#999' }]}>
        <Text style={styles.flagStatusText}>{enabled ? 'ON' : 'OFF'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#6200ea',
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#d1c4e9',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  cardSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  reputationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  ratingBox: {
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6200ea',
  },
  ratingLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  flagsContainer: {
    gap: 12,
  },
  flagItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  flagLabel: {
    fontSize: 14,
    color: '#333',
  },
  flagStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flagStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  alertBox: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  alertText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e65100',
  },
  threatItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  severityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: 12,
  },
  threatContent: {
    flex: 1,
  },
  threatType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  threatDetails: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  threatTime: {
    fontSize: 11,
    color: '#999',
  },
  metricItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metricType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  metricDate: {
    fontSize: 11,
    color: '#999',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});

