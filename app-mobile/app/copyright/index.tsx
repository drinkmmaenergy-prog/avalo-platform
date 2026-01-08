/**
 * PACK 127 — Copyright Center (Mobile)
 * 
 * Main copyright protection dashboard for creators
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface IPDashboard {
  contentProtection: {
    totalFingerprints: number;
    activeFingerprints: number;
    disputedContent: number;
  };
  claims: {
    filedByYou: number;
    filedAgainstYou: number;
    openClaims: number;
  };
  antiPiracy: {
    detectionsTotal: number;
    confirmedLeaks: number;
    investigating: number;
  };
  licensing: {
    licensesOwned: number;
    licensesHeld: number;
    activeLicenses: number;
    totalLicenseRevenue: number;
  };
}

export default function CopyrightCenterScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<IPDashboard | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const getIPDashboard = httpsCallable(functions, 'pack127_getIPDashboard');
      const result = await getIPDashboard({});
      
      if (result.data.success) {
        setDashboard(result.data.dashboard);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load copyright dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading Copyright Center...</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load dashboard</Text>
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Copyright Center</Text>
        <Text style={styles.subtitle}>
          Protect your intellectual property
        </Text>
      </View>

      {/* Content Protection Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Content Protection</Text>
        <View style={styles.statsCard}>
          <StatItem
            label="Protected Content"
            value={dashboard.contentProtection.totalFingerprints}
            color="#4CAF50"
          />
          <StatItem
            label="Active"
            value={dashboard.contentProtection.activeFingerprints}
            color="#2196F3"
          />
          <StatItem
            label="Disputed"
            value={dashboard.contentProtection.disputedContent}
            color="#FF9800"
          />
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/copyright/my-content')}
        >
          <Text style={styles.actionButtonText}>View Protected Content</Text>
        </TouchableOpacity>
      </View>

      {/* Copyright Claims Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Copyright Claims</Text>
        <View style={styles.statsCard}>
          <StatItem
            label="Claims Filed"
            value={dashboard.claims.filedByYou}
            color="#2196F3"
          />
          <StatItem
            label="Claims Received"
            value={dashboard.claims.filedAgainstYou}
            color="#FF9800"
          />
          <StatItem
            label="Open Cases"
            value={dashboard.claims.openClaims}
            color="#F44336"
          />
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.halfButton]}
            onPress={() => router.push('/copyright/submit-claim')}
          >
            <Text style={styles.actionButtonText}>File Claim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.halfButton, styles.secondaryButton]}
            onPress={() => router.push('/copyright/my-claims')}
          >
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
              View Claims
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Anti-Piracy Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Anti-Piracy Protection</Text>
        <View style={styles.statsCard}>
          <StatItem
            label="Total Detections"
            value={dashboard.antiPiracy.detectionsTotal}
            color="#9C27B0"
          />
          <StatItem
            label="Confirmed Leaks"
            value={dashboard.antiPiracy.confirmedLeaks}
            color="#F44336"
          />
          <StatItem
            label="Investigating"
            value={dashboard.antiPiracy.investigating}
            color="#FF9800"
          />
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🛡️ Your content is watermarked for leak detection
          </Text>
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/copyright/report-piracy')}
        >
          <Text style={styles.actionButtonText}>Report Piracy</Text>
        </TouchableOpacity>
      </View>

      {/* Licensing Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>IP Licensing</Text>
        <View style={styles.statsCard}>
          <StatItem
            label="Licenses Owned"
            value={dashboard.licensing.licensesOwned}
            color="#4CAF50"
          />
          <StatItem
            label="Licenses Held"
            value={dashboard.licensing.licensesHeld}
            color="#2196F3"
          />
          <StatItem
            label="Active"
            value={dashboard.licensing.activeLicenses}
            color="#00BCD4"
          />
        </View>
        {dashboard.licensing.totalLicenseRevenue > 0 && (
          <View style={styles.revenueBox}>
            <Text style={styles.revenueLabel}>Total License Revenue</Text>
            <Text style={styles.revenueValue}>
              ${dashboard.licensing.totalLicenseRevenue.toLocaleString()}
            </Text>
          </View>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.halfButton]}
            onPress={() => router.push('/copyright/create-license')}
          >
            <Text style={styles.actionButtonText}>Create License</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.halfButton, styles.secondaryButton]}
            onPress={() => router.push('/copyright/my-licenses')}
          >
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
              View Licenses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Help Section */}
      <View style={styles.section}>
        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            • All creators are protected equally{'\n'}
            • No economic effects during disputes{'\n'}
            • False claims penalize the claimant{'\n'}
            • Your earnings are never affected by piracy
          </Text>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={() => router.push('/copyright/help')}
          >
            <Text style={styles.helpButtonText}>Learn More</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#F44336',
  },
  header: {
    backgroundColor: '#6200EA',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#E1BEE7',
  },
  section: {
    backgroundColor: '#FFF',
    marginTop: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#6200EA',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  halfButton: {
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#6200EA',
  },
  secondaryButtonText: {
    color: '#6200EA',
  },
  infoBox: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#2E7D32',
    textAlign: 'center',
  },
  revenueBox: {
    backgroundColor: '#F3E5F5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 12,
    color: '#7B1FA2',
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6A1B9A',
  },
  helpCard: {
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 12,
  },
  helpText: {
    fontSize: 14,
    color: '#EF6C00',
    lineHeight: 20,
    marginBottom: 12,
  },
  helpButton: {
    backgroundColor: '#FF6F00',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  helpButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 40,
  },
});
