/**
 * Support Service for Avalo Mobile App
 * 
 * Handles creating and managing support tickets.
 * Integrates with backend support functions (PACK 68).
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type SupportCategory =
  | 'ACCOUNT'
  | 'PAYMENTS_PAYOUTS'
  | 'TOKENS_BILLING'
  | 'SAFETY_ABUSE'
  | 'CONTENT_MODERATION'
  | 'TECHNICAL_ISSUE'
  | 'RESERVATIONS'
  | 'DISPUTES'
  | 'GDPR_PRIVACY'
  | 'OTHER';

export type SupportSeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

export interface SupportTicketSummary {
  ticketId: string;
  category: SupportCategory;
  subject: string;
  status: TicketStatus;
  severity: SupportSeverity;
  createdAt: number;
  updatedAt: number;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  description: string;
  relatedDisputeId?: string | null;
  relatedReservationId?: string | null;
  relatedPayoutRequestId?: string | null;
  relatedDeletionJobId?: string | null;
}

export interface SupportTicketMessage {
  messageId: string;
  senderType: 'USER' | 'ADMIN';
  senderId: string;
  body: string;
  createdAt: number;
  attachments?: Array<{
    type: 'IMAGE' | 'FILE' | 'OTHER';
    url: string;
    mimeType?: string | null;
  }> | null;
}

export interface HelpArticle {
  articleId: string;
  category: SupportCategory;
  title: string;
  body: string;
  locale: string;
}

export interface CreateTicketParams {
  userId: string;
  category: SupportCategory;
  subject: string;
  description: string;
  severity?: SupportSeverity;
  appVersion?: string;
  platform?: 'android' | 'ios';
  locale?: string;
  countryIso?: string;
  relatedDisputeId?: string;
  relatedReservationId?: string;
  relatedPayoutRequestId?: string;
  relatedDeletionJobId?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Create a new support ticket
 */
export async function createSupportTicket(
  params: CreateTicketParams
): Promise<{ ticketId: string; status: string }> {
  const createTicketFn = httpsCallable(functions, 'support_createTicket');
  
  const result = await createTicketFn(params);
  
  return result.data as { ticketId: string; status: string };
}

/**
 * List user's support tickets
 */
export async function listMyTickets(
  userId: string,
  limit: number = 20,
  cursor?: string
): Promise<{ tickets: SupportTicketSummary[]; nextCursor: string | null }> {
  const listTicketsFn = httpsCallable(functions, 'support_listMyTickets');
  
  const result = await listTicketsFn({
    userId,
    limit,
    cursor,
  });
  
  const data = result.data as any;
  return {
    tickets: data.tickets,
    nextCursor: data.nextCursor || null,
  };
}

/**
 * Get ticket detail with messages
 */
export async function getTicketDetail(
  userId: string,
  ticketId: string
): Promise<{ ticket: SupportTicketDetail; messages: SupportTicketMessage[] }> {
  const getDetailFn = httpsCallable(functions, 'support_getTicketDetail');
  
  const result = await getDetailFn({
    userId,
    ticketId,
  });
  
  const data = result.data as any;
  return {
    ticket: data.ticket,
    messages: data.messages,
  };
}

/**
 * Reply to a support ticket
 */
export async function replyToTicket(
  userId: string,
  ticketId: string,
  message: string
): Promise<void> {
  const replyFn = httpsCallable(functions, 'support_replyToTicket');
  
  await replyFn({
    userId,
    ticketId,
    message,
  });
}

/**
 * Get help articles
 */
export async function getHelpArticles(
  locale: string,
  category?: SupportCategory
): Promise<HelpArticle[]> {
  const getArticlesFn = httpsCallable(functions, 'support_getHelpArticles');
  
  const result = await getArticlesFn({
    locale,
    category,
  });
  
  const data = result.data as any;
  return data.articles || [];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get category display name
 */
export function getCategoryDisplayName(
  category: SupportCategory,
  locale: string = 'en'
): string {
  const translations: Record<string, Record<SupportCategory, string>> = {
    en: {
      ACCOUNT: 'Account & login',
      PAYMENTS_PAYOUTS: 'Payments & payouts',
      TOKENS_BILLING: 'Tokens & billing',
      SAFETY_ABUSE: 'Safety & abuse',
      CONTENT_MODERATION: 'Content moderation',
      TECHNICAL_ISSUE: 'Technical issues',
      RESERVATIONS: 'Reservations & meetings',
      DISPUTES: 'Disputes',
      GDPR_PRIVACY: 'Privacy & data (GDPR)',
      OTHER: 'Other',
    },
    pl: {
      ACCOUNT: 'Konto i logowanie',
      PAYMENTS_PAYOUTS: 'Płatności i wypłaty',
      TOKENS_BILLING: 'Tokeny i rozliczenia',
      SAFETY_ABUSE: 'Bezpieczeństwo i nadużycia',
      CONTENT_MODERATION: 'Moderacja treści',
      TECHNICAL_ISSUE: 'Problemy techniczne',
      RESERVATIONS: 'Rezerwacje i spotkania',
      DISPUTES: 'Spory',
      GDPR_PRIVACY: 'Prywatność i dane (RODO)',
      OTHER: 'Inne',
    },
  };

  return translations[locale]?.[category] || translations.en[category];
}

/**
 * Get status display name
 */
export function getStatusDisplayName(
  status: TicketStatus,
  locale: string = 'en'
): string {
  const translations: Record<string, Record<TicketStatus, string>> = {
    en: {
      OPEN: 'Open',
      IN_PROGRESS: 'In progress',
      WAITING_FOR_USER: 'Waiting for your reply',
      RESOLVED: 'Resolved',
      CLOSED: 'Closed',
    },
    pl: {
      OPEN: 'Otwarte',
      IN_PROGRESS: 'W trakcie',
      WAITING_FOR_USER: 'Oczekuje na Twoją odpowiedź',
      RESOLVED: 'Rozwiązane',
      CLOSED: 'Zamknięte',
    },
  };

  return translations[locale]?.[status] || translations.en[status];
}

/**
 * Get status color
 */
export function getStatusColor(status: TicketStatus): string {
  const colors: Record<TicketStatus, string> = {
    OPEN: '#FF9500',
    IN_PROGRESS: '#007AFF',
    WAITING_FOR_USER: '#FF3B30',
    RESOLVED: '#34C759',
    CLOSED: '#8E8E93',
  };

  return colors[status];
}

/**
 * Get severity display name
 */
export function getSeverityDisplayName(
  severity: SupportSeverity,
  locale: string = 'en'
): string {
  const translations: Record<string, Record<SupportSeverity, string>> = {
    en: {
      LOW: 'Low',
      NORMAL: 'Normal',
      HIGH: 'High',
      CRITICAL: 'Critical',
    },
    pl: {
      LOW: 'Niski',
      NORMAL: 'Normalny',
      HIGH: 'Wysoki',
      CRITICAL: 'Krytyczny',
    },
  };

  return translations[locale]?.[severity] || translations.en[severity];
}

/**
 * Format timestamp for display
 */
export function formatTicketDate(timestamp: number, locale: string = 'en'): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return locale === 'pl' ? 'Teraz' : 'Just now';
  } else if (diffMins < 60) {
    return locale === 'pl' ? `${diffMins} min temu` : `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return locale === 'pl' ? `${diffHours} godz. temu` : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return locale === 'pl' ? `${diffDays} dni temu` : `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Check if there are new admin replies since last view
 */
export async function hasNewReplies(
  userId: string,
  ticketId: string,
  lastAdminReplyAt?: number | null
): Promise<boolean> {
  if (!lastAdminReplyAt) {
    return false;
  }

  try {
    const key = `support_last_viewed_ticket_ts_v1_${userId}_${ticketId}`;
    const lastViewedStr = await AsyncStorage.getItem(key);
    
    if (!lastViewedStr) {
      return true; // Never viewed, assume new replies
    }

    const lastViewed = parseInt(lastViewedStr, 10);
    return lastAdminReplyAt > lastViewed;
  } catch (error) {
    console.error('[Support] Error checking new replies:', error);
    return false;
  }
}

/**
 * Mark ticket as viewed
 */
export async function markTicketAsViewed(
  userId: string,
  ticketId: string
): Promise<void> {
  try {
    const key = `support_last_viewed_ticket_ts_v1_${userId}_${ticketId}`;
    await AsyncStorage.setItem(key, Date.now().toString());
  } catch (error) {
    console.error('[Support] Error marking ticket as viewed:', error);
  }
}

/**
 * Get all categories for selection
 */
export function getAllCategories(): SupportCategory[] {
  return [
    'ACCOUNT',
    'PAYMENTS_PAYOUTS',
    'TOKENS_BILLING',
    'SAFETY_ABUSE',
    'CONTENT_MODERATION',
    'TECHNICAL_ISSUE',
    'RESERVATIONS',
    'DISPUTES',
    'GDPR_PRIVACY',
    'OTHER',
  ];
}

/**
 * Get category icon name (for display in UI)
 */
export function getCategoryIcon(category: SupportCategory): string {
  const icons: Record<SupportCategory, string> = {
    ACCOUNT: 'person',
    PAYMENTS_PAYOUTS: 'cash',
    TOKENS_BILLING: 'wallet',
    SAFETY_ABUSE: 'shield',
    CONTENT_MODERATION: 'eye',
    TECHNICAL_ISSUE: 'bug',
    RESERVATIONS: 'calendar',
    DISPUTES: 'alert-circle',
    GDPR_PRIVACY: 'lock-closed',
    OTHER: 'help-circle',
  };

  return icons[category];
}

export default {
  createSupportTicket,
  listMyTickets,
  getTicketDetail,
  replyToTicket,
  getHelpArticles,
  getCategoryDisplayName,
  getStatusDisplayName,
  getStatusColor,
  getSeverityDisplayName,
  formatTicketDate,
  hasNewReplies,
  markTicketAsViewed,
  getAllCategories,
  getCategoryIcon,
};