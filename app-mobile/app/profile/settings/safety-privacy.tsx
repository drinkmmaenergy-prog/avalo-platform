/**
 * Safety & Privacy Center
 * 
 * Features:
 * - View and manage blocked users
 * - Report user functionality
 * - Contact support
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface BlockedUser {
  userId: string;
  displayName: string;
  photoURL?: string;
  blockedAt: Date;
  reason?: string;
}

const REPORT_CATEGORIES = [
  { id: 'harassment', label: 'Harassment or Bullying', icon: '⚠️' },
  { id: 'fake_profile', label: 'Fake Profile', icon: '🎭' },
  { id: 'inappropriate_content', label: 'Inappropriate Content', icon: '🚫' },
  { id: 'spam', label: 'Spam', icon: '📧' },
  { id: 'other', label: 'Other', icon: '📝' },
];

export default function SafetyPrivacyScreen() {
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try {
      setLoading(true);
      // TODO: Load from Firestore
      // const userId = await getCurrentUserId();
      // const blockedList = await getBlockedUsers(userId);
      // setBlockedUsers(blockedList);
      
      // Mock data for now
      setBlockedUsers([
        {
          userId: 'user1',
          displayName: 'Example User',
          blockedAt: new Date(),
          reason: 'Chemistry just wasn\'t there',
        },
      ]);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (userId: string, displayName: string) => {
    Alert.alert(
      'Unblock User',
      `Unblock ${displayName}? They will be able to see your profile and contact you again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // TODO: Call Cloud Function
              // const currentUserId = await getCurrentUserId();
              // await unblockUser(currentUserId, userId);
              
              setBlockedUsers(blockedUsers.filter(u => u.userId !== userId));
              Alert.alert('Success', `${displayName} has been unblocked.`);
            } catch (error) {
              console.error('Failed to unblock user:', error);
              Alert.alert('Error', 'Failed to unblock user. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const submitReport = async () => {
    if (!reportCategory) {
      Alert.alert('Error', 'Please select a report category.');
      return;
    }

    if (!reportDescription.trim()) {
      Alert.alert('Error', 'Please provide a description.');
      return;
    }

    try {
      setLoading(true);
      // TODO: Call Cloud Function to submit report
      // const userId = await getCurrentUserId();
      // const reportedUserId = 'TARGET_USER_ID'; // Get from context
      // await reportUser(userId, reportedUserId, reportCategory, reportDescription);
      
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. Our team will review it shortly.',
        [{ text: 'OK', onPress: () => {
          setShowReportModal(false);
          setReportCategory('');
          setReportDescription('');
        }}]
      );
    } catch (error) {
      console.error('Failed to submit report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const contactSupport = async () => {
    if (!supportMessage.trim()) {
      Alert.alert('Error', 'Please enter your message.');
      return;
    }

    try {
      setLoading(true);
      // TODO: Send email via SendGrid Cloud Function
      // const userId = await getCurrentUserId();
      // await sendSupportEmail(userId, supportMessage);
      
      Alert.alert(
        'Message Sent',
        'Your message has been sent to our support team. We will respond via email within 24 hours.',
        [{ text: 'OK', onPress: () => {
          setShowSupportModal(false);
          setSupportMessage('');
        }}]
      );
    } catch (error) {
      console.error('Failed to contact support:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderBlockedUser = ({ item }: { item: BlockedUser }) => (
    <View style={styles.blockedUserCard}>
      <View style={styles.blockedUserInfo}>
        <View style={styles.blockedUserAvatar}>
          <Text style={styles.blockedUserAvatarText}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.blockedUserDetails}>
          <Text style={styles.blockedUserName}>{item.displayName}</Text>
          {item.reason && (
            <Text style={styles.blockedUserReason}>{item.reason}</Text>
          )}
          <Text style={styles.blockedUserDate}>
            Blocked {item.blockedAt.toLocaleDateString()}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => unblockUser(item.userId, item.displayName)}
        disabled={loading}
      >
        <Text style={styles.unblockButtonText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Safety & Privacy</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Quick Actions */}
        <View style={styles.quickActionsCard}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowReportModal(true)}
          >
            <Text style={styles.actionIcon}>⚠️</Text>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Report a User</Text>
              <Text style={styles.actionDescription}>
                Report something that crossed the line
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowSupportModal(true)}
          >
            <Text style={styles.actionIcon}>💬</Text>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Contact Support</Text>
              <Text style={styles.actionDescription}>
                Get help from our support team
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Blocked Users */}
        <View style={styles.blockedUsersCard}>
          <Text style={styles.cardTitle}>
            Blocked Users ({blockedUsers.length})
          </Text>
          
          {blockedUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>✓</Text>
              <Text style={styles.emptyStateText}>
                You haven't blocked any users
              </Text>
            </View>
          ) : (
            <FlatList
              data={blockedUsers}
              renderItem={renderBlockedUser}
              keyExtractor={(item) => item.userId}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Safety Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.cardTitle}>Safety Tips</Text>
          
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>🔒</Text>
            <Text style={styles.tipText}>
              Never share personal information like your address or financial details
            </Text>
          </View>
          
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>👥</Text>
            <Text style={styles.tipText}>
              Meet in public places for first dates and tell a friend where you'll be
            </Text>
          </View>
          
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>🚨</Text>
            <Text style={styles.tipText}>
              Trust your instincts — if it feels off, let us know
            </Text>
          </View>
          
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>✋</Text>
            <Text style={styles.tipText}>
              Trust your instincts - if something feels wrong, it probably is
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report User</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.modalLabel}>Select Category</Text>
              {REPORT_CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryButton,
                    reportCategory === category.id && styles.categoryButtonSelected,
                  ]}
                  onPress={() => setReportCategory(category.id)}
                >
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  {reportCategory === category.id && (
                    <Text style={styles.categoryCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              <Text style={styles.modalLabel}>Description</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Please provide details about your report..."
                value={reportDescription}
                onChangeText={setReportDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={submitReport}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Support Modal */}
      <Modal
        visible={showSupportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSupportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contact Support</Text>
              <TouchableOpacity onPress={() => setShowSupportModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.modalDescription}>
                Our support team is here to help. We typically respond within 24 hours.
              </Text>

              <Text style={styles.modalLabel}>Your Message</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe your issue or question..."
                value={supportMessage}
                onChangeText={setSupportMessage}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={contactSupport}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>Send Message</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  quickActionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 10,
  },
  actionIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: '#666',
  },
  actionArrow: {
    fontSize: 24,
    color: '#999',
  },
  blockedUsersCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  blockedUserCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 10,
  },
  blockedUserInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  blockedUserAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  blockedUserAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  blockedUserDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  blockedUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  blockedUserReason: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  blockedUserDate: {
    fontSize: 12,
    color: '#999',
  },
  unblockButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#4ECDC4',
    borderRadius: 6,
  },
  unblockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 10,
    opacity: 0.5,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
  },
  tipsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  tipIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 28,
    color: '#999',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryButtonSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FFFE',
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  categoryCheck: {
    fontSize: 20,
    color: '#4ECDC4',
  },
  textArea: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    fontSize: 15,
    marginBottom: 20,
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
