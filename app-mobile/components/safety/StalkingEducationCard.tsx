/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Educational Card for Stalkers
 * 
 * "No one owes access to location or time"
 * Educational intervention to stop harmful behavior before escalation.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface StalkingEducationCardProps {
  violationType: 'LOCATION' | 'TIME' | 'ATTENTION' | 'MEDIA' | 'GENERAL';
  onDismiss?: () => void;
  onContactSupport?: () => void;
}

export const StalkingEducationCard: React.FC<StalkingEducationCardProps> = ({
  violationType,
  onDismiss,
  onContactSupport,
}) => {
  const getEducationContent = () => {
    switch (violationType) {
      case 'LOCATION':
        return {
          title: 'Location Privacy Is A Right',
          icon: '📍',
          principles: [
            'No one owes you access to their location',
            'Asking repeatedly where someone is can feel invasive',
            'Healthy relationships are built on trust, not tracking',
            'Location is personal information that must be shared willingly',
          ],
          warning: 'Continued location tracking attempts may result in account restrictions.',
        };
      
      case 'TIME':
        return {
          title: 'Everyone Has The Right To Their Time',
          icon: '⏰',
          principles: [
            'No one owes you immediate responses',
            'People have lives, responsibilities, and other relationships',
            'Demanding constant availability is controlling behavior',
            'Patience and respect are essential',
          ],
          warning: 'Excessive messaging or guilt-tripping may result in messaging restrictions.',
        };
      
      case 'ATTENTION':
        return {
          title: 'Respecting Boundaries',
          icon: '🤝',
          principles: [
            'Everyone has the right to interact with others freely',
            'Jealousy and possessiveness are not signs of care',
            'Trying to isolate someone socially is harmful',
            'Healthy relationships allow independence',
          ],
          warning: 'Territorial or controlling behavior violates platform policies.',
        };
      
      case 'MEDIA':
        return {
          title: 'Privacy And Consent Matter',
          icon: '📸',
          principles: [
            'No one has to prove their activities to you',
            'Demanding photos or videos is surveillance',
            'Screen sharing requests violate digital privacy',
            'Trust is earned, not demanded',
          ],
          warning: 'Surveillance requests may result in immediate account suspension.',
        };
      
      default:
        return {
          title: 'Healthy Interactions On Avalo',
          icon: '💚',
          principles: [
            'Respect boundaries and privacy',
            'No one owes you their time, location, or attention',
            'Control and monitoring are not signs of care',
            'Trust and respect are the foundation of healthy connections',
          ],
          warning: 'Violating these principles may result in account restrictions or ban.',
        };
    }
  };
  
  const content = getEducationContent();
  
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.headerIcon}>{content.icon}</Text>
            <Text style={styles.title}>{content.title}</Text>
          </View>
          
          <View style={styles.principlesContainer}>
            <Text style={styles.sectionTitle}>Important Principles:</Text>
            {content.principles.map((principle, index) => (
              <View key={index} style={styles.principleItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.principleText}>{principle}</Text>
              </View>
            ))}
          </View>
          
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>{content.warning}</Text>
          </View>
          
          <View style={styles.reflectionBox}>
            <Text style={styles.reflectionTitle}>Take A Moment</Text>
            <Text style={styles.reflectionText}>
              Consider why you feel the need to monitor or control. Healthy relationships are based on mutual respect and trust.
            </Text>
          </View>
          
          <View style={styles.actions}>
            {onDismiss && (
              <TouchableOpacity 
                style={styles.dismissButton}
                onPress={onDismiss}
              >
                <Text style={styles.dismissButtonText}>I Understand</Text>
              </TouchableOpacity>
            )}
            
            {onContactSupport && (
              <TouchableOpacity 
                style={styles.supportButton}
                onPress={onContactSupport}
              >
                <Text style={styles.supportButtonText}>Get Help</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 500,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  principlesContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  principleItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 18,
    color: '#3B82F6',
    fontWeight: '700',
  },
  principleText: {
    flex: 1,
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    fontWeight: '500',
  },
  reflectionBox: {
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    marginBottom: 24,
  },
  reflectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  reflectionText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  dismissButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  supportButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  supportButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});
