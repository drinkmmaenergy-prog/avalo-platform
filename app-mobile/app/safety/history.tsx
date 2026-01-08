import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { doc, getDoc } from 'firebase/firestore';
import { db } from "@/lib/firebase";

interface ModerationIncident {
  category: string;
  severity: string;
  action: string;
  timestamp: number;
  reason?: string;
}

export default function SafetyHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<ModerationIncident[]>([]);
  const [totalIncidents, setTotalIncidents] = useState(0);

  useEffect(() => {
    if (user?.uid) {
      loadHistory();
    }
  }, [user?.uid]);

  const loadHistory = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      
      // Get moderation stats
      const statsRef = doc(db, 'userModerationStats', user.uid);
      const statsSnap = await getDoc(statsRef);

      if (statsSnap.exists()) {
        const stats = statsSnap.data();
        setTotalIncidents(stats?.totalIncidents || 0);
        
        // Get incidents array and sort by timestamp descending
        const rawIncidents = stats?.incidents || [];
        const sortedIncidents = rawIncidents
          .map((inc: any) => ({
            category: inc.category || 'UNKNOWN',
            severity: inc.severity || 'MEDIUM',
            action: inc.action || 'WARNING',
            timestamp: inc.timestamp || Date.now(),
            reason: inc.reason,
          }))
          .sort((a: ModerationIncident, b: ModerationIncident) => b.timestamp - a.timestamp);
        
        setIncidents(sortedIncidents);
      }
    } catch (error) {
      console.error('Error loading safety history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIncidentIcon = (severity: string): string => {
    switch (severity.toUpperCase()) {
      case 'LOW':
        return '⚠️';
      case 'MEDIUM':
        return '🔒';
      case 'HIGH':
        return '⛔';
      case 'CRITICAL':
        return '🚫';
      default:
        return '⚠️';
    }
  };

  const getIncidentColor = (action: string): string => {
    switch (action.toUpperCase()) {
      case 'WARNING':
        return '#FFA500'; // Yellow/Orange
      case 'RESTRICTED':
        return '#FF8C00'; // Orange
      case 'SUSPENDED':
        return '#FF0033'; // Red
      case 'BANNED_PERMANENT':
        return '#000000'; // Black
      default:
        return '#FFA500';
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  };

  const formatCategory = (category: string): string => {
    return category
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatAction = (action: string): string => {
    switch (action.toUpperCase()) {
      case 'WARNING':
        return t('safety.warningTitle');
      case 'RESTRICTED':
        return t('safety.restrictedTitle');
      case 'SUSPENDED':
        return t('safety.suspendedTitle');
      case 'BANNED_PERMANENT':
        return t('safety.bannedTitle');
      default:
        return action;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Stack.Screen
          options={{
            title: t('safety.historyTitle'),
            headerBackTitle: t('common.back'),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#40E0D0" />
          <Text style={[styles.loadingText, isDark && styles.textDark]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <Stack.Screen
        options={{
          title: t('safety.historyTitle'),
          headerBackTitle: t('common.back'),
        }}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>
          {t('safety.moderationHistory')}
        </Text>
        <Text style={[styles.headerSubtitle, isDark && styles.textDarkSecondary]}>
          {t('safety.totalIncidents', { count: totalIncidents })}
        </Text>
      </View>

      {/* Community Rules Button */}
      <TouchableOpacity
        style={styles.rulesButton}
        onPress={() => router.push('/legal/community' as any)}
      >
        <Text style={styles.rulesButtonText}>
          📖 {t('safety.readCommunityRules')}
        </Text>
      </TouchableOpacity>

      {/* Incidents Timeline */}
      {incidents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            {t('safety.noIncidents')}
          </Text>
          <Text style={[styles.emptyText, isDark && styles.textDarkSecondary]}>
            {t('safety.noIncidentsMessage')}
          </Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {incidents.map((incident, index) => (
            <View key={index} style={styles.incidentCard}>
              {/* Timeline indicator */}
              <View style={styles.timelineIndicator}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: getIncidentColor(incident.action) },
                  ]}
                />
                {index < incidents.length - 1 && <View style={styles.timelineLine} />}
              </View>

              {/* Incident content */}
              <View style={[styles.incidentContent, isDark && styles.incidentContentDark]}>
                <View style={styles.incidentHeader}>
                  <Text style={styles.incidentIcon}>{getIncidentIcon(incident.severity)}</Text>
                  <View style={styles.incidentInfo}>
                    <Text style={[styles.incidentCategory, isDark && styles.textDark]}>
                      {formatCategory(incident.category)}
                    </Text>
                    <Text style={[styles.incidentDate, isDark && styles.textDarkSecondary]}>
                      {formatDate(incident.timestamp)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.incidentAction,
                    { backgroundColor: `${getIncidentColor(incident.action)}15` },
                  ]}
                >
                  <Text
                    style={[
                      styles.incidentActionText,
                      { color: getIncidentColor(incident.action) },
                    ]}
                  >
                    {t('safety.actionTaken')}: {formatAction(incident.action)}
                  </Text>
                </View>

                {incident.reason && (
                  <Text style={[styles.incidentReason, isDark && styles.textDarkSecondary]}>
                    {incident.reason}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  rulesButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#40E0D0',
    borderRadius: 12,
    alignItems: 'center',
  },
  rulesButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  timeline: {
    padding: 16,
  },
  incidentCard: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineIndicator: {
    width: 40,
    alignItems: 'center',
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 4,
  },
  incidentContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  incidentContentDark: {
    backgroundColor: '#1a1a1a',
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  incidentIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  incidentInfo: {
    flex: 1,
  },
  incidentCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  incidentDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  incidentAction: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  incidentActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  incidentReason: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  textDark: {
    color: '#ffffff',
  },
  textDarkSecondary: {
    color: '#9CA3AF',
  },
  bottomSpacing: {
    height: 32,
  },
});
