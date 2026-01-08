import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Event, EventLocation, LocationType } from "@/types/events";

export default function CreateEventScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationType, setLocationType] = useState<LocationType>('physical');
  const [address, setAddress] = useState('');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('50');
  const [priceTokens, setPriceTokens] = useState('500');
  const [requireSelfieCheck, setRequireSelfieCheck] = useState(true);
  const [allowPanicMode, setAllowPanicMode] = useState(true);

  const handleCreateEvent = async () => {
    // Validation
    if (!title.trim() || title.length < 5) {
      Alert.alert('Error', 'Title must be at least 5 characters');
      return;
    }

    if (!description.trim() || description.length < 20) {
      Alert.alert('Error', 'Description must be at least 20 characters');
      return;
    }

    if (locationType === 'physical' && !address.trim()) {
      Alert.alert('Error', 'Address is required for physical events');
      return;
    }

    if (locationType === 'online' && !onlineUrl.trim()) {
      Alert.alert('Error', 'Online URL is required for online events');
      return;
    }

    if (!startTime || !endTime) {
      Alert.alert('Error', 'Start and end times are required');
      return;
    }

    const maxPart = parseInt(maxParticipants);
    if (isNaN(maxPart) || maxPart < 1 || maxPart > 10000) {
      Alert.alert('Error', 'Max participants must be between 1 and 10,000');
      return;
    }

    const price = parseInt(priceTokens);
    if (isNaN(price) || price < 0) {
      Alert.alert('Error', 'Price must be a positive number');
      return;
    }

    setLoading(true);

    try {
      // Get current user ID (placeholder - integrate with auth)
      const userId = 'CURRENT_USER_ID'; // TODO: Get from auth context

      const location: EventLocation = {
        type: locationType,
      };

      if (locationType === 'physical' || locationType === 'hybrid') {
        location.address = address;
        // TODO: Geocode address to get lat/lng
        location.lat = 0;
        location.lng = 0;
      }

      if (locationType === 'online' || locationType === 'hybrid') {
        location.onlineUrl = onlineUrl;
      }

      const now = new Date().toISOString();
      const eventData: Partial<Event> = {
        organizerId: userId,
        title: title.trim(),
        description: description.trim(),
        location,
        startTime,
        endTime,
        maxParticipants: maxPart,
        priceTokens: price,
        currency: 'TOKENS',
        status: 'PUBLISHED',
        safety: {
          requireSelfieCheck,
          allowPanicMode,
        },
        stats: {
          ticketsSold: 0,
          checkIns: 0,
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      };

      const docRef = await addDoc(collection(db, 'events'), eventData);
      
      Alert.alert('Success', 'Event created successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create Event</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Event Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Avalo Meetup in Warsaw"
            maxLength={200}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your event..."
            multiline
            numberOfLines={4}
            maxLength={5000}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location Type</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[
                styles.button,
                locationType === 'physical' && styles.buttonActive,
              ]}
              onPress={() => setLocationType('physical')}
            >
              <Text
                style={[
                  styles.buttonText,
                  locationType === 'physical' && styles.buttonTextActive,
                ]}
              >
                Physical
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                locationType === 'online' && styles.buttonActive,
              ]}
              onPress={() => setLocationType('online')}
            >
              <Text
                style={[
                  styles.buttonText,
                  locationType === 'online' && styles.buttonTextActive,
                ]}
              >
                Online
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                locationType === 'hybrid' && styles.buttonActive,
              ]}
              onPress={() => setLocationType('hybrid')}
            >
              <Text
                style={[
                  styles.buttonText,
                  locationType === 'hybrid' && styles.buttonTextActive,
                ]}
              >
                Hybrid
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {(locationType === 'physical' || locationType === 'hybrid') && (
          <View style={styles.section}>
            <Text style={styles.label}>Address *</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street, City, Country"
            />
          </View>
        )}

        {(locationType === 'online' || locationType === 'hybrid') && (
          <View style={styles.section}>
            <Text style={styles.label}>Online URL *</Text>
            <TextInput
              style={styles.input}
              value={onlineUrl}
              onChangeText={setOnlineUrl}
              placeholder="https://meet.avalo.com/event123"
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Start Time *</Text>
          <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="YYYY-MM-DD HH:MM"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>End Time *</Text>
          <TextInput
            style={styles.input}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="YYYY-MM-DD HH:MM"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Max Participants *</Text>
          <TextInput
            style={styles.input}
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            placeholder="50"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Ticket Price (Tokens) *</Text>
          <TextInput
            style={styles.input}
            value={priceTokens}
            onChangeText={setPriceTokens}
            placeholder="500"
            keyboardType="number-pad"
          />
          <Text style={styles.helpText}>You'll receive 80%, Avalo gets 20%</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Safety Options</Text>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setRequireSelfieCheck(!requireSelfieCheck)}
          >
            <View style={[styles.checkboxBox, requireSelfieCheck && styles.checkboxBoxChecked]}>
              {requireSelfieCheck && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Require selfie check-in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setAllowPanicMode(!allowPanicMode)}
          >
            <View style={[styles.checkboxBox, allowPanicMode && styles.checkboxBoxChecked]}>
              {allowPanicMode && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Enable panic mode for participants</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateEvent}
          disabled={loading}
        >
          <Text style={styles.createButtonText}>
            {loading ? 'Creating...' : 'Create Event'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  buttonTextActive: {
    color: '#fff',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#000',
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
