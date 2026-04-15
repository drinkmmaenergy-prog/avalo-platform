/**
 * PACK 321 — Wallet Info Screen
 * Information about tokens, rates, and terms
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from "@/components/AppHeader";
import { colors, spacing, fontSizes, fontWeights } from "@/shared/theme";

export default function WalletInfoScreen() {
  const router = useRouter();

  const InfoSection = ({ icon, title, content }: { icon: string; title: string; content: string }) => (
    <View style={styles.infoSection}>
      <View style={styles.infoHeader}>
        <Text style={styles.infoIcon}>{icon}</Text>
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      <Text style={styles.infoContent}>{content}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title="Wallet Information"
        rightAction={
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💰 About Tokens</Text>
          <Text style={styles.headerSubtitle}>
            Everything you need to know about Avalo tokens
          </Text>
        </View>

        <InfoSection
          icon="💳"
          title="What are Tokens?"
          content="Tokens are Avalo's virtual currency used to access premium features like paid chat, voice/video calls, calendar bookings, and events. You can purchase tokens in packs and earn them from your activity on the platform."
        />

        <InfoSection
          icon="💵"
          title="Token Rates"
          content={`Purchase: Prices vary by pack (see Token Store)\nPayout: 1 token = MONETIZATION_SPLITS.EVENT_TICKET.avalo PLN (fixed rate)\n\nNote: Purchase and payout rates differ. This is the standard tokenomics model for the platform.`}
        />

        <InfoSection
          icon="📊"
          title="Revenue Splits"
          content={`Chat, Calls, AI, Media: up to reference rate creator / 35% Avalo\nCalendar & Events: up to reference rate creator / 20% Avalo\nTips: 90% creator / 10% Avalo\n\nVIP/Royal members get discounts on call rates, but the revenue split stays the same.`}
        />

        <InfoSection
          icon="💰"
          title="How to Earn"
          content="Creators earn tokens when users pay for their services:\n• Paid chat messages\n• Voice and video calls\n• Calendar 1:1 meetings\n• Event tickets\n• Tips from fans\n• Media and digital products"
        />

        <InfoSection
          icon="🏦"
          title="Payouts"
          content={`Minimum: 1,000 tokens (200 PLN)\nRate: MONETIZATION_SPLITS.EVENT_TICKET.avalo PLN per token\nMethods: Stripe Connect, Bank Transfer\nProcessing: 3-5 business days\n\nKYC verification required before first payout.`}
        />

        <InfoSection
          icon="🔒"
          title="Age Requirements"
          content="You must be 18+ to purchase tokens or request payouts. This is strictly enforced and verified during KYC."
        />

        <InfoSection
          icon="↩️"
          title="Refunds"
          content={`Token purchases are non-refundable except where required by law.\n\nFor services:\n• Chat/Calls: Avalo commission is non-refundable\n• Calendar: Time-based refund policy applies\n• Events: Organizer cancellation = full refund\n• User cancellation: Partial refund based on timing`}
        />

        <InfoSection
          icon="⚠️"
          title="Important Notes"
          content={`• Tokens have no cash value outside the platform\n• Cannot be transferred between users\n• No guarantee of profit from earning tokens\n• Platform terms & conditions apply\n• Avalo reserves the right to modify rates with notice`}
        />

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Need Help?</Text>
          <Text style={styles.contactText}>
            Contact support@avalo.app for questions about your wallet, tokens, or payouts.
          </Text>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  closeButton: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  header: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  headerSubtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  infoSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.textSecondary + '10',
    borderRadius: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  infoIcon: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  infoTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  infoContent: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  contactCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.primary + '10',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary + '30',
  },
  contactTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  contactText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});

