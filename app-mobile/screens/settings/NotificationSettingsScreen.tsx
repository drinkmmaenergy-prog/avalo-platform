/**
 * PACK 53 - Notification Settings Screen
 * Allows users to configure notification preferences
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import DateTimePicker from "@react-native-community/datetimepicker";

interface NotificationSettings {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  newMessages: boolean;
  aiCompanions: boolean;
  mediaUnlocks: boolean;
  streaksAndRoyal: boolean;
  earningsAndPayouts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://us-central1-avalo-app.cloudfunctions.net";

export default function NotificationSettingsScreen() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (currentUser?.uid) {
      loadSettings();
    }
  }, [currentUser?.uid]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/getNotificationSettings?userId=${currentUser?.uid}`
      );

      if (!response.ok) {
        throw new Error("Failed to load settings");
      }

      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error("Error loading notification settings:", error);
      Alert.alert("Error", "Failed to load notification settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updatedSettings: NotificationSettings) => {
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/updateNotificationSettings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedSettings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSettings(updatedSettings);
    } catch (error) {
      console.error("Error saving notification settings:", error);
      Alert.alert("Error", "Failed to save notification settings");
      // Revert to previous settings
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    if (!settings || !currentUser?.uid) return;

    const updated = {
      ...settings,
      [key]: value,
    };

    saveSettings(updated);
  };

  const parseTime = (timeStr?: string): Date => {
    if (!timeStr) {
      const now = new Date();
      now.setHours(22, 0, 0, 0);
      return now;
    }

    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  if (loading || !settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Channels</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Push notifications</Text>
          <Switch
            value={settings.pushEnabled}
            onValueChange={(value) => updateSetting("pushEnabled", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Email notifications</Text>
          <Switch
            value={settings.emailEnabled}
            onValueChange={(value) => updateSetting("emailEnabled", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>In-app notifications</Text>
          <Switch
            value={settings.inAppEnabled}
            onValueChange={(value) => updateSetting("inAppEnabled", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>New messages</Text>
          <Switch
            value={settings.newMessages}
            onValueChange={(value) => updateSetting("newMessages", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>AI companions</Text>
          <Switch
            value={settings.aiCompanions}
            onValueChange={(value) => updateSetting("aiCompanions", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Paid media and unlocks</Text>
          <Switch
            value={settings.mediaUnlocks}
            onValueChange={(value) => updateSetting("mediaUnlocks", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Streaks and Royal</Text>
          <Switch
            value={settings.streaksAndRoyal}
            onValueChange={(value) => updateSetting("streaksAndRoyal", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Earnings and payouts</Text>
          <Switch
            value={settings.earningsAndPayouts}
            onValueChange={(value) => updateSetting("earningsAndPayouts", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quiet Hours</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable quiet hours</Text>
          <Switch
            value={settings.quietHoursEnabled}
            onValueChange={(value) => updateSetting("quietHoursEnabled", value)}
            trackColor={{ false: "#767577", true: "#667eea" }}
            thumbColor="#f4f3f4"
            disabled={saving}
          />
        </View>

        {settings.quietHoursEnabled && (
          <>
            <TouchableOpacity
              style={styles.timePicker}
              onPress={() => setShowStartPicker(true)}
              disabled={saving}
            >
              <Text style={styles.timePickerLabel}>From</Text>
              <Text style={styles.timePickerValue}>
                {settings.quietHoursStart || "22:00"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.timePicker}
              onPress={() => setShowEndPicker(true)}
              disabled={saving}
            >
              <Text style={styles.timePickerLabel}>To</Text>
              <Text style={styles.timePickerValue}>
                {settings.quietHoursEnd || "08:00"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={parseTime(settings.quietHoursStart)}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartPicker(false);
            if (selectedDate) {
              updateSetting("quietHoursStart", formatTime(selectedDate));
            }
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={parseTime(settings.quietHoursEnd)}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndPicker(false);
            if (selectedDate) {
              updateSetting("quietHoursEnd", formatTime(selectedDate));
            }
          }}
        />
      )}

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="small" color="#667eea" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </ScrollView>
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
  section: {
    backgroundColor: "white",
    marginTop: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginLeft: 16,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  settingLabel: {
    fontSize: 16,
    color: "#333",
  },
  timePicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  timePickerLabel: {
    fontSize: 16,
    color: "#333",
  },
  timePickerValue: {
    fontSize: 16,
    color: "#667eea",
    fontWeight: "600",
  },
  savingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  savingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#666",
  },
});
