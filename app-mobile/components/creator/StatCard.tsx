/**
 * StatCard Component
 * Animated card for displaying creator statistics
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string;
  color?: 'gold' | 'turquoise';
  subtitle?: string;
}

export default function StatCard({ 
  title, 
  value, 
  icon, 
  color = 'gold',
  subtitle 
}: StatCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Smooth fade-in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const backgroundColor = color === 'gold' ? '#1A1610' : '#0F1A1A';
  const accentColor = color === 'gold' ? '#D4AF37' : '#40E0D0';

  return (
    <Animated.View
      style={[
        styles.card,
        { 
          backgroundColor,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {icon && (
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
      )}
      
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.value, { color: accentColor }]}>
          {value}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>

      {/* Accent border */}
      <View 
        style={[
          styles.accentBorder, 
          { backgroundColor: accentColor }
        ]} 
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconContainer: {
    marginBottom: 8,
  },
  icon: {
    fontSize: 32,
  },
  content: {
    gap: 4,
  },
  title: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#707070',
    marginTop: 2,
  },
  accentBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.6,
  },
});
