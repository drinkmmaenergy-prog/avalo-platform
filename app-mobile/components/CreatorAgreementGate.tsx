/**
 * Creator Agreement Gate Component
 * PHASE 4.2 — B2B Creator Agreement Implementation
 *
 * Shows a modal requiring creators to accept the B2B Creator Agreement
 * before accessing any monetization features.
 *
 * Usage:
 * <CreatorAgreementGate onAccepted={handleAccepted}>
 *   <CreatorDashboard />
 * </CreatorAgreementGate>
 *
 * @version v1.0
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface CreatorAgreementStatusResponse {
  success: boolean;
  accepted: boolean;
  currentVersion: string;
  userVersion: string | null;
  acceptedAt: string | null;
}

interface AcceptCreatorAgreementResponse {
  success: boolean;
  status: 'accepted' | 'already_accepted';
  version: string;
  acceptedAt: string;
}

interface CreatorAgreementGateProps {
  children: React.ReactNode;
  onAccepted?: () => void;
  onDismiss?: () => void;
}

export default function CreatorAgreementGate({
  children,
  onAccepted,
  onDismiss,
}: CreatorAgreementGateProps) {
  const { user } = useAuth();
  const { locale } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      checkAgreementStatus();
    }
  }, [user?.uid]);

  const checkAgreementStatus = async () => {
    try {
      const getStatus = httpsCallable<void, CreatorAgreementStatusResponse>(
        functions,
        'getCreatorAgreementStatusV1'
      );
      const result = await getStatus();

      if (result.data.accepted) {
        setAgreementAccepted(true);
        setShowModal(false);
      } else {
        setShowModal(true);
      }
    } catch (error) {
      console.error('Failed to check creator agreement status:', error);
      // On error, show the modal to be safe
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAgreement = () => {
    router.push('/legal/creator-agreement' as any);
  };

  const handleAcceptAgreement = async () => {
    if (!user?.uid) return;

    setAccepting(true);

    try {
      const acceptAgreement = httpsCallable<
        { surface: 'app' | 'web' },
        AcceptCreatorAgreementResponse
      >(functions, 'acceptCreatorAgreementV1');

      const result = await acceptAgreement({ surface: 'app' });

      if (result.data.success) {
        setAgreementAccepted(true);
        setShowModal(false);
        onAccepted?.();

        Alert.alert(
          locale === 'pl' ? 'Sukces' : 'Success',
          locale === 'pl'
            ? 'Umowa Twórcy została zaakceptowana.'
            : 'Creator Agreement has been accepted.'
        );
      }
    } catch (error: any) {
      console.error('Failed to accept creator agreement:', error);
      Alert.alert(
        locale === 'pl' ? 'Błąd' : 'Error',
        locale === 'pl'
          ? 'Nie udało się zaakceptować umowy. Spróbuj ponownie.'
          : 'Failed to accept agreement. Please try again.'
      );
    } finally {
      setAccepting(false);
    }
  };

  const handleDismiss = () => {
    setShowModal(false);
    onDismiss?.();
    router.back();
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>
          {locale === 'pl' ? 'Sprawdzanie...' : 'Checking...'}
        </Text>
      </View>
    );
  }

  // If accepted, render children
  if (agreementAccepted) {
    return <>{children}</>;
  }

  // Modal for non-accepted users
  return (
    <>
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismiss}
      >
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.emoji}>📋</Text>
            <Text style={styles.title}>
              {locale === 'pl' ? 'Umowa Twórcy Wymagana' : 'Creator Agreement Required'}
            </Text>
            <Text style={styles.subtitle}>
              {locale === 'pl'
                ? 'Aby uzyskać dostęp do funkcji monetyzacji, musisz zaakceptować naszą Umowę Twórcy (B2B).'
                : 'To access creator monetization features, you must accept our Creator Agreement (B2B).'}
            </Text>

            <View style={styles.keyPointsContainer}>
              <Text style={styles.keyPointsTitle}>
                {locale === 'pl' ? 'Kluczowe punkty:' : 'Key Points:'}
              </Text>

              <View style={styles.keyPoint}>
                <Text style={styles.keyPointIcon}>🤝</Text>
                <Text style={styles.keyPointText}>
                  {locale === 'pl'
                    ? 'Działasz jako niezależny kontaktor B2B'
                    : 'You act as an independent B2B contractor'}
                </Text>
              </View>

              <View style={styles.keyPoint}>
                <Text style={styles.keyPointIcon}>📊</Text>
                <Text style={styles.keyPointText}>
                  {locale === 'pl'
                    ? 'Ponosisz odpowiedzialność za podatki i VAT'
                    : 'You are responsible for taxes and VAT'}
                </Text>
              </View>

              <View style={styles.keyPoint}>
                <Text style={styles.keyPointIcon}>✅</Text>
                <Text style={styles.keyPointText}>
                  {locale === 'pl'
                    ? 'Zapewniasz zgodność prawną treści'
                    : 'You ensure legal compliance of content'}
                </Text>
              </View>

              <View style={styles.keyPoint}>
                <Text style={styles.keyPointIcon}>💰</Text>
                <Text style={styles.keyPointText}>
                  {locale === 'pl'
                    ? 'Płatności przez system skarbca platformy'
                    : 'Payments via platform treasury system'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.viewButton} onPress={handleViewAgreement}>
              <Text style={styles.viewButtonText}>
                {locale === 'pl' ? 'Przeczytaj pełną umowę' : 'Read Full Agreement'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
              onPress={handleAcceptAgreement}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>
                  {locale === 'pl' ? 'Akceptuję i Kontynuuję' : 'Accept & Continue'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleDismiss}>
              <Text style={styles.cancelButtonText}>
                {locale === 'pl' ? 'Anuluj' : 'Cancel'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.footerNote}>
              {locale === 'pl'
                ? 'Akceptując, potwierdzasz, że jesteś niezależnym kontraaktorem B2B i rozumiesz swoje obowiązki.'
                : 'By accepting, you confirm you are an independent B2B contractor and understand your responsibilities.'}
            </Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Show empty or minimal content while modal is visible */}
      <View style={styles.blockedContent}>
        <Text style={styles.blockedText}>
          {locale === 'pl'
            ? 'Wymagana akceptacja umowy twórcy'
            : 'Creator agreement acceptance required'}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalContent: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  keyPointsContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  keyPointsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  keyPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  keyPointIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  keyPointText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  viewButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  acceptButton: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: '#10B981',
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  acceptButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 14,
    marginBottom: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6B7280',
  },
  footerNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  blockedContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  blockedText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
