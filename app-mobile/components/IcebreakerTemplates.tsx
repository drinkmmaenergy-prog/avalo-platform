/**
 * Icebreaker Templates Component
 * Pre-written message templates for first contact
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';

interface IcebreakerTemplatesProps {
  visible: boolean;
  onClose: () => void;
  onSelectTemplate: (message: string) => void;
  recipientName: string;
}

const ICEBREAKER_TEMPLATES = [
  "Hey {name}! Your profile caught my eye 😊",
  "Hi {name}! I'd love to get to know you better",
  "Hey! I noticed we have similar interests. What's your favorite {interest}?",
  "Hi {name}! Your bio made me smile 😄",
  "Hey! I saw you're into {interest}. That's awesome!",
  "Hi {name}! What's been the highlight of your week?",
  "Hey! Your photos are great! Where was that taken?",
  "Hi {name}! Coffee or tea? 😊",
  "Hey! I'd love to chat and see if we click!",
  "Hi {name}! What are you up to this weekend?",
  "Hey! Your smile is contagious 😊",
  "Hi {name}! Tell me something interesting about yourself!",
];

export default function IcebreakerTemplates({
  visible,
  onClose,
  onSelectTemplate,
  recipientName,
}: IcebreakerTemplatesProps) {
  const handleSelectTemplate = (template: string) => {
    // Replace {name} placeholder
    const message = template.replace('{name}', recipientName);
    onSelectTemplate(message);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>💬 Icebreaker Templates</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Choose a template to start the conversation with {recipientName}
          </Text>

          <ScrollView style={styles.templatesList}>
            {ICEBREAKER_TEMPLATES.map((template, index) => (
              <TouchableOpacity
                key={index}
                style={styles.templateCard}
                onPress={() => handleSelectTemplate(template)}
              >
                <Text style={styles.templateText}>
                  {template.replace('{name}', recipientName).replace('{interest}', '...')}
                </Text>
                <Text style={styles.tapHint}>Tap to send →</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.customButton}
            onPress={onClose}
          >
            <Text style={styles.customButtonText}>✍️ Write Custom Message</Text>
          </TouchableOpacity>
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
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: '#666',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    padding: 20,
    paddingTop: 0,
  },
  templatesList: {
    paddingHorizontal: 20,
  },
  templateCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  templateText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
    lineHeight: 22,
  },
  tapHint: {
    fontSize: 12,
    color: '#FF6B6B',
    fontStyle: 'italic',
  },
  customButton: {
    margin: 20,
    padding: 16,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    alignItems: 'center',
  },
  customButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
