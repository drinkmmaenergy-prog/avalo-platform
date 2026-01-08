/**
 * PACK 57 — Disputes List Screen
 * Shows all disputes for the current user
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchDisputes,
  DisputeSummary,
  getDisputeStatusLabel,
  getDisputeStatusColor,
  getDisputeTypeLabel,
} from "../../services/disputeService";
import { useTranslation } from "react-i18next";

export default function DisputesListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [disputes, setDisputes] = useState<DisputeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDisputes();
  }, []);

  const loadDisputes = async (forceRefresh = false) => {
    if (!user?.uid) return;

    try {
      setError(null);
      const data = await fetchDisputes(user.uid, forceRefresh);
      setDisputes(data);
    } catch (err) {
      console.error("Error loading disputes:", err);
      setError(err instanceof Error ? err.message : "Failed to load disputes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDisputes(true);
  };

  const handleDisputePress = (disputeId: string) => {
    router.push(`/support/dispute-detail?disputeId=${disputeId}`);
  };

  const handleCreateDispute = () => {
    router.push("/support/create-dispute");
  };

  const renderDisputeItem = ({ item }: { item: DisputeSummary }) => {
    const statusColor = getDisputeStatusColor(item.status);
    const date = new Date(item.updatedAt).toLocaleDateString();

    return (
      <TouchableOpacity
        style={styles.disputeCard}
        onPress={() => handleDisputePress(item.disputeId)}
        activeOpacity={0.7}
      >
        <View style={styles.disputeHeader}>
          <Text style={styles.disputeTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {t(`disputes.status.${item.status}`, getDisputeStatusLabel(item.status))}
            </Text>
          </View>
        </View>
        
        <View style={styles.disputeInfo}>
          <Text style={styles.disputeType}>
            {t(`disputes.type.${item.type}`, getDisputeTypeLabel(item.type))}
          </Text>
          <Text style={styles.disputeDate}>{date}</Text>
        </View>

        {item.userVisibleOutcomeMessage && (
          <Text style={styles.outcomeMessage} numberOfLines={2}>
            {item.userVisibleOutcomeMessage}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6C47FF" />
        <Text style={styles.loadingText}>{t("common.loading", "Loading...")}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadDisputes(true)}>
          <Text style={styles.retryButtonText}>{t("common.retry", "Retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("disputes.title", "Disputes and Issues")}</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateDispute}>
          <Text style={styles.createButtonText}>
            {t("disputes.create.button", "Report a Problem")}
          </Text>
        </TouchableOpacity>
      </View>

      {disputes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("disputes.empty", "You have no disputes.")}</Text>
          <TouchableOpacity style={styles.createButtonLarge} onPress={handleCreateDispute}>
            <Text style={styles.createButtonText}>
              {t("disputes.create.button", "Report a Problem")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={disputes}
          renderItem={renderDisputeItem}
          keyExtractor={(item) => item.disputeId}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    padding: 20,
  },
  header: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  createButton: {
    backgroundColor: "#6C47FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonLarge: {
    backgroundColor: "#6C47FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666666",
  },
  errorText: {
    fontSize: 16,
    color: "#F44336",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#6C47FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
  },
  listContainer: {
    padding: 16,
  },
  disputeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disputeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  disputeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  disputeInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  disputeType: {
    fontSize: 14,
    color: "#666666",
  },
  disputeDate: {
    fontSize: 14,
    color: "#999999",
  },
  outcomeMessage: {
    fontSize: 14,
    color: "#4CAF50",
    fontStyle: "italic",
    marginTop: 4,
  },
});
