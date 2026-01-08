/**
 * Message Earning Indicator Component
 * Phase 33-2: Monetized Chat - Earnings Display
 * 
 * Displays earnings indicator below paid messages on the creator's side.
 * Shows the tokens earned after Avalo commission (35%) is deducted.
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

interface MessageEarningIndicatorProps {
  earned: number;
  visible: boolean;
  messagePrice: number;
}

export const MessageEarningIndicator: React.FC<MessageEarningIndicatorProps> = ({
  earned,
  visible,
  messagePrice,
}) => {
  const { t } = useTranslation();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(10));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    if (visible && earned > 0) {
      // Celebrate animation - quick pop in
      Animated.sequence([
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
        ]),
        // Small bounce
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(10);
      scaleAnim.setValue(0.8);
    }
  }, [visible, earned]);

  if (!visible || earned === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✨</Text>
        </View>
        <Text style={styles.text}>
          {t('monetizedChat.earningLabel', { earned })}
        </Text>
      </View>
      <View style={styles.detailsContainer}>
        <Text style={styles.details}>
          {messagePrice} tokens • 65% after commission
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    marginBottom: 4,
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  iconContainer: {
    marginRight: 6,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF37',
  },
  detailsContainer: {
    marginTop: 4,
    alignItems: 'flex-end',
  },
  details: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
});
