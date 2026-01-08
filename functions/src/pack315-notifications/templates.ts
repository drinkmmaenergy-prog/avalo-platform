/**
 * PACK 315 - Push Notifications & Growth Funnels
 * Notification Templates
 */

import { NotificationTemplate, NotificationType } from './types';

// ============================================================================
// Notification Templates Registry
// ============================================================================

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  // ========================================
  // Verification & Account
  // ========================================
  
  VERIFICATION_NUDGE: {
    type: 'VERIFICATION_NUDGE',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Complete Your Verification',
      pl: 'Dokończ Weryfikację'
    },
    body: {
      en: 'Finish your selfie verification to fully use Avalo and start connecting.',
      pl: 'Dokończ weryfikację selfie, aby w pełni korzystać z Avalo i zacząć nawiązywać kontakty.'
    },
    defaultScreen: 'VERIFICATION',
    priority: 'HIGH'
  },
  
  VERIFICATION_SUCCESS: {
    type: 'VERIFICATION_SUCCESS',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Verification Complete! ✓',
      pl: 'Weryfikacja Zakończona! ✓'
    },
    body: {
      en: 'Your profile is now verified (18+). Start exploring and connecting!',
      pl: 'Twój profil jest teraz zweryfikowany (18+). Zacznij eksplorować i nawiązywać kontakty!'
    },
    defaultScreen: 'PROFILE',
    priority: 'NORMAL'
  },
  
  // ========================================
  // Chat & Social
  // ========================================
  
  NEW_MESSAGE: {
    type: 'NEW_MESSAGE',
    category: 'TRANSACTIONAL',
    title: {
      en: 'New Message',
      pl: 'Nowa Wiadomość'
    },
    body: {
      en: 'You have a new message waiting for you.',
      pl: 'Masz nową wiadomość.'
    },
    defaultScreen: 'CHAT',
    priority: 'HIGH'
  },
  
  NEW_MATCH: {
    type: 'NEW_MATCH',
    category: 'TRANSACTIONAL',
    title: {
      en: 'It\'s a Match! 💕',
      pl: 'To Match! 💕'
    },
    body: {
      en: 'You and someone liked each other. Start chatting now!',
      pl: 'Ty i ktoś polubiliście się nawzajem. Zacznij rozmawiać!'
    },
    defaultScreen: 'CHAT',
    priority: 'HIGH'
  },
  
  NEW_CONNECTION: {
    type: 'NEW_CONNECTION',
    category: 'TRANSACTIONAL',
    title: {
      en: 'New Connection',
      pl: 'Nowe Połączenie'
    },
    body: {
      en: 'Someone accepted your connection request. Say hello!',
      pl: 'Ktoś zaakceptował Twoją prośbę o połączenie. Przywitaj się!'
    },
    defaultScreen: 'CHAT',
    priority: 'NORMAL'
  },
  
  NEW_LIKE: {
    type: 'NEW_LIKE',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Someone Likes You! 💖',
      pl: 'Ktoś Cię Lubi! 💖'
    },
    body: {
      en: 'Check out who liked your profile.',
      pl: 'Zobacz, kto polubił Twój profil.'
    },
    defaultScreen: 'SWIPE',
    priority: 'NORMAL'
  },
  
  NEW_PROFILE_VISIT: {
    type: 'NEW_PROFILE_VISIT',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Profile Visit',
      pl: 'Odwiedziny Profilu'
    },
    body: {
      en: 'Someone checked out your profile. Take a look!',
      pl: 'Ktoś sprawdził Twój profil. Zajrzyj!'
    },
    defaultScreen: 'PROFILE',
    priority: 'LOW'
  },
  
  // ========================================
  // Calendar & Meetings
  // ========================================
  
  BOOKING_CONFIRMED: {
    type: 'BOOKING_CONFIRMED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Booking Confirmed',
      pl: 'Rezerwacja Potwierdzona'
    },
    body: {
      en: 'Your meeting has been confirmed. Check details in Calendar.',
      pl: 'Twoje spotkanie zostało potwierdzone. Sprawdź szczegóły w Kalendarzu.'
    },
    defaultScreen: 'CALENDAR',
    priority: 'HIGH'
  },
  
  MEETING_REMINDER_BEFORE: {
    type: 'MEETING_REMINDER_BEFORE',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Meeting Starting Soon',
      pl: 'Spotkanie Wkrótce'
    },
    body: {
      en: 'Your meeting starts in 1 hour. Get ready!',
      pl: 'Twoje spotkanie zaczyna się za godzinę. Przygotuj się!'
    },
    defaultScreen: 'CALENDAR',
    priority: 'HIGH'
  },
  
  MEETING_STATUS_UPDATE: {
    type: 'MEETING_STATUS_UPDATE',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Meeting Update',
      pl: 'Aktualizacja Spotkania'
    },
    body: {
      en: 'There has been an update to your meeting. Check details.',
      pl: 'Nastąpiła aktualizacja Twojego spotkania. Sprawdź szczegóły.'
    },
    defaultScreen: 'CALENDAR',
    priority: 'HIGH'
  },
  
  MEETING_CANCELLED: {
    type: 'MEETING_CANCELLED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Meeting Cancelled',
      pl: 'Spotkanie Anulowane'
    },
    body: {
      en: 'A meeting has been cancelled. Check your calendar for details.',
      pl: 'Spotkanie zostało anulowane. Sprawdź kalendarz, aby uzyskać szczegóły.'
    },
    defaultScreen: 'CALENDAR',
    priority: 'HIGH'
  },
  
  MEETING_REFUND_PROCESSED: {
    type: 'MEETING_REFUND_PROCESSED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Refund Processed',
      pl: 'Zwrot Przetworzony'
    },
    body: {
      en: 'Your meeting refund has been processed. Tokens are back in your wallet.',
      pl: 'Zwrot za spotkanie został przetworzony. Tokeny wróciły do portfela.'
    },
    defaultScreen: 'WALLET',
    priority: 'NORMAL'
  },
  
  // ========================================
  // Events
  // ========================================
  
  EVENT_TICKET_CONFIRMED: {
    type: 'EVENT_TICKET_CONFIRMED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Event Ticket Confirmed',
      pl: 'Bilet na Wydarzenie Potwierdzony'
    },
    body: {
      en: 'Your ticket is confirmed. See you at the event!',
      pl: 'Twój bilet został potwierdzony. Do zobaczenia na wydarzeniu!'
    },
    defaultScreen: 'EVENT',
    priority: 'HIGH'
  },
  
  EVENT_REMINDER: {
    type: 'EVENT_REMINDER',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Event Coming Up',
      pl: 'Nadchodzące Wydarzenie'
    },
    body: {
      en: 'Your event is coming up soon. Don\'t forget!',
      pl: 'Twoje wydarzenie wkrótce. Nie zapomnij!'
    },
    defaultScreen: 'EVENT',
    priority: 'HIGH'
  },
  
  EVENT_UPDATED: {
    type: 'EVENT_UPDATED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Event Updated',
      pl: 'Wydarzenie Zaktualizowane'
    },
    body: {
      en: 'There are updates to an event you\'re attending. Check details.',
      pl: 'Są aktualizacje wydarzenia, w którym uczestniczysz. Sprawdź szczegóły.'
    },
    defaultScreen: 'EVENT',
    priority: 'NORMAL'
  },
  
  EVENT_CANCELLED: {
    type: 'EVENT_CANCELLED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Event Cancelled',
      pl: 'Wydarzenie Anulowane'
    },
    body: {
      en: 'An event has been cancelled. Refund details will follow.',
      pl: 'Wydarzenie zostało anulowane. Szczegóły zwrotu będą dostępne wkrótce.'
    },
    defaultScreen: 'EVENT',
    priority: 'HIGH'
  },
  
  // ========================================
  // Wallet & Payouts
  // ========================================
  
  TOKEN_PURCHASE_SUCCESS: {
    type: 'TOKEN_PURCHASE_SUCCESS',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Tokens Added! 💰',
      pl: 'Tokeny Dodane! 💰'
    },
    body: {
      en: 'Your token purchase was successful. Start using them now!',
      pl: 'Zakup tokenów zakończył się sukcesem. Zacznij ich używać!'
    },
    defaultScreen: 'WALLET',
    priority: 'NORMAL'
  },
  
  TOKEN_PURCHASE_FAILED_RETRY: {
    type: 'TOKEN_PURCHASE_FAILED_RETRY',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Token Purchase Issue',
      pl: 'Problem z Zakupem Tokenów'
    },
    body: {
      en: 'We couldn\'t process your payment. Please try again or contact support.',
      pl: 'Nie mogliśmy przetworzyć płatności. Spróbuj ponownie lub skontaktuj się z obsługą.'
    },
    defaultScreen: 'WALLET',
    priority: 'HIGH'
  },
  
  PAYOUT_INITIATED: {
    type: 'PAYOUT_INITIATED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Payout Initiated',
      pl: 'Wypłata Rozpoczęta'
    },
    body: {
      en: 'Your payout is being processed. It should arrive within 2-3 business days.',
      pl: 'Twoja wypłata jest przetwarzana. Powinna dotrzeć w ciągu 2-3 dni roboczych.'
    },
    defaultScreen: 'WALLET',
    priority: 'NORMAL'
  },
  
  PAYOUT_COMPLETED: {
    type: 'PAYOUT_COMPLETED',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Payout Completed ✓',
      pl: 'Wypłata Zakończona ✓'
    },
    body: {
      en: 'Your payout has been completed successfully. Check your bank account.',
      pl: 'Twoja wypłata została zakończona pomyślnie. Sprawdź konto bankowe.'
    },
    defaultScreen: 'WALLET',
    priority: 'NORMAL'
  },
  
  PAYOUT_FAILED_CONTACT_SUPPORT: {
    type: 'PAYOUT_FAILED_CONTACT_SUPPORT',
    category: 'TRANSACTIONAL',
    title: {
      en: 'Payout Issue',
      pl: 'Problem z Wypłatą'
    },
    body: {
      en: 'We couldn\'t complete your payout. Please contact support for assistance.',
      pl: 'Nie mogliśmy dokończyć wypłaty. Skontaktuj się z obsługą, aby uzyskać pomoc.'
    },
    defaultScreen: 'WALLET',
    priority: 'HIGH'
  },
  
  // ========================================
  // Safety
  // ========================================
  
  PANIC_BUTTON_FOLLOWUP: {
    type: 'PANIC_BUTTON_FOLLOWUP',
    category: 'SAFETY',
    title: {
      en: 'Safety Check-In',
      pl: 'Sprawdzenie Bezpieczeństwa'
    },
    body: {
      en: 'We\'re here for you. Check our safety resources or contact support.',
      pl: 'Jesteśmy tutaj dla Ciebie. Sprawdź nasze zasoby bezpieczeństwa lub skontaktuj się z obsługą.'
    },
    defaultScreen: 'SAFETY_CENTER',
    priority: 'HIGH'
  },
  
  ACCOUNT_UNDER_REVIEW: {
    type: 'ACCOUNT_UNDER_REVIEW',
    category: 'SAFETY',
    title: {
      en: 'Account Under Review',
      pl: 'Konto w Przeglądzie'
    },
    body: {
      en: 'Your account is being reviewed. We\'ll update you soon.',
      pl: 'Twoje konto jest przeglądane. Wkrótce Cię zaktualizujemy.'
    },
    defaultScreen: 'SAFETY_CENTER',
    priority: 'HIGH'
  },
  
  ACCOUNT_RESTORED: {
    type: 'ACCOUNT_RESTORED',
    category: 'SAFETY',
    title: {
      en: 'Account Restored',
      pl: 'Konto Przywrócone'
    },
    body: {
      en: 'Your account has been restored. Welcome back to Avalo!',
      pl: 'Twoje konto zostało przywrócone. Witaj z powrotem w Avalo!'
    },
    defaultScreen: 'PROFILE',
    priority: 'HIGH'
  },
  
  ACCOUNT_BANNED: {
    type: 'ACCOUNT_BANNED',
    category: 'SAFETY',
    title: {
      en: 'Account Suspended',
      pl: 'Konto Zawieszone'
    },
    body: {
      en: 'Your account has been suspended due to policy violations. Contact support for details.',
      pl: 'Twoje konto zostało zawieszone z powodu naruszeń zasad. Skontaktuj się z obsługą, aby uzyskać szczegóły.'
    },
    defaultScreen: 'SAFETY_CENTER',
    priority: 'HIGH'
  },
  
  SAFETY_WARNING: {
    type: 'SAFETY_WARNING',
    category: 'SAFETY',
    title: {
      en: 'Safety Notice',
      pl: 'Ostrzeżenie Bezpieczeństwa'
    },
    body: {
      en: 'Important safety information. Please review our safety guidelines.',
      pl: 'Ważne informacje dotyczące bezpieczeństwa. Przejrzyj nasze wytyczne bezpieczeństwa.'
    },
    defaultScreen: 'SAFETY_CENTER',
    priority: 'HIGH'
  },
  
  // ========================================
  // Growth - Activation
  // ========================================
  
  GROWTH_ACTIVATION_PHOTOS: {
    type: 'GROWTH_ACTIVATION_PHOTOS',
    category: 'GROWTH',
    title: {
      en: 'Add Photos to Your Profile',
      pl: 'Dodaj Zdjęcia do Profilu'
    },
    body: {
      en: 'Add 2-3 clear photos to get noticed faster and make connections.',
      pl: 'Dodaj 2-3 wyraźne zdjęcia, aby szybciej być zauważonym i nawiązywać kontakty.'
    },
    defaultScreen: 'PROFILE',
    priority: 'NORMAL'
  },
  
  GROWTH_ACTIVATION_PROFILE: {
    type: 'GROWTH_ACTIVATION_PROFILE',
    category: 'GROWTH',
    title: {
      en: 'Complete Your Profile',
      pl: 'Uzupełnij Swój Profil'
    },
    body: {
      en: 'Complete your profile so people know who you are and what you\'re looking for.',
      pl: 'Uzupełnij profil, aby ludzie wiedzieli, kim jesteś i czego szukasz.'
    },
    defaultScreen: 'PROFILE',
    priority: 'NORMAL'
  },
  
  GROWTH_ACTIVATION_VERIFICATION: {
    type: 'GROWTH_ACTIVATION_VERIFICATION',
    category: 'GROWTH',
    title: {
      en: 'Verify Your Account',
      pl: 'Zweryfikuj Swoje Konto'
    },
    body: {
      en: 'Verify your account to start chatting and booking meetings with confidence.',
      pl: 'Zweryfikuj swoje konto, aby zacząć rozmawiać i rezerwować spotkania z pewnością.'
    },
    defaultScreen: 'VERIFICATION',
    priority: 'NORMAL'
  },
  
  GROWTH_ACTIVATION_FIRST_SWIPE: {
    type: 'GROWTH_ACTIVATION_FIRST_SWIPE',
    category: 'GROWTH',
    title: {
      en: 'Start Exploring',
      pl: 'Zacznij Eksplorować'
    },
    body: {
      en: 'Discover interesting people near you. Start swiping now!',
      pl: 'Odkryj ciekawych ludzi w pobliżu. Zacznij przeglądać teraz!'
    },
    defaultScreen: 'SWIPE',
    priority: 'NORMAL'
  },
  
  // ========================================
  // Growth - Retention
  // ========================================
  
  GROWTH_RETENTION_NEW_PEOPLE: {
    type: 'GROWTH_RETENTION_NEW_PEOPLE',
    category: 'GROWTH',
    title: {
      en: 'New People Nearby',
      pl: 'Nowi Ludzie w Pobliżu'
    },
    body: {
      en: 'New people joined near you. Check out who appeared and connect!',
      pl: 'Nowi ludzie dołączyli w Twojej okolicy. Sprawdź, kto się pojawił i nawiąż kontakt!'
    },
    defaultScreen: 'SWIPE',
    priority: 'LOW'
  },
  
  GROWTH_RETENTION_UNSEEN_LIKES: {
    type: 'GROWTH_RETENTION_UNSEEN_LIKES',
    category: 'GROWTH',
    title: {
      en: 'You Have Unseen Likes',
      pl: 'Masz Nieprzejrzane Polubienia'
    },
    body: {
      en: 'People are interested in you. Check your likes and matches!',
      pl: 'Ludzie są Tobą zainteresowani. Sprawdź swoje polubienia i dopasowania!'
    },
    defaultScreen: 'SWIPE',
    priority: 'LOW'
  },
  
  GROWTH_RETENTION_AI_WAITING: {
    type: 'GROWTH_RETENTION_AI_WAITING',
    category: 'GROWTH',
    title: {
      en: 'Your AI Companion Awaits',
      pl: 'Twój Towarzysz AI Czeka'
    },
    body: {
      en: 'Your AI companion is waiting for you. Continue where you left off.',
      pl: 'Twój towarzysz AI czeka na Ciebie. Kontynuuj, gdzie skończyłeś.'
    },
    defaultScreen: 'CHAT',
    priority: 'LOW'
  },
  
  GROWTH_RETENTION_COMEBACK: {
    type: 'GROWTH_RETENTION_COMEBACK',
    category: 'GROWTH',
    title: {
      en: 'We Miss You!',
      pl: 'Tęsknimy!'
    },
    body: {
      en: 'Come back to Avalo. New features and people are waiting for you.',
      pl: 'Wróć do Avalo. Nowe funkcje i ludzie czekają na Ciebie.'
    },
    defaultScreen: 'SWIPE',
    priority: 'LOW'
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get template by notification type
 */
export function getTemplate(type: NotificationType): NotificationTemplate {
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template) {
    throw new Error(`No template found for notification type: ${type}`);
  }
  return template;
}

/**
 * Get localized text from a template
 */
export function getLocalizedText(
  localizedText: Record<string, string>,
  language: string
): string {
  // Try exact language match
  if (localizedText[language]) {
    return localizedText[language];
  }
  
  // Try base language (e.g., 'en' from 'en-US')
  const baseLanguage = language.split('-')[0];
  if (localizedText[baseLanguage]) {
    return localizedText[baseLanguage];
  }
  
  // Fallback to English
  if (localizedText['en']) {
    return localizedText['en'];
  }
  
  // Last resort: return first available translation
  const firstKey = Object.keys(localizedText)[0];
  return localizedText[firstKey] || '';
}