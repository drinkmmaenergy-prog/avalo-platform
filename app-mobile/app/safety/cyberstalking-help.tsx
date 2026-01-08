/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Location & Cyberstalking Help Center Screen
 * 
 * Comprehensive help and resources for victims and education for all users.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

export default function CyberstalkingHelpScreen() {
  const router = useRouter();
  const auth = getAuth();
  const functions = getFunctions();
  
  const [legalResources, setLegalResources] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadLegalResources();
  }, []);
  
  const loadLegalResources = async () => {
    try {
      setLoading(true);
      const getLegalResourcesFunc = httpsCallable(functions, 'pack175_getLegalResources');
      const result = await getLegalResourcesFunc({});
      
      if (result.data && (result.data as any).success) {
        setLegalResources((result.data as any).resources);
      }
    } catch (error) {
      console.error('Error loading legal resources:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleReportStalking = () => {
    Alert.alert('Report Stalking', 'This feature will navigate to the reporting flow.');
  };
  
  const handleReportObsession = () => {
    Alert.alert('Report Obsession', 'This feature will navigate to the reporting flow.');
  };
  
  const handleReportLocation = () => {
    Alert.alert('Report Location Abuse', 'This feature will navigate to the reporting flow.');
  };
  
  const handleEmergencyProtection = () => {
    Alert.alert(
      'Request Emergency Protection',
      'This will immediately apply maximum protective measures. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Protection',
          style: 'destructive',
          onPress: requestEmergencyProtection,
        },
      ]
    );
  };
  
  const requestEmergencyProtection = async () => {
    try {
      const requestProtectionFunc = httpsCallable(functions, 'pack175_requestImmediateProtection');
      const result = await requestProtectionFunc({
        urgencyReason: 'User requested emergency protection',
      });
      
      Alert.alert(
        'Protection Applied',
        'Emergency protection has been activated. Moderators have been notified.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error requesting protection:', error);
      Alert.alert('Error', 'Could not apply protection. Please contact support.');
    }
  };
  
  const openUrl = (url: string) => {
    Linking.openURL(url).catch(err => 
      console.error('Error opening URL:', err)
    );
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛡️</Text>
        <Text style={styles.headerTitle}>
          Cyberstalking & Location Safety Help
        </Text>
        <Text style={styles.headerSubtitle}>
          You are not alone. Avalo provides tools and resources to keep you safe.
        </Text>
      </View>
      
      {/* Immediate Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Immediate Actions</Text>
        
        <TouchableOpacity 
          style={[styles.actionCard, styles.urgentCard]}
          onPress={handleEmergencyProtection}
        >
          <Text style={styles.actionIcon}>🚨</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Request Emergency Protection</Text>
            <Text style={styles.actionSubtitle}>
              For urgent safety concerns
            </Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionCard}
          onPress={handleReportStalking}
        >
          <Text style={styles.actionIcon}>🔍</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Report Stalking Behavior</Text>
            <Text style={styles.actionSubtitle}>
              Invasive monitoring, digital following
            </Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionCard}
          onPress={handleReportObsession}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Report Obsessive Attention</Text>
            <Text style={styles.actionSubtitle}>
              Excessive messaging, guilt-tripping
            </Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionCard}
          onPress={handleReportLocation}
        >
          <Text style={styles.actionIcon}>📍</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Report Location Harassment</Text>
            <Text style={styles.actionSubtitle}>
              GPS tracking attempts, location demands
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      
      {/* Safety Principles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Rights</Text>
        
        <View style={styles.principleBox}>
          <Text style={styles.principleIcon}>✓</Text>
          <Text style={styles.principleText}>
            You have the right to privacy in your location
          </Text>
        </View>
        
        <View style={styles.principleBox}>
          <Text style={styles.principleIcon}>✓</Text>
          <Text style={styles.principleText}>
            You have the right to control your time and attention
          </Text>
        </View>
        
        <View style={styles.principleBox}>
          <Text style={styles.principleIcon}>✓</Text>
          <Text style={styles.principleText}>
            You have the right to interact with others freely
          </Text>
        </View>
        
        <View style={styles.principleBox}>
          <Text style={styles.principleIcon}>✓</Text>
          <Text style={styles.principleText}>
            You don't owe anyone proof of your activities
          </Text>
        </View>
      </View>
      
      {/* Legal Resources Section */}
      {legalResources && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal Resources</Text>
          
          {legalResources.hotlines && legalResources.hotlines.length > 0 && (
            <View style={styles.resourceBox}>
              <Text style={styles.resourceTitle}>Hotlines</Text>
              {legalResources.hotlines.map((hotline: string, index: number) => (
                <Text key={index} style={styles.resourceItem}>{hotline}</Text>
              ))}
            </View>
          )}
          
          {legalResources.websites && legalResources.websites.length > 0 && (
            <View style={styles.resourceBox}>
              <Text style={styles.resourceTitle}>Helpful Websites</Text>
              {legalResources.websites.map((website: string, index: number) => (
                <TouchableOpacity 
                  key={index}
                  onPress={() => openUrl(website)}
                >
                  <Text style={styles.linkText}>{website}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {legalResources.supportOrganizations && legalResources.supportOrganizations.length > 0 && (
            <View style={styles.resourceBox}>
              <Text style={styles.resourceTitle}>Support Organizations</Text>
              {legalResources.supportOrganizations.map((org: string, index: number) => (
                <Text key={index} style={styles.resourceItem}>{org}</Text>
              ))}
            </View>
          )}
        </View>
      )}
      
      {/* Education Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Understanding Stalking</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What Is Cyberstalking?</Text>
          <Text style={styles.infoText}>
            Cyberstalking involves using online platforms to harass, monitor, or threaten someone. This includes:
          </Text>
          <Text style={styles.infoListItem}>• Demanding to know your location constantly</Text>
          <Text style={styles.infoListItem}>• Monitoring who you talk to or interact with</Text>
          <Text style={styles.infoListItem}>• Sending excessive messages or demands</Text>
          <Text style={styles.infoListItem}>• Using guilt or threats to control behavior</Text>
        </View>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Avalo's Protection</Text>
          <Text style={styles.infoText}>
            Avalo automatically detects and blocks stalking behaviors:
          </Text>
          <Text style={styles.infoListItem}>• Location requests are blocked</Text>
          <Text style={styles.infoListItem}>• Obsessive messaging triggers restrictions</Text>
          <Text style={styles.infoListItem}>• Victims are never penalized</Text>
          <Text style={styles.infoListItem}>• Offenders face automatic consequences</Text>
        </View>
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Your safety is our priority. Privacy {'>'} emotions. Always.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  urgentCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  actionIcon: {
    fontSize: 32,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  principleBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  principleIcon: {
    fontSize: 18,
    color: '#10B981',
  },
  principleText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  resourceBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  resourceItem: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 6,
    lineHeight: 20,
  },
  linkText: {
    fontSize: 14,
    color: '#3B82F6',
    marginBottom: 6,
    textDecorationLine: 'underline',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 21,
    marginBottom: 8,
  },
  infoListItem: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    paddingLeft: 8,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
});
