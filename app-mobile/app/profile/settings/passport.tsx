/**
 * Passport Location Override Screen
 * 
 * FREE for all users
 * Allows manual city/country selection
 * Overrides GPS for Discovery/Swipe only
 */

import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface PassportLocation {
  enabled: boolean;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

const POPULAR_CITIES = [
  { city: 'New York', country: 'United States', lat: 40.7128, lng: -74.0060 },
  { city: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437 },
  { city: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lng: 55.2708 },
  { city: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { city: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { city: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050 },
  { city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 },
];

export default function PassportSettingsScreen() {
  const router = useRouter();
  const [passportEnabled, setPassportEnabled] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<PassportLocation | null>(null);
  const [customCity, setCustomCity] = useState('');
  const [customCountry, setCustomCountry] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPassportSettings();
  }, []);

  const loadPassportSettings = async () => {
    try {
      // TODO: Load from Firestore
      // const userId = await getCurrentUserId();
      // const userDoc = await getDoc(doc(db, 'users', userId));
      // const passport = userDoc.data()?.location?.passport;
      // if (passport?.enabled) {
      //   setPassportEnabled(true);
      //   setSelectedLocation(passport);
      // }
      setPassportEnabled(false);
    } catch (error) {
      console.error('Failed to load passport settings:', error);
    }
  };

  const togglePassport = async () => {
    if (passportEnabled) {
      // Disable passport
      try {
        setLoading(true);
        // TODO: Call Cloud Function to disable passport
        // await disablePassportLocation(userId);
        setPassportEnabled(false);
        setSelectedLocation(null);
        Alert.alert('Success', 'Passport mode disabled. Using your GPS location.');
      } catch (error) {
        console.error('Failed to disable passport:', error);
        Alert.alert('Error', 'Failed to disable passport mode.');
      } finally {
        setLoading(false);
      }
    } else {
      // Just toggle the UI, user will select location below
      setPassportEnabled(true);
    }
  };

  const selectCity = async (location: typeof POPULAR_CITIES[0]) => {
    try {
      setLoading(true);
      
      // TODO: Call Cloud Function to set passport location
      // const userId = await getCurrentUserId();
      // await setPassportLocation(userId, location);
      
      setSelectedLocation({ enabled: true, ...location });
      setPassportEnabled(true);
      
      Alert.alert(
        'Success',
        `Passport set to ${location.city}, ${location.country}. You'll now appear in Discovery for this location.`
      );
    } catch (error) {
      console.error('Failed to set passport location:', error);
      Alert.alert('Error', 'Failed to set passport location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const setCustomLocation = async () => {
    if (!customCity.trim() || !customCountry.trim()) {
      Alert.alert('Error', 'Please enter both city and country.');
      return;
    }

    try {
      setLoading(true);
      
      // TODO: Geocode custom location and call Cloud Function
      // For now, use center of the country as coordinates
      const location = {
        city: customCity,
        country: customCountry,
        lat: 0,
        lng: 0,
      };
      
      // TODO: await setPassportLocation(userId, location);
      
      setSelectedLocation({ enabled: true, ...location });
      setPassportEnabled(true);
      setCustomCity('');
      setCustomCountry('');
      
      Alert.alert(
        'Success',
        `Passport set to ${customCity}, ${customCountry}.`
      );
    } catch (error) {
      console.error('Failed to set custom location:', error);
      Alert.alert('Error', 'Failed to set custom location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Passport</Text>
        <Text style={styles.subtitle}>FREE • Change Your Location</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Passport Mode</Text>
              <Text style={styles.toggleDescription}>
                {passportEnabled 
                  ? selectedLocation 
                    ? `${selectedLocation.city}, ${selectedLocation.country}`
                    : 'Select a location below'
                  : 'Using GPS location'}
              </Text>
            </View>
            <Switch
              value={passportEnabled}
              onValueChange={togglePassport}
              disabled={loading}
              trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              thumbColor={passportEnabled ? '#fff' : '#fff'}
            />
          </View>
        </View>

        {passportEnabled && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Popular Cities</Text>
            </View>

            <View style={styles.citiesGrid}>
              {POPULAR_CITIES.map((location) => (
                <TouchableOpacity
                  key={`${location.city}-${location.country}`}
                  style={[
                    styles.cityCard,
                    selectedLocation?.city === location.city &&
                    selectedLocation?.country === location.country &&
                      styles.cityCardSelected,
                  ]}
                  onPress={() => selectCity(location)}
                  disabled={loading}
                >
                  <Text style={styles.cityName}>{location.city}</Text>
                  <Text style={styles.cityCountry}>{location.country}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.customLocationCard}>
              <Text style={styles.customLocationTitle}>Custom Location</Text>
              <TextInput
                style={styles.input}
                placeholder="City"
                value={customCity}
                onChangeText={setCustomCity}
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="Country"
                value={customCountry}
                onChangeText={setCustomCountry}
                editable={!loading}
              />
              <TouchableOpacity
                style={[styles.setButton, loading && styles.setButtonDisabled]}
                onPress={setCustomLocation}
                disabled={loading}
              >
                <Text style={styles.setButtonText}>Set Custom Location</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How Passport Works</Text>
          
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🌍</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Change Your Location</Text>
              <Text style={styles.featureDescription}>
                Appear in Discovery and Swipe as if you're in a different city
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🆓</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Completely Free</Text>
              <Text style={styles.featureDescription}>
                Available to all users, no subscription required
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔄</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Switch Anytime</Text>
              <Text style={styles.featureDescription}>
                Change locations or return to GPS whenever you want
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📍</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Discovery Only</Text>
              <Text style={styles.featureDescription}>
                Your actual GPS is still used for meetups and other features
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
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
  subtitle: {
    fontSize: 16,
    color: '#4ECDC4',
    fontWeight: '600',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#666',
  },
  sectionHeader: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  citiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  cityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    width: '48%',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  cityCardSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FFFE',
  },
  cityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cityCountry: {
    fontSize: 12,
    color: '#666',
  },
  customLocationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  customLocationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  setButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  setButtonDisabled: {
    opacity: 0.5,
  },
  setButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
