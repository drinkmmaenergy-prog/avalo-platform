/**
 * CreatorCallToAction Component
 * Gold CTA button with shadow glow effect
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface CreatorCallToActionProps {
  title: string;
  icon?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export default function CreatorCallToAction({ 
  title, 
  icon, 
  onPress,
  variant = 'primary' 
}: CreatorCallToActionProps) {
  const isPrimary = variant === 'primary';
  
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[
          styles.title,
          isPrimary ? styles.primaryTitle : styles.secondaryTitle,
        ]}>
          {title}
        </Text>
      </View>
      
      {/* Gold glow effect for primary */}
      {isPrimary && (
        <View style={styles.glowEffect} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    position: 'relative',
    overflow: 'visible',
  },
  primaryButton: {
    backgroundColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  secondaryButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  primaryTitle: {
    color: '#000000',
  },
  secondaryTitle: {
    color: '#D4AF37',
  },
  glowEffect: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    backgroundColor: '#D4AF37',
    opacity: 0.15,
    zIndex: -1,
  },
});
