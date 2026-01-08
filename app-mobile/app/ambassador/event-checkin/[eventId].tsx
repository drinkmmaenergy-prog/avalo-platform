/**
 * PACK 152 - Event Check-In Screen
 * QR code scanning for safe event attendance
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { functions, auth } from '../../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export default function EventCheckInScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [loading, setLoading] = useState(false);
  const [eventDetails, setEventDetails] = useState<any>(null);

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async () => {
    // Load event details from Firestore
    try {
      setLoading(true);
      // Event details would be loaded here
      setEventDetails({
        title: 'Sample Event',
        startTime: new Date(),
        venue: 'Sample Venue'
      });
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (qrCode: string) => {
    if (!eventId) return;

    try {
      setLoading(true);
      const checkInToEvent = httpsCallable(functions, 'checkInToEvent');
      
      await checkInToEvent({
        eventId,
        qrCode
});

      Alert.alert(
        'Check-In Successful',
        'You have been checked in to the event!',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error: any) {
      console.error('Check-in error:', error);
      Alert.alert('Check-In Failed', error.message || 'Failed to check in to event');
    } finally {
      setLoading(false);
    }
  };

  const simulateQRScan = () => {
    // In production, this would open a QR scanner
    Alert.alert(
      'QR Scanner',
      'In production, this would open the QR code scanner',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Simulate Scan',
          onPress: () => handleCheckIn(`avalo://event-checkin/${eventId}`)
        }
      ]
    );
  };

  if (loading && !eventDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading event...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Event Check-In</Text>
        {eventDetails && (
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle}>{eventDetails.title}</Text>
            <Text style={styles.eventDetail}>{eventDetails.venue}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📱</Text>
        </View>

        <Text style={styles.instruction}>
          Scan the QR code displayed at the event to check in
        </Text>

        <View style={styles.safetyBox}>
          <Text style={styles.safetyTitle}>Safety Reminders</Text>
          <Text style={styles.safetyText}>
            ✓ Follow all event safety rules{'\n'}
            ✓ Respect photography consent policies{'\n'}
            ✓ Report any safety concerns immediately{'\n'}
            ✓ No romantic advances or harassment
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.scanButton, loading && styles.scanButtonDisabled]}
          onPress={simulateQRScan}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.scanButtonIcon}>📷</Text>
              <Text style={styles.scanButtonText}>Scan QR Code</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666'
  },
  header: {
    backgroundColor: '#007bff',
    padding: 20,
    paddingTop: 60
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16
  },
  eventInfo: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 8
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4
  },
  eventDetail: {
    fontSize: 14,
    color: '#fff'
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  icon: {
    fontSize: 60
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20
  },
  safetyBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8
  },
  safetyText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  scanButtonDisabled: {
    backgroundColor: '#ccc'
  },
  scanButtonIcon: {
    fontSize: 24,
    marginRight: 12
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});