/**
 * PACK 300A - Create Support Ticket Screen
 * Form for creating new support tickets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { auth } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { Ionicons } from '@expo/vector-icons';
import {
  TicketType,
  TICKET_TYPE_LABELS,
  CreateTicketRequest,
  CreateTicketResponse,
} from "@/shared/types/support";
import TicketAttachmentUploader from './components/TicketAttachmentUploader';

interface Attachment {
  uri: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name: string;
  size?: number;
}

const TICKET_TYPES: TicketType[] = [
  'GENERAL_QUESTION',
  'TECHNICAL_ISSUE',
  'PAYMENT_ISSUE',
  'PAYOUT_ISSUE',
  'ACCOUNT_ACCESS',
  'CALENDAR_BOOKING_ISSUE',
  'EVENT_ISSUE',
  'OTHER',
];

export default function CreateTicketScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [type, setType] = useState<TicketType | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [creating, setCreating] = useState(false);

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

  const handleCreateTicket = async () => {
    if (!subject.trim()) {
      Alert.alert('Required Field', 'Please enter a subject for your ticket');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Required Field', 'Please describe your issue');
      return;
    }

    if (!type) {
      Alert.alert('Required Field', 'Please select a ticket type');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'You must be logged in to create a ticket');
      return;
    }

    setCreating(true);

    try {
      const createTicketFunction = httpsCallable<CreateTicketRequest, CreateTicketResponse>(
        functions,
        'createTicket'
      );

      const request: CreateTicketRequest = {
        type,
        subject: subject.trim(),
        description: description.trim(),
        related: {},
      };

      const result = await createTicketFunction(request);

      if (result.data.success && result.data.ticketId) {
        Alert.alert(
          'Ticket Created',
          'Your support ticket has been created successfully. Our team will respond soon.',
          [
            {
              text: 'View Ticket',
              onPress: () => {
                router.replace(`/support/${result.data.ticketId}` as any);
              },
            },
            {
              text: 'Back to List',
              onPress: () => {
                router.replace('/support' as any);
              },
            },
          ]
        );
      } else {
        throw new Error(result.data.error || 'Failed to create ticket');
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to create support ticket. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const getTypeIcon = (ticketType: TicketType) => {
    const iconMap: Record<TicketType, string> = {
      GENERAL_QUESTION: 'help-circle-outline',
      TECHNICAL_ISSUE: 'bug-outline',
      PAYMENT_ISSUE: 'card-outline',
      PAYOUT_ISSUE: 'cash-outline',
      ACCOUNT_ACCESS: 'lock-closed-outline',
      SAFETY_REPORT_FOLLOWUP: 'shield-checkmark-outline',
      CONTENT_TAKEDOWN: 'ban-outline',
      CALENDAR_BOOKING_ISSUE: 'calendar-outline',
      EVENT_ISSUE: 'people-outline',
      OTHER: 'ellipsis-horizontal-circle-outline',
    };
    return iconMap[ticketType];
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Support Ticket</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Ticket Type Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Ticket Type <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.typeGrid}>
            {TICKET_TYPES.map((ticketType) => (
              <TouchableOpacity
                key={ticketType}
                style={[
                  styles.typeCard,
                  type === ticketType && styles.typeCardSelected,
                ]}
                onPress={() => setType(ticketType)}
              >
                <Ionicons
                  name={getTypeIcon(ticketType) as any}
                  size={24}
                  color={type === ticketType ? '#6366f1' : '#6b7280'}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    type === ticketType && styles.typeLabelSelected,
                  ]}
                >
                  {TICKET_TYPE_LABELS[ticketType].en}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Subject <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Brief description of your issue"
            placeholderTextColor="#9ca3af"
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
          />
          <Text style={styles.charCount}>{subject.length}/200</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Please describe your issue in detail..."
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={5000}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/5000</Text>
        </View>

        {/* Attachments */}
        <View style={styles.section}>
          <Text style={styles.label}>Attachments (Optional)</Text>
          <TicketAttachmentUploader
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#3b82f6" />
          <Text style={styles.infoText}>
            Our support team typically responds within 24 hours. For urgent issues, we prioritize based on severity.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!subject.trim() || !description.trim() || !type || creating) && styles.submitButtonDisabled,
          ]}
          onPress={handleCreateTicket}
          disabled={!subject.trim() || !description.trim() || !type || creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Create Support Ticket</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '48%',
    aspectRatio: 1.8,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  typeCardSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eff6ff',
  },
  typeLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  typeLabelSelected: {
    color: '#6366f1',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#6366f1',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
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
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
