/**
 * PACK 123 - Team Dashboard Screen
 * 
 * Main interface for managing team members
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

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
  invitedAt: any;
  joinedAt?: any;
}

export default function TeamDashboardScreen() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      const functions = getFunctions();
      const getTeamMembers = httpsCallable(functions, 'getTeamMembers');
      
      const result = await getTeamMembers({});
      const data = result.data as any;

      if (data.success) {
        setMembers(data.members);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load team members');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTeamMembers();
  };

  const handleInviteMember = () => {
    router.push('/profile/settings/team/invite');
  };

  const handleViewActivity = () => {
    router.push('/profile/settings/team/activity');
  };

  const handleManageMember = (member: TeamMember) => {
    router.push({
      pathname: '/profile/settings/team/manage',
      params: { membershipId: member.membershipId },
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'manager':
        return '#FF6B35';
      case 'editor':
        return '#4ECDC4';
      case 'analyst':
        return '#95E1D3';
      case 'support_agent':
        return '#FFE66D';
      default:
        return '#999';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'invited':
        return '#FFC107';
      case 'suspended':
        return '#FF9800';
      case 'removed':
        return '#F44336';
      default:
        return '#999';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Team Management</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading team members...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Management</Text>
        <Text style={styles.subtitle}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleInviteMember}
        >
          <Text style={styles.primaryButtonText}>+ Invite Member</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleViewActivity}
        >
          <Text style={styles.secondaryButtonText}>View Activity Log</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.membersList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No team members yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Invite team members to help manage your account
            </Text>
          </View>
        ) : (
          members.map((member) => (
            <TouchableOpacity
              key={member.membershipId}
              style={styles.memberCard}
              onPress={() => handleManageMember(member)}
            >
              <View style={styles.memberHeader}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.memberDisplayName || 'Unknown User'}
                  </Text>
                  <Text style={styles.memberEmail}>{member.memberEmail}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(member.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{member.status}</Text>
                </View>
              </View>

              <View style={styles.memberDetails}>
                <View
                  style={[
                    styles.roleBadge,
                    { backgroundColor: getRoleColor(member.role) },
                  ]}
                >
                  <Text style={styles.roleText}>
                    {member.role.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.accessIndicators}>
                  {member.dmAccessGranted && (
                    <View style={styles.accessBadge}>
                      <Text style={styles.accessText}>DM Access</Text>
                    </View>
                  )}
                  {member.twoFactorEnabled && (
                    <View style={styles.accessBadge}>
                      <Text style={styles.accessText}>2FA</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.permissionsText}>
                {member.permissions.length} permissions
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
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
  actionButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
  membersList: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    color: '#FFF',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  memberCard: {
    backgroundColor: '#1a1a1a',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  memberDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  accessIndicators: {
    flexDirection: 'row',
    gap: 8,
  },
  accessBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  accessText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  permissionsText: {
    fontSize: 12,
    color: '#666',
  },
});
