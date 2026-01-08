/**
 * PACK 123 - Manage Team Member Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface TeamMember {
  membershipId: string;
  memberUserId: string;
  memberEmail?: string;
  memberDisplayName?: string;
  role: string;
  status: string;
  permissions: string[];
  dmAccessGranted: boolean;
  twoFactorEnabled: boolean;
}

const ROLES = [
  { id: 'manager', name: 'Manager', color: '#FF6B35' },
  { id: 'editor', name: 'Editor', color: '#4ECDC4' },
  { id: 'analyst', name: 'Analyst', color: '#95E1D3' },
  { id: 'support_agent', name: 'Support Agent', color: '#FFE66D' },
];

export default function ManageTeamMemberScreen() {
  const params = useLocalSearchParams();
  const membershipId = params.membershipId as string;

  const [member, setMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemberDetails();
  }, []);

  const loadMemberDetails = async () => {
    try {
      const functions = getFunctions();
      const getTeamMembers = httpsCallable(functions, 'getTeamMembers');

      const result = await getTeamMembers({});
      const data = result.data as any;

      if (data.success) {
        const foundMember = data.members.find(
          (m: any) => m.membershipId === membershipId
        );
        if (foundMember) {
          setMember(foundMember);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load member details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (newRole: string) => {
    if (!member) return;

    Alert.alert(
      'Update Role',
      `Change role to ${newRole.replace('_', ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              const functions = getFunctions();
              const updateTeamMemberRole = httpsCallable(
                functions,
                'updateTeamMemberRole'
              );

              const result = await updateTeamMemberRole({
                membershipId: member.membershipId,
                newRole,
              });

              const data = result.data as any;

              if (data.success) {
                Alert.alert('Success', 'Role updated successfully');
                loadMemberDetails();
              } else if (data.require2FA) {
                Alert.alert(
                  'Error',
                  data.error || 'Member must enable 2FA for this role'
                );
              } else {
                Alert.alert('Error', data.error || 'Failed to update role');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update role');
            }
          },
        },
      ]
    );
  };

  const handleToggleDmAccess = async () => {
    if (!member) return;

    const action = member.dmAccessGranted ? 'revoke' : 'grant';
    const functionName = member.dmAccessGranted
      ? 'revokeDmAccess'
      : 'grantDmAccess';

    Alert.alert(
      `${action === 'grant' ? 'Grant' : 'Revoke'} DM Access`,
      `Are you sure you want to ${action} DM access for this member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'grant' ? 'Grant' : 'Revoke',
          style: action === 'revoke' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const functions = getFunctions();
              const callable = httpsCallable(functions, functionName);

              const result = await callable({
                membershipId: member.membershipId,
              });

              const data = result.data as any;

              if (data.success) {
                Alert.alert('Success', `DM access ${action}ed successfully`);
                loadMemberDetails();
              } else if (data.require2FA) {
                Alert.alert(
                  'Error',
                  data.error || 'Member must enable 2FA for DM access'
                );
              } else {
                Alert.alert('Error', data.error || `Failed to ${action} DM access`);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || `Failed to ${action} DM access`);
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = async () => {
    if (!member) return;

    Alert.alert(
      'Remove Team Member',
      'Are you sure you want to remove this team member? This action is immediate.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const functions = getFunctions();
              const removeTeamMember = httpsCallable(
                functions,
                'removeTeamMember'
              );

              const result = await removeTeamMember({
                membershipId: member.membershipId,
                reason: 'Removed by owner',
              });

              const data = result.data as any;

              if (data.success) {
                Alert.alert('Success', 'Team member removed successfully', [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]);
              } else {
                Alert.alert('Error', data.error || 'Failed to remove member');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  if (loading || !member) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading member details...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{member.memberDisplayName}</Text>
        <Text style={styles.email}>{member.memberEmail}</Text>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                member.status === 'active'
                  ? '#4CAF50'
                  : member.status === 'invited'
                  ? '#FFC107'
                  : '#F44336',
            },
          ]}
        >
          <Text style={styles.statusText}>{member.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Role</Text>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.id}
            style={[
              styles.roleOption,
              member.role === role.id && styles.roleOptionSelected,
            ]}
            onPress={() => handleUpdateRole(role.id)}
            disabled={member.role === role.id}
          >
            <View
              style={[styles.roleIndicator, { backgroundColor: role.color }]}
            />
            <Text style={styles.roleOptionText}>{role.name}</Text>
            {member.role === role.id && (
              <Text style={styles.currentBadge}>Current</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <View style={styles.permissionsList}>
          {member.permissions.map((permission, index) => (
            <View key={index} style={styles.permissionBadge}>
              <Text style={styles.permissionText}>
                {permission.replace('_', ' ')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Access Controls</Text>

        <TouchableOpacity
          style={styles.accessRow}
          onPress={handleToggleDmAccess}
        >
          <View style={styles.accessInfo}>
            <Text style={styles.accessLabel}>DM Access</Text>
            <Text style={styles.accessDescription}>
              {member.dmAccessGranted
                ? 'Can respond to direct messages'
                : 'Cannot access direct messages'}
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              member.dmAccessGranted && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                member.dmAccessGranted && styles.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.accessRow}>
          <View style={styles.accessInfo}>
            <Text style={styles.accessLabel}>Two-Factor Authentication</Text>
            <Text style={styles.accessDescription}>
              {member.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
            </Text>
          </View>
          <Text style={styles.twoFactorStatus}>
            {member.twoFactorEnabled ? '✓' : '✗'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleRemoveMember}
        >
          <Text style={styles.dangerButtonText}>Remove Team Member</Text>
        </TouchableOpacity>
        <Text style={styles.dangerWarning}>
          This action is immediate and will revoke all access
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: '#999',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  roleOptionSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  roleIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  roleOptionText: {
    fontSize: 16,
    color: '#FFF',
    flex: 1,
  },
  currentBadge: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  permissionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionBadge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  permissionText: {
    color: '#FFF',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  accessInfo: {
    flex: 1,
  },
  accessLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  accessDescription: {
    fontSize: 14,
    color: '#999',
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#007AFF',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  twoFactorStatus: {
    fontSize: 24,
    color: '#FFF',
  },
  dangerButton: {
    backgroundColor: '#F44336',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  dangerButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerWarning: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
