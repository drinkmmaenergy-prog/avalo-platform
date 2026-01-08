import React from 'react';
import { ScrollView, View, Text, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  VictoryChart,
  VictoryLine,
  VictoryAxis,
  VictoryTheme,
  VictoryPie,
} from 'victory-native';

const screenWidth = Dimensions.get('window').width;

// Mock performance data
const weeklyTokens = [
  { day: 'Mon', tokens: 320 },
  { day: 'Tue', tokens: 410 },
  { day: 'Wed', tokens: 290 },
  { day: 'Thu', tokens: 520 },
  { day: 'Fri', tokens: 680 },
  { day: 'Sat', tokens: 740 },
  { day: 'Sun', tokens: 590 },
];

const revenueSplit = [
  { x: 'Avalo 35%', y: 35 },
  { x: 'Creator 65%', y: 65 },
];

export default function CreatorDashboardScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Creator dashboard</Text>
        <Text style={styles.subtitle}>
          Monetization overview (mock data – dev mode)
        </Text>

        {/* Weekly Tokens */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly performance</Text>
          <Text style={styles.cardCaption}>Tokens received (7 days)</Text>

          <VictoryChart
            theme={VictoryTheme.material}
            height={220}
            width={screenWidth - 32}
            domainPadding={{ x: 20 }}
          >
            <VictoryAxis
              tickValues={weeklyTokens.map((p) => p.day)}
              style={{
                tickLabels: { fontSize: 10 },
                axis: { strokeWidth: 0.6 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t) => `${t}`}
              style={{
                tickLabels: { fontSize: 10 },
                axis: { strokeWidth: 0.6 },
                grid: { strokeWidth: 0.2 },
              }}
            />
            <VictoryLine
              data={weeklyTokens}
              x="day"
              y="tokens"
              style={{
                data: { strokeWidth: 2 },
              }}
            />
          </VictoryChart>
        </View>

        {/* Revenue Split */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue split</Text>
          <Text style={styles.cardCaption}>Gross revenue distribution</Text>

          <VictoryPie
            data={revenueSplit}
            height={200}
            width={screenWidth - 32}
            colorScale={['#ef4444', '#22c55e']}
            labels={({ datum }) => datum.x}
            style={{
              labels: { fill: '#ffffff', fontSize: 12 },
            }}
          />
        </View>

        <View style={styles.bottomInfo}>
          <Text style={styles.bottomText}>
            This section will later integrate:
          </Text>
          <Text style={styles.bottomText}>
            – Token ledger sync (Firestore + Trust Engine)
          </Text>
          <Text style={styles.bottomText}>
            – Payout & Withdraw system (Stripe/Bank)
          </Text>
          <Text style={styles.bottomText}>
            – Dynamic pricing tiers (Avalo Token Economy)
          </Text>
          <Text style={styles.bottomText}>
            – Creator performance AI recommendations
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05060A',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#0B0C12',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#111827',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  cardCaption: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 8,
  },
  bottomInfo: {
    marginTop: 8,
  },
  bottomText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
});
