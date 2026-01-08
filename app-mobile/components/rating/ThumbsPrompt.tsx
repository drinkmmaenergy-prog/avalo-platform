/**
 * PACK 423 — Thumbs Up/Down Prompt Component
 * Quick feedback UI
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ThumbsPromptProps {
  question: string;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onSkip?: () => void;
}

export const ThumbsPrompt: React.FC<ThumbsPromptProps> = ({
  question,
  onThumbsUp,
  onThumbsDown,
  onSkip,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question}</Text>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.thumbsUpButton]}
          onPress={onThumbsUp}
        >
          <Ionicons name="thumbs-up" size={32} color="#FFFFFF" />
          <Text style={styles.buttonText}>Yes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.thumbsDownButton]}
          onPress={onThumbsDown}
        >
          <Ionicons name="thumbs-down" size={32} color="#FFFFFF" />
          <Text style={styles.buttonText}>No</Text>
        </TouchableOpacity>
      </View>

      {onSkip && (
        <TouchableOpacity onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    color: '#000000',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  button: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 120,
  },
  thumbsUpButton: {
    backgroundColor: '#4CAF50',
  },
  thumbsDownButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  skipButton: {
    padding: 12,
  },
  skipText: {
    color: '#999999',
    fontSize: 14,
  },
});
