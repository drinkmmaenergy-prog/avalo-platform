/**
 * PACK 59: User Control Center Screen
 * Unified settings for privacy, incognito, passport, ads, contacts, and support
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import {
  fetchUserControlProfile,
  updateVisibilitySettings,
  updateIncognitoSettings,
  updatePassportSettings,
  updateMarketingSettings,
  updateContactSettings,
  updateSupportSettings,
  UserControlProfile,
  AllowMessagesFrom,
} from "../../services/userControlService";

export default function UserControlCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserControlProfile | null>(null);

  // Load profile on mount
  useEffect(() => {
    if (user?.uid) {
      loadProfile();
    }
  }, [user?.uid]);

  const loadProfile = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      const data = await fetchUserControlProfile(user.uid, true);
      setProfile(data);
    } catch (error) {
      console.error("Error loading user control profile:", error);
      Alert.alert(
        t("common.error"),
        t("userControl.errorLoading") || "Failed to load settings"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVisibilityToggle = async (
    field: keyof typeof profile.visibility,
    value: boolean
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updateVisibilitySettings(user.uid, {
        [field]: value,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating visibility:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleIncognitoToggle = async (
    field: keyof typeof profile.incognito,
    value: boolean
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updateIncognitoSettings(user.uid, {
        [field]: value,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating incognito:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePassportToggle = async (
    field: keyof typeof profile.passport,
    value: boolean
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updatePassportSettings(user.uid, {
        [field]: value,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating passport:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePassportLocationChange = async (
    field: "virtualCountry" | "virtualCity",
    value: string
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updatePassportSettings(user.uid, {
        [field]: value || null,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating passport location:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMarketingToggle = async (
    field: keyof typeof profile.marketing,
    value: boolean
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updateMarketingSettings(user.uid, {
        [field]: value,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating marketing:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleContactsChange = async (
    field: keyof typeof profile.contacts,
    value: any
  ) => {
    if (!user?.uid || !profile) return;

    try {
      setSaving(true);
      const updated = await updateContactSettings(user.uid, {
        [field]: value,
      });
      setProfile(updated);
    } catch (error: any) {
      console.error("Error updating contacts:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("userControl.errorSaving")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAllowMessagesFromChange = () => {
    if (!profile) return;

    const options: AllowMessagesFrom[] = [
      "ANYONE",
      "MATCHES_ONLY",
      "FANS_ONLY",
      "NONE",
    ];

    const labels = {
      ANYONE: t("userControl.contacts.anyone") || "Anyone",
      MATCHES_ONLY: t("userControl.contacts.matchesOnly") || "Matches only",
      FANS_ONLY: t("userControl.contacts.fansOnly") || "Fans only",
      NONE: t("userControl.contacts.none") || "None",
    };

    Alert.alert(
      t("userControl.contacts.allowMessagesFrom"),
      t("userControl.contacts.selectPreference") || "Select who can message you",
      options.map((option) => ({
        text: labels[option],
        onPress: () => handleContactsChange("allowMessagesFrom", option),
      }))
    );
  };

  const navigateToSupport = () => {
    router.push("/support/center");
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
        <Text style={styles.loadingText}>
          {t("userControl.loading") || "Loading settings..."}
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {t("userControl.errorLoadingProfile") || "Failed to load profile"}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
          <Text style={styles.retryButtonText}>
            {t("common.retry") || "Retry"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("userControl.title")}</Text>
        {saving && (
          <ActivityIndicator size="small" color="#6B46C1" style={styles.savingIndicator} />
        )}
      </View>

      {/* Visibility & Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.visibility")}
        </Text>

        <SettingRow
          label={t("userControl.visibility.profileVisible")}
          value={profile.visibility.profileVisible}
          onValueChange={(value) =>
            handleVisibilityToggle("profileVisible", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.visibility.showInDiscovery")}
          value={profile.visibility.showInDiscovery}
          onValueChange={(value) =>
            handleVisibilityToggle("showInDiscovery", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.visibility.showInMarketplace")}
          value={profile.visibility.showInMarketplace}
          onValueChange={(value) =>
            handleVisibilityToggle("showInMarketplace", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.visibility.showOnlineStatus")}
          value={profile.visibility.showOnlineStatus}
          onValueChange={(value) =>
            handleVisibilityToggle("showOnlineStatus", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.visibility.showLastSeen")}
          value={profile.visibility.showLastSeen}
          onValueChange={(value) =>
            handleVisibilityToggle("showLastSeen", value)
          }
          disabled={saving}
        />
      </View>

      {/* Incognito Mode */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.incognito")}
        </Text>

        <SettingRow
          label={t("userControl.incognito.enabled")}
          value={profile.incognito.enabled}
          onValueChange={(value) => handleIncognitoToggle("enabled", value)}
          disabled={saving}
        />

        {profile.incognito.enabled && (
          <>
            <SettingRow
              label={t("userControl.incognito.hideFromRecentlyViewed")}
              value={profile.incognito.hideFromRecentlyViewed}
              onValueChange={(value) =>
                handleIncognitoToggle("hideFromRecentlyViewed", value)
              }
              disabled={saving}
            />

            <SettingRow
              label={t("userControl.incognito.hideFromWhoViewedMe")}
              value={profile.incognito.hideFromWhoViewedMe}
              onValueChange={(value) =>
                handleIncognitoToggle("hideFromWhoViewedMe", value)
              }
              disabled={saving}
            />

            <SettingRow
              label={t("userControl.incognito.hideFromNearby")}
              value={profile.incognito.hideFromNearby}
              onValueChange={(value) =>
                handleIncognitoToggle("hideFromNearby", value)
              }
              disabled={saving}
            />
          </>
        )}
      </View>

      {/* Passport / Virtual Location */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.passport")}
        </Text>

        <SettingRow
          label={t("userControl.passport.virtualLocation")}
          value={profile.passport.virtualLocationEnabled}
          onValueChange={(value) =>
            handlePassportToggle("virtualLocationEnabled", value)
          }
          disabled={saving}
        />

        {profile.passport.virtualLocationEnabled && (
          <>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                {t("userControl.passport.country")}
              </Text>
              <TextInput
                style={styles.input}
                value={profile.passport.virtualCountry || ""}
                onChangeText={(text) =>
                  handlePassportLocationChange("virtualCountry", text)
                }
                placeholder="e.g., US, PL, DE"
                placeholderTextColor="#999"
                editable={!saving}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                {t("userControl.passport.city")}
              </Text>
              <TextInput
                style={styles.input}
                value={profile.passport.virtualCity || ""}
                onChangeText={(text) =>
                  handlePassportLocationChange("virtualCity", text)
                }
                placeholder="e.g., New York, Warsaw"
                placeholderTextColor="#999"
                editable={!saving}
              />
            </View>
          </>
        )}
      </View>

      {/* Contact Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.contacts")}
        </Text>

        <TouchableOpacity
          style={styles.selectRow}
          onPress={handleAllowMessagesFromChange}
          disabled={saving}
        >
          <Text style={styles.selectLabel}>
            {t("userControl.contacts.allowMessagesFrom")}
          </Text>
          <Text style={styles.selectValue}>
            {profile.contacts.allowMessagesFrom}
          </Text>
        </TouchableOpacity>

        <SettingRow
          label={t("userControl.contacts.allowColdPaidMessages")}
          value={profile.contacts.allowColdPaidMessages}
          onValueChange={(value) =>
            handleContactsChange("allowColdPaidMessages", value)
          }
          disabled={saving}
        />
      </View>

      {/* Ads & Marketing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.marketing")}
        </Text>

        <SettingRow
          label={t("userControl.marketing.allowInAppPromotions")}
          value={profile.marketing.allowInAppPromotions}
          onValueChange={(value) =>
            handleMarketingToggle("allowInAppPromotions", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.marketing.allowEmailMarketing")}
          value={profile.marketing.allowEmailMarketing}
          onValueChange={(value) =>
            handleMarketingToggle("allowEmailMarketing", value)
          }
          disabled={saving}
        />

        <SettingRow
          label={t("userControl.marketing.allowPushMarketing")}
          value={profile.marketing.allowPushMarketing}
          onValueChange={(value) =>
            handleMarketingToggle("allowPushMarketing", value)
          }
          disabled={saving}
        />
      </View>

      {/* Support & Help */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("userControl.section.support")}
        </Text>

        <TouchableOpacity
          style={styles.supportButton}
          onPress={navigateToSupport}
          disabled={saving}
        >
          <Text style={styles.supportButtonText}>
            {t("userControl.support.openHelpCenter")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface SettingRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

function SettingRow({ label, value, onValueChange, disabled }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: "#ccc", true: "#9F7AEA" }}
        thumbColor={value ? "#6B46C1" : "#f4f3f4"}
      />
    </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a202c",
  },
  savingIndicator: {
    marginLeft: 12,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#e53e3e",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#6B46C1",
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  settingLabel: {
    fontSize: 16,
    color: "#4a5568",
    flex: 1,
    marginRight: 12,
  },
  selectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f7fafc",
    borderRadius: 8,
    marginBottom: 12,
  },
  selectLabel: {
    fontSize: 16,
    color: "#4a5568",
    flex: 1,
  },
  selectValue: {
    fontSize: 14,
    color: "#6B46C1",
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: "#4a5568",
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1a202c",
    backgroundColor: "#fff",
  },
  supportButton: {
    backgroundColor: "#6B46C1",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  supportButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
