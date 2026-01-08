/**
 * PACK 53 - Notification Center Screen
 * Displays all notifications for the user
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "@react-navigation/native";
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  AppNotification,
} from "../../services/notificationService";

export default function NotificationCenterScreen() {
  const { currentUser } = useAuth();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = subscribeToNotifications(currentUser.uid, (notifications) => {
      setNotifications(notifications);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid]);

  const handleNotificationPress = async (notification: AppNotification) => {
    try {
      // Mark as read
      if (!notification.read && currentUser?.uid) {
        await markNotificationRead(currentUser.uid, notification.notificationId);
      }

      // Navigate based on deep link
      if (notification.context?.deepLink) {
        handleDeepLink(notification.context.deepLink);
      }
    } catch (error) {
      console.error("Error handling notification press:", error);
    }
  };

  const handleDeepLink = (deepLink: string) => {
    const parts = deepLink.split("/");
    const screen = parts[0];

    switch (screen) {
      case "chat":
        if (parts[1]) {
          navigation.navigate("Chat" as never, { chatId: parts[1] } as never);
        }
        break;
      case "ai-companion":
        if (parts[1]) {
          navigation.navigate("AICompanion" as never, { companionId: parts[1] } as never);
        }
        break;
      case "profile":
        navigation.navigate("Profile" as never);
        break;
      case "earnings":
        navigation.navigate("Earnings" as never);
        break;
      default:
        console.log("Unknown deep link:", deepLink);
    }
  };

  const handleMarkAllRead = async () => {
    if (!currentUser?.uid) return;

    try {
      await markAllNotificationsRead(currentUser.uid);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // Subscription will handle the refresh
  };

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type: string): string => {
    switch (type) {
      case "NEW_MESSAGE":
        return "💬";
      case "AI_REPLY":
        return "🤖";
      case "MEDIA_UNLOCK":
        return "🔓";
      case "STREAK":
        return "🔥";
      case "ROYAL_UPDATE":
        return "👑";
      case "EARNINGS":
        return "💰";
      default:
        return "🔔";
    }
  };

  const renderNotification = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadItem]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{getNotificationIcon(item.type)}</Text>
        {!item.read && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.contentContainer}>
        <Text style={[styles.title, !item.read && styles.unreadText]}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyText}>No notifications yet</Text>
      <Text style={styles.emptySubtext}>
        When you get notifications, they'll show up here
      </Text>
    </View>
  );

  const unreadCount = getUnreadCount(notifications);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {notifications.length > 0 && unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllReadButton}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.notificationId}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#667eea"
          />
        }
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyList : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerText: {
    fontSize: 14,
    color: "#666",
  },
  markAllReadButton: {
    fontSize: 14,
    color: "#667eea",
    fontWeight: "600",
  },
  notificationItem: {
    flexDirection: "row",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  unreadItem: {
    backgroundColor: "#f8f9ff",
  },
  iconContainer: {
    width: 50,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  icon: {
    fontSize: 24,
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#667eea",
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: "#333",
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: "600",
  },
  body: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
});
