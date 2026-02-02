/**
 * PACK 3.4 — Refund & Dispute Policy Screen
 * Store compliance: Clear explanation of token refund policies
 * 
 * COMPLIANCE NOTES:
 * - Apple App Store requires clear refund policy disclosure
 * - Google Play requires accessible refund information
 * - NO actual refund logic here - display only
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from "@/hooks/useTranslation";

interface PolicySection {
  title: string;
  content: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export default function RefundPolicyScreen() {
  const { locale } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const getPolicySections = (): PolicySection[] => {
    if (locale === 'pl') {
      return [
        {
          title: 'Czym są Tokeny Avalo?',
          content: 'Tokeny Avalo są wirtualnymi dobrami cyfrowymi przeznaczonymi do użytku wewnątrz aplikacji. Są to towary cyfrowe zdefiniowane zgodnie z wymogami App Store i Google Play. Tokeny nie mają wartości pieniężnej poza platformą Avalo i nie mogą być wymienione na gotówkę.',
          icon: 'diamond-outline',
        },
        {
          title: 'Polityka Zwrotów',
          content: 'Zakupy tokenów są ostateczne zgodnie z polityką Apple App Store i Google Play Store dotyczącą towarów cyfrowych. Po zakupie tokeny są natychmiast dostępne na Twoim koncie.\n\nJeśli uważasz, że wystąpił błąd techniczny uniemożliwiający realizację usługi, możesz złożyć zgłoszenie w ciągu 14 dni od zakupu.',
          icon: 'receipt-outline',
        },
        {
          title: 'Kiedy Mogę Zgłosić Problem?',
          content: '• Produkt/usługa nie została dostarczona\n• Połączenie wideo/głosowe nie doszło do skutku z przyczyn technicznych\n• Wydarzenie zostało anulowane przez organizatora\n• Dostęp do zakupionej treści nie został przyznany\n• Plik okazał się uszkodzony i nie można go otworzyć\n• Wystąpił błąd platformy potwiedzony przez zespół techniczny',
          icon: 'alert-circle-outline',
        },
        {
          title: 'Czego NIE Można Zgłosić',
          content: '• Niezadowolenie z treści romantycznych lub emocjonalnych\n• Oczekiwania dotyczące wzajemności w relacjach\n• Żal związany z podjętą decyzją o zakupie\n• Zmiana zdania po konsumpcji treści\n• Spory o subiektywną jakość usług twórców',
          icon: 'close-circle-outline',
        },
        {
          title: 'Proces Rozpatrywania Zgłoszeń',
          content: '1. Złóż zgłoszenie przez aplikację w ciągu 14 dni\n2. Podaj szczegółowy opis problemu technicznego\n3. Nasz zespół zbada sprawę w ciągu 5-7 dni roboczych\n4. Otrzymasz decyzję wraz z uzasadnieniem\n5. W przypadku pozytywnego rozpatrzenia, tokeny zostaną zwrócone na konto',
          icon: 'git-branch-outline',
        },
        {
          title: 'Kontakt z Apple/Google',
          content: 'W przypadku problemów z płatnością możesz również skontaktować się bezpośrednio z Apple App Store lub Google Play Store. Pamiętaj, że sklepy aplikacji mają własne procedury zwrotów dla transakcji dokonanych przez ich systemy płatności.',
          icon: 'storefront-outline',
        },
      ];
    }

    return [
      {
        title: 'What Are Avalo Tokens?',
        content: 'Avalo Tokens are virtual digital goods designed for use within the app. They are digital goods as defined by App Store and Google Play requirements. Tokens have no monetary value outside the Avalo platform and cannot be exchanged for cash.',
        icon: 'diamond-outline',
      },
      {
        title: 'Refund Policy',
        content: 'Token purchases are final in accordance with Apple App Store and Google Play Store policies for digital goods. Once purchased, tokens are immediately available in your account.\n\nIf you believe a technical error prevented service delivery, you may submit a request within 14 days of purchase.',
        icon: 'receipt-outline',
      },
      {
        title: 'When Can I Report an Issue?',
        content: '• Product/service was not delivered\n• Video/voice call failed due to technical issues\n• Event was cancelled by the organizer\n• Access to purchased content was not granted\n• File was corrupted and cannot be opened\n• Platform error confirmed by technical team',
        icon: 'alert-circle-outline',
      },
      {
        title: 'What Cannot Be Disputed',
        content: '• Dissatisfaction with romantic or emotional content\n• Expectations of relationship reciprocity\n• Regret about purchase decisions\n• Change of mind after consuming content\n• Disputes about subjective quality of creator services',
        icon: 'close-circle-outline',
      },
      {
        title: 'Dispute Resolution Process',
        content: '1. Submit a request through the app within 14 days\n2. Provide a detailed description of the technical issue\n3. Our team will investigate within 5-7 business days\n4. You will receive a decision with justification\n5. If approved, tokens will be refunded to your account',
        icon: 'git-branch-outline',
      },
      {
        title: 'Contact Apple/Google',
        content: 'For payment issues, you may also contact Apple App Store or Google Play Store directly. Note that app stores have their own refund procedures for transactions made through their payment systems.',
        icon: 'storefront-outline',
      },
    ];
  };

  const policies = getPolicySections();

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@avalo.app?subject=Refund%20Inquiry');
  };

  const handleFileDispute = () => {
    router.push('/refund/request' as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Polityka Zwrotów' : 'Refund Policy',
          headerBackTitle: locale === 'pl' ? 'Wstecz' : 'Back',
        }}
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Notice */}
        <View style={styles.headerNotice}>
          <Ionicons name="information-circle" size={24} color="#007AFF" />
          <Text style={styles.headerNoticeText}>
            {locale === 'pl'
              ? 'Tokeny Avalo są towarami cyfrowymi zgodnie z wymogami sklepów aplikacji.'
              : 'Avalo Tokens are digital goods as required by app stores.'}
          </Text>
        </View>

        {/* Policy Sections */}
        {policies.map((section, index) => (
          <TouchableOpacity
            key={index}
            style={styles.sectionCard}
            onPress={() => setExpandedSection(expandedSection === index ? null : index)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name={section.icon} size={24} color="#FF6B6B" />
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Ionicons
                name={expandedSection === index ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#666"
              />
            </View>
            {expandedSection === index && (
              <View style={styles.sectionContent}>
                <Text style={styles.sectionText}>{section.content}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleFileDispute}
          >
            <Ionicons name="document-text-outline" size={20} color="#FFF" />
            <Text style={styles.primaryButtonText}>
              {locale === 'pl' ? 'Złóż Zgłoszenie' : 'File a Request'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleContactSupport}
          >
            <Ionicons name="mail-outline" size={20} color="#007AFF" />
            <Text style={styles.secondaryButtonText}>
              {locale === 'pl' ? 'Kontakt z Pomocą' : 'Contact Support'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {locale === 'pl'
              ? 'Ostatnia aktualizacja: Luty 2026'
              : 'Last Updated: February 2026'}
          </Text>
          <Text style={styles.footerText}>
            {locale === 'pl'
              ? 'Pytania? support@avalo.app'
              : 'Questions? support@avalo.app'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  headerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  headerNoticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  sectionText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
  actionsContainer: {
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
});
