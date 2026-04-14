import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

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




























