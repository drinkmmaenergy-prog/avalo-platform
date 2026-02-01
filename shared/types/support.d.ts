export interface SupportTicket {
    id: string;
    userId: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    createdAt: any;
}
export interface SupportResponse {
    ticketId: string;
    message: string;
    responderId: string;
    createdAt: any;
}
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
