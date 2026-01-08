import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { MEET_CONFIG } from '../../config/monetization';
import DateTimePicker from '@react-native-community/datetimepicker';

interface HostProfile {
  userId: string;
  displayName: string;
  photoURL: string | null;
  realMeetEnabled: boolean;
  socialMeetEnabled: boolean;
  realMeetPrice: number;
  socialMeetPrice: number;
  bio: string;
  rules: string;
}

export default function HostProfile() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [selectedType, setSelectedType] = useState<'real_meet' | 'social_meet'>('social_meet');
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadHostProfile();
  }, [userId]);

  const loadHostProfile = async () => {
    try {
      const functions = getFunctions(getApp());
      const listHostsFunc = httpsCallable(functions, 'meet_listHosts');
      
      const result = await listHostsFunc({ limit: 100 });
      const data = result.data as { success: boolean; hosts?: HostProfile[] };
      
      if (data.success && data.hosts) {
        const host = data.hosts.find(h => h.userId === userId);
        if (host) {
          setProfile(host);
          if (host.realMeetEnabled) {
            setSelectedType('real_meet');
          }
        }
      }
    } catch (error) {
      console.error('Error loading host profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookMeet = async () => {
    const auth = getAuth(getApp());
    if (!auth.currentUser) {
      Alert.alert('Błąd', 'Musisz być zalogowany');
      return;
    }

    if (!profile) return;

    const price = selectedType === 'real_meet' ? profile.realMeetPrice : profile.socialMeetPrice;

    Alert.alert(
      'Potwierdzenie',
      `Czy na pewno chcesz zarezerwować spotkanie za ${price} tokenów?\n\nPłatność zostanie zablokowana w escrow i rozliczona po spotkaniu.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Rezerwuj',
          onPress: async () => {
            setBooking(true);
            try {
              const functions = getFunctions(getApp());
              const bookFunc = httpsCallable(functions, 'meet_book');
              
              const result = await bookFunc({
                hostId: userId,
                meetType: selectedType,
                scheduledDate: selectedDate.toISOString(),
                location: selectedType === 'real_meet' ? location : undefined,
                notes,
              });

              const data = result.data as { success: boolean; bookingId?: string; error?: string };
              
              if (data.success && data.bookingId) {
                Alert.alert(
                  'Sukces!',
                  'Spotkanie zostało zarezerwowane',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.push(`/meet/booking/${data.bookingId}` as any),
                    },
                  ]
                );
              } else {
                Alert.alert('Błąd', data.error || 'Nie udało się zarezerwować spotkania');
              }
            } catch (error: any) {
              Alert.alert('Błąd', error.message || 'Wystąpił błąd podczas rezerwacji');
            } finally {
              setBooking(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Nie znaleziono profilu hosta</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Image
          source={
            profile.photoURL
              ? { uri: profile.photoURL }
              : require('../../assets/icon.png')
          }
          style={styles.profilePhoto}
        />
        <Text style={styles.displayName}>{profile.displayName}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O mnie</Text>
        <Text style={styles.bioText}>{profile.bio}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zasady</Text>
        <Text style={styles.rulesText}>{profile.rules}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typ spotkania</Text>
        <View style={styles.typeContainer}>
          {profile.realMeetEnabled && (
            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === 'real_meet' && styles.typeButtonActive,
              ]}
              onPress={() => setSelectedType('real_meet')}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  selectedType === 'real_meet' && styles.typeButtonTextActive,
                ]}
              >
                Real Meet
              </Text>
              <Text
                style={[
                  styles.typePrice,
                  selectedType === 'real_meet' && styles.typePriceActive,
                ]}
              >
                {profile.realMeetPrice} 🪙
              </Text>
            </TouchableOpacity>
          )}
          {profile.socialMeetEnabled && (
            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === 'social_meet' && styles.typeButtonActive,
              ]}
              onPress={() => setSelectedType('social_meet')}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  selectedType === 'social_meet' && styles.typeButtonTextActive,
                ]}
              >
                Social Meet
              </Text>
              <Text
                style={[
                  styles.typePrice,
                  selectedType === 'social_meet' && styles.typePriceActive,
                ]}
              >
                {profile.socialMeetPrice} 🪙
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data spotkania</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateButtonText}>
            {selectedDate.toLocaleDateString('pl-PL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="datetime"
            display="default"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        )}
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Zasady płatności</Text>
        <Text style={styles.warningText}>
          • Płatność 100% z góry{'\n'}
          • Środki blokowane w escrow{'\n'}
          • Host otrzymuje 80%, Avalo 20%{'\n'}
          • Automatyczne rozliczenie po 12h{'\n'}
          • Możliwość sporu w ciągu 12h{'\n'}
          • Anulowanie przez gościa: brak zwrotu{'\n'}
          • Anulowanie przez hosta: pełny zwrot
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.bookButton, booking && styles.bookButtonDisabled]}
        onPress={handleBookMeet}
        disabled={booking}
      >
        {booking ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <Text style={styles.bookButtonText}>
            Zarezerwuj za{' '}
            {selectedType === 'real_meet' ? profile.realMeetPrice : profile.socialMeetPrice} 🪙
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1A1A1A',
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    backgroundColor: '#2A2A2A',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  bioText: {
    fontSize: 16,
    color: '#D0D0D0',
    lineHeight: 24,
  },
  rulesText: {
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 22,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  typeButtonActive: {
    backgroundColor: '#40E0D0',
    borderColor: '#40E0D0',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A0A0',
    marginBottom: 4,
  },
  typeButtonTextActive: {
    color: '#0A0A0A',
  },
  typePrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  typePriceActive: {
    color: '#0A0A0A',
  },
  dateButton: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  warningBox: {
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  bookButton: {
    margin: 20,
    marginTop: 0,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
});