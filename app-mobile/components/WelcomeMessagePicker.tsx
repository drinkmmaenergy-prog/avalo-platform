/**
 * Welcome Message Picker Component
 * Phase 32-3: AI-Generated Welcome Message Selection
 * 
 * Displays 3 AI-generated welcome message options for user to choose from
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { WelcomeMessageBundle } from '../utils/aiWelcomeMessage';

interface WelcomeMessagePickerProps {
  visible: boolean;
  messages: WelcomeMessageBundle;
  matchedName: string;
  onSelect: (message: string) => void;
  onCancel: () => void;
}

type MessageLength = 'short' | 'medium' | 'long';

export function WelcomeMessagePicker({
  visible,
  messages,
  matchedName,
  onSelect,
  onCancel,
}: WelcomeMessagePickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [selectedMessage, setSelectedMessage] = useState<MessageLength | null>(null);

  const handleSelect = (length: MessageLength) => {
    setSelectedMessage(length);
    setTimeout(() => {
      onSelect(messages[length]);
      setSelectedMessage(null);
    }, 200);
  };

  const messageOptions: Array<{ key: MessageLength; label: string; description: string }> = [
    { key: 'short', label: '✨ Quick & Casual', description: 'Simple and friendly' },
    { key: 'medium', label: '💬 Engaging', description: 'Shows interest & personality' },
    { key: 'long', label: '🌟 Thoughtful', description: 'Detailed and confident' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={[styles.overlay, isDark && styles.overlayDark]}>
        <View style={[styles.container, isDark && styles.containerDark]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.titleDark]}>
              Start chatting with {matchedName}
            </Text>
            <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
              Choose a message to begin
            </Text>
          </View>

          {/* Message Options */}
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {messageOptions.map(({ key, label, description }) => {
              const isSelected = selectedMessage === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.messageCard,
                    isDark && styles.messageCardDark,
                    isSelected && styles.messageCardSelected,
                  ]}
                  onPress={() => handleSelect(key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.messageHeader}>
                    <Text style={[styles.messageLabel, isDark && styles.messageLabelDark]}>
                      {label}
                    </Text>
                    <Text style={[styles.messageDescription, isDark && styles.messageDescriptionDark]}>
                      {description}
                    </Text>
                  </View>
                  <Text style={[styles.messageText, isDark && styles.messageTextDark]} numberOfLines={4}>
                    {messages[key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer with Cancel */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
              onPress={onCancel}
            >
              <Text style={[styles.cancelButtonText, isDark && styles.cancelButtonTextDark]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  containerDark: {
    backgroundColor: '#1A1A1A',
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  titleDark: {
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 20,
  },
  subtitleDark: {
    color: '#AAAAAA',
  },
  scrollView: {
    paddingHorizontal: 24,
  },
  messageCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  messageCardDark: {
    backgroundColor: '#2A2A2A',
  },
  messageCardSelected: {
    borderColor: '#40E0D0',
    backgroundColor: '#F0FFFF',
  },
  messageHeader: {
    marginBottom: 12,
  },
  messageLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  messageLabelDark: {
    color: '#FFFFFF',
  },
  messageDescription: {
    fontSize: 13,
    color: '#666666',
  },
  messageDescriptionDark: {
    color: '#AAAAAA',
  },
  messageText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
  },
  messageTextDark: {
    color: '#DDDDDD',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonDark: {
    backgroundColor: '#333333',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  cancelButtonTextDark: {
    color: '#AAAAAA',
  },
});
