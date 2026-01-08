// AUTO-GENERATED STUB FOR MVP BUILD FIX
// Ticket types and enums

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function getStatusColor(status: TicketStatus): string {
  return '#6B7280';
}

export function getPriorityColor(priority: TicketPriority): string {
  return '#6B7280';
}

export function formatTicketId(id: string): string {
  return id;
}

export interface Ticket {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  description: string;
  [key: string]: any;
}

export interface CreateTicketRequest {
  subject: string;
  description: string;
  priority?: TicketPriority;
}

export interface CreateTicketResponse {
  ticketId: string;
  success: boolean;
}

export interface HelpArticle {
  articleId: string;
  title: string;
  content: string;
  category: ArticleCategory;
}

export enum ArticleCategory {
  GENERAL = 'general',
  ACCOUNT = 'account',
  BILLING = 'billing',
  TECHNICAL = 'technical',
}

export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  [ArticleCategory.GENERAL]: 'General',
  [ArticleCategory.ACCOUNT]: 'Account',
  [ArticleCategory.BILLING]: 'Billing',
  [ArticleCategory.TECHNICAL]: 'Technical',
};

export interface EducationCard {
  id: string;
  title: string;
  content: string;
  ctaType: string;
  ctaPayload: any;
}

export function shouldShowEducationCard(card: EducationCard): boolean {
  return false;
}
