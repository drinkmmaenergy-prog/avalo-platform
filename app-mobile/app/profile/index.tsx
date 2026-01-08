/**
 * PACK 269 - Profile Screen
 * Main profile view with navigation to all settings sections
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsSection {
  icon: string;
  title: string;
  subtitle?: string;
  route: string;
  badge?: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    icon: '✏️',
    title: 'Edit Profile',
    subtitle: 'Update your basic information',
    route: '/profile/edit',
  },
  {
    icon: '📸',
    title: 'Photos',
    subtitle: 'Manage your profile photos',
    route: '/profile/photos',
  },
  {
    icon: '⚙️',
    title: 'Preferences',
    subtitle: 'Dating preferences & filters',
    route: '/profile/preferences',
  },
  {
    icon: '🔒',
    title: 'Privacy',
    subtitle: 'Control who sees your profile',
    route: '/profile/privacy',
  },
  {
    icon: '💰',
    title: 'Earn Mode',
    subtitle: 'Enable creator monetization',
    route: '/profile/earn',
    badge: 'NEW',
  },
  {
    icon: '🤖',
    title: 'AI Avatar',
    subtitle: 'Create your digital persona',
    route: '/profile/ai-avatar',
  },
  {
    icon: '🛡️',
    title: 'Security',
    subtitle: 'Password & 2FA settings',
    route: '/profile/security',
  },
  {
    icon: '❓',
    title: 'Help & Support',
    subtitle: 'FAQs and contact us',
    route: '/profile/help',
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [incognitoMode, setIncognitoMode] = React.useState(false);
  const [passportMode, setPassportMode] = React.useState(false);

  const handleSectionPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Profile" />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.userName}>{user?.email?.split('@')[0] || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        {/* Quick Toggles */}
        <View style={styles.quickToggles}>
          <View style={styles.toggleCard}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleIcon}>🕶️</Text>
              <View>
                <Text style={styles.toggleTitle}>Incognito Mode</Text>
                <Text style={styles.toggleSubtitle}>Browse privately</Text>
              </View>
            </View>
            <Switch
              value={incognitoMode}
              onValueChange={setIncognitoMode}
              trackColor={{ false: colors.disabled, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleIcon}>🌍</Text>
              <View>
                <Text style={styles.toggleTitle}>Passport Mode</Text>
                <Text style={styles.toggleSubtitle}>Match anywhere</Text>
              </View>
            </View>
            <Switch
              value={passportMode}
              onValueChange={setPassportMode}
              trackColor={{ false: colors.disabled, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Settings Sections */}
        <View style={styles.sections}>
          {SETTINGS_SECTIONS.map((section, index) => (
            <TouchableOpacity
              key={index}
              style={styles.sectionItem}
              onPress={() => handleSectionPress(section.route)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionLeft}>
                <Text style={styles.sectionIcon}>{section.icon}</Text>
                <View style={styles.sectionText}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    {section.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{section.badge}</Text>
                      </View>
                    )}
                  </View>
                  {section.subtitle && (
                    <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 60,
  },
  userName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  userEmail: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  quickToggles: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: 16,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  toggleIcon: {
    fontSize: 28,
  },
  toggleTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  toggleSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  sections: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: 12,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  sectionIcon: {
    fontSize: 24,
  },
  sectionText: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: fontSizes.xs - 2,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  sectionSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 28,
    color: colors.textTertiary,
    fontWeight: fontWeights.light,
  },
  logoutButton: {
    margin: spacing.lg,
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.error,
  },
  bottomSpacing: {
    height: spacing.xxxl,
  },
});
