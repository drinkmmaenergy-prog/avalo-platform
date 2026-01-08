/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * "This User Is Protected" Safety Screen
 * 
 * Displayed when a user with active stalking restrictions tries to contact a protected victim.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface UserProtectedScreenProps {
  userName?: string;
  onContactSupport?: () => void;
  onGoBack?: () => void;
}

export const UserProtectedScreen: React.FC<UserProtectedScreenProps> = ({
  userName,
  onContactSupport,
  onGoBack,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🛡️</Text>
      </View>
      
      <Text style={styles.title}>This User Is Protected</Text>
      
      <View style={styles.messageContainer}>
        <Text style={styles.message}>
          {userName ? `${userName} has` : 'This user has'} enabled additional safety protections.
        </Text>
        <Text style={styles.message}>
          You cannot contact this user at this time.
        </Text>
      </View>
      
      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          These protections are in place to ensure user safety and privacy.
        </Text>
      </View>
      
      <View style={styles.reminderBox}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.reminderText}>
          Remember: No one owes you access to their location, time, or attention.
        </Text>
      </View>
      
      <View style={styles.actions}>
        {onGoBack && (
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={onGoBack}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        )}
        
        {onContactSupport && (
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={onContactSupport}
          >
            <Text style={styles.secondaryButtonText}>Contact Support</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#FEE2E2',
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 80,
  },
  infoIcon: {
    fontSize: 20,
  },
  warningIcon: {
    fontSize: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  reminderBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginBottom: 32,
    alignItems: 'flex-start',
  },
  reminderText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    fontWeight: '500',
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  secondaryButtonText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '600',
  },
});
