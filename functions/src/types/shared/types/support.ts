import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Stub types for support
export interface SupportTicket  {
  id: string;
  userId: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: any;
  [key: string]: any;
}

export interface SupportResponse  {
  ticketId: string;
  message: string;
  responderId: string;
  createdAt: any;
  [key: string]: any;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Additional types needed by pack300-support-functions.ts

export type TicketType = 
  | 'GENERAL'
  | 'BILLING'
  | 'TECHNICAL'
  | 'SAFETY'
  | 'ACCOUNT'
  | 'REPORT'
  | 'FEEDBACK';

export interface SupportTicketMessage  {
  id?: string;
  messageId?: string;
  ticketId?: any;
  senderId?: string;
  authorId?: any;
  senderType?: 'USER' | 'AGENT' | 'SYSTEM';
  authorType?: string;
  content?: string;
  body?: any;
  attachments?: string[];
  createdAt?: any;
  internal?: any;
  [key: string]: any;
}

export interface CreateTicketRequest  {
  userId: string;
  type: TicketType;
  subject: string;
  description: string;
  priority?: TicketPriority;
  attachments?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface CreateTicketResponse  {
  success: boolean;
  ticketId?: string;
  message?: string;
  error?: any;
  [key: string]: any;
}

export interface AddMessageRequest  {
  ticketId: string;
  senderId: string;
  senderType: 'USER' | 'AGENT' | 'SYSTEM';
  content: string;
  attachments?: string[];
  [key: string]: any;
}

export interface AddMessageResponse  {
  success: boolean;
  messageId?: string;
  message?: string;
  error?: any;
  [key: string]: any;
}

export interface UpdateTicketRequest  {
  ticketId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface UpdateTicketResponse  {
  success: boolean;
  message?: string;
  [key: string]: any;
}

export function getAutoPriority(type: TicketType): TicketPriority {
  switch (type) {
    case 'SAFETY':
    case 'REPORT':
      return 'HIGH';
    case 'BILLING':
    case 'ACCOUNT':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}




























