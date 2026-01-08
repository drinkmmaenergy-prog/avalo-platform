/**
 * Creator Local Events Screen
 * Phase 34: Local Fan Events & Meet-Ups
 * 
 * Allows creators to:
 * - Create one active local event at a time
 * - View event status, seats, and participants
 * - Close event manually
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createEvent,
  getActiveEventForCreator,
  getParticipants,
  closeEvent,
  refreshEventStatuses,
  getTimeUntilEvent,
  LocalFanEvent,
  LocalEventParticipant,
  UnlockCondition,
} from "@/services/localEventService";

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  cardBackground: '#181818',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
  red: '#FF3B30',
  green: '#34C759',
};

const SEAT_OPTIONS = [5, 10, 15, 20, 25];

export default function LocalEventsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeEvent, setActiveEvent] = useState<LocalFanEvent | null>(null);
  const [participants, setParticipants] = useState<LocalEventParticipant[]>([]);
  
  // Wizard state
  const [step, setStep] = useState(1);
  
  // Step 1: Event details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [roughLocation, setRoughLocation] = useState('');
  const [exactLocation, setExactLocation] = useState('');
  
  // Step 2: Date & capacity
  const [eventDate, setEventDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [maxSeats, setMaxSeats] = useState(10);
  
  // Step 3: Unlock condition
  const [unlockCondition, setUnlockCondition] = useState<UnlockCondition>('SUBSCRIPTION');

  useEffect(() => {
    loadEvent();
  }, [user]);

  const loadEvent = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      await refreshEventStatuses();
      const event = await getActiveEventForCreator(user.uid);
      setActiveEvent(event);
      
      if (event) {
        const eventParticipants = await getParticipants(event.id);
        setParticipants(eventParticipants);
      }
    } catch (error) {
      console.error('Error loading event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!user?.uid) return;
    
    if (!title.trim()) {
      Alert.alert(t('common.error'), 'Event title is required');
      return;
    }
    
    if (!city.trim()) {
      Alert.alert(t('common.error'), 'City is required');
      return;
    }
    
    if (!roughLocation.trim()) {
      Alert.alert(t('common.error'), 'Rough location is required');
      return;
    }

    try {
      setCreating(true);
      
      await createEvent(user.uid, {
        title: title.trim(),
        description: description.trim() || undefined,
        city: city.trim(),
        countryCode: countryCode.trim() || undefined,
        roughLocation: roughLocation.trim(),
        exactLocation: exactLocation.trim() || null,
        dateTimestamp: eventDate.getTime(),
        maxSeats,
        unlockCondition,
      });

      Alert.alert(
        t('common.success'),
        t('localEvents.createSuccess')
      );
      
      // Reset wizard
      setStep(1);
      setTitle('');
      setDescription('');
      setCity('');
      setCountryCode('');
      setRoughLocation('');
      setExactLocation('');
      setEventDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      setMaxSeats(10);
      setUnlockCondition('SUBSCRIPTION');
      
      // Reload event
      await loadEvent();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseEvent = () => {
    if (!activeEvent) return;
    
    Alert.alert(
      t('localEvents.closeConfirmTitle'),
      t('localEvents.closeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await closeEvent(activeEvent.id);
              Alert.alert(t('common.success'), 'Event closed');
              await loadEvent();
            } catch (error) {
              Alert.alert(t('common.error'), 'Failed to close event');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return COLORS.green;
      case 'CLOSED':
        return COLORS.red;
      case 'EXPIRED':
        return COLORS.lightGray;
      default:
        return COLORS.lightGray;
    }
  };

  const getStatusLabel = (status: string) => {
    return t(`localEvents.status${status.charAt(0) + status.slice(1).toLowerCase()}`);
  };

  const formatCountdown = () => {
    if (!activeEvent) return '';
    
    const { days, hours, minutes, isPast } = getTimeUntilEvent(activeEvent);
    
    if (isPast) {
      return t('localEvents.countdownSoon');
    }
    
    if (days > 0) {
      return t('localEvents.countdownDays', { count: days });
    }
    
    if (hours > 0) {
      return t('localEvents.countdownHours', { count: hours });
    }
    
    return t('localEvents.countdownSoon');
  };

  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{t('localEvents.title')}</Text>
      <Text style={styles.headerSubtitle}>{t('localEvents.subtitle')}</Text>
    </View>
  );

  const renderWizardStep1 = () => (
    <View style={styles.wizardStep}>
      <Text style={styles.stepTitle}>{t('localEvents.step1Title')}</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('localEvents.eventTitleLabel')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Coffee & Community Meetup"
          placeholderTextColor="#666"
          maxLength={60}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('localEvents.eventDescriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details about the event..."
          placeholderTextColor="#666"
          multiline
          numberOfLines={3}
          maxLength={200}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('localEvents.cityLabel')}</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="e.g., Warsaw"
          placeholderTextColor="#666"
          maxLength={50}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('localEvents.countryLabel')}</Text>
        <TextInput
          style={styles.input}
          value={countryCode}
          onChangeText={setCountryCode}
          placeholder="e.g., PL"
          placeholderTextColor="#666"
          maxLength={2}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('localEvents.roughLocationLabel')}</Text>
        <TextInput
          style={styles.input}
          value={roughLocation}
          onChangeText={setRoughLocation}
          placeholder="e.g., Centrum / Śródmieście"
          placeholderTextColor="#666"
          maxLength={100}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Exact Location (revealed less than 24h before)
        </Text>
        <TextInput
          style={styles.input}
          value={exactLocation}
          onChangeText={setExactLocation}
          placeholder="e.g., Ul. Marszałkowska 1 (optional)"
          placeholderTextColor="#666"
          maxLength={150}
        />
      </View>

      <TouchableOpacity
        style={[styles.nextButton, (!title.trim() || !city.trim() || !roughLocation.trim()) && styles.buttonDisabled]}
        onPress={() => setStep(2)}
        disabled={!title.trim() || !city.trim() || !roughLocation.trim()}
      >
        <Text style={styles.nextButtonText}>{t('common.next')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderWizardStep2 = () => {
    const adjustDate = (days: number) => {
      const newDate = new Date(eventDate);
      newDate.setDate(newDate.getDate() + days);
      setEventDate(newDate);
    };

    const adjustTime = (hours: number) => {
      const newDate = new Date(eventDate);
      newDate.setHours(newDate.getHours() + hours);
      setEventDate(newDate);
    };

    return (
      <View style={styles.wizardStep}>
        <Text style={styles.stepTitle}>{t('localEvents.step2Title')}</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('localEvents.dateLabel')}</Text>
          <View style={styles.dateDisplay}>
            <Text style={styles.dateDisplayText}>
              {formatDateTime(eventDate.getTime())}
            </Text>
          </View>
          
          <View style={styles.dateAdjustButtons}>
            <TouchableOpacity
              style={styles.dateAdjustButton}
              onPress={() => adjustDate(-1)}
            >
              <Text style={styles.dateAdjustButtonText}>- 1 day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateAdjustButton}
              onPress={() => adjustDate(1)}
            >
              <Text style={styles.dateAdjustButtonText}>+ 1 day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateAdjustButton}
              onPress={() => adjustTime(-1)}
            >
              <Text style={styles.dateAdjustButtonText}>- 1 hour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateAdjustButton}
              onPress={() => adjustTime(1)}
            >
              <Text style={styles.dateAdjustButtonText}>+ 1 hour</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('localEvents.maxSeatsLabel')}</Text>
          <View style={styles.seatsGrid}>
            {SEAT_OPTIONS.map((seats) => (
              <TouchableOpacity
                key={seats}
                style={[
                  styles.seatOption,
                  maxSeats === seats && styles.seatOptionSelected,
                ]}
                onPress={() => setMaxSeats(seats)}
              >
                <Text style={[
                  styles.seatOptionText,
                  maxSeats === seats && styles.seatOptionTextSelected,
                ]}>
                  {seats}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.wizardButtons}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nextButton}
            onPress={() => setStep(3)}
          >
            <Text style={styles.nextButtonText}>{t('common.next')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderWizardStep3 = () => {
    const conditions: Array<{
      value: UnlockCondition;
      icon: string;
      label: string;
      description: string;
    }> = [
      {
        value: 'SUBSCRIPTION',
        icon: '⭐',
        label: t('localEvents.conditionSubscription'),
        description: 'Fans who subscribed to you',
      },
      {
        value: 'LIVE',
        icon: '📹',
        label: t('localEvents.conditionLive'),
        description: 'Fans who joined your LIVE streams',
      },
      {
        value: 'PPV',
        icon: '🎬',
        label: t('localEvents.conditionPPV'),
        description: 'Fans who unlocked your PPV content',
      },
      {
        value: 'AI',
        icon: '🤖',
        label: t('localEvents.conditionAI'),
        description: 'Fans who chatted with your AI companion',
      },
      {
        value: 'SEASON_TIER_2',
        icon: '🏆',
        label: t('localEvents.conditionSeason'),
        description: 'Fans who reached Tier 2+ in Season Pass',
      },
    ];

    return (
      <View style={styles.wizardStep}>
        <Text style={styles.stepTitle}>{t('localEvents.step3Title')}</Text>
        <Text style={styles.stepSubtitle}>
          {t('localEvents.unlockConditionLabel')}
        </Text>
        
        <View style={styles.conditionsGrid}>
          {conditions.map((condition) => {
            const isSelected = unlockCondition === condition.value;
            
            return (
              <TouchableOpacity
                key={condition.value}
                style={[
                  styles.conditionCard,
                  isSelected && styles.conditionCardSelected,
                ]}
                onPress={() => setUnlockCondition(condition.value)}
              >
                <Text style={styles.conditionIcon}>{condition.icon}</Text>
                <Text style={[
                  styles.conditionLabel,
                  isSelected && styles.conditionLabelSelected,
                ]}>
                  {condition.label}
                </Text>
                <Text style={styles.conditionDescription}>
                  {condition.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.wizardButtons}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.createButton, creating && styles.buttonDisabled]}
            onPress={handleCreateEvent}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.createButtonText}>
                {t('localEvents.createCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderActiveEventCard = () => {
    if (!activeEvent) return null;

    return (
      <View style={styles.activeEventCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderText}>
            {t('localEvents.activeEventHeader')}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(activeEvent.status) }]}>
            <Text style={styles.statusText}>
              {getStatusLabel(activeEvent.status)}
            </Text>
          </View>
        </View>

        <Text style={styles.eventTitle}>{activeEvent.title}</Text>
        {activeEvent.description && (
          <Text style={styles.eventDescription}>{activeEvent.description}</Text>
        )}

        <View style={styles.eventInfoGrid}>
          <View style={styles.eventInfoItem}>
            <Text style={styles.eventInfoIcon}>📅</Text>
            <Text style={styles.eventInfoText}>
              {formatDateTime(activeEvent.dateTimestamp)}
            </Text>
          </View>
          
          <View style={styles.eventInfoItem}>
            <Text style={styles.eventInfoIcon}>🌆</Text>
            <Text style={styles.eventInfoText}>
              {activeEvent.city}, {activeEvent.roughLocation}
            </Text>
          </View>
          
          <View style={styles.eventInfoItem}>
            <Text style={styles.eventInfoIcon}>⏰</Text>
            <Text style={styles.eventInfoText}>
              {formatCountdown()}
            </Text>
          </View>
        </View>

        <View style={styles.seatsCard}>
          <Text style={styles.seatsLabel}>
            {t('localEvents.seatsLeft', { 
              taken: participants.length, 
              max: activeEvent.maxSeats 
            })}
          </Text>
          <View style={styles.seatsBar}>
            <View 
              style={[
                styles.seatsFill,
                { width: `${(participants.length / activeEvent.maxSeats) * 100}%` }
              ]} 
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.participantsButton}
          onPress={() => {
            Alert.alert(
              t('localEvents.participantsTitle'),
              `${participants.length} participants`
            );
          }}
        >
          <Text style={styles.participantsButtonText}>
            {t('localEvents.participantsTitle')} ({participants.length})
          </Text>
        </TouchableOpacity>

        {activeEvent.status === 'ACTIVE' && (
          <TouchableOpacity
            style={styles.closeEventButton}
            onPress={handleCloseEvent}
          >
            <Text style={styles.closeEventButtonText}>
              {t('localEvents.closeEvent')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('localEvents.title'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.gold,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderHeader()}

        {activeEvent ? (
          renderActiveEventCard()
        ) : (
          <View style={styles.createSection}>
            <View style={styles.noEventBanner}>
              <Text style={styles.noEventIcon}>📍</Text>
              <Text style={styles.noEventTitle}>
                {t('localEvents.noActiveEvent')}
              </Text>
              <Text style={styles.noEventSubtitle}>
                {t('localEvents.createFirst')}
              </Text>
            </View>

            {step === 1 && renderWizardStep1()}
            {step === 2 && renderWizardStep2()}
            {step === 3 && renderWizardStep3()}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    lineHeight: 22,
  },
  noEventBanner: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.turquoise,
  },
  noEventIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  noEventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  noEventSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  createSection: {
    gap: 24,
  },
  wizardStep: {
    gap: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: COLORS.lightGray,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateDisplay: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gold,
    marginBottom: 12,
  },
  dateDisplayText: {
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  dateAdjustButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateAdjustButton: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: COLORS.mediumGray,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dateAdjustButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  seatsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  seatOption: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.mediumGray,
  },
  seatOptionSelected: {
    borderColor: COLORS.turquoise,
    backgroundColor: COLORS.turquoise + '20',
  },
  seatOptionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.lightGray,
  },
  seatOptionTextSelected: {
    color: COLORS.turquoise,
  },
  conditionsGrid: {
    gap: 12,
  },
  conditionCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  conditionCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold + '10',
  },
  conditionIcon: {
    fontSize: 28,
    marginBottom: 10,
  },
  conditionLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 6,
  },
  conditionLabelSelected: {
    color: COLORS.gold,
  },
  conditionDescription: {
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 18,
  },
  wizardButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  backButton: {
    flex: 1,
    backgroundColor: COLORS.mediumGray,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  nextButton: {
    flex: 2,
    backgroundColor: COLORS.turquoise,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  createButton: {
    flex: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  activeEventCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 15,
    color: COLORS.lightGray,
    lineHeight: 22,
    marginBottom: 20,
  },
  eventInfoGrid: {
    gap: 12,
    marginBottom: 20,
  },
  eventInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 14,
  },
  eventInfoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  eventInfoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  seatsCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  seatsLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 10,
  },
  seatsBar: {
    height: 8,
    backgroundColor: COLORS.mediumGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  seatsFill: {
    height: '100%',
    backgroundColor: COLORS.turquoise,
    borderRadius: 4,
  },
  participantsButton: {
    backgroundColor: COLORS.turquoise,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  participantsButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  closeEventButton: {
    backgroundColor: COLORS.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeEventButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
