/**
 * PACK 210: Trusted Contacts Management Screen
 * Add and manage emergency contacts for safety tracking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Stack } from 'expo-router';

interface TrustedContact {
  contactId: string;
  name: string;
  phoneNumber: string;
  phoneCountryCode: string;
  email?: string;
  relationship: string;
  isPrimary: boolean;
  receiveTrackingLinks: boolean;
  receivePanicAlerts: boolean;
  receiveAutoAlerts: boolean;
}

export default function TrustedContactsScreen() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<TrustedContact | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('FRIEND');
  const [isPrimary, setIsPrimary] = useState(false);
  const [receiveTrackingLinks, setReceiveTrackingLinks] = useState(true);
  const [receivePanicAlerts, setReceivePanicAlerts] = useState(true);
  const [receiveAutoAlerts, setReceiveAutoAlerts] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const functions = getFunctions();
      const getContacts = httpsCallable(functions, 'pack210_getTrustedContacts');
      const result = await getContacts();
      const data = result.data as any;
      
      if (data.success) {
        setContacts(data.contacts);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
      Alert.alert('Error', 'Failed to load trusted contacts');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPhoneNumber('');
    setPhoneCountryCode('+1');
    setEmail('');
    setRelationship('FRIEND');
    setIsPrimary(false);
    setReceiveTrackingLinks(true);
    setReceivePanicAlerts(true);
    setReceiveAutoAlerts(true);
    setEditingContact(null);
  };

  const handleSaveContact = async () => {
    if (!name.trim() || !phoneNumber.trim()) {
      Alert.alert('Error', 'Name and phone number are required');
      return;
    }

    try {
      const functions = getFunctions();
      const manageContact = httpsCallable(functions, 'pack210_manageTrustedContact');
      
      const result = await manageContact({
        contactId: editingContact?.contactId,
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        phoneCountryCode: phoneCountryCode.trim(),
        email: email.trim() || undefined,
        relationship,
        isPrimary,
        receiveTrackingLinks,
        receivePanicAlerts,
        receiveAutoAlerts,
      });

      const data = result.data as any;
      
      if (data.success) {
        Alert.alert(
          'Success',
          editingContact ? 'Contact updated successfully' : 'Contact added successfully'
        );
        setShowAddForm(false);
        resetForm();
        loadContacts();
      }
    } catch (error: any) {
      console.error('Failed to save contact:', error);
      Alert.alert('Error', error.message || 'Failed to save contact');
    }
  };

  const handleEditContact = (contact: TrustedContact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhoneNumber(contact.phoneNumber);
    setPhoneCountryCode(contact.phoneCountryCode);
    setEmail(contact.email || '');
    setRelationship(contact.relationship);
    setIsPrimary(contact.isPrimary);
    setReceiveTrackingLinks(contact.receiveTrackingLinks);
    setReceivePanicAlerts(contact.receivePanicAlerts);
    setReceiveAutoAlerts(contact.receiveAutoAlerts);
    setShowAddForm(true);
  };

  const handleDeleteContact = (contact: TrustedContact) => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to remove ${contact.name} as a trusted contact?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const functions = getFunctions();
              const removeContact = httpsCallable(functions, 'pack210_removeTrustedContact');
              await removeContact({ contactId: contact.contactId });
              loadContacts();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Trusted Contacts',
          headerBackTitle: 'Settings',
        }}
      />

      <ScrollView style={styles.container}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={24} color="#007AFF" />
          <Text style={styles.infoText}>
            Your trusted contacts can track your location and receive alerts during meetings.
          </Text>
        </View>

        {/* Add Contact Button */}
        {!showAddForm && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              setShowAddForm(true);
            }}
          >
            <Ionicons name="add-circle" size={24} color="#007AFF" />
            <Text style={styles.addButtonText}>Add Trusted Contact</Text>
          </TouchableOpacity>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {editingContact ? 'Edit Contact' : 'Add New Contact'}
            </Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
            />

            <Text style={styles.label}>Phone Number *</Text>
            <View style={styles.phoneRow}>
              <TextInput
                style={[styles.input, styles.countryCode]}
                value={phoneCountryCode}
                onChangeText={setPhoneCountryCode}
                placeholder="+1"
              />
              <TextInput
                style={[styles.input, styles.phoneInput]}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Phone number"
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.label}>Email (optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Relationship</Text>
            <View style={styles.relationshipGrid}>
              {['FRIEND', 'FAMILY', 'PARTNER_NON_DATE', 'ROOMMATE', 'OTHER'].map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipChip,
                    relationship === rel && styles.relationshipChipActive,
                  ]}
                  onPress={() => setRelationship(rel)}
                >
                  <Text
                    style={[
                      styles.relationshipText,
                      relationship === rel && styles.relationshipTextActive,
                    ]}
                  >
                    {rel.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Primary Contact</Text>
              <Switch value={isPrimary} onValueChange={setIsPrimary} />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Receive Tracking Links</Text>
              <Switch value={receiveTrackingLinks} onValueChange={setReceiveTrackingLinks} />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Receive Panic Alerts</Text>
              <Switch value={receivePanicAlerts} onValueChange={setReceivePanicAlerts} />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Receive Auto Safety Checks</Text>
              <Switch value={receiveAutoAlerts} onValueChange={setReceiveAutoAlerts} />
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.formButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.formButton, styles.saveButton]}
                onPress={handleSaveContact}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Contacts List */}
        {!showAddForm && (
          <View style={styles.contactsList}>
            <Text style={styles.sectionTitle}>
              Your Trusted Contacts ({contacts.length})
            </Text>

            {contacts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No trusted contacts yet</Text>
                <Text style={styles.emptySubtext}>
                  Add someone who can track your location during meetings
                </Text>
              </View>
            )}

            {contacts.map((contact) => (
              <View key={contact.contactId} style={styles.contactCard}>
                <View style={styles.contactHeader}>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.isPrimary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      onPress={() => handleEditContact(contact)}
                      style={styles.iconButton}
                    >
                      <Ionicons name="create-outline" size={20} color="#007AFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteContact(contact)}
                      style={styles.iconButton}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.contactPhone}>
                  {contact.phoneCountryCode} {contact.phoneNumber}
                </Text>
                {contact.email && <Text style={styles.contactEmail}>{contact.email}</Text>}
                <Text style={styles.contactRelationship}>
                  {contact.relationship.replace('_', ' ')}
                </Text>

                <View style={styles.contactSettings}>
                  {contact.receiveTrackingLinks && (
                    <Text style={styles.settingTag}>📍 Live Tracking</Text>
                  )}
                  {contact.receivePanicAlerts && (
                    <Text style={styles.settingTag}>🚨 Panic Alerts</Text>
                  )}
                  {contact.receiveAutoAlerts && (
                    <Text style={styles.settingTag}>⏰ Safety Checks</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  form: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCode: {
    width: 80,
  },
  phoneInput: {
    flex: 1,
  },
  relationshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  relationshipChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  relationshipChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  relationshipText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  relationshipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 4,
  },
  switchLabel: {
    fontSize: 16,
    color: '#333',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  contactsList: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  primaryBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  contactRelationship: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  contactSettings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  settingTag: {
    fontSize: 11,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
});
