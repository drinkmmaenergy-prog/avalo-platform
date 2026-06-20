/**
 * PACK 56 — Payout Summary Screen
 *
 * [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH]
 * Creator payouts are not available during the current launch phase.
 * The creator USD earnings ledger must be implemented and validated before
 * this screen is re-enabled.
 *
 * To re-enable: restore the original implementation from git history once
 * creatorAccounts/{uid} USD ledger is live and validated.
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function PayoutSummaryScreen({ navigation }: any) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔒</Text>
      </View>

      <Text style={styles.title}>Creator Payouts</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Not available yet</Text>
        <Text style={styles.cardBody}>
          Creator payouts are not available during the current launch phase.
          We are building a secure earnings ledger to ensure every payout is
          accurate and auditable.
        </Text>
        <Text style={styles.cardBody}>
          Your earned tokens are safe and will be available for withdrawal
          once creator payouts launch.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{"What's coming:"}</Text>
        <Text style={styles.infoItem}>{"• Secure USD creator earnings account"}</Text>
        <Text style={styles.infoItem}>{"• Transparent per-session earnings ledger"}</Text>
        <Text style={styles.infoItem}>{"• Bank transfer and Stripe payouts"}</Text>
        <Text style={styles.infoItem}>{"• Earnings dashboard and payout history"}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    padding: 24,
    alignItems: "center",
  },
  iconContainer: {
    marginTop: 40,
    marginBottom: 24,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 24,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    width: "100%",
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f59e0b",
    marginBottom: 12,
  },
  cardBody: {
    fontSize: 15,
    color: "#94a3b8",
    lineHeight: 22,
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    width: "100%",
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 22,
    marginBottom: 4,
  },
});
