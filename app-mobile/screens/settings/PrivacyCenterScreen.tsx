/**
 * PACK 64 — Privacy & Data Center Screen
 * 
 * Self-service GDPR data export and account deletion
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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { auth } from "../../lib/firebase";
import {
  ExportJob,
  DeletionJob,
  requestExport,
  fetchExportStatus,
  getCachedExportJob,
  downloadExport,
  requestDeletion,
  fetchDeletionStatus,
  getCachedDeletionJob,
  formatFileSize,
  formatDate,
  daysUntilDeletion,
} from "../../services/privacyService";
import { useTranslation } from "react-i18next";

export default function PrivacyCenterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const userId = auth.currentUser?.uid || "";

  // Export state
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);

  // Deletion state
  const [deletionJob, setDeletionJob] = useState<DeletionJob | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [loadingDeletion, setLoadingDeletion] = useState(false);
  const [showDeletionInput, setShowDeletionInput] = useState(false);

  // Load cached data and fetch updates
  useEffect(() => {
    loadInitialData();
    
    // Poll for updates while jobs are active
    const interval = setInterval(() => {
      if (exportJob && ["PENDING", "IN_PROGRESS"].includes(exportJob.status)) {
        refreshExportStatus();
      }
      if (
        deletionJob &&
        ["REQUESTED", "IN_REVIEW", "SCHEDULED", "IN_PROGRESS"].includes(
          deletionJob.status
        )
      ) {
        refreshDeletionStatus();
      }
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [exportJob, deletionJob]);

  const loadInitialData = async () => {
    // Load cached data first for immediate display
    const cachedExport = await getCachedExportJob(userId);
    if (cachedExport) {
      setExportJob(cachedExport);
    }

    const cachedDeletion = await getCachedDeletionJob(userId);
    if (cachedDeletion) {
      setDeletionJob(cachedDeletion);
    }

    // Then fetch fresh data
    refreshExportStatus();
    refreshDeletionStatus();
  };

  const refreshExportStatus = async () => {
    try {
      const job = await fetchExportStatus(userId);
      setExportJob(job);
    } catch (error) {
      console.error("Error refreshing export status:", error);
    }
  };

  const refreshDeletionStatus = async () => {
    try {
      const job = await fetchDeletionStatus(userId);
      setDeletionJob(job);
    } catch (error) {
      console.error("Error refreshing deletion status:", error);
    }
  };

  const handleRequestExport = async () => {
    setLoadingExport(true);
    try {
      const job = await requestExport(userId);
      setExportJob(job);
      Alert.alert(
        t("privacyCenter.export.title"),
        t("privacyCenter.export.status.PENDING")
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to request export");
    } finally {
      setLoadingExport(false);
    }
  };

  const handleDownloadExport = async () => {
    if (!exportJob) return;

    setDownloadingExport(true);
    try {
      const downloadUrl = await downloadExport(userId, exportJob.jobId);
      
      // Open download URL in browser
      await Linking.openURL(downloadUrl);
      
      Alert.alert(
        t("privacyCenter.export.title"),
        "Opening download in your browser"
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to download export");
    } finally {
      setDownloadingExport(false);
    }
  };

  const handleRequestDeletion = async () => {
    // Show confirmation dialog
    Alert.alert(
      t("privacyCenter.deletion.title"),
      t("privacyCenter.deletion.description"),
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            setLoadingDeletion(true);
            try {
              const job = await requestDeletion(userId, deletionReason);
              setDeletionJob(job);
              setShowDeletionInput(false);
              setDeletionReason("");
              
              Alert.alert(
                t("privacyCenter.deletion.title"),
                getStatusText(job.status, "deletion")
              );
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to request deletion");
            } finally {
              setLoadingDeletion(false);
            }
          },
        },
      ]
    );
  };

  const getStatusText = (status: string, type: "export" | "deletion"): string => {
    return t(`privacyCenter.${type}.status.${status}`);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "PENDING":
      case "IN_PROGRESS":
      case "REQUESTED":
      case "IN_REVIEW":
      case "SCHEDULED":
        return "#FFA500";
      case "READY":
      case "COMPLETED":
        return "#4CAF50";
      case "FAILED":
      case "REJECTED":
        return "#F44336";
      default:
        return "#999";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("privacyCenter.title")}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Data Export Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="download-outline" size={24} color="#6C47FF" />
            <Text style={styles.sectionTitle}>
              {t("privacyCenter.export.title")}
            </Text>
          </View>

          <Text style={styles.sectionDescription}>
            {t("privacyCenter.export.description")}
          </Text>

          {exportJob ? (
            <View style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobLabel}>Status</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(exportJob.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusText(exportJob.status, "export")}
                  </Text>
                </View>
              </View>

              <View style={styles.jobDetail}>
                <Text style={styles.jobLabel}>Requested</Text>
                <Text style={styles.jobValue}>
                  {formatDate(exportJob.requestedAt)}
                </Text>
              </View>

              {exportJob.status === "READY" && exportJob.expiresAt && (
                <>
                  <View style={styles.jobDetail}>
                    <Text style={styles.jobLabel}>File Size</Text>
                    <Text style={styles.jobValue}>
                      {exportJob.fileSizeBytes
                        ? formatFileSize(exportJob.fileSizeBytes)
                        : "Unknown"}
                    </Text>
                  </View>

                  <View style={styles.jobDetail}>
                    <Text style={styles.jobLabel}>Expires</Text>
                    <Text style={styles.jobValue}>
                      {formatDate(exportJob.expiresAt)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleDownloadExport}
                    disabled={downloadingExport}
                  >
                    {downloadingExport ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download" size={20} color="#fff" />
                        <Text style={styles.primaryButtonText}>
                          {t("privacyCenter.export.downloadButton")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {exportJob.status === "FAILED" && exportJob.errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{exportJob.errorMessage}</Text>
                </View>
              )}

              {["PENDING", "IN_PROGRESS"].includes(exportJob.status) && (
                <View style={styles.infoBox}>
                  <ActivityIndicator color="#6C47FF" />
                  <Text style={styles.infoText}>
                    Processing your export request. This may take a few minutes.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleRequestExport}
              disabled={loadingExport}
            >
              {loadingExport ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t("privacyCenter.export.requestButton")}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Account Deletion Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trash-outline" size={24} color="#F44336" />
            <Text style={[styles.sectionTitle, { color: "#F44336" }]}>
              {t("privacyCenter.deletion.title")}
            </Text>
          </View>

          <Text style={styles.sectionDescription}>
            {t("privacyCenter.deletion.description")}
          </Text>

          {deletionJob ? (
            <View style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobLabel}>Status</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(deletionJob.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusText(deletionJob.status, "deletion")}
                  </Text>
                </View>
              </View>

              <View style={styles.jobDetail}>
                <Text style={styles.jobLabel}>Requested</Text>
                <Text style={styles.jobValue}>
                  {formatDate(deletionJob.requestedAt)}
                </Text>
              </View>

              {deletionJob.scheduledFor && (
                <View style={styles.jobDetail}>
                  <Text style={styles.jobLabel}>Scheduled For</Text>
                  <Text style={styles.jobValue}>
                    {formatDate(deletionJob.scheduledFor)} (
                    {daysUntilDeletion(deletionJob.scheduledFor)} days)
                  </Text>
                </View>
              )}

              {deletionJob.rejectionReason && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {deletionJob.rejectionReason}
                  </Text>
                </View>
              )}

              {deletionJob.status === "COMPLETED" && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    Your account has been deleted. You will be logged out shortly.
                  </Text>
                </View>
              )}
            </View>
          ) : showDeletionInput ? (
            <View style={styles.deletionForm}>
              <TextInput
                style={styles.textInput}
                placeholder={t("privacyCenter.deletion.reasonPlaceholder")}
                placeholderTextColor="#999"
                value={deletionReason}
                onChangeText={setDeletionReason}
                multiline
                numberOfLines={3}
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setShowDeletionInput(false);
                    setDeletionReason("");
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerButton}
                  onPress={handleRequestDeletion}
                  disabled={loadingDeletion}
                >
                  {loadingDeletion ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Confirm Deletion</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={() => setShowDeletionInput(true)}
            >
              <Text style={styles.dangerButtonText}>
                {t("privacyCenter.deletion.requestButton")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginLeft: 12,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#999",
    lineHeight: 20,
    marginBottom: 16,
  },
  jobCard: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  jobLabel: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  jobDetail: {
    marginBottom: 12,
  },
  jobValue: {
    fontSize: 14,
    color: "#fff",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6C47FF",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  dangerButton: {
    backgroundColor: "#F44336",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  deletionForm: {
    gap: 16,
  },
  textInput: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  buttonRow: {
    flexDirection: "row",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#6C47FF20",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#6C47FF",
  },
  errorBox: {
    backgroundColor: "#F4433620",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#F44336",
  },
  successBox: {
    backgroundColor: "#4CAF5020",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  successText: {
    fontSize: 13,
    color: "#4CAF50",
  },
  bottomSpacer: {
    height: 40,
  },
});
