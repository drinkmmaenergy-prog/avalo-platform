/**
 * PACK 308 — Verified Badge UI, Trust Labels & Safety Messaging
 * 
 * Safety & Verification Settings Screen
 * Shows user's verification status and safety information
 * Read-only informational screen with links to Help Center and Support
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/hooks/useAuth";
import { useTrustLabel } from "@/hooks/useTrustLabel";
import { useLocaleContext } from "@/contexts/LocaleContext";
import VerifiedBadge from "@/components/VerifiedBadge";

const TRANSLATIONS = {
  en: {
    title: 'Safety & Verification',
    backButton: '← Back',
    
    // Verification Status Section
    verificationStatus: 'Verification Status',
    verified: 'Verified',
    verifiedDesc: 'Selfie & age check passed (18+)',
    notVerified: 'Not Verified',
    notVerifiedDesc: 'Complete verification to get verified badge',
    contactSupport: 'Contact Support',
    
    // Features Section
    featuresTitle: 'Safety Features',
    
    verifiedBadgeTitle: 'Verified Badge',
    verifiedBadgeDesc: 'Shows you passed selfie and age verification (18+). Does NOT guarantee behavior - always trust your instincts.',
    
    panicButtonTitle: 'Panic Button',
    panicButtonDesc: 'Emergency tool to immediately end unsafe situations and alert our safety team. Available in all chats and meetings.',
    
    meetingVerificationTitle: 'Meeting QR/Selfie Verification',
    meetingVerificationDesc: 'Before or at physical meetings, both parties verify identity via QR code or selfie match. Mismatches trigger refunds.',
    
    reportUserTitle: 'Report Another User',
    reportUserDesc: 'Report inappropriate behavior, fake profiles, or safety concerns. All reports are reviewed by our moderation team.',
    
    // Help Links
    helpTitle: 'Get Help',
    learnMoreVerification: 'Learn More About Verification',
    safetyGuidelines: 'Safety Guidelines',
    howToReport: 'How to Report Users',
    contactSupportBtn: 'Contact Support Team',
    
    // Footer
    footerNote: 'Your safety is our priority. If you feel unsafe or uncomfortable, always use the Panic button or contact support immediately.',
  },
  pl: {
    title: 'Bezpieczeństwo i Weryfikacja',
    backButton: '← Wstecz',
    
    // Verification Status Section
    verificationStatus: 'Status Weryfikacji',
    verified: 'Zweryfikowano',
    verifiedDesc: 'Selfie i wiek zweryfikowane (18+)',
    notVerified: 'Nie Zweryfikowano',
    notVerifiedDesc: 'Ukończ weryfikację, aby otrzymać odznakę',
    contactSupport: 'Kontakt z Pomocą',
    
    // Features Section
    featuresTitle: 'Funkcje Bezpieczeństwa',
    
    verifiedBadgeTitle: 'Odznaka Verified',
    verifiedBadgeDesc: 'Pokazuje, że przeszedłeś weryfikację selfie i wieku (18+). NIE gwarantuje zachowania - zawsze ufaj swoim instynktom.',
    
    panicButtonTitle: 'Przycisk Paniki',
    panicButtonDesc: 'Narzędzie awaryjne do natychmiastowego zakończenia niebezpiecznych sytuacji i powiadomienia zespołu bezpieczeństwa.',
    
    meetingVerificationTitle: 'Weryfikacja QR/Selfie na Spotkaniu',
    meetingVerificationDesc: 'Przed lub na fizycznych spotkaniach obie strony weryfikują tożsamość poprzez kod QR lub selfie. Niezgodności wywołują zwroty.',
    
    reportUserTitle: 'Zgłoś Użytkownika',
    reportUserDesc: 'Zgłoś nieodpowiednie zachowanie, fałszywe profile lub obawy bezpieczeństwa. Wszystkie zgłoszenia są przeglądane.',
    
    // Help Links
    helpTitle: 'Uzyskaj Pomoc',
    learnMoreVerification: 'Dowiedz się Więcej o Weryfikacji',
    safetyGuidelines: 'Wytyczne Bezpieczeństwa',
    howToReport: 'Jak Zgłosić Użytkowników',
    contactSupportBtn: 'Kontakt z Pomocą Techniczną',
    
    // Footer
    footerNote: 'Twoje bezpieczeństwo jest naszym priorytetem. Jeśli czujesz się niebezpiecznie lub niekomfortowo, zawsze używaj przycisku paniki lub skontaktuj się z pomocą.',
  },
};

export default function SafetyVerificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { trustLabel, loading } = useTrustLabel(user?.uid);
  const { locale } = useLocaleContext();
  const t = TRANSLATIONS[locale as keyof typeof TRANSLATIONS] || TRANSLATIONS.en;

  const openHelpArticle = (article: string) => {
    // TODO: Open help center article
    const url = `https://help.avalo.app/${locale}/${article}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open help article');
    });
  };

  const contactSupport = () => {
    // TODO: Open support chat or email
    Linking.openURL('mailto:support@avalo.app').catch(() => {
      Alert.alert('Error', 'Could not open email client');
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{t.backButton}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t.title}</Text>
      </View>

      <View style={styles.content}>
        {/* Verification Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.verificationStatus}</Text>
          
          <View style={styles.statusCard}>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : trustLabel?.verified ? (
              <>
                <View style={styles.statusHeader}>
                  <VerifiedBadge verified={true} size="large" />
                  <Text style={styles.statusTitle}>{t.verified}</Text>
                </View>
                <Text style={styles.statusDesc}>{t.verifiedDesc}</Text>
              </>
            ) : (
              <>
                <Text style={styles.statusTitle}>{t.notVerified}</Text>
                <Text style={styles.statusDesc}>{t.notVerifiedDesc}</Text>
                <TouchableOpacity
                  style={styles.supportButton}
                  onPress={contactSupport}
                >
                  <Text style={styles.supportButtonText}>{t.contactSupport}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Safety Features Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.featuresTitle}</Text>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>✓</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{t.verifiedBadgeTitle}</Text>
              <Text style={styles.featureDesc}>{t.verifiedBadgeDesc}</Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🚨</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{t.panicButtonTitle}</Text>
              <Text style={styles.featureDesc}>{t.panicButtonDesc}</Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>📸</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{t.meetingVerificationTitle}</Text>
              <Text style={styles.featureDesc}>{t.meetingVerificationDesc}</Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>⚠️</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{t.reportUserTitle}</Text>
              <Text style={styles.featureDesc}>{t.reportUserDesc}</Text>
            </View>
          </View>
        </View>

        {/* Help Links Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.helpTitle}</Text>

          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => openHelpArticle('verification')}
          >
            <Text style={styles.helpLinkText}>{t.learnMoreVerification}</Text>
            <Text style={styles.helpLinkArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => openHelpArticle('safety-guidelines')}
          >
            <Text style={styles.helpLinkText}>{t.safetyGuidelines}</Text>
            <Text style={styles.helpLinkArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => openHelpArticle('reporting')}
          >
            <Text style={styles.helpLinkText}>{t.howToReport}</Text>
            <Text style={styles.helpLinkArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactButton}
            onPress={contactSupport}
          >
            <Text style={styles.contactButtonText}>{t.contactSupportBtn}</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t.footerNote}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  supportButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
    alignItems: 'center',
  },
  supportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  featureCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  helpLink: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  helpLinkText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  helpLinkArrow: {
    fontSize: 18,
    color: '#4ECDC4',
  },
  contactButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 16,
    marginTop: 10,
    alignItems: 'center',
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    marginTop: 10,
  },
  footerText: {
    fontSize: 13,
    color: '#E65100',
    lineHeight: 18,
    textAlign: 'center',
  },
});
