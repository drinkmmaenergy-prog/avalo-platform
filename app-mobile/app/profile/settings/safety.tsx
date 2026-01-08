/**
 * PACK 280 - Safety Settings Screen
 * Manage trusted contacts and safety preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafetyService } from "@/lib/services/SafetyService";
import type {
  SafetyProfile,
  TrustedContact,
  NotificationChannel,
} from "@/shared/src/types/safety";

export default function SafetySettingsScreen() {
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddContact, setShowAddContact] = useState(false);

  // New contact form state
  const [newContactName, setNewContactName] = useState('');
  const [newContactChannel, setNewContactChannel] = useState<NotificationChannel>('sms');
  const [newContactValue, setNewContactValue] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await SafetyService.getSafetyProfile();
      setProfile(data);
    } catch (error) {
      console.error('Error loading safety profile:', error);
      Alert.alert('Error', 'Failed to load safety settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSetting = async (
    setting: keyof SafetyProfile['settings'],
    value: boolean
  ) => {
    try {
      await SafetyService.updateSettings({ [setting]: value });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              settings: { ...prev.settings, [setting]: value },
            }
          : null
      );
    } catch (error) {
      console.error('Error updating setting:', error);
      Alert.alert('Error', 'Failed to update setting');
    }
  };

  const handleAddContact = async () => {
    if (!newContactName || !newContactValue) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      await SafetyService.addTrustedContact({
        name: newContactName,
        channel: newContactChannel,
        value: newContactValue,
        enabled: true,
      });

      // Reset form
      setNewContactName('');
      setNewContactValue('');
      setShowAddContact(false);

      // Reload profile
      await loadProfile();

      Alert.alert('Success', 'Trusted contact added');
    } catch (error) {
      console.error('Error adding contact:', error);
      Alert.alert('Error', 'Failed to add trusted contact');
    }
  };

  const handleRemoveContact = (contactId: string) => {
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to remove this trusted contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await SafetyService.removeTrustedContact(contactId);
              await loadProfile();
              Alert.alert('Success', 'Contact removed');
            } catch (error) {
              console.error('Error removing contact:', error);
              Alert.alert('Error', 'Failed to remove contact');
            }
          },
        },
      ]
    );
  };

  const handleTestContact = async (contactId: string) => {
    try {
      await SafetyService.testTrustedContact(contactId);
      Alert.alert('Test Sent', 'A test notification has been sent to this contact');
    } catch (error) {
      console.error('Error testing contact:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load safety settings</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Safety & Emergency</Text>
        <Text style={styles.headerSubtitle}>
          Manage your safety settings and trusted contacts
        </Text>
      </View>

      {/* Safety Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Tracking</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Auto-track during meetings</Text>
            <Text style={styles.settingDescription}>
              Automatically start location tracking during calendar meetings
            </Text>
          </View>
          <Switch
            value={profile.settings.autoTrackingOnMeetings}
            onValueChange={(value) =>
              handleToggleSetting('autoTrackingOnMeetings', value)
            }
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Auto-track during events</Text>
            <Text style={styles.settingDescription}>
              Automatically start location tracking when attending events
            </Text>
          </View>
          <Switch
            value={profile.settings.autoTrackingOnEvents}
            onValueChange={(value) =>
              handleToggleSetting('autoTrackingOnEvents', value)
            }
          />
        </View>
      </View>

      {/* Panic Alert Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Panic Alert Information</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Send my profile</Text>
            <Text style={styles.settingDescription}>
              Include your profile link when sending panic alerts
            </Text>
          </View>
          <Switch
            value={profile.settings.panicSendProfile}
            onValueChange={(value) => handleToggleSetting('panicSendProfile', value)}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Send my location</Text>
            <Text style={styles.settingDescription}>
              Include your last known location in panic alerts
            </Text>
          </View>
          <Switch
            value={profile.settings.panicSendLocation}
            onValueChange={(value) => handleToggleSetting('panicSendLocation', value)}
          />
        </View>
      </View>

      {/* Trusted Contacts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trusted Contacts</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddContact(!showAddContact)}
          >
            <Text style={styles.addButtonText}>
              {showAddContact ? 'Cancel' : '+ Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionDescription}>
          These people will be notified when you press the panic button
        </Text>

        {/* Add Contact Form */}
        {showAddContact && (
          <View style={styles.addContactForm}>
            <TextInput
              style={styles.input}
              placeholder="Contact Name"
              value={newContactName}
              onChangeText={setNewContactName}
            />

            <View style={styles.channelSelector}>
              {(['sms', 'email', 'whatsapp'] as NotificationChannel[]).map((channel) => (
                <TouchableOpacity
                  key={channel}
                  style={[
                    styles.channelButton,
                    newContactChannel === channel && styles.channelButtonActive,
                  ]}
                  onPress={() => setNewContactChannel(channel)}
                >
                  <Text
                    style={[
                      styles.channelButtonText,
                      newContactChannel === channel && styles.channelButtonTextActive,
                    ]}
                  >
                    {channel.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={
                newContactChannel === 'email'
                  ? 'email@example.com'
                  : newContactChannel === 'sms'
                  ? '+1234567890'
                  : 'WhatsApp number'
              }
              value={newContactValue}
              onChangeText={setNewContactValue}
              keyboardType={newContactChannel === 'email' ? 'email-address' : 'phone-pad'}
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleAddContact}>
              <Text style={styles.submitButtonText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contacts List */}
        {profile.trustedContacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No trusted contacts yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Add contacts who will be notified in emergencies
            </Text>
          </View>
        ) : (
          profile.trustedContacts.map((contact) => (
            <View key={contact.contactId} style={styles.contactCard}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactDetails}>
                  {contact.channel.toUpperCase()}: {contact.value}
                </Text>
              </View>
              <View style={styles.contactActions}>
                <TouchableOpacity
                  style={styles.testButton}
                  onPress={() => handleTestContact(contact.contactId)}
                >
                  <Text style={styles.testButtonText}>Test</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveContact(contact.contactId)}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Last Panic Info */}
      {profile.lastPanicAt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Panic Alert</Text>
          <Text style={styles.lastPanicText}>
            {new Date(profile.lastPanicAt).toLocaleString()}
          </Text>
          <Text style={styles.lastPanicContext}>
            Context: {profile.lastPanicContext}
          </Text>
        </View>
      )}

      {/* Emergency Info */}
      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Emergency Services</Text>
        <Text style={styles.warningText}>
          The panic button alerts your trusted contacts, but does NOT contact
          emergency services. In a life-threatening emergency, call 911 (US) or 112
          (Europe) directly.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addContactForm: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  channelSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  channelButton: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    alignItems: 'center',
  },
  channelButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  channelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  channelButtonTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#34C759',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#bbb',
    textAlign: 'center',
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactDetails: {
    fontSize: 13,
    color: '#666',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  lastPanicText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  lastPanicContext: {
    fontSize: 13,
    color: '#999',
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    margin: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#856404',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20,
  },
});
