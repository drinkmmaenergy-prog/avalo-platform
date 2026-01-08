/**
 * PACK 237: End Connection Screen
 * 
 * Clean ending flow with pre-set closing notes to avoid harm.
 * Requires confirmation from both users (unless safety override).
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CLOSING_NOTE_MESSAGES } from "@/lib/pack237-types";

export default function EndConnectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { connectionId, partnerId, partnerName } = params;
  
  const [selectedNote, setSelectedNote] = useState<'thank_you' | 'good_wishes' | 'closing_chapter' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectNote = (note: typeof selectedNote) => {
    setSelectedNote(note);
  };

  const handleEndConnection = async () => {
    if (!selectedNote) {
      Alert.alert('Please select a closing note');
      return;
    }

    Alert.alert(
      'End Connection?',
      `This will send a request to ${partnerName || 'them'} to end your connection. They will need to confirm.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Send Request',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // Call Cloud Function to initiate end connection
              const response = await fetch('/api/breakup-recovery/end-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  connectionId,
                  partnerId,
                  closingNote: selectedNote
                })
              });

              if (response.ok) {
                Alert.alert(
                  'Request Sent',
                  'Your request has been sent. You\'ll be notified when they respond.',
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              } else {
                throw new Error('Failed to send request');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to send request. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>End Connection</Text>
        <Text style={styles.subtitle}>
          Choose a closing message. Both of you will need to agree to end the connection.
        </Text>
      </View>

      <View style={styles.notesContainer}>
        {CLOSING_NOTE_MESSAGES.map((note) => (
          <TouchableOpacity
            key={note.code}
            style={[
              styles.noteCard,
              selectedNote === note.code && styles.noteCardSelected
            ]}
            onPress={() => handleSelectNote(note.code)}
          >
            <View style={styles.noteHeader}>
              <View style={[
                styles.radio,
                selectedNote === note.code && styles.radioSelected
              ]}>
                {selectedNote === note.code && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.noteMessage}>{note.message}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>🕊️ What happens next:</Text>
        <Text style={styles.infoText}>• Chat will lock after confirmation</Text>
        <Text style={styles.infoText}>• Trophy Cabinet becomes archived</Text>
        <Text style={styles.infoText}>• Memory Log becomes view-only</Text>
        <Text style={styles.infoText}>• You'll enter a brief recovery period</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.endButton,
          (!selectedNote || isSubmitting) && styles.endButtonDisabled
        ]}
        onPress={handleEndConnection}
        disabled={!selectedNote || isSubmitting}
      >
        <Text style={styles.endButtonText}>
          {isSubmitting ? 'Sending...' : 'Send End Request'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20
  },
  notesContainer: {
    padding: 20,
    gap: 12
  },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e9ecef'
  },
  noteCardSelected: {
    borderColor: '#0d6efd',
    backgroundColor: '#f0f7ff'
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#dee2e6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioSelected: {
    borderColor: '#0d6efd'
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0d6efd'
  },
  noteMessage: {
    fontSize: 16,
    color: '#212529',
    flex: 1
  },
  infoBox: {
    margin: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0d6efd'
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12
  },
  infoText: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
    lineHeight: 20
  },
  endButton: {
    margin: 20,
    marginTop: 0,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center'
  },
  endButtonDisabled: {
    backgroundColor: '#adb5bd',
    opacity: 0.6
  },
  endButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  },
  cancelButton: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    alignItems: 'center'
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d'
  }
});
