/**
 * PACK 276 - Profile Settings Screen
 * 
 * Central hub for all profile settings:
 * - Edit profile
 * - Change photos
 * - Enable passport
 * - Enable incognito
 * - Notification settings
 * - Delete account
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileSettingsScreen() {
  const router = useRouter();

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and you will lose all your data, matches, and messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement account deletion
            Alert.alert('Account Deletion', 'This feature will be implemented soon.');
          },
        },
      ]
    );
  };

  const settingsSections = [
    {
      title: 'Profile',
      items: [
        {
          icon: 'person-outline',
          label: 'Edit Profile',
          subtitle: 'Update your bio, interests, and details',
          route: '/profile/edit',
        },
        {
          icon: 'images-outline',
          label: 'Change Photos',
          subtitle: 'Add or remove profile photos',
          route: '/profile/photos',
        },
        {
          icon: 'shield-checkmark-outline',
          label: 'Verification Status',
          subtitle: 'Check your verification status',
          route: '/profile/verification-status',
        },
      ],
    },
    {
      title: 'Privacy & Visibility',
      items: [
        {
          icon: 'eye-off-outline',
          label: 'Incognito Mode',
          subtitle: 'Hide your profile from discovery',
          route: '/profile/settings/incognito',
        },
        {
          icon: 'airplane-outline',
          label: 'Passport',
          subtitle: 'Change your location',
          route: '/profile/settings/passport',
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: 'filter-outline',
          label: 'Discovery Preferences',
          subtitle: 'Who you want to see',
          route: '/profile/preferences',
        },
        {
          icon: 'notifications-outline',
          label: 'Notifications',
          subtitle: 'Manage notification settings',
          route: '/profile/settings/notifications',
        },
      ],
    },
    {
      title: 'Safety & Security',
      items: [
        {
          icon: 'lock-closed-outline',
          label: 'Security',
          subtitle: 'Password and 2FA',
          route: '/profile/security',
        },
        {
          icon: 'shield-outline',
          label: 'Privacy',
          subtitle: 'Control who can see what',
          route: '/profile/privacy',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'help-circle-outline',
          label: 'Help & Support',
          subtitle: 'Get help or contact us',
          route: '/profile/help',
        },
        {
          icon: 'document-text-outline',
          label: 'Legal Center',
          subtitle: 'Terms, privacy policy, and more',
          route: '/profile/legal-center',
        },
        {
          icon: 'trash-outline',
          label: 'Delete Account',
          subtitle: 'Permanently delete your account',
          onPress: handleDeleteAccount,
          danger: true,
        },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.settingItemLast,
                  ]}
                  onPress={() => {
                    if (item.onPress) {
                      item.onPress();
                    } else if (item.route) {
                      router.push(item.route as any);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.settingIcon,
                      item.danger && styles.settingIconDanger,
                    ]}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={24}
                      color={item.danger ? '#FF6B6B' : '#666'}
                    />
                  </View>
                  <View style={styles.settingInfo}>
                    <Text
                      style={[
                        styles.settingLabel,
                        item.danger && styles.settingLabelDanger,
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#CCC"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* App version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Avalo v1.0.0</Text>
          <Text style={styles.versionSubtext}>Build 276</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F8F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingIconDanger: {
    backgroundColor: '#FFF5F5',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  settingLabelDanger: {
    color: '#FF6B6B',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#999',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  versionText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  versionSubtext: {
    fontSize: 12,
    color: '#CCC',
  },
});
