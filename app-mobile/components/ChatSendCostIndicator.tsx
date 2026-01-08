/**
 * Chat Send Cost Indicator Component
 * Phase 33-2: Monetized Chat - Cost Display
 * 
 * Displays the token cost above the message input when chat has a price.
 * Only visible when messages cost tokens (price > 0).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';

interface ChatSendCostIndicatorProps {
  tokensRequired: number;
  visible: boolean;
}

export const ChatSendCostIndicator: React.FC<ChatSendCostIndicatorProps> = ({
  tokensRequired,
  visible,
}) => {
  const { t } = useTranslation();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-20));

  useEffect(() => {
    if (visible && tokensRequired > 0) {
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, tokensRequired]);

  if (!visible || tokensRequired === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>💰</Text>
        <Text style={styles.text}>
          {t('monetizedChat.costInfo', { tokens: tokensRequired })}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
    textAlign: 'center',
  },
});
