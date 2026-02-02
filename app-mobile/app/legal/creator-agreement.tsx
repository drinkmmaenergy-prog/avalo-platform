/**
 * Creator Agreement (B2B) Screen
 * PHASE 4.2 — B2B Creator Agreement Implementation
 *
 * Displays the full B2B Creator Agreement for creators.
 * This is a LEGAL DOCUMENT screen - creators must accept this agreement
 * before they can access any monetization features.
 *
 * @version v1.0
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// Agreement version - must match backend CREATOR_AGREEMENT_CURRENT_VERSION
const AGREEMENT_VERSION = 'v1.0';

interface AcceptCreatorAgreementResponse {
  success: boolean;
  status: 'accepted' | 'already_accepted';
  version: string;
  acceptedAt: string;
}

export default function CreatorAgreementScreen() {
  const { locale } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);

  const handleAcceptAgreement = async () => {
    if (!user?.uid) {
      Alert.alert(
        locale === 'pl' ? 'Błąd' : 'Error',
        locale === 'pl' ? 'Musisz być zalogowany.' : 'You must be logged in.'
      );
      return;
    }

    setAccepting(true);

    try {
      const acceptCreatorAgreement = httpsCallable<
        { surface: 'app' | 'web' },
        AcceptCreatorAgreementResponse
      >(functions, 'acceptCreatorAgreementV1');

      const result = await acceptCreatorAgreement({ surface: 'app' });

      if (result.data.success) {
        Alert.alert(
          locale === 'pl' ? 'Sukces' : 'Success',
          locale === 'pl'
            ? 'Umowa twórcy została zaakceptowana.'
            : 'Creator Agreement has been accepted.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error accepting creator agreement:', error);
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

  const renderEnglishContent = () => (
    <>
      <Text style={styles.title}>Creator Agreement (B2B)</Text>
      <Text style={styles.version}>Version {AGREEMENT_VERSION}</Text>
      <Text style={styles.lastUpdated}>Last Updated: February 2026</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Independent Contractor Status</Text>
        <Text style={styles.paragraph}>
          By accepting this Agreement and participating in the Avalo Creator Program,
          you acknowledge and agree that you are acting as an <Text style={styles.bold}>independent
          contractor (B2B - Business to Business)</Text> and NOT as an employee, agent,
          partner, or joint venturer of Avalo sp. z o.o. ("Avalo" or the "Platform").
        </Text>
        <Text style={styles.paragraph}>
          This Agreement establishes a business-to-business relationship between you
          ("Creator") and Avalo. Nothing in this Agreement creates an employment
          relationship, partnership, agency, or any other relationship other than
          that of independent contracting parties.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Platform Intermediary Role</Text>
        <Text style={styles.paragraph}>
          Avalo operates as a <Text style={styles.bold}>platform intermediary</Text> that
          facilitates connections between Creators and users. Avalo is NOT your employer
          and does not direct or control the manner in which you provide services to users.
        </Text>
        <Text style={styles.paragraph}>You retain full control over:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• The content you create and share</Text>
          <Text style={styles.bulletItem}>• Your pricing within platform guidelines</Text>
          <Text style={styles.bulletItem}>• Your schedule and availability</Text>
          <Text style={styles.bulletItem}>• Which users you engage with</Text>
          <Text style={styles.bulletItem}>• Your creative and business decisions</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. Creator Responsibilities</Text>
        <Text style={styles.paragraph}>
          As an independent contractor, <Text style={styles.bold}>you are solely responsible for</Text>:
        </Text>

        <Text style={styles.subSectionTitle}>3.1 Tax Obligations</Text>
        <Text style={styles.paragraph}>
          • Registration with appropriate tax authorities{'\n'}
          • Filing all required tax returns{'\n'}
          • Payment of all applicable income taxes{'\n'}
          • VAT registration and reporting (if applicable){'\n'}
          • Maintaining proper financial records
        </Text>

        <Text style={styles.subSectionTitle}>3.2 VAT / Income Reporting</Text>
        <Text style={styles.paragraph}>
          • Accurate reporting of all income earned through the Platform{'\n'}
          • Compliance with VAT regulations in your jurisdiction{'\n'}
          • Issuing invoices where required by local law{'\n'}
          • Maintaining records for the statutory retention period
        </Text>

        <Text style={styles.subSectionTitle}>3.3 Legal Compliance of Content</Text>
        <Text style={styles.paragraph}>
          • Ensuring all content you create complies with applicable laws{'\n'}
          • Obtaining necessary rights, licenses, and consent for content{'\n'}
          • Adhering to Platform content guidelines and policies{'\n'}
          • Age verification and consent requirements for adult content{'\n'}
          • Intellectual property rights and copyright compliance
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. Payment Settlement</Text>
        <Text style={styles.paragraph}>
          All payments for Creator earnings are settled via the <Text style={styles.bold}>Platform
          treasury system</Text>. This includes:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Token-to-currency conversion</Text>
          <Text style={styles.bulletItem}>• Payout processing and disbursement</Text>
          <Text style={styles.bulletItem}>• Transaction fee deduction</Text>
          <Text style={styles.bulletItem}>• Currency exchange (where applicable)</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. Payout Suspension</Text>
        <Text style={styles.paragraph}>
          Avalo reserves the right to <Text style={styles.bold}>suspend, withhold, or offset payouts</Text> in
          the following circumstances:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Chargebacks:</Text> When users dispute transactions</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Fraud:</Text> Suspected or confirmed fraudulent activity</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Legal Violations:</Text> Breach of laws or Platform policies</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Disputes:</Text> Pending resolution of user complaints</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Investigation:</Text> During compliance or fraud investigations</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Tax Compliance:</Text> Failure to provide required tax documentation</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. No Employment Benefits</Text>
        <Text style={styles.paragraph}>
          As an independent contractor, you are NOT entitled to any employee benefits
          including but not limited to:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Health insurance</Text>
          <Text style={styles.bulletItem}>• Retirement/pension contributions</Text>
          <Text style={styles.bulletItem}>• Paid leave or vacation</Text>
          <Text style={styles.bulletItem}>• Unemployment insurance</Text>
          <Text style={styles.bulletItem}>• Workers' compensation</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. Governing Law & Jurisdiction</Text>
        <Text style={styles.paragraph}>
          This Agreement shall be governed by and construed in accordance with the
          laws of <Text style={styles.bold}>Poland</Text>. Any disputes arising out of or in connection
          with this Agreement shall be subject to the exclusive jurisdiction of the
          courts of <Text style={styles.bold}>Warsaw, Poland</Text>.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. Agreement Version & Updates</Text>
        <Text style={styles.paragraph}>
          This is version <Text style={styles.bold}>{AGREEMENT_VERSION}</Text> of the Creator Agreement.
          Material changes will require re-acceptance before you can continue using Creator features.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>9. Contact Information</Text>
        <Text style={styles.paragraph}>
          Avalo sp. z o.o.{'\n'}Warsaw, Poland{'\n'}creators@avalo.app{'\n'}legal@avalo.app
        </Text>
      </View>

      <View style={styles.acknowledgmentBox}>
        <Text style={styles.acknowledgmentText}>
          By accepting this Agreement, you acknowledge that you have read, understood,
          and agree to be bound by all terms. You confirm that you are acting as an
          independent B2B contractor and accept full responsibility for your tax obligations,
          content compliance, and legal requirements.
        </Text>
      </View>
    </>
  );

  const renderPolishContent = () => (
    <>
      <Text style={styles.title}>Umowa Twórcy (B2B)</Text>
      <Text style={styles.version}>Wersja {AGREEMENT_VERSION}</Text>
      <Text style={styles.lastUpdated}>Ostatnia aktualizacja: Luty 2026</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Status Niezależnego Kontraktora</Text>
        <Text style={styles.paragraph}>
          Akceptując niniejszą Umowę i uczestnicząc w Programie Twórców Avalo,
          potwierdzasz i zgadzasz się, że działasz jako <Text style={styles.bold}>niezależny
          kontaktor (B2B - Business to Business)</Text> i NIE jako pracownik, agent,
          partner ani współwłaściciel Avalo sp. z o.o. ("Avalo" lub "Platforma").
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Rola Pośrednika Platformy</Text>
        <Text style={styles.paragraph}>
          Avalo działa jako <Text style={styles.bold}>pośrednik platformy</Text>, który
          ułatwia połączenia między Twórcami a użytkownikami. Avalo NIE jest Twoim
          pracodawcą.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. Obowiązki Twórcy</Text>
        <Text style={styles.paragraph}>
          Jako niezależny kontaktor, <Text style={styles.bold}>ponosisz wyłączną odpowiedzialność za</Text>:
        </Text>
        <Text style={styles.subSectionTitle}>3.1 Zobowiązania Podatkowe</Text>
        <Text style={styles.paragraph}>
          • Rejestrację w odpowiednich urzędach skarbowych{'\n'}
          • Składanie wszystkich wymaganych deklaracji podatkowych{'\n'}
          • Płatność wszystkich należnych podatków dochodowych{'\n'}
          • Rejestrację i raportowanie VAT (jeśli dotyczy)
        </Text>
        <Text style={styles.subSectionTitle}>3.2 Zgodność Prawna Treści</Text>
        <Text style={styles.paragraph}>
          • Zapewnienie zgodności wszystkich tworzonych treści z obowiązującym prawem{'\n'}
          • Uzyskanie niezbędnych praw, licencji i zgód na treści
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. Rozliczenia Płatności</Text>
        <Text style={styles.paragraph}>
          Wszystkie płatności za zarobki Twórcy są rozliczane przez <Text style={styles.bold}>system
          skarbca Platformy</Text>.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. Zawieszenie Wypłat</Text>
        <Text style={styles.paragraph}>
          Avalo zastrzega sobie prawo do <Text style={styles.bold}>zawieszenia, wstrzymania lub
          potrącenia wypłat</Text> w przypadku: obciążeń zwrotnych, oszustwa, naruszeń prawnych,
          sporów, dochodzeń, lub braku zgodności podatkowej.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. Brak Świadczeń Pracowniczych</Text>
        <Text style={styles.paragraph}>
          Jako niezależny kontaktor, NIE przysługują Ci żadne świadczenia pracownicze.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. Prawo Właściwe</Text>
        <Text style={styles.paragraph}>
          Niniejsza Umowa podlega prawu <Text style={styles.bold}>Polski</Text>. Spory podlegają
          jurysdykcji sądów w <Text style={styles.bold}>Warszawie</Text>.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. Wersja Umowy</Text>
        <Text style={styles.paragraph}>
          To jest wersja <Text style={styles.bold}>{AGREEMENT_VERSION}</Text> Umowy Twórcy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>9. Kontakt</Text>
        <Text style={styles.paragraph}>
          Avalo sp. z o.o.{'\n'}Warszawa, Polska{'\n'}creators@avalo.app{'\n'}legal@avalo.app
        </Text>
      </View>

      <View style={styles.acknowledgmentBox}>
        <Text style={styles.acknowledgmentText}>
          Akceptując niniejszą Umowę, potwierdzasz, że przeczytałeś, zrozumiałeś
          i zgadzasz się być związany wszystkimi warunkami. Potwierdzasz, że działasz
          jako niezależny kontaktor B2B.
        </Text>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locale === 'pl' ? 'Umowa Twórcy (B2B)' : 'Creator Agreement (B2B)',
          headerBackTitle: locale === 'pl' ? 'Wstecz' : 'Back',
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {locale === 'pl' ? renderPolishContent() : renderEnglishContent()}

        {user && (
          <TouchableOpacity
            style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
            onPress={handleAcceptAgreement}
            disabled={accepting}
          >
            {accepting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptButtonText}>
                {locale === 'pl' ? 'Akceptuję Umowę' : 'Accept Agreement'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1F2937', marginBottom: 8, textAlign: 'center' },
  version: { fontSize: 14, color: '#6B7280', textAlign: 'center', fontWeight: '600' },
  lastUpdated: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 24 },
  section: { marginBottom: 24, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  subSectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 8 },
  paragraph: { fontSize: 14, lineHeight: 22, color: '#4B5563', marginBottom: 12 },
  bold: { fontWeight: 'bold', color: '#1F2937' },
  bulletList: { marginLeft: 8, marginTop: 8, marginBottom: 8 },
  bulletItem: { fontSize: 14, lineHeight: 24, color: '#4B5563' },
  acknowledgmentBox: { backgroundColor: '#FEF3C7', borderLeftWidth: 4, borderLeftColor: '#F59E0B', padding: 16, borderRadius: 8, marginTop: 16, marginBottom: 24 },
  acknowledgmentText: { fontSize: 14, lineHeight: 22, color: '#92400E', fontWeight: '500' },
  acceptButton: { backgroundColor: '#10B981', paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginTop: 8, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  acceptButtonDisabled: { backgroundColor: '#9CA3AF', shadowOpacity: 0, elevation: 0 },
  acceptButtonText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
});
