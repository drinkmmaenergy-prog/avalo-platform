/**
 * SectionHeader Component
 * Section header with animated turquoise underline
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const underlineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate turquoise underline
    Animated.timing(underlineAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [underlineAnim]);

  const underlineWidth = underlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const underlineOpacity = underlineAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.18, 0.18],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && (
        <Text style={styles.subtitle}>{subtitle}</Text>
      )}
      
      {/* Animated turquoise underline */}
      <Animated.View
        style={[
          styles.underline,
          {
            width: underlineWidth,
            opacity: underlineOpacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    position: 'relative',
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#A0A0A0',
    marginTop: 4,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#40E0D0',
    borderRadius: 18,
  },
});
