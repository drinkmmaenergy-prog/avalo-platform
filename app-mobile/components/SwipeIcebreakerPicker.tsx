/**
 * Swipe Icebreaker Picker Component
 * PACK 38: Bottom sheet for selecting icebreaker message
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import {
  SwipeIcebreakerContext,
  SwipeIcebreakerSettings,
  generateIcebreakerVariations,
} from '../services/swipeIcebreakerService';
import { useTranslation } from '../hooks/useTranslation';

interface SwipeIcebreakerPickerProps {
  visible: boolean;
  onClose: () => void;
  context: SwipeIcebreakerContext;
  settings: SwipeIcebreakerSettings;
  onSelectMessage: (message: string) => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function SwipeIcebreakerPicker({
  visible,
  onClose,
  context,
  settings,
  onSelectMessage,
}: SwipeIcebreakerPickerProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const slideAnim = useState(new Animated.Value(SCREEN_HEIGHT))[0];

  // Generate message variations when component mounts or context changes
  useEffect(() => {
    if (visible) {
      const variations = generateIcebreakerVariations(settings, context, 4);
      setMessages(variations);
      setSelectedIndex(null);

      // Animate slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Reset animation
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible, context, settings]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const handleSelectMessage = (message: string, index: number) => {
    setSelectedIndex(index);

    // Brief delay for visual feedback
    setTimeout(() => {
      handleClose();
      setTimeout(() => {
        onSelectMessage(message);
      }, 100);
    }, 150);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={handleClose}
        />

        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('swipeIcebreakers.pickerTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('swipeIcebreakers.pickerSubtitle')}
            </Text>
          </View>

          {/* Message Options */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.messageCard,
                  selectedIndex === index && styles.messageCardSelected,
                ]}
                onPress={() => handleSelectMessage(message, index)}
                activeOpacity={0.7}
              >
                <Text style={styles.messageText}>{message}</Text>
                <View style={styles.messageCardArrow}>
                  <Text style={styles.arrowText}>→</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Cancel Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>
                {t('swipeIcebreakers.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#101010',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: SCREEN_HEIGHT * 0.75,
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#404040',
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  messageCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageCardSelected: {
    borderColor: '#D4AF37',
    backgroundColor: '#1F1F1F',
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 24,
  },
  messageCardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  arrowText: {
    color: '#101010',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cancelButton: {
    backgroundColor: '#282828',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CCCCCC',
  },
});
