/**
 * PACK 300B - Seed Data Script
 * Seeds admin users, help articles, and education cards
 */

import * as admin from 'firebase-admin';
import { HelpArticle, EducationCard } from '../shared/types/support';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ============================================================================
// ADMIN USERS
// ============================================================================

const adminUsers = [
  {
    adminId: 'admin-super-001',
    email: 'super@avalo.app',
    displayName: 'Super Admin',
    role: 'super_admin',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    adminId: 'admin-support-001',
    email: 'support@avalo.app',
    displayName: 'Support Agent 1',
    role: 'support_agent',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    adminId: 'admin-support-002',
    email: 'support2@avalo.app',
    displayName: 'Support Agent 2',
    role: 'support_agent',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    adminId: 'admin-safety-001',
    email: 'safety@avalo.app',
    displayName: 'Safety Admin',
    role: 'safety_admin',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    adminId: 'admin-manager-001',
    email: 'manager@avalo.app',
    displayName: 'Support Manager',
    role: 'support_manager',
    active: true,
    createdAt: new Date().toISOString(),
  },
];

// ============================================================================
// HELP ARTICLES
// ============================================================================

const helpArticles: HelpArticle[] = [
  // Paid Chat - English
  {
    articleId: 'paid-chat-how-it-works-EN',
    category: 'PAID_CHAT',
    slug: 'how-paid-chat-works',
    locale: 'en-US',
    title: 'How Paid Chat Works',
    shortSummary: 'Learn how paid chat works, message pricing, and when you can get refunds.',
    bodyMarkdown: `# How Paid Chat Works

Paid chat allows you to have meaningful conversations with interesting people while supporting their time and attention.

## Message Pricing

- Each message sent costs tokens
- Token prices are set by the recipient
- You see the cost before sending any message
- View pricing in the chat header

## Sending Messages

1. Open a chat with someone
2. Check their per-message token price
3. Type your message
4. Confirm payment before sending
5. Message is delivered instantly

## Refund Policy

You can request a refund if:
- The other person doesn't reply within 24 hours
- You sent the first message in the conversation
- The refund request is made within 48 hours

Refunds are processed within 48 hours.

## Need Help?

If you have questions about paid chat, contact our support team.`,
    isFeatured: true,
    isSearchable: true,
    tags: ['chat', 'payments', 'tokens', 'messaging', 'refunds'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Paid Chat - Polish
  {
    articleId: 'paid-chat-how-it-works-PL',
    category: 'PAID_CHAT',
    slug: 'jak-dziala-platny-czat',
    locale: 'pl-PL',
    title: 'Jak działa płatny czat',
    shortSummary: 'Dowiedz się, jak działa płatny czat, ceny wiadomości i kiedy można uzyskać zwrot pieniędzy.',
    bodyMarkdown: `# Jak działa płatny czat

Płatny czat pozwala na prowadzenie znaczących rozmów z ciekawymi ludźmi, wspierając ich czas i uwagę.

## Ceny wiadomości

- Każda wysłana wiadomość kosztuje tokeny
- Ceny tokenów ustalane są przez odbiorcę
- Widzisz koszt przed wysłaniem wiadomości
- Sprawdź cenę w nagłówku czatu

## Polityka zwrotów

Możesz poprosić o zwrot pieniędzy, jeśli:
- Druga osoba nie odpowie w ciągu 24 godzin
- Wysłałeś pierwszą wiadomość w rozmowie
- Wniosek o zwrot zostanie złożony w ciągu 48 godzin

Zwroty są przetwarzane w ciągu 48 godzin.`,
    isFeatured: true,
    isSearchable: true,
    tags: ['czat', 'płatności', 'tokeny', 'wiadomości', 'zwroty'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Calendar Meetings - English
  {
    articleId: 'calendar-meetings-refunds-EN',
    category: 'CALENDAR_AND_MEETINGS',
    slug: 'calendar-meetings-refunds',
    locale: 'en-US',
    title: 'Calendar Meetings & Refund Policy',
    shortSummary: 'Understand how to book calendar meetings and when refunds are available.',
    bodyMarkdown: `# Calendar Meetings & Refund Policy

Book one-on-one meetings with interesting people through our calendar system.

## How Booking Works

1. Browse available time slots
2. Select date and time
3. Pay the booking fee
4. Receive confirmation
5. Meet at the scheduled time

## Refund Policy

### Full Refunds Available If:
- Meeting cancelled by host
- Cancellation made 24+ hours before meeting
- Technical issues prevent the meeting
- Host doesn't show up

### No Refunds If:
- You cancel less than 12 hours before
- You don't show up ("no-show")
- You're more than 15 minutes late

Refunds processed within 3-5 business days.`,
    isFeatured: true,
    isSearchable: true,
    tags: ['calendar', 'meetings', 'booking', 'refunds'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Token Wallet - English
  {
    articleId: 'tokens-wallet-guide-EN',
    category: 'TOKENS_AND_WALLET',
    slug: 'tokens-wallet-guide',
    locale: 'en-US',
    title: 'Understanding Tokens & Your Wallet',
    shortSummary: 'Complete guide to buying tokens, managing your wallet, and understanding token economics.',
    bodyMarkdown: `# Understanding Tokens & Your Wallet

Tokens are the currency used for paid features on Avalo.

## Token Value

- 1 token = 0.20 PLN
- Fixed exchange rate
- Tokens are non-refundable

## How to Buy Tokens

1. Go to Wallet section
2. Select token pack
3. Choose payment method
4. Complete purchase
5. Tokens added instantly

## Token Packs

- 50 tokens = 10 PLN
- 100 tokens = 20 PLN
- 250 tokens = 50 PLN
- 500 tokens = 100 PLN

## What Tokens Are Used For

- Paid chat messages
- Video/voice calls
- Calendar bookings
- Event tickets
- Premium features`,
    isFeatured: true,
    isSearchable: true,
    tags: ['tokens', 'wallet', 'payments', 'pricing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Safety & Panic Button - English
  {
    articleId: 'safety-panic-button-EN',
    category: 'SAFETY_AND_REPORTING',
    slug: 'safety-panic-button',
    locale: 'en-US',
    title: 'Safety Features & Panic Button',
    shortSummary: 'Learn how to stay safe, use the panic button, and report concerning behavior.',
    bodyMarkdown: `# Safety Features & Panic Button

Your safety is our top priority. Here's how to stay safe on Avalo.

## Panic Button

Emergency feature for dangerous situations.

### When to Use
- You feel physically threatened
- Someone is following you
- Emergency situation during meetup
- Immediate danger

### What It Does
1. Alerts trusted contacts
2. Shares your location
3. Notifies platform safety team
4. Records incident details

### How to Activate
- Press and hold panic button (3 seconds)
- Confirm emergency
- Help is on the way

## Reporting Users

Report inappropriate behavior:
1. Go to user profile
2. Tap "Report"
3. Select reason
4. Provide details
5. Submit report

Reports are reviewed within 24 hours.

## Need Immediate Help?

- **Emergency:** Call local police (112 in EU)
- **Safety concerns:** Contact support team
- **Crisis helpline:** Available in app settings`,
    isFeatured: true,
    isSearchable: true,
    tags: ['safety', 'panic', 'emergency', 'reporting'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Getting Started - English
  {
    articleId: 'getting-started-guide-EN',
    category: 'GETTING_STARTED',
    slug: 'getting-started-guide',
    locale: 'en-US',
    title: 'Getting Started with Avalo',
    shortSummary: 'Your complete guide to setting up your Avalo account and getting started.',
    bodyMarkdown: `# Getting Started with Avalo

Welcome to Avalo! Here's everything you need to know to get started.

## Create Your Profile

1. Sign up with email or phone
2. Add profile photo
3. Write bio
4. Set preferences
5. Choose interests

## Discover People

- Swipe to discover new people
- Filter by interests
- View profiles
- Send messages

## Stay Safe

- Use safety features
- Report inappropriate behavior
- Trust your instincts
- Keep conversations in-app

## Need Help?

Browse our help articles or contact support.`,
    isFeatured: true,
    isSearchable: true,
    tags: ['onboarding', 'setup', 'beginner', 'tutorial'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============================================================================
// EDUCATION CARDS
// ============================================================================

const educationCards: EducationCard[] = [
  // Token Wallet - English
  {
    cardId: 'tokens-intro-EN',
    context: 'TOKENS',
    locale: 'en-US',
    title: 'Understanding Tokens',
    body: 'Tokens are used for paid features like chat, calls, and events. 1 token = 0.20 PLN. Tokens are non-refundable once purchased.',
    ctaLabel: 'Learn More',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'tokens-wallet-guide' },
    enabled: true,
    order: 0,
  },

  // Token Wallet - Polish
  {
    cardId: 'tokens-intro-PL',
    context: 'TOKENS',
    locale: 'pl-PL',
    title: 'Zrozumienie tokenów',
    body: 'Tokeny są używane do płatnych funkcji, takich jak czat, rozmowy i wydarzenia. 1 token = 0,20 PLN. Tokeny są bezzwrotne po zakupie.',
    ctaLabel: 'Dowiedz się więcej',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'tokeny-portfel-przewodnik' },
    enabled: true,
    order: 0,
  },

  // Paid Chat - English
  {
    cardId: 'paid-chat-intro-EN',
    context: 'PAID_CHAT',
    locale: 'en-US',
    title: 'How Paid Chat Works',
    body: 'Each message costs tokens set by the recipient. You can request a refund if they don\'t reply within 24 hours.',
    ctaLabel: 'Learn About Chat',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'how-paid-chat-works' },
    enabled: true,
    order: 0,
  },

  // Calendar - English
  {
    cardId: 'calendar-intro-EN',
    context: 'CALENDAR',
    locale: 'en-US',
    title: 'Booking Calendar Meetings',
    body: 'Book one-on-one meetings with people you\'re interested in. Cancel 24+ hours before for a full refund.',
    ctaLabel: 'Refund Policy',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'calendar-meetings-refunds' },
    enabled: true,
    order: 0,
  },

  // Panic Button - English
  {
    cardId: 'panic-how-it-works-EN',
    context: 'PANIC_BUTTON',
    locale: 'en-US',
    title: 'Emergency Safety Feature',
    body: 'The panic button alerts your trusted contacts, shares your location, and notifies our safety team immediately. Use only in dangerous situations.',
    ctaLabel: 'Safety Guidelines',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'safety-panic-button' },
    enabled: true,
    order: 0,
  },

  // Safety - English
  {
    cardId: 'safety-tips-EN',
    context: 'SAFETY',
    locale: 'en-US',
    title: 'Stay Safe on Avalo',
    body: 'Report inappropriate behavior, block users who make you uncomfortable, and trust your instincts. Your safety is our priority.',
    ctaLabel: 'Safety Features',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'safety-panic-button' },
    enabled: true,
    order: 0,
  },

  // Payouts - English
  {
    cardId: 'payouts-intro-EN',
    context: 'PAYOUTS',
    locale: 'en-US',
    title: 'Creator Earnings & Payouts',
    body: 'Earn money through paid features. Minimum payout is 100 PLN. Payouts are processed weekly.',
    ctaLabel: 'Payout Details',
    ctaType: 'OPEN_HELP_ARTICLE',
    ctaPayload: { articleSlug: 'creator-payouts-guide' },
    enabled: true,
    order: 0,
  },
];

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedAdminUsers() {
  console.log('Seeding admin users...');
  const batch = db.batch();
  
  for (const admin of adminUsers) {
    const ref = db.collection('adminUsers').doc(admin.adminId);
    batch.set(ref, admin);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${adminUsers.length} admin users`);
}

async function seedHelpArticles() {
  console.log('Seeding help articles...');
  const batch = db.batch();
  
  for (const article of helpArticles) {
    const ref = db.collection('helpArticles').doc(article.articleId);
    batch.set(ref, article);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${helpArticles.length} help articles`);
}

async function seedEducationCards() {
  console.log('Seeding education cards...');
  const batch = db.batch();
  
  for (const card of educationCards) {
    const ref = db.collection('educationCards').doc(card.cardId);
    batch.set(ref, card);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${educationCards.length} education cards`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    console.log('🌱 Starting PACK 300B seed data...\n');
    
    await seedAdminUsers();
    await seedHelpArticles();
    await seedEducationCards();
    
    console.log('\n✅ PACK 300B seed data complete!');
    console.log('\nNext steps:');
    console.log('1. Deploy Cloud Functions');
    console.log('2. Deploy admin console');
    console.log('3. Deploy public help center');
    console.log('4. Train support team');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { seedAdminUsers, seedHelpArticles, seedEducationCards };