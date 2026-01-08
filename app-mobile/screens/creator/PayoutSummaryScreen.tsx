/**
 * PACK 56 — Payout Summary Screen
 * 
 * Shows creator earnings and allows requesting payouts.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchPayoutState,
  requestPayout,
  formatCurrencyAmount,
  type PayoutState,
} from "../../services/payoutService";

export default function PayoutSummaryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payoutState, setPayoutState] = useState<PayoutState | null>(null);
  const [tokensAmount, setTokensAmount] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  useEffect(() => {
    loadPayoutState();
  }, []);

  const loadPayoutState = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const state = await fetchPayoutState(user.uid, true);
      setPayoutState(state);
    } catch (error: any) {
      console.error("Error loading payout state:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("payout.error.loadFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!user || !payoutState) return;

    const tokens = parseInt(tokensAmount, 10);
    if (isNaN(tokens) || tokens <= 0) {
      Alert.alert(t("common.error"), t("payout.error.invalidAmount"));
      return;
    }

    if (tokens > payoutState.earnings.withdrawableTokens) {
      Alert.alert(t("common.error"), t("payout.error.insufficientTokens"));
      return;
    }

    try {
      setRequestLoading(true);

      const result = await requestPayout(user.uid, tokens);

      Alert.alert(
        t("common.success"),
        t("payout.request.successMessage", {
          amount: formatCurrencyAmount(
            result.amountFiatNetToUser,
            result.currency
          ),
        }),
        [
          {
            text: t("common.ok"),
            onPress: () => {
              setTokensAmount("");
              loadPayoutState();
              navigation.navigate("PayoutHistory");
            },
          },
        ]
      );
    } catch (error: any) {
      console.error("Error requesting payout:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("payout.error.requestFailed")
      );
    } finally {
      setRequestLoading(false);
    }
  };

  const calculateEstimatedAmount = (): number => {
    if (!payoutState || !tokensAmount) return 0;

    const tokens = parseInt(tokensAmount, 10);
    if (isNaN(tokens) || tokens <= 0) return 0;

    // Rough estimate: 1 token = $0.01 USD (will be recalculated on backend)
    const rate = payoutState.account.currency === "EUR" ? 0.009 : 0.01;
    return tokens * rate * 0.98; // Account for 2% platform fee
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!payoutState) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{t("payout.error.loadFailed")}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPayoutState}>
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { eligibility, account, earnings } = payoutState;
  const canRequestPayout = eligibility.eligible && account.effectiveRail !== null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("payout.title")}</Text>
          <Text style={styles.subtitle}>
            {t("payout.summary.description")}
          </Text>
        </View>

        {/* Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.cardTitle}>{t("payout.earnings.title")}</Text>

          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>
              {t("payout.earnings.totalEarned")}
            </Text>
            <Text style={styles.earningsValue}>
              {earnings.totalTokensEarnedAllTime.toLocaleString()} {t("common.tokens")}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.earningsRow}>
            <Text style={[styles.earningsLabel, styles.withdrawableLabel]}>
              {t("payout.earnings.withdrawable")}
            </Text>
            <Text style={[styles.earningsValue, styles.withdrawableValue]}>
              {earnings.withdrawableTokens.toLocaleString()} {t("common.tokens")}
            </Text>
          </View>

          {account.currency && (
            <Text style={styles.estimateText}>
              ≈ {formatCurrencyAmount(
                earnings.withdrawableTokens * 0.01,
                account.currency
              )}
            </Text>
          )}
        </View>

        {/* Account Status */}
        {account.effectiveRail && (
          <View style={styles.accountCard}>
            <Text style={styles.cardTitle}>{t("payout.account.title")}</Text>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>{t("payout.rail.label")}:</Text>
              <Text style={styles.accountValue}>
                {account.effectiveRail === "STRIPE"
                  ? t("payout.rail.stripe")
                  : t("payout.rail.wise")}
              </Text>
            </View>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>{t("payout.currency.label")}:</Text>
              <Text style={styles.accountValue}>{account.currency || "—"}</Text>
            </View>
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => navigation.navigate("PayoutSetup")}
            >
              <Text style={styles.manageButtonText}>
                {t("payout.account.manage")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Request Payout Form */}
        {canRequestPayout ? (
          <View style={styles.requestCard}>
            <Text style={styles.cardTitle}>{t("payout.request.title")}</Text>

            <Text style={styles.inputLabel}>
              {t("payout.request.amountLabel")}
            </Text>
            <TextInput
              style={styles.input}
              value={tokensAmount}
              onChangeText={setTokensAmount}
              placeholder={t("payout.request.amountPlaceholder")}
              placeholderTextColor="#64748b"
              keyboardType="numeric"
            />

            {tokensAmount && calculateEstimatedAmount() > 0 && (
              <Text style={styles.estimateText}>
                {t("payout.request.estimated")}: ≈ {formatCurrencyAmount(
                  calculateEstimatedAmount(),
                  account.currency || "USD"
                )}
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.requestButton,
                (!tokensAmount || requestLoading) && styles.requestButtonDisabled,
              ]}
              onPress={handleRequestPayout}
              disabled={!tokensAmount || requestLoading}
            >
              {requestLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.requestButtonText}>
                  {t("payout.request.submit")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.setupPromptCard}>
            <Text style={styles.setupPromptTitle}>
              {t("payout.setup.required")}
            </Text>
            <Text style={styles.setupPromptText}>
              {t("payout.setup.requiredDescription")}
            </Text>
            <TouchableOpacity
              style={styles.setupPromptButton}
              onPress={() => navigation.navigate("PayoutSetup")}
            >
              <Text style={styles.setupPromptButtonText}>
                {t("payout.setup.goToSetup")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History Link */}
        <TouchableOpacity
          style={styles.historyLink}
          onPress={() => navigation.navigate("PayoutHistory")}
        >
          <Text style={styles.historyLinkText}>
            {t("payout.history.view")} →
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
    lineHeight: 24,
  },
  earningsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  earningsLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  earningsValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  withdrawableLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  withdrawableValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#22c55e",
  },
  divider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 12,
  },
  estimateText: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 8,
    textAlign: "right",
  },
  accountCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  accountLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  accountValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  manageButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366f1",
  },
  requestCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  requestButton: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  setupPromptCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  setupPromptTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  setupPromptText: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  setupPromptButton: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  setupPromptButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  historyLink: {
    alignItems: "center",
    paddingVertical: 16,
  },
  historyLinkText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6366f1",
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
