/**
 * PACK 338a - Legal Acceptance Gate
 * Blocks app access until user accepts all legal documents
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { LEGAL_DOCS, getAllLegalDocKeys, getCombinedLegalVersion } from '../../../shared/legal/legalRegistry';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface LegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  guidelinesVersion: string;
  refundsVersion: string;
  ageVerificationVersion: string;
  acceptedAt: Date;
  lang: 'en' | 'pl';
  platform: 'mobile' | 'web';
}

interface LegalGateProps {
  onAccepted?: () => void;
}

export default function LegalGate({ onAccepted }: LegalGateProps) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [lang] = useState<'en' | 'pl'>('en'); // TODO: detect from device locale
  
  const [checkboxes, setCheckboxes] = useState({
    terms: false,
    privacy: false,
    guidelines: false,
    refunds: false,
    ageVerification: false,
  });

  useEffect(() => {
    if (user) {
      checkAcceptance();
    }
  }, [user]);

  const checkAcceptance = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const acceptanceRef = doc(db, 'userLegalAcceptances', user.uid);
      const acceptanceSnap = await getDoc(acceptanceRef);

      if (!acceptanceSnap.exists()) {
        // No acceptance record, show gate
        setVisible(true);
        return;
      }

      const acceptance = acceptanceSnap.data() as LegalAcceptance;
      const currentVersions = getAllLegalDocKeys().map(key => 
        LEGAL_DOCS[key][lang].version
      );

      // Check if any version changed
      const needsUpdate =
        acceptance.termsVersion !== LEGAL_DOCS.terms[lang].version ||
        acceptance.privacyVersion !== LEGAL_DOCS.privacy[lang].version ||
        acceptance.guidelinesVersion !== LEGAL_DOCS.guidelines[lang].version ||
        acceptance.refundsVersion !== LEGAL_DOCS.refunds[lang].version ||
        acceptance.ageVerificationVersion !== LEGAL_DOCS.ageVerification[lang].version;

      if (needsUpdate) {
        setVisible(true);
      } else {
        setVisible(false);
        onAccepted?.();
      }
    } catch (error) {
      console.error('Error checking legal acceptance:', error);
      // On error, show gate to be safe
      setVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckbox = (key: keyof typeof checkboxes) => {
    setCheckboxes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checkboxes).every(v => v);

  const handleAccept = async () => {
    if (!allChecked || !user) return;

    try {
      setAccepting(true);

      // Call Cloud Function to save acceptance
      const response = await fetch(
        `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/pack338a_acceptLegal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({ lang }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save acceptance');
      }

      setVisible(false);
      onAccepted?.();
    } catch (error) {
      console.error('Error accepting legal documents:', error);
      Alert.alert(
        'Error',
        'Failed to save acceptance. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <Modal visible={true} animationType="fade" transparent>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF3B5C" />
        </View>
      </Modal>
    );
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={48} color="#FF3B5C" />
          <Text style={styles.title}>Legal Agreement Required</Text>
          <Text style={styles.subtitle}>
            Please review and accept our policies to continue using Avalo
          </Text>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {getAllLegalDocKeys().map((key) => {
            const doc = LEGAL_DOCS[key][lang];
            return (
              <TouchableOpacity
                key={key}
                style={styles.checkboxRow}
                onPress={() => handleCheckbox(key)}
              >
                <View style={[styles.checkbox, checkboxes[key] && styles.checkboxChecked]}>
                  {checkboxes[key] && <Ionicons name="checkmark" size={18} color="#fff" />}
                </View>
                <View style={styles.checkboxText}>
                  <Text style={styles.checkboxLabel}>
                    I accept the <Text style={styles.linkText}>{doc.title}</Text>
                  </Text>
                  <Text style={styles.checkboxVersion}>Version {doc.version}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color="#666" />
            <Text style={styles.infoText}>
              You can review these documents anytime in Settings → Legal & Policies
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.acceptButton, !allChecked && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!allChecked || accepting}
          >
            {accepting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptButtonText}>Accept & Continue</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            By accepting, you confirm you are 18+ and agree to all policies above
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 32,
    paddingTop: 80,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  checkboxText: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  linkText: {
    color: '#FF3B5C',
    fontWeight: '600',
  },
  checkboxVersion: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    lineHeight: 18,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  acceptButton: {
    backgroundColor: '#FF3B5C',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptButtonDisabled: {
    backgroundColor: '#ccc',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
