/**
 * PACK 58 — Creator Availability Screen
 * 
 * Allows creators to set their meeting availability:
 * - Weekly schedule with time blocks
 * - Date-specific overrides
 * - Meeting mode (online/offline/hybrid)
 * - Price per meeting
 * - Location hints
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  fetchCreatorAvailability,
  setCreatorAvailability,
  AvailabilitySettings,
  MeetingMode,
  WeeklySlot,
} from '../../services/reservationService';
import { useAuth } from '../../contexts/AuthContext';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_LABELS: { [key: string]: string } = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export default function CreatorAvailabilityScreen() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Availability settings
  const [timezone, setTimezone] = useState('Europe/Warsaw');
  const [defaultPriceTokens, setDefaultPriceTokens] = useState('100');
  const [meetingMode, setMeetingMode] = useState<MeetingMode>('ONLINE');
  const [locationHint, setLocationHint] = useState('');
  const [description, setDescription] = useState('');

  // Weekly schedule
  const [weeklySlots, setWeeklySlots] = useState<{ [key: string]: WeeklySlot }>({});

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { availability } = await fetchCreatorAvailability(
        currentUser.uid,
        now.toISOString(),
        oneWeekLater.toISOString()
      );

      if (availability) {
        setTimezone(availability.timezone || 'Europe/Warsaw');
        setDefaultPriceTokens(String(availability.defaultPriceTokens));
        setMeetingMode(availability.meetingMode);
        setLocationHint(availability.locationHint || '');
        setDescription(availability.description || '');
      }
    } catch (error) {
      console.error('Error loading availability:', error);
      Alert.alert('Error', 'Failed to load availability settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;

    const price = parseInt(defaultPriceTokens, 10);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid Price', 'Price must be a positive number');
      return;
    }

    try {
      setSaving(true);

      const settings: AvailabilitySettings = {
        timezone,
        weeklySlots,
        defaultPriceTokens: price,
        meetingMode,
        locationHint: locationHint || undefined,
        description: description || undefined,
      };

      await setCreatorAvailability(settings);

      Alert.alert('Success', 'Availability updated successfully');
    } catch (error: any) {
      console.error('Error saving availability:', error);
      Alert.alert('Error', error.message || 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekday = (day: string) => {
    setWeeklySlots((prev) => ({
      ...prev,
      [day]: {
        enabled: !prev[day]?.enabled,
        blocks: prev[day]?.blocks || [
          {
            start: '09:00',
            end: '17:00',
            slotDurationMinutes: 60,
          },
        ],
      },
    }));
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading availability...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('reservation.availability.title')}</Text>

        {/* Price */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('reservation.availability.price')}</Text>
          <TextInput
            style={styles.input}
            value={defaultPriceTokens}
            onChangeText={setDefaultPriceTokens}
            keyboardType="numeric"
            placeholder="100"
          />
          <Text style={styles.hint}>Tokens per meeting</Text>
        </View>

        {/* Meeting Mode */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('reservation.availability.meetingMode')}</Text>
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                meetingMode === 'ONLINE' && styles.modeButtonActive,
              ]}
              onPress={() => setMeetingMode('ONLINE')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  meetingMode === 'ONLINE' && styles.modeButtonTextActive,
                ]}
              >
                Online
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                meetingMode === 'OFFLINE' && styles.modeButtonActive,
              ]}
              onPress={() => setMeetingMode('OFFLINE')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  meetingMode === 'OFFLINE' && styles.modeButtonTextActive,
                ]}
              >
                Offline
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                meetingMode === 'HYBRID' && styles.modeButtonActive,
              ]}
              onPress={() => setMeetingMode('HYBRID')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  meetingMode === 'HYBRID' && styles.modeButtonTextActive,
                ]}
              >
                Hybrid
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location Hint */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('reservation.availability.locationHint')}</Text>
          <TextInput
            style={styles.input}
            value={locationHint}
            onChangeText={setLocationHint}
            placeholder="e.g., Zoom link will be sent / Warsaw city center"
            multiline
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell clients what to expect from the meeting..."
            multiline
            numberOfLines={4}
          />
        </View>
      </View>

      {/* Weekly Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Schedule</Text>
        <Text style={styles.sectionHint}>
          Toggle days when you're available for meetings
        </Text>

        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayRow}>
            <View style={styles.weekdayLabel}>
              <Text style={styles.weekdayText}>{WEEKDAY_LABELS[day]}</Text>
            </View>
            <Switch
              value={weeklySlots[day]?.enabled || false}
              onValueChange={() => toggleWeekday(day)}
              trackColor={{ false: '#d1d5db', true: '#667eea' }}
              thumbColor="#ffffff"
            />
          </View>
        ))}

        <Text style={styles.note}>
          Note: Default hours are 9:00 AM - 5:00 PM with 1-hour slots. You can
          customize this further in the full settings.
        </Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Availability</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  field: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  weekdayLabel: {
    flex: 1,
  },
  weekdayText: {
    fontSize: 16,
    color: '#111827',
  },
  note: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 16,
    fontStyle: 'italic',
  },
  saveButton: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
