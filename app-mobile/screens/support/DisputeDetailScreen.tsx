/**
 * PACK 57 — Dispute Detail Screen
 * Shows details, messages, and evidence for a dispute
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchDisputeDetail,
  sendDisputeMessage,
  DisputeDetail,
  DisputeMessage,
  getDisputeStatusLabel,
  getDisputeStatusColor,
  getDisputeTypeLabel,
} from "../../services/disputeService";
import { useTranslation } from "react-i18next";

export default function DisputeDetailScreen() {
  const router = useRouter();
  const { disputeId } = useLocalSearchParams<{ disputeId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (disputeId) {
      loadDisputeDetail();
    }
  }, [disputeId]);

  const loadDisputeDetail = async (forceRefresh = false) => {
    if (!user?.uid || !disputeId) return;

    try {
      setError(null);
      const data = await fetchDisputeDetail(user.uid, disputeId as string, forceRefresh);
      setDispute(data);
    } catch (err) {
      console.error("Error loading dispute detail:", err);
      setError(err instanceof Error ? err.message : "Failed to load dispute");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDisputeDetail(true);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !user?.uid || !disputeId || sending) return;

    try {
      setSending(true);
      await sendDisputeMessage(user.uid, disputeId as string, messageText.trim());
      setMessageText("");
      
      // Reload dispute to get updated messages
      await loadDisputeDetail(true);
    } catch (err) {
      console.error("Error sending message:", err);
      alert(t("disputes.error.sendMessage", "Failed to send message. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const renderMessage = (message: DisputeMessage) => {
    const isUser = message.authorType === "USER";
    const isSystem = message.authorType === "SYSTEM";
    const date = new Date(message.createdAt).toLocaleString();

    return (
      <View
        key={message.messageId}
        style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.supportMessage,
          isSystem && styles.systemMessage,
        ]}
      >
        <View style={styles.messageHeader}>
          <Text style={styles.messageAuthor}>
            {isUser
              ? t("disputes.message.you", "You")
              : isSystem
              ? t("disputes.message.system", "System")
              : t("disputes.message.support", "Support")}
          </Text>
          <Text style={styles.messageDate}>{date}</Text>
        </View>
        <Text style={styles.messageBody}>{message.body}</Text>
      </View>
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

  if (error || !dispute) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {error || t("disputes.error.notFound", "Dispute not found")}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>{t("common.goBack", "Go Back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getDisputeStatusColor(dispute.status);
  const isResolved = dispute.status === "RESOLVED" || dispute.status === "CLOSED";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Dispute Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>{dispute.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>
                {t(`disputes.status.${dispute.status}`, getDisputeStatusLabel(dispute.status))}
              </Text>
            </View>
          </View>
          
          <Text style={styles.disputeType}>
            {t(`disputes.type.${dispute.type}`, getDisputeTypeLabel(dispute.type))}
          </Text>

          {dispute.description && (
            <Text style={styles.description}>{dispute.description}</Text>
          )}

          {dispute.userVisibleOutcomeMessage && (
            <View style={styles.outcomeContainer}>
              <Text style={styles.outcomeLabel}>
                {t("disputes.outcome", "Resolution")}:
              </Text>
              <Text style={styles.outcomeMessage}>
                {dispute.userVisibleOutcomeMessage}
              </Text>
            </View>
          )}

          {dispute.evidenceCount !== undefined && dispute.evidenceCount > 0 && (
            <Text style={styles.evidenceCount}>
              {t("disputes.evidenceCount", "{{count}} evidence items attached", {
                count: dispute.evidenceCount,
              })}
            </Text>
          )}
        </View>

        {/* Messages */}
        <View style={styles.messagesContainer}>
          <Text style={styles.messagesTitle}>
            {t("disputes.messages", "Messages")}
          </Text>
          {dispute.messages.map((message) => renderMessage(message))}
        </View>
      </ScrollView>

      {/* Message Input (only if not resolved) */}
      {!isResolved && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={t("disputes.message.placeholder", "Type your message...")}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>
                {t("disputes.message.send", "Send")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
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
  header: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  disputeType: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: "#333333",
    lineHeight: 22,
    marginBottom: 12,
  },
  outcomeContainer: {
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  outcomeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2E7D32",
    marginBottom: 4,
  },
  outcomeMessage: {
    fontSize: 14,
    color: "#1B5E20",
    lineHeight: 20,
  },
  evidenceCount: {
    fontSize: 13,
    color: "#666666",
    marginTop: 8,
    fontStyle: "italic",
  },
  messagesContainer: {
    padding: 16,
  },
  messagesTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 16,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  userMessage: {
    backgroundColor: "#E3F2FD",
    alignSelf: "flex-end",
    maxWidth: "80%",
  },
  supportMessage: {
    backgroundColor: "#F5F5F5",
    alignSelf: "flex-start",
    maxWidth: "80%",
  },
  systemMessage: {
    backgroundColor: "#FFF3E0",
    alignSelf: "center",
    maxWidth: "90%",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  messageAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666666",
  },
  messageDate: {
    fontSize: 12,
    color: "#999999",
  },
  messageBody: {
    fontSize: 15,
    color: "#333333",
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    padding: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 15,
    color: "#333333",
  },
  sendButton: {
    backgroundColor: "#6C47FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 70,
  },
  sendButtonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
