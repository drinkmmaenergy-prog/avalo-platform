/**
 * PACK 59: Support Center Screen
 * Central hub for support, help, policies, disputes, and contact
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { getSupportMeta, SupportMeta } from "../../services/userControlService";
import { Ionicons } from "@expo/vector-icons";

export default function SupportCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [supportMeta, setSupportMeta] = useState<SupportMeta | null>(null);

  useEffect(() => {
    loadSupportMeta();
  }, []);

  const loadSupportMeta = async () => {
    try {
      setLoading(true);
      const meta = await getSupportMeta();
      setSupportMeta(meta);
    } catch (error) {
      console.error("Error loading support meta:", error);
      // Use defaults on error
      setSupportMeta({
        faqUrl: "https://avalo.app/help",
        supportEmail: "support@avalo.app",
        canOpenDisputes: true,
        canOpenContentReports: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFAQ = async () => {
    if (!supportMeta?.faqUrl) return;

    try {
      const canOpen = await Linking.canOpenURL(supportMeta.faqUrl);
      if (canOpen) {
        await Linking.openURL(supportMeta.faqUrl);
      } else {
        Alert.alert(
          t("common.error"),
          t("support.cannotOpenUrl") || "Cannot open URL"
        );
      }
    } catch (error) {
      console.error("Error opening FAQ:", error);
      Alert.alert(
        t("common.error"),
        t("support.errorOpeningUrl") || "Failed to open URL"
      );
    }
  };

  const handleContactSupport = async () => {
    if (!supportMeta?.supportEmail) return;

    const subject = encodeURIComponent("Avalo Support Request");
    const body = encodeURIComponent(
      `User ID: ${user?.uid || "Not logged in"}\n\nPlease describe your issue:\n\n`
    );
    const mailto = `mailto:${supportMeta.supportEmail}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
      } else {
        // Fallback: show email address
        Alert.alert(
          t("support.contactSupport"),
          `${t("support.emailUs")}: ${supportMeta.supportEmail}`,
          [
            {
              text: t("common.ok"),
              onPress: () => {},
            },
          ]
        );
      }
    } catch (error) {
      console.error("Error opening mailto:", error);
      Alert.alert(
        t("support.contactSupport"),
        `${t("support.emailUs")}: ${supportMeta.supportEmail}`
      );
    }
  };

  const handleOpenPolicies = () => {
    router.push("/legal/terms");
  };

  const handleOpenDisputes = () => {
    if (!user?.uid) {
      Alert.alert(
        t("common.error"),
        t("support.mustBeLoggedIn") || "Must be logged in"
      );
      return;
    }
    router.push("/disputes/list");
  };

  const handleReportContent = () => {
    if (!user?.uid) {
      Alert.alert(
        t("common.error"),
        t("support.mustBeLoggedIn") || "Must be logged in"
      );
      return;
    }
    router.push("/moderation/report");
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
        <Text style={styles.loadingText}>
          {t("support.loading") || "Loading support center..."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="help-circle-outline" size={48} color="#6B46C1" />
        <Text style={styles.title}>
          {t("support.title") || "Support & Help Center"}
        </Text>
        <Text style={styles.subtitle}>
          {t("support.subtitle") ||
            "Get help, view policies, and manage disputes"}
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("support.quickActions") || "Quick Actions"}
        </Text>

        <SupportCard
          icon="book-outline"
          title={t("support.faq") || "FAQ & Help Center"}
          description={
            t("support.faqDescription") ||
            "Find answers to common questions"
          }
          onPress={handleOpenFAQ}
        />

        <SupportCard
          icon="mail-outline"
          title={t("support.contactSupport") || "Contact Support"}
          description={
            t("support.contactDescription") ||
            "Send us an email for assistance"
          }
          onPress={handleContactSupport}
        />

        <SupportCard
          icon="document-text-outline"
          title={t("support.policies") || "Policies & Terms"}
          description={
            t("support.policiesDescription") ||
            "View terms, privacy, and community guidelines"
          }
          onPress={handleOpenPolicies}
        />
      </View>

      {/* Disputes & Reports */}
      {user?.uid && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("support.disputesAndReports") || "Disputes & Reports"}
          </Text>

          {supportMeta?.canOpenDisputes && (
            <SupportCard
              icon="alert-circle-outline"
              title={t("support.viewDisputes") || "View Disputes"}
              description={
                t("support.disputesDescription") ||
                "Manage payment, booking, and content disputes"
              }
              onPress={handleOpenDisputes}
            />
          )}

          {supportMeta?.canOpenContentReports && (
            <SupportCard
              icon="flag-outline"
              title={t("support.reportContent") || "Report Content"}
              description={
                t("support.reportDescription") ||
                "Report inappropriate content or behavior"
              }
              onPress={handleReportContent}
            />
          )}
        </View>
      )}

      {/* Support Info */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={24} color="#6B46C1" />
        <Text style={styles.infoText}>
          {t("support.infoText") ||
            "For urgent safety concerns, please contact your local authorities immediately."}
        </Text>
      </View>

      {/* Support Email Footer */}
      {supportMeta?.supportEmail && (
        <View style={styles.footer}>
          <Text style={styles.footerLabel}>
            {t("support.emailLabel") || "Support Email:"}
          </Text>
          <Text style={styles.footerValue}>{supportMeta.supportEmail}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface SupportCardProps {
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
}

function SupportCard({ icon, title, description, onPress }: SupportCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon as any} size={32} color="#6B46C1" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#CBD5E0" />
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a202c",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f7fafc",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: "#718096",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#553C9A",
    marginLeft: 12,
    lineHeight: 20,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerLabel: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 4,
  },
  footerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B46C1",
  },
});
