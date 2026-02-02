/**
 * PACK 3.4 — Digital Goods Explanation Screen
 * Store compliance: Token nature disclosure
 * 
 * COMPLIANCE NOTES:
 * - Required by Apple App Store Guidelines 3.1.1
 * - Required by Google Play Digital Content Policy
 * - Clearly states tokens are consumable digital goods
 * - NO monetary value representation outside platform
 */

import React from 'react';
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

interface InfoItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

export default function DigitalGoodsScreen() {
  const { locale } = useTranslation();

  const getContent = () => {
    if (locale === 'pl') {
      return {
        pageTitle: 'O Tokenach Avalo',
        subtitle: 'Informacje o towarach cyfrowych',
        intro: 'Tokeny Avalo są wirtualnymi towarami cyfrowymi przeznaczonymi wyłącznie do użytku w aplikacji Avalo. Niniejszy dokument wyjaśnia naturę tokenów i usług, na które można je wymienić.',
        whatAreTokens: {
          title: 'Czym są Tokeny?',
          items: [
            {
              icon: 'diamond-outline',
              title: 'Towary Cyfrowe',
              description: 'Tokeny Avalo są konsumowalnymi towarami cyfrowymi zgodnie z definicją Apple App Store i Google Play Store.',
            },
            {
              icon: 'wallet-outline',
              title: 'Waluta Wewnętrzna',
              description: 'Tokeny funkcjonują wyłącznie jako waluta wewnętrzna aplikacji Avalo i nie mają wartości poza platformą.',
            },
            {
              icon: 'lock-closed-outline',
              title: 'Brak Transferów',
              description: 'Tokenów nie można przekazywać innym użytkownikom, wymieniać na gotówkę ani przenosić na inne platformy.',
            },
            {
              icon: 'cart-outline',
              title: 'Natychmiastowa Konsumpcja',
              description: 'Zakupione tokeny są natychmiast dostępne w Twoim portfelu i przeznaczone do konsumpcji w aplikacji.',
            },
          ] as InfoItem[],
        },
        whatCanYouGet: {
          title: 'Na Co Można Wymienić Tokeny?',
          items: [
            {
              icon: 'chatbubbles-outline',
              title: 'Rozmowy z Twórcami',
              description: 'Płatne wiadomości tekstowe, głosowe i wideo z twórcami treści.',
            },
            {
              icon: 'videocam-outline',
              title: 'Połączenia Wideo',
              description: 'Prywatne sesje wideo z twórcami rozliczane minutowo.',
            },
            {
              icon: 'gift-outline',
              title: 'Wirtualne Prezenty',
              description: 'Prezenty cyfrowe wysyłane twórcom podczas transmisji na żywo i w rozmowach.',
            },
            {
              icon: 'folder-outline',
              title: 'Treści Premium',
              description: 'Dostęp do ekskluzywnych treści cyfrowych publikowanych przez twórców.',
            },
            {
              icon: 'star-outline',
              title: 'Wzmocnienia Profilu',
              description: 'Promocja profilu w aplikacji dla zwiększenia widoczności.',
            },
            {
              icon: 'calendar-outline',
              title: 'Rezerwacje Wydarzeń',
              description: 'Bilety na wirtualne i fizyczne wydarzenia organizowane przez twórców.',
            },
          ] as InfoItem[],
        },
        important: {
          title: 'Ważne Informacje',
          items: [
            'Tokeny są towarami cyfrowymi i nie mają wartości pieniężnej poza aplikacją.',
            'Zakupy tokenów są przetwarzane przez Apple App Store lub Google Play Store.',
            'Polityka zwrotów podlega regulaminom sklepów aplikacji.',
            'Ceny tokenów są jednolite i nie podlegają promocjom ani rabatom.',
            'Niewykorzystane tokeny pozostają na koncie bezterminowo.',
            'Konto z nieprawidłowo zdobytymi tokenami może zostać zawieszone.',
          ],
        },
        legalNotice: 'Używając tokenów, akceptujesz Regulamin Avalo i potwierdzasz zrozumienie natury towarów cyfrowych.',
        contactTitle: 'Masz Pytania?',
        contactText: 'Skontaktuj się z naszym zespołem pomocy technicznej.',
      };
    }

    return {
      pageTitle: 'About Avalo Tokens',
      subtitle: 'Digital goods information',
      intro: 'Avalo Tokens are virtual digital goods designed exclusively for use within the Avalo app. This document explains the nature of tokens and the services they can be exchanged for.',
      whatAreTokens: {
        title: 'What Are Tokens?',
        items: [
          {
            icon: 'diamond-outline',
            title: 'Digital Goods',
            description: 'Avalo Tokens are consumable digital goods as defined by Apple App Store and Google Play Store.',
          },
          {
            icon: 'wallet-outline',
            title: 'In-App Currency',
            description: 'Tokens function exclusively as in-app currency within Avalo and have no value outside the platform.',
          },
          {
            icon: 'lock-closed-outline',
            title: 'Non-Transferable',
            description: 'Tokens cannot be transferred to other users, exchanged for cash, or moved to other platforms.',
          },
          {
            icon: 'cart-outline',
            title: 'Immediate Consumption',
            description: 'Purchased tokens are immediately available in your wallet and intended for in-app consumption.',
          },
        ] as InfoItem[],
      },
      whatCanYouGet: {
        title: 'What Can You Get With Tokens?',
        items: [
          {
            icon: 'chatbubbles-outline',
            title: 'Creator Conversations',
            description: 'Paid text, voice, and video messages with content creators.',
          },
          {
            icon: 'videocam-outline',
            title: 'Video Calls',
            description: 'Private video sessions with creators billed by the minute.',
          },
          {
            icon: 'gift-outline',
            title: 'Virtual Gifts',
            description: 'Digital gifts sent to creators during live streams and conversations.',
          },
          {
            icon: 'folder-outline',
            title: 'Premium Content',
            description: 'Access to exclusive digital content published by creators.',
          },
          {
            icon: 'star-outline',
            title: 'Profile Boosts',
            description: 'In-app profile promotion for increased visibility.',
          },
          {
            icon: 'calendar-outline',
            title: 'Event Bookings',
            description: 'Tickets to virtual and physical events hosted by creators.',
          },
        ] as InfoItem[],
      },
      important: {
        title: 'Important Information',
        items: [
          'Tokens are digital goods and have no monetary value outside the app.',
          'Token purchases are processed through Apple App Store or Google Play Store.',
          'Refund policy is subject to app store regulations.',
          'Token prices are uniform and not subject to promotions or discounts.',
          'Unused tokens remain on your account indefinitely.',
          'Accounts with improperly obtained tokens may be suspended.',
        ],
      },
      legalNotice: 'By using tokens, you accept the Avalo Terms of Service and acknowledge understanding of digital goods nature.',
      contactTitle: 'Have Questions?',
      contactText: 'Contact our support team for assistance.',
    };
  };

  const content = getContent();

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@avalo.app?subject=Token%20Information');
  };

  const handleViewTerms = () => {
    router.push('/legal/terms' as any);
  };

  const handleBuyTokens = () => {
    router.push('/purchase/buy-tokens' as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: content.pageTitle,
          headerBackTitle: locale === 'pl' ? 'Wstecz' : 'Back',
        }}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.tokenIcon}>
            <Ionicons name="diamond" size={48} color="#FFD700" />
          </View>
          <Text style={styles.pageTitle}>{content.pageTitle}</Text>
          <Text style={styles.subtitle}>{content.subtitle}</Text>
        </View>

        {/* Intro */}
        <View style={styles.introCard}>
          <Text style={styles.introText}>{content.intro}</Text>
        </View>

        {/* What Are Tokens Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{content.whatAreTokens.title}</Text>
          {content.whatAreTokens.items.map((item, index) => (
            <View key={index} style={styles.infoItem}>
              <View style={styles.infoIconContainer}>
                <Ionicons name={item.icon} size={24} color="#007AFF" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>{item.title}</Text>
                <Text style={styles.infoDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* What Can You Get Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{content.whatCanYouGet.title}</Text>
          <View style={styles.gridContainer}>
            {content.whatCanYouGet.items.map((item, index) => (
              <View key={index} style={styles.gridItem}>
                <Ionicons name={item.icon} size={32} color="#FF6B6B" />
                <Text style={styles.gridItemTitle}>{item.title}</Text>
                <Text style={styles.gridItemDescription}>{item.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Important Information Section */}
        <View style={styles.importantSection}>
          <View style={styles.importantHeader}>
            <Ionicons name="alert-circle" size={24} color="#FF9800" />
            <Text style={styles.importantTitle}>{content.important.title}</Text>
          </View>
          {content.important.items.map((item, index) => (
            <View key={index} style={styles.bulletItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* Legal Notice */}
        <View style={styles.legalNotice}>
          <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
          <Text style={styles.legalNoticeText}>{content.legalNotice}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBuyTokens}
          >
            <Ionicons name="diamond-outline" size={20} color="#FFF" />
            <Text style={styles.primaryButtonText}>
              {locale === 'pl' ? 'Kup Tokeny' : 'Buy Tokens'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleViewTerms}
          >
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
            <Text style={styles.secondaryButtonText}>
              {locale === 'pl' ? 'Zobacz Regulamin' : 'View Terms'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>{content.contactTitle}</Text>
          <Text style={styles.contactText}>{content.contactText}</Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactSupport}
          >
            <Ionicons name="mail-outline" size={18} color="#666" />
            <Text style={styles.contactButtonText}>support@avalo.app</Text>
          </TouchableOpacity>
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  tokenIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  introCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  introText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  gridItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  gridItemDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
  importantSection: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  importantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  importantTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginLeft: 8,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#E65100',
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#795548',
    lineHeight: 20,
  },
  legalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  legalNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#2E7D32',
    marginLeft: 12,
    lineHeight: 20,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
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
  contactSection: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  contactText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
});
