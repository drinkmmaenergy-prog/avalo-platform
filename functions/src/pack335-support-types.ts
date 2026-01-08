/**
 * PACK 335: User Support System - Type Definitions
 * Shared types for support ticket system
 */

export type TicketType =
  | "TECHNICAL"
  | "PAYMENT"
  | "REFUND_DISPUTE"
  | "IDENTITY_VERIFICATION"
  | "SAFETY"
  | "ACCOUNT_ACCESS"
  | "OTHER";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED" | "CLOSED";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type ResolutionCode =
  | "REFUND_GRANTED"
  | "REFUND_PARTIAL"
  | "REFUND_DENIED"
  | "ACCOUNT_UNLOCKED"
  | "ACCOUNT_BANNED"
  | "INFO_PROVIDED"
  | "FORWARDED_TO_KYC"
  | "FORWARDED_TO_FRAUD"
  | "OTHER";

export type MessageSenderType = "USER" | "AGENT" | "SYSTEM";

export type FaqCategory =
  | "ACCOUNT"
  | "PAYMENTS"
  | "TOKENS"
  | "REFUNDS"
  | "SAFETY"
  | "VERIFICATION"
  | "AI"
  | "OTHER";

export interface TicketContext {
  relatedChatId?: string;
  relatedBookingId?: string;
  relatedEventId?: string;
  relatedTransactionId?: string;
  relatedUserId?: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  type: TicketType;
  context: TicketContext;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  lastUserMessageAt?: FirebaseFirestore.Timestamp;
  lastAgentMessageAt?: FirebaseFirestore.Timestamp;
  resolutionSummary?: string;
  resolutionCode?: ResolutionCode;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderType: MessageSenderType;
  senderUserId?: string;
  agentId?: string;
  messageText: string;
  attachments?: string[];
  createdAt: FirebaseFirestore.Timestamp;
}

export interface SupportFaqArticle {
  id: string;
  title: string;
  bodyMarkdown: string;
  category: FaqCategory;
  tags: string[];
  language: string;
  isPublished: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface SupportSystemSettings {
  id: "GLOBAL";
  maxOpenTicketsPerUser: number;
  autoCloseAfterDays: number;
  refundDisputeWindowDays: number;
  aiAssistantEnabled: boolean;
}

export interface CreateTicketRequest {
  userId: string;
  type: TicketType;
  context: TicketContext;
  initialMessage: string;
  attachments?: string[];
}

export interface AddMessageRequest {
  ticketId: string;
  messageText: string;
  attachments?: string[];
}

export interface UpdateTicketStatusRequest {
  ticketId: string;
  status: TicketStatus;
  resolutionSummary?: string;
  resolutionCode?: ResolutionCode;
}

export interface RefundDisputeContext {
  ticketId: string;
  transactionId?: string;
  chatId?: string;
  bookingId?: string;
  eventId?: string;
}

export interface AiSupportRequest {
  userId: string;
  message: string;
  locale: string;
}

export interface AiSupportResponse {
  answer: string;
  relatedFaqs: string[];
  suggestedActions?: string[];
}