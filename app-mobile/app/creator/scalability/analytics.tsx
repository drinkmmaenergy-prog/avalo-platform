/**
 * PACK 166: Product Analytics Screen
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function AnalyticsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>Track performance and optimize</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Analytics</Text>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>📊</Text>
            <View style={styles.metricContent}>
              <Text style={styles.metricTitle}>Conversion Metrics</Text>
              <Text style={styles.metricDesc}>Track conversions per product and source</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>📈</Text>
            <View style={styles.metricContent}>
              <Text style={styles.metricTitle}>Revenue Analytics</Text>
              <Text style={styles.metricDesc}>Monitor revenue and retention rates</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🎯</Text>
            <View style={styles.metricContent}>
              <Text style={styles.metricTitle}>Bundle Performance</Text>
              <Text style={styles.metricDesc}>Analyze bundle conversion and revenue</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🔄</Text>
            <View style={styles.metricContent}>
              <Text style={styles.metricTitle}>Upsell Success</Text>
              <Text style={styles.metricDesc}>Track upsell impressions and conversions</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Forbidden Analytics</Text>
          <Text style={styles.infoWarning}>✗ No ranking by spending power</Text>
          <Text style={styles.infoWarning}>✗ No "top fans" identification</Text>
          <Text style={styles.infoWarning}>✗ No attractiveness-based metrics</Text>
          <Text style={styles.infoWarning}>✗ No body-focused performance data</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#FFFFFF', padding: 24, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666' },
  section: { marginTop: 16, backgroundColor: '#FFFFFF', padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 16 },
  metricCard: { flexDirection: 'row', backgroundColor: '#F9F9F9', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E5E5' },
  metricIcon: { fontSize: 32, marginRight: 12 },
  metricContent: { flex: 1 },
  metricTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 4 },
  metricDesc: { fontSize: 14, color: '#666' },
  infoCard: { backgroundColor: '#FFF3F3', margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FFCCCC' },
  infoTitle: { fontSize: 16, fontWeight: '600', color: '#CC0000', marginBottom: 12 },
  infoWarning: { fontSize: 14, color: '#CC0000', marginBottom: 8 },
});
