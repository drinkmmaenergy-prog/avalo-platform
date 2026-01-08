/**
 * PACK 335 - Create Support Ticket Screen
 * Allows users to create new support tickets with context
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { Ionicons } from '@expo/vector-icons';

type TicketType = 'TECHNICAL' | 'PAYMENT' | 'REFUND_DISPUTE' | 'IDENTITY_VERIFICATION' | 'SAFETY' | 'ACCOUNT_ACCESS' | 'OTHER';

interface CreateTicketRequest {
  userId: string;
  type: TicketType;
  context: {
    relatedChatId?: string;
    relatedBookingId?: string;
    relatedEventId?: string;
    relatedTransactionId?: string;
    relatedUserId?: string;
  };
  initialMessage: string;
  attachments?: string[];
}

export default function CreateTicketScreen() {
  const params = useLocalSearchParams<{
    type?: TicketType;
    chatId?: string;
    bookingId?: string;
    eventId?: string;
    transactionId?: string;
    relatedUserId?: string;
  }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [type, setType] = useState<TicketType>(params.type || 'OTHER');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        router.replace('/auth/login' as any);
      }
    });
    return () => unsubscribe();
  }, []);

  const ticketTypes: Array<{ value: TicketType; label: string; icon: string; description: string }> = [
    {
      value: 'TECHNICAL',
      label: 'Technical Issue',
      icon: 'bug-outline',
      description: 'App bugs, crashes, or technical problems',
    },
    {
      value: 'PAYMENT',
      label: 'Payment Issue',
      icon: 'card-outline',
      description: 'Problems with payments or transactions',
    },
    {
      value: 'REFUND_DISPUTE',
      label: 'Refund Request',
      icon: 'cash-outline',
      description: 'Request a refund or dispute a charge',
    },
    {
      value: 'IDENTITY_VERIFICATION',
      label: 'ID Verification',
      icon: 'shield-checkmark-outline',
      description: 'Issues with identity verification',
    },
    {
      value: 'SAFETY',
      label: 'Safety Concern',
      icon: 'alert-circle-outline',
      description: 'Report safety issues or inappropriate behavior',
    },
    {
      value: 'ACCOUNT_ACCESS',
      label: 'Account Access',
      icon: 'lock-closed-outline',
      description: 'Trouble accessing your account',
    },
    {
      value: 'OTHER',
      label: 'Other',
      icon: 'help-circle-outline',
      description: 'General questions or other issues',
    },
  ];

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    if (!message.trim()) {
      Alert.alert('Error', 'Please describe your issue');
      return;
    }

    setLoading(true);

    try {
      const createTicket = httpsCallable<CreateTicketRequest, { success: boolean; ticketId: string }>(
        functions,
        'pack335_createSupportTicket'
      );

      const request: CreateTicketRequest = {
        userId,
        type,
        context: {
          relatedChatId: params.chatId,
          relatedBookingId: params.bookingId,
          relatedEventId: params.eventId,
          relatedTransactionId: params.transactionId,
          relatedUserId: params.relatedUserId,
        },
        initialMessage: message.trim(),
      };

      const result = await createTicket(request);

      if (result.data.success) {
        Alert.alert(
          'Success',
          'Your support ticket has been created. Our team will respond soon.',
          [
            {
              text: 'View Ticket',
              onPress: () => {
                router.replace(`/support/${result.data.ticketId}` as any);
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      
      let errorMessage = 'Failed to create support ticket. Please try again.';
      
      if (error.code === 'resource-exhausted') {
        errorMessage = 'You have reached the maximum number of open tickets. Please close some existing tickets first.';
      } else if (error.code === 'failed-precondition') {
        errorMessage = error.message || 'This issue cannot be disputed at this time.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Support Ticket</Text>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#6366f1" />
        <Text style={styles.infoText}>
          Our support team typically responds within 24 hours. For urgent issues, please contact us immediately.
        </Text>
      </View>

      {/* Issue Type Selection */}
      <Text style={styles.sectionTitle}>What can we help you with?</Text>
      <View style={styles.typeList}>
        {ticketTypes.map((ticketType) => (
          <TouchableOpacity
            key={ticketType.value}
            style={[
              styles.typeCard,
              type === ticketType.value && styles.typeCardActive,
            ]}
            onPress={() => setType(ticketType.value)}
          >
            <View style={styles.typeCardHeader}>
              <Ionicons
                name={ticketType.icon as any}
                size={24}
                color={type === ticketType.value ? '#6366f1' : '#6b7280'}
              />
              <Text
                style={[
                  styles.typeLabel,
                  type === ticketType.value && styles.typeLabelActive,
                ]}
              >
                {ticketType.label}
              </Text>
            </View>
            <Text style={styles.typeDescription}>{ticketType.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Message Input */}
      <Text style={styles.sectionTitle}>Describe your issue *</Text>
      <TextInput
        style={styles.messageInput}
        placeholder="Please provide as much detail as possible..."
        placeholderTextColor="#9ca3af"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={2000}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{message.length} / 2000</Text>

      {/* Context Info */}
      {(params.chatId || params.bookingId || params.eventId || params.transactionId) && (
        <View style={styles.contextCard}>
          <Ionicons name="link-outline" size={20} color="#6366f1" />
          <Text style={styles.contextText}>
            This ticket will include context from your recent activity
          </Text>
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, (!message.trim() || loading) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!message.trim() || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={20} color="#fff" />
            <Text style={styles.submitButtonText}>Submit Ticket</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    marginTop: 8,
  },
  typeList: {
    gap: 12,
    marginBottom: 24,
  },
  typeCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  typeCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#eff6ff',
  },
  typeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  typeLabelActive: {
    color: '#6366f1',
  },
  typeDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  messageInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    minHeight: 150,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 16,
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  contextText: {
    flex: 1,
    fontSize: 13,
    color: '#047857',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
