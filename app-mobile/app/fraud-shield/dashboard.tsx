/**
 * PACK 174 - Fraud Alert Dashboard
 * View fraud cases, alerts, and security status
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { auth } from "@/lib/firebase";

interface FraudCase {
  id: string;
  fraudType: string;
  status: string;
  severity: string;
  riskScore: number;
  description: string;
  createdAt: Date;
}

interface RiskProfile {
  overallRiskScore: number;
  riskLevel: string;
  flags: string[];
}

export default function FraudDashboard() {
  const user = auth.currentUser;
  const [fraudCases, setFraudCases] = useState<FraudCase[]>([]);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const casesResponse = await fetch('/api/fraud/cases', {
        headers: { Authorization: `Bearer ${await user?.getIdToken()}` },
      });
      const casesData = await casesResponse.json();
      setFraudCases(casesData.cases || []);

      const profileResponse = await fetch('/api/fraud/risk-profile', {
        headers: { Authorization: `Bearer ${await user?.getIdToken()}` },
      });
      const profileData = await profileResponse.json();
      setRiskProfile(profileData);
    } catch (error) {
      console.error('Error loading fraud dashboard:', error);
      Alert.alert('Error', 'Failed to load fraud dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#FF0000';
      case 'high': return '#FF6600';
      case 'medium': return '#FFA500';
      case 'low': return '#00AA00';
      default: return '#666666';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return '#FF0000';
      case 'high': return '#FF6600';
      case 'medium': return '#FFA500';
      case 'low': return '#00AA00';
      default: return '#666666';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Fraud & Security Dashboard</Text>
        <Text style={styles.subtitle}>Protecting your account from scams and fraud</Text>
      </View>

      {riskProfile && (
        <View style={styles.riskCard}>
          <Text style={styles.sectionTitle}>Security Risk Level</Text>
          <View style={styles.riskScoreContainer}>
            <View style={[
              styles.riskScoreBadge,
              { backgroundColor: getRiskLevelColor(riskProfile.riskLevel) }
            ]}>
              <Text style={styles.riskScoreText}>{riskProfile.overallRiskScore}</Text>
            </View>
            <View style={styles.riskDetails}>
              <Text style={[
                styles.riskLevel,
                { color: getRiskLevelColor(riskProfile.riskLevel) }
              ]}>
                {riskProfile.riskLevel.toUpperCase()}
              </Text>
              <Text style={styles.riskDescription}>Risk Score</Text>
            </View>
          </View>
          
          {riskProfile.flags.length > 0 && (
            <View style={styles.flagsContainer}>
              <Text style={styles.flagsTitle}>Active Flags:</Text>
              {riskProfile.flags.map((flag, index) => (
                <Text key={index} style={styles.flag}>• {flag.replace(/_/g, ' ')}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.casesSection}>
        <Text style={styles.sectionTitle}>Recent Fraud Cases</Text>
        
        {fraudCases.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🛡️</Text>
            <Text style={styles.emptyStateText}>No fraud cases detected</Text>
            <Text style={styles.emptyStateSubtext}>
              Your account is secure. We're constantly monitoring for suspicious activity.
            </Text>
          </View>
        ) : (
          fraudCases.map((fraudCase) => (
            <TouchableOpacity
              key={fraudCase.id}
              style={styles.caseCard}
              onPress={() => {
                Alert.alert('Case Details', fraudCase.description);
              }}
            >
              <View style={styles.caseHeader}>
                <View style={[
                  styles.severityBadge,
                  { backgroundColor: getSeverityColor(fraudCase.severity) }
                ]}>
                  <Text style={styles.severityText}>{fraudCase.severity.toUpperCase()}</Text>
                </View>
                <Text style={styles.caseStatus}>{fraudCase.status}</Text>
              </View>
              
              <Text style={styles.caseType}>{fraudCase.fraudType.replace(/_/g, ' ')}</Text>
              <Text style={styles.caseDescription}>{fraudCase.description}</Text>
              
              <View style={styles.caseFooter}>
                <Text style={styles.caseDate}>
                  {new Date(fraudCase.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.caseRisk}>
                  Risk: {fraudCase.riskScore}/100
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>📊</Text>
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonTitle}>View Spending Safety Settings</Text>
            <Text style={styles.actionButtonSubtitle}>Manage daily limits and alerts</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>⚠️</Text>
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonTitle}>Report Suspicious Activity</Text>
            <Text style={styles.actionButtonSubtitle}>Flag fraud or scam attempts</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>🔐</Text>
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonTitle}>Identity Verification</Text>
            <Text style={styles.actionButtonSubtitle}>Verify your account security</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  riskCard: {
    margin: 15,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 15,
  },
  riskScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  riskScoreBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  riskScoreText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  riskDetails: {
    flex: 1,
  },
  riskLevel: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  riskDescription: {
    fontSize: 14,
    color: '#666666',
  },
  flagsContainer: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
  },
  flagsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 5,
  },
  flag: {
    fontSize: 13,
    color: '#856404',
    marginVertical: 2,
  },
  casesSection: {
    padding: 15,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  caseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  caseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  caseStatus: {
    fontSize: 12,
    color: '#666666',
    textTransform: 'capitalize',
  },
  caseType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 5,
    textTransform: 'capitalize',
  },
  caseDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 10,
  },
  caseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 10,
  },
  caseDate: {
    fontSize: 12,
    color: '#999999',
  },
  caseRisk: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6600',
  },
  actionsSection: {
    padding: 15,
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonIcon: {
    fontSize: 32,
    marginRight: 15,
  },
  actionButtonContent: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 3,
  },
  actionButtonSubtitle: {
    fontSize: 13,
    color: '#666666',
  },
});
