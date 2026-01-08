/**
 * PACK 123 - Invite Team Member Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

const ROLES = [
  {
    id: 'manager',
    name: 'Manager',
    description: 'Edit profile, post content, view analytics & earnings',
    color: '#FF6B35',
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Edit profile, post content, view analytics',
    color: '#4ECDC4',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'View analytics and earnings only',
    color: '#95E1D3',
  },
  {
    id: 'support_agent',
    name: 'Support Agent',
    description: 'Handle support inquiries only',
    color: '#FFE66D',
  },
];

export default function InviteTeamMemberScreen() {
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('editor');
  const [dmAccess, setDmAccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);

      const functions = getFunctions();
      const inviteTeamMember = httpsCallable(functions, 'inviteTeamMember');

      const result = await inviteTeamMember({
        memberEmail: email.trim(),
        role: selectedRole,
        dmAccessGranted: dmAccess,
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert(
          'Success',
          'Team member invitation sent successfully',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else if (data.require2FA) {
        Alert.alert(
          'Error',
          data.error || 'Team member must enable 2FA for this role'
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Invite Team Member</Text>
        <Text style={styles.subtitle}>
          Add a team member to help manage your account
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="team@example.com"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Role</Text>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.id}
            style={[
              styles.roleCard,
              selectedRole === role.id && styles.roleCardSelected,
            ]}
            onPress={() => setSelectedRole(role.id)}
          >
            <View style={styles.roleHeader}>
              <View
                style={[styles.roleIndicator, { backgroundColor: role.color }]}
              />
              <Text style={styles.roleName}>{role.name}</Text>
              {selectedRole === role.id && (
                <Text style={styles.selectedIcon}>✓</Text>
              )}
            </View>
            <Text style={styles.roleDescription}>{role.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => setDmAccess(!dmAccess)}
        >
          <View style={styles.optionInfo}>
            <Text style={styles.optionLabel}>Grant DM Access</Text>
            <Text style={styles.optionDescription}>
              Allow this member to respond to direct messages (requires 2FA)
            </Text>
          </View>
          <View style={[styles.checkbox, dmAccess && styles.checkboxChecked]}>
            {dmAccess && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Security Notice</Text>
        <Text style={styles.warningText}>
          • Team members cannot access payouts or financial settings
        </Text>
        <Text style={styles.warningText}>
          • DM access requires explicit consent and 2FA
        </Text>
        <Text style={styles.warningText}>
          • All actions are logged and auditable
        </Text>
        <Text style={styles.warningText}>
          • You can revoke access at any time
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleInvite}
        disabled={loading}
      >
        <Text style={styles.submitButtonText}>
          {loading ? 'Sending Invitation...' : 'Send Invitation'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
  },
  roleCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  roleCardSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  roleName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },
  selectedIcon: {
    fontSize: 20,
    color: '#007AFF',
  },
  roleDescription: {
    fontSize: 14,
    color: '#999',
    marginLeft: 24,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionInfo: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#999',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningBox: {
    margin: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#FFA500',
    borderRadius: 12,
    padding: 16,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFA500',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
