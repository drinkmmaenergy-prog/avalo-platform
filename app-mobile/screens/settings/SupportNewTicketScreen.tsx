/**
 * Support New Ticket Screen
 * 
 * Form to create a new support ticket.
 * Part of PACK 68 - In-App Support Center & Ticketing.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  SupportCategory,
  SupportSeverity,
  createSupportTicket,
  getAllCategories,
  getCategoryDisplayName,
} from '../../services/supportService';

const SupportNewTicketScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as { category?: SupportCategory } | undefined;

  const [category, setCategory] = useState<SupportCategory>(
    params?.category || 'OTHER'
  );
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SupportSeverity>('NORMAL');
  const [loading, setLoading] = useState(false);

  const locale = 'en'; // TODO: Get from user settings
  const userId = 'current-user-id'; // TODO: Get from auth context

  const handleSubmit = async () => {
    // Validation
    if (!subject.trim()) {
      Alert.alert('Error', 'Please enter a subject');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please describe your issue');
      return;
    }

    try {
      setLoading(true);

      const result = await createSupportTicket({
        userId,
        category,
        subject: subject.trim(),
        description: description.trim(),
        severity,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        locale,
      });

      Alert.alert(
        'Ticket Created',
        'Your support ticket has been created. We\'ll respond within 24 hours.',
        [
          {
            text: 'View Ticket',
            onPress: () => {
              navigation.navigate('SupportTicketDetail' as never, {
                ticketId: result.ticketId,
              } as never);
            },
          },
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('[SupportNewTicket] Error creating ticket:', error);
      Alert.alert('Error', 'Failed to create ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const categories = getAllCategories();
  const severities: SupportSeverity[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Category *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  category === cat && styles.categoryChipActive,
                ]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {getCategoryDisplayName(cat, locale)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={styles.label}>Subject *</Text>
          <TextInput
            style={styles.input}
            placeholder="Short summary of your problem"
            value={subject}
            onChangeText={setSubject}
            maxLength={100}
          />
          <Text style={styles.helperText}>{subject.length}/100</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe what happened, when and on which device."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.helperText}>{description.length}/1000</Text>
        </View>

        {/* Severity */}
        <View style={styles.section}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.severityRow}>
            {severities.map((sev) => (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.severityChip,
                  severity === sev && styles.severityChipActive,
                ]}
                onPress={() => setSeverity(sev)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.severityChipText,
                    severity === sev && styles.severityChipTextActive,
                  ]}
                >
                  {sev.charAt(0) + sev.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Creating...' : 'Send Message'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Our support team typically responds within 24 hours. You'll receive
          updates in your support tickets section.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textArea: {
    height: 150,
    paddingTop: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'right',
  },
  severityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  severityChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    margin: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  severityChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  severityChipText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  severityChipTextActive: {
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});

export default SupportNewTicketScreen;
