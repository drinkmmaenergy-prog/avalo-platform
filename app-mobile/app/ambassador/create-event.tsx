/**
 * PACK 152 - Create Ambassador Event
 * With comprehensive safety validation against romantic/NSFW content
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';
import DateTimePicker from '@react-native-community/datetimepicker';

const EVENT_TYPES = [
  { value: 'wellness_workshop', label: 'Wellness Workshop' },
  { value: 'fitness_meetup', label: 'Fitness Meetup' },
  { value: 'photography_walk', label: 'Photography Walk' },
  { value: 'creator_collaboration', label: 'Creator Collaboration' },
  { value: 'business_networking', label: 'Business Networking' },
  { value: 'beauty_masterclass', label: 'Beauty Masterclass' },
  { value: 'creator_growth_seminar', label: 'Creator Growth Seminar' },
  { value: 'outdoor_challenge', label: 'Outdoor Challenge' },
  { value: 'tech_gaming_night', label: 'Tech & Gaming Night' },
  { value: 'skill_workshop', label: 'Skill Workshop' },
  { value: 'professional_networking', label: 'Professional Networking' }
];

export default function CreateEventScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'wellness_workshop',
    venue: '',
    address: '',
    city: '',
    country: '',
    countryCode: '',
    startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours later
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    maxAttendees: 20,
    ticketPrice: 0,
    currency: 'USD'
  });

  const validateAndSubmit = async () => {
    if (!formData.title || !formData.description || !formData.venue || !formData.address || 
        !formData.city || !formData.country || !formData.countryCode) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.title.length < 10) {
      Alert.alert('Error', 'Title must be at least 10 characters');
      return;
    }

    if (formData.description.length < 50) {
      Alert.alert('Error', 'Description must be at least 50 characters');
      return;
    }

    if (formData.maxAttendees < 5 || formData.maxAttendees > 200) {
      Alert.alert('Error', 'Max attendees must be between 5 and 200');
      return;
    }

    const startHour = formData.startTime.getHours();
    if (startHour < 6 || startHour >= 21) {
      Alert.alert(
        'Invalid Time',
        'Events must start between 6:00 AM and 9:00 PM for safety reasons'
      );
      return;
    }

    try {
      setLoading(true);
      const scheduleEvent = httpsCallable(functions, 'scheduleAmbassadorEvent');
      
      const result: any = await scheduleEvent({
        ...formData,
        startTime: formData.startTime.toISOString(),
        endTime: formData.endTime.toISOString()
      });

      if (result.data.warnings && result.data.warnings.length > 0) {
        Alert.alert(
          'Event Created with Warnings',
          `Your event has been submitted for approval.\n\nWarnings:\n${result.data.warnings.join('\n')}`,
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      } else {
        Alert.alert(
          'Event Created',
          'Your event has been submitted for approval. You will be notified once it is reviewed.',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      }
    } catch (error: any) {
      console.error('Event creation error:', error);
      Alert.alert(
        'Event Validation Failed',
        error.message || 'Your event could not be created. Please ensure it follows all safety guidelines.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Professional Event</Text>
        <Text style={styles.subtitle}>
          Build community through safe, skill-based gatherings
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Event Guidelines</Text>
        <Text style={styles.warningText}>
          • Professional, skill-based content only{'\n'}
          • NO romantic, dating, or NSFW themes{'\n'}
          • Events must start between 6 AM - 9 PM{'\n'}
          • Public, appropriate venues only{'\n'}
          • Safety rules and consent required
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Event Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Creator Photography Workshop"
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Event Type *</Text>
        <View style={styles.typeGrid}>
          {EVENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeButton,
                formData.eventType === type.value && styles.typeButtonActive
              ]}
              onPress={() => setFormData({ ...formData, eventType: type.value })}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  formData.eventType === type.value && styles.typeButtonTextActive
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Description * (min 50 characters)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe what attendees will learn and do at this event..."
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{formData.description.length}/50</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Venue Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Downtown Coworking Space"
          value={formData.venue}
          onChangeText={(text) => setFormData({ ...formData, venue: text })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Full Address *</Text>
        <TextInput
          style={styles.input}
          placeholder="123 Main Street"
          value={formData.address}
          onChangeText={(text) => setFormData({ ...formData, address: text })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>City *</Text>
        <TextInput
          style={styles.input}
          placeholder="San Francisco"
          value={formData.city}
          onChangeText={(text) => setFormData({ ...formData, city: text })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Country *</Text>
        <TextInput
          style={styles.input}
          placeholder="United States"
          value={formData.country}
          onChangeText={(text) => setFormData({ ...formData, country: text })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Country Code *</Text>
        <TextInput
          style={styles.input}
          placeholder="US"
          value={formData.countryCode}
          onChangeText={(text) => setFormData({ ...formData, countryCode: text.toUpperCase() })}
          maxLength={2}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Start Time *</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowStartPicker(true)}
        >
          <Text style={styles.dateText}>
            {formData.startTime.toLocaleString()}
          </Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={formData.startTime}
            mode="datetime"
            onChange={(event, date) => {
              setShowStartPicker(Platform.OS === 'ios');
              if (date) setFormData({ ...formData, startTime: date });
            }}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>End Time *</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowEndPicker(true)}
        >
          <Text style={styles.dateText}>
            {formData.endTime.toLocaleString()}
          </Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={formData.endTime}
            mode="datetime"
            onChange={(event, date) => {
              setShowEndPicker(Platform.OS === 'ios');
              if (date) setFormData({ ...formData, endTime: date });
            }}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Max Attendees *</Text>
        <TextInput
          style={styles.input}
          placeholder="20"
          value={formData.maxAttendees.toString()}
          onChangeText={(text) => setFormData({ ...formData, maxAttendees: parseInt(text) || 0 })}
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Ticket Price (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="0 (Free)"
          value={formData.ticketPrice.toString()}
          onChangeText={(text) => setFormData({ ...formData, ticketPrice: parseFloat(text) || 0 })}
          keyboardType="decimal-pad"
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={validateAndSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit for Approval</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Your event will be reviewed for compliance with safety guidelines before being published.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    padding: 20,
    backgroundColor: '#f8f9fa'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  warningBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107'
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#f8f9fa'
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    margin: 4,
    backgroundColor: '#fff'
  },
  typeButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff'
  },
  typeButtonText: {
    fontSize: 12,
    color: '#666'
  },
  typeButtonTextActive: {
    color: '#fff',
    fontWeight: '600'
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f9fa'
  },
  dateText: {
    fontSize: 14,
    color: '#1a1a1a'
  },
  submitButton: {
    margin: 16,
    backgroundColor: '#007bff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc'
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  footer: {
    padding: 16,
    paddingBottom: 32
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18
  }
});
