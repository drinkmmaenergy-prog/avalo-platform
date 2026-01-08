/**
 * PACK 56 — Payout Setup Screen
 * 
 * Allows creators to configure their payout account (Stripe Connect or Wise).
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchPayoutState,
  setupPayoutAccount,
  getEligibilityReasonMessage,
  type PayoutState,
  type PayoutRail,
} from "../../services/payoutService";

export default function PayoutSetupScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payoutState, setPayoutState] = useState<PayoutState | null>(null);
  const [selectedRail, setSelectedRail] = useState<PayoutRail>("AUTO");
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    loadPayoutState();
  }, []);

  const loadPayoutState = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const state = await fetchPayoutState(user.uid, true);
      setPayoutState(state);
      if (state?.account?.preferredRail) {
        setSelectedRail(state.account.preferredRail);
      }
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

  const handleSetupAccount = async () => {
    if (!user) return;

    try {
      setSetupLoading(true);

      const result = await setupPayoutAccount({
        userId: user.uid,
        preferredRail: selectedRail,
        country: payoutState?.account?.country || undefined,
        currency: payoutState?.account?.currency || undefined,
      });

      setPayoutState({
        userId: result.userId,
        eligibility: result.eligibility,
        account: result.account,
        earnings: result.earnings,
      });

      // If Stripe onboarding URL is provided, open it
      if (result.onboardingUrl) {
        const canOpen = await Linking.canOpenURL(result.onboardingUrl);
        if (canOpen) {
          await Linking.openURL(result.onboardingUrl);
        } else {
          Alert.alert(
            t("payout.setupTitle"),
            t("payout.onboarding.openManually"),
            [
              {
                text: t("common.ok"),
                onPress: () => navigation.goBack(),
              },
            ]
          );
        }
      } else {
        Alert.alert(
          t("common.success"),
          t("payout.setup.success"),
          [
            {
              text: t("common.ok"),
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error("Error setting up payout account:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("payout.error.setupFailed")
      );
    } finally {
      setSetupLoading(false);
    }
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

  const { eligibility, account } = payoutState;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("payout.setupTitle")}</Text>
          <Text style={styles.subtitle}>
            {t("payout.setup.description")}
          </Text>
        </View>

        {/* Eligibility Status */}
        {!eligibility.eligible && (
          <View style={styles.ineligibleCard}>
            <Text style={styles.ineligibleTitle}>
              {t("payout.eligibility.notEligible")}
            </Text>
            <Text style={styles.ineligibleSubtitle}>
              {t("payout.eligibility.reasons")}
            </Text>
            {eligibility.reasons.map((reason, index) => (
              <Text key={index} style={styles.reasonText}>
                • {getEligibilityReasonMessage(reason, t("common.language") as "en" | "pl")}
              </Text>
            ))}
          </View>
        )}

        {/* Current Account Status */}
        {account.effectiveRail && (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>{t("payout.account.current")}</Text>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t("payout.rail.label")}:</Text>
              <Text style={styles.statusValue}>
                {account.effectiveRail === "STRIPE"
                  ? t("payout.rail.stripe")
                  : t("payout.rail.wise")}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t("payout.country.label")}:</Text>
              <Text style={styles.statusValue}>{account.country || "—"}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t("payout.currency.label")}:</Text>
              <Text style={styles.statusValue}>{account.currency || "—"}</Text>
            </View>
            {account.effectiveRail === "STRIPE" && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>{t("payout.status.label")}:</Text>
                <Text style={[
                  styles.statusValue,
                  account.stripe.onboardingStatus === "COMPLETE"
                    ? styles.statusComplete
                    : styles.statusPending,
                ]}>
                  {account.stripe.onboardingStatus || "NONE"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* KYC Status */}
        <View style={styles.kycCard}>
          <Text style={styles.kycTitle}>{t("payout.kyc.title")}</Text>
          <View style={styles.kycRow}>
            <Text style={styles.kycLabel}>{t("payout.kyc.required")}:</Text>
            <Text style={styles.kycValue}>
              {account.kycRequired ? t("common.yes") : t("common.no")}
            </Text>
          </View>
          <View style={styles.kycRow}>
            <Text style={styles.kycLabel}>{t("payout.kyc.verified")}:</Text>
            <Text style={[
              styles.kycValue,
              account.kycVerified ? styles.kycVerified : styles.kycNotVerified,
            ]}>
              {account.kycVerified ? t("common.yes") : t("common.no")}
            </Text>
          </View>
          <View style={styles.kycRow}>
            <Text style={styles.kycLabel}>{t("payout.kyc.level")}:</Text>
            <Text style={styles.kycValue}>{account.kycLevel}</Text>
          </View>
        </View>

        {/* Rail Selection */}
        {eligibility.eligible && (
          <View style={styles.railSelectionCard}>
            <Text style={styles.railTitle}>{t("payout.rail.select")}</Text>
            
            <TouchableOpacity
              style={[
                styles.railOption,
                selectedRail === "AUTO" && styles.railOptionSelected,
              ]}
              onPress={() => setSelectedRail("AUTO")}
            >
              <View style={styles.railRadio}>
                {selectedRail === "AUTO" && <View style={styles.railRadioInner} />}
              </View>
              <View style={styles.railContent}>
                <Text style={styles.railLabel}>{t("payout.rail.auto")}</Text>
                <Text style={styles.railDescription}>
                  {t("payout.rail.autoDescription")}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.railOption,
                selectedRail === "STRIPE" && styles.railOptionSelected,
              ]}
              onPress={() => setSelectedRail("STRIPE")}
            >
              <View style={styles.railRadio}>
                {selectedRail === "STRIPE" && <View style={styles.railRadioInner} />}
              </View>
              <View style={styles.railContent}>
                <Text style={styles.railLabel}>{t("payout.rail.stripe")}</Text>
                <Text style={styles.railDescription}>
                  {t("payout.rail.stripeDescription")}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.railOption,
                selectedRail === "WISE" && styles.railOptionSelected,
              ]}
              onPress={() => setSelectedRail("WISE")}
            >
              <View style={styles.railRadio}>
                {selectedRail === "WISE" && <View style={styles.railRadioInner} />}
              </View>
              <View style={styles.railContent}>
                <Text style={styles.railLabel}>{t("payout.rail.wise")}</Text>
                <Text style={styles.railDescription}>
                  {t("payout.rail.wiseDescription")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Setup Button */}
        {eligibility.eligible && (
          <TouchableOpacity
            style={[styles.setupButton, setupLoading && styles.setupButtonDisabled]}
            onPress={handleSetupAccount}
            disabled={setupLoading}
          >
            {setupLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.setupButtonText}>
                {account.effectiveRail
                  ? t("payout.setup.update")
                  : t("payout.setup.create")}
              </Text>
            )}
          </TouchableOpacity>
        )}
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
  ineligibleCard: {
    backgroundColor: "#991b1b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  ineligibleTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  ineligibleSubtitle: {
    fontSize: 14,
    color: "#fecaca",
    marginBottom: 12,
  },
  reasonText: {
    fontSize: 14,
    color: "#fecaca",
    marginBottom: 4,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  statusComplete: {
    color: "#22c55e",
  },
  statusPending: {
    color: "#f59e0b",
  },
  kycCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  kycTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  kycRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  kycLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  kycValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  kycVerified: {
    color: "#22c55e",
  },
  kycNotVerified: {
    color: "#f59e0b",
  },
  railSelectionCard: {
    marginBottom: 24,
  },
  railTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
  },
  railOption: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 2,
    borderColor: "#334155",
  },
  railOptionSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#312e81",
  },
  railRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#94a3b8",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  railRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#6366f1",
  },
  railContent: {
    flex: 1,
  },
  railLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  railDescription: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
  },
  setupButton: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  setupButtonDisabled: {
    opacity: 0.6,
  },
  setupButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
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
