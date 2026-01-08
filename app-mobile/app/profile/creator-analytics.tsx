import React from 'react';
import {
  ScrollView,
  View,
  Text,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  VictoryChart,
  VictoryBar,
  VictoryLine,
  VictoryAxis,
  VictoryTheme,
} from 'victory-native';

const screenWidth = Dimensions.get('window').width;

const weeklyTokens = [
  { label: 'Mon', tokens: 320 },
  { label: 'Tue', tokens: 410 },
  { label: 'Wed', tokens: 290 },
  { label: 'Thu', tokens: 520 },
  { label: 'Fri', tokens: 680 },
  { label: 'Sat', tokens: 740 },
  { label: 'Sun', tokens: 590 },
];

const monthlyRevenue = [
  { label: 'Wk1', pln: 430.5 },
  { label: 'Wk2', pln: 712.2 },
  { label: 'Wk3', pln: 965.8 },
  { label: 'Wk4', pln: 1284.4 },
];

const CreatorAnalyticsScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Creator analytics</Text>
        <Text style={styles.subtitle}>
          Preview of your token performance and revenue (mock data for dev).
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly token earnings</Text>
          <Text style={styles.cardCaption}>Last 7 days • tokens received</Text>

          <VictoryChart
            theme={VictoryTheme.material}
            domainPadding={{ x: 20 }}
            height={220}
            width={screenWidth - 32}
          >
            <VictoryAxis
              tickValues={weeklyTokens.map((p) => p.label)}
              style={{
                tickLabels: { fontSize: 10 },
                axis: { strokeWidth: 0.5 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t) => `${t}`}
              style={{
                tickLabels: { fontSize: 10 },
                axis: { strokeWidth: 0.5 },
                grid: { strokeWidth: 0.3 },
              }}
            />
            <VictoryBar
              data={weeklyTokens}
              x="label"
              y="tokens"
              cornerRadius={4}
              barRatio={0.6}
            />
          </VictoryChart>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>30-day revenue (PLN)</Text>
          <Text style={styles.cardCaption}>Gross revenue in Avalo tokens</Text>

          <VictoryChart
            theme={VictoryTheme.material}
            height={220}
            width={screenWidth - 32}
          >
            <VictoryAxis
              tickValues={monthlyRevenue.map((p) => p.label)}
              style={{
                tickLabels: {
                  fontSize: 10,
                },
                axis: { strokeWidth: 0.5 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t) => `zł ${t}`}
              style={{
                tickLabels: { fontSize: 10 },
                axis: { strokeWidth: 0.5 },
                grid: { strokeWidth: 0.3 },
              }}
            />
            <VictoryLine
              data={monthlyRevenue}
              x="label"
              y="pln"
              style={{
                data: { strokeWidth: 2 },
              }}
            />
          </VictoryChart>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
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
    marginBottom: 4,
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
});

export default CreatorAnalyticsScreen;
