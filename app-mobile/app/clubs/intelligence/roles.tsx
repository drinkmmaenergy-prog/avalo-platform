/**
 * PACK 193 — Club Roles Management
 * Functional, non-hierarchical role assignment
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface ClubRole {
  roleId: string;
  userId: string;
  userName: string;
  role: string;
  description: string;
  assignedAt: any;
  isActive: boolean;
}

const ROLE_TYPES = [
  { value: 'coach', label: 'Coach', icon: '🏋️', description: 'Teaches & mentors members' },
  { value: 'researcher', label: 'Researcher', icon: '🔬', description: 'Posts educational resources' },
  { value: 'archivist', label: 'Archivist', icon: '📚', description: 'Catalogs materials' },
  { value: 'host', label: 'Host', icon: '🎯', description: 'Coordinates live sessions' },
  { value: 'moderator', label: 'Moderator', icon: '🛡️', description: 'Enforces rules' },
];

export default function ClubRolesManagement() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<ClubRole[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [userId, setUserId] = useState('');
  const [description, setDescription] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadRoles();
    }
  }, [clubId]);

  const loadRoles = async () => {
    try {
      setLoading(true);
      // Note: This would need a backend function to list roles
      // For now, we'll show the UI structure
      setRoles([]);
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedRole || !userId) {
      Alert.alert('Error', 'Please select a role and enter a user ID');
      return;
    }

    try {
      setAssigning(true);

      const result = await httpsCallable(functions, 'assignClubRole')({
        clubId,
        userId,
        role: selectedRole,
        description,
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert('Success', 'Role assigned successfully');
        setShowAssignModal(false);
        setSelectedRole('');
        setUserId('');
        setDescription('');
        loadRoles();
      } else {
        Alert.alert('Error', data.error || 'Failed to assign role');
      }
    } catch (error: any) {
      console.error('Error assigning role:', error);
      Alert.alert('Error', error.message || 'Failed to assign role');
    } finally {
      setAssigning(false);
    }
  };

  const getRoleConfig = (roleType: string) => {
    return ROLE_TYPES.find(r => r.value === roleType) || ROLE_TYPES[0];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading roles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club Roles</Text>
        <TouchableOpacity onPress={() => setShowAssignModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#4A90E2" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#3498DB" />
          <Text style={styles.infoText}>
            Roles are functional, NOT hierarchical. No alpha/beta/VIP status ranks.
          </Text>
        </View>

        {/* Available Roles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Roles</Text>
          {ROLE_TYPES.map((roleType) => (
            <View key={roleType.value} style={styles.roleTypeCard}>
              <Text style={styles.roleIcon}>{roleType.icon}</Text>
              <View style={styles.roleTypeInfo}>
                <Text style={styles.roleTypeName}>{roleType.label}</Text>
                <Text style={styles.roleTypeDescription}>{roleType.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Current Roles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Role Assignments</Text>
          {roles.length > 0 ? (
            roles.map((role) => {
              const config = getRoleConfig(role.role);
              return (
                <View key={role.roleId} style={styles.roleCard}>
                  <Text style={styles.roleCardIcon}>{config.icon}</Text>
                  <View style={styles.roleCardInfo}>
                    <View style={styles.roleCardHeader}>
                      <Text style={styles.roleCardName}>{role.userName}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>{config.label}</Text>
                      </View>
                    </View>
                    {role.description && (
                      <Text style={styles.roleCardDescription}>{role.description}</Text>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people" size={48} color="#BDC3C7" />
              <Text style={styles.emptyText}>No roles assigned yet</Text>
              <Text style={styles.emptySubtext}>Assign functional roles to organize your club</Text>
            </View>
          )}
        </View>

        {/* Guidelines */}
        <View style={styles.guidelines}>
          <Text style={styles.guidelinesTitle}>Role Guidelines</Text>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>Roles define responsibilities, not status</Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
            <Text style={styles.guidelineText}>All members have equal visibility & access</Text>
          </View>
          <View style={styles.guidelineItem}>
            <Ionicons name="close-circle" size={16} color="#E74C3C" />
            <Text style={styles.guidelineText}>No VIP, elite, or popularity-based roles</Text>
          </View>
        </View>
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Role</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={24} color="#2C3E50" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Select Role */}
              <Text style={styles.inputLabel}>Select Role *</Text>
              <View style={styles.roleSelector}>
                {ROLE_TYPES.map((roleType) => (
                  <TouchableOpacity
                    key={roleType.value}
                    style={[
                      styles.roleSelectorItem,
                      selectedRole === roleType.value && styles.roleSelectorItemSelected,
                    ]}
                    onPress={() => setSelectedRole(roleType.value)}
                  >
                    <Text style={styles.roleSelectorIcon}>{roleType.icon}</Text>
                    <Text style={styles.roleSelectorLabel}>{roleType.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* User ID */}
              <Text style={styles.inputLabel}>User ID *</Text>
              <TextInput
                style={styles.input}
                value={userId}
                onChangeText={setUserId}
                placeholder="Enter user ID"
                autoCapitalize="none"
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Why are you assigning this role?"
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowAssignModal(false)}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleAssignRole}
                disabled={assigning || !selectedRole || !userId}
              >
                {assigning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Assign Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  addButton: {
    padding: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E8F4FD',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#2980B9',
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  roleTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  roleIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  roleTypeInfo: {
    flex: 1,
  },
  roleTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  roleTypeDescription: {
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  roleCardIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  roleCardInfo: {
    flex: 1,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleCardName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2C3E50',
  },
  roleBadge: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  roleCardDescription: {
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7F8C8D',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#95A5A6',
    marginTop: 4,
    textAlign: 'center',
  },
  guidelines: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 8,
  },
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  roleSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleSelectorItemSelected: {
    backgroundColor: '#E8F4FD',
    borderColor: '#4A90E2',
  },
  roleSelectorIcon: {
    fontSize: 18,
  },
  roleSelectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2C3E50',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ECF0F1',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1',
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#4A90E2',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  buttonSecondary: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#BDC3C7',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7F8C8D',
  },
});
