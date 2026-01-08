/**
 * PACK 56 — Payout History Screen
 * 
 * Displays history of payout requests.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchPayoutRequests,
  formatPayoutStatus,
  formatCurrencyAmount,
  type PayoutRequestSummary,
} from "../../services/payoutService";

export default function PayoutHistoryScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<PayoutRequestSummary[]>([]);

  useEffect(() => {
    loadPayoutRequests();
  }, []);

  const loadPayoutRequests = async (forceRefresh: boolean = false) => {
    if (!user) return;

    try {
      if (!forceRefresh) setLoading(true);
      const data = await fetchPayoutRequests(user.uid, forceRefresh);
      setRequests(data);
    } catch (error: any) {
      console.error("Error loading payout requests:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("payout.error.loadFailed")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPayoutRequests(true);
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "PAID":
        return "#22c55e";
      case "PENDING":
      case "PROCESSING":
        return "#f59e0b";
      case "FAILED":
      case "CANCELLED":
        return "#ef4444";
      default:
        return "#94a3b8";
    }
  };

  const renderPayoutItem = ({ item }: { item: PayoutRequestSummary }) => (
    <View style={styles.payoutCard}>
      <View style={styles.payoutHeader}>
        <Text style={styles.payoutAmount}>
          {formatCurrencyAmount(item.amountFiatNetToUser, item.currency)}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + "20" },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(item.status) },
            ]}
          >
            {formatPayoutStatus(item.status, t("common.language") as "en" | "pl")}
          </Text>
        </View>
      </View>

      <View style={styles.payoutDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t("payout.history.rail")}:</Text>
          <Text style={styles.detailValue}>
            {item.rail === "STRIPE" ? t("payout.rail.stripe") : t("payout.rail.wise")}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t("payout.history.tokens")}:</Text>
          <Text style={styles.detailValue}>
            {item.tokensRequested.toLocaleString()} {t("common.tokens")}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t("payout.history.requested")}:</Text>
          <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text>
        </View>
        {item.processedAt && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t("payout.history.processed")}:</Text>
            <Text style={styles.detailValue}>{formatDate(item.processedAt)}</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (requests.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>💸</Text>
        <Text style={styles.emptyTitle}>{t("payout.history.empty")}</Text>
        <Text style={styles.emptySubtitle}>
          {t("payout.history.emptyDescription")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={requests}
        renderItem={renderPayoutItem}
        keyExtractor={(item) => item.requestId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6366f1"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 20,
  },
  listContent: {
    padding: 20,
  },
  payoutCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  payoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  payoutAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  payoutDetails: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 24,
  },
});
