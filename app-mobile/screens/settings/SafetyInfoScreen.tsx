/**
 * PACK 73 — Safety Info Screen
 * Static content about safety guidelines and support
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { markSafetyUxEvent } from '../../services/safetyService';

export default function SafetyInfoScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  const handleOpenSupport = async () => {
    try {
      await markSafetyUxEvent('SUPPORT_SAFETY_CLICK');
      // Navigate to Support Center (PACK 68)
      navigation.navigate('SupportCenter' as never);
    } catch (error) {
      console.error('Error opening support:', error);
    }
  };

  const handleOpenPrivacy = async () => {
    try {
      // Navigate to Privacy Center (PACK 64)
      navigation.navigate('PrivacyCenter' as never);
    } catch (error) {
      console.error('Error opening privacy:', error);
    }
  };

  const handleOpenTerms = async () => {
    try {
      // Open external safety policy URL
      const url = 'https://avalo.app/safety-policy';
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening terms:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('safety.info.title')}</Text>

        {/* Basic Safety Rules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('safety.info.section.basics')}
          </Text>
          <Text style={styles.sectionBody}>
            {t('safety.onboarding.body1')}
          </Text>
        </View>

        {/* Safe Meetings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('safety.info.section.meetings')}
          </Text>
          <Text style={styles.sectionBody}>
            {t('safety.onboarding.body2')}
          </Text>
        </View>

        {/* Support and Reporting */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('safety.info.section.support')}
          </Text>
          <Text style={styles.sectionBody}>
            {t('safety.onboarding.body3')}
          </Text>
        </View>

        {/* Action Links */}
        <View style={styles.linksContainer}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenSupport}
          >
            <Text style={styles.linkButtonText}>
              {t('safety.info.link.support')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenPrivacy}
          >
            <Text style={styles.linkButtonText}>
              {t('safety.info.link.privacy')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenTerms}
          >
            <Text style={styles.linkButtonText}>
              {t('safety.info.link.terms')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  sectionBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A4A4A',
  },
  linksContainer: {
    marginTop: 16,
    gap: 12,
  },
  linkButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF69B4',
  },
});
