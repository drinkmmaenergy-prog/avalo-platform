// Stub types for support-300b
export interface SupportArticle  {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  [key: string]: any;
}

export interface FAQEntry  {
  question: string;
  answer: string;
  category: string;
  [key: string]: any;
}

// Additional types needed by pack300-support-functions.ts

export interface SupportTicketExtended  {
  id?: string;
  ticketId?: string;
  userId?: any;
  type?: any;
  subject?: any;
  description?: any;
  status?: any;
  priority?: any;
  assignedTo?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  safetyMetadata?: SafetyTicketMetadata;
  messages?: any[];
  createdAt?: any;
  updatedAt?: any;
  lastMessageAt?: any;
  resolvedAt?: any;
  related?: any;
  userLocale?: any;
  userCountry?: any;
  safety?: any;
  [key: string]: any;
}

export interface SafetyTicketMetadata  {
  reportedUserId?: string;
  reportType?: string;
  severity?: string;
  evidencUSDls?: string[];
  autoDetected?: boolean;
  aiAnalysis?: Record<string, any>;
  safetyType?: string;
  autoClassified?: boolean;
  isSafety?: boolean;
  reportId?: string;
  keywords?: string[];
  [key: string]: any;
}

export interface AccountActionRequest  {
  ticketId: string;
  targetUserId: string;
  action: AccountActionType;
  reason: string;
  duration?: number; // in hours for temporary actions
  metadata?: Record<string, any>;
  [key: string]: any;
}

export type AccountActionType = 
  | 'WARN'
  | 'RESTRICT'
  | 'SUSPEND'
  | 'BAN'
  | 'UNBAN'
  | 'VERIFY'
  | 'RESET_PASSWORD';

export interface AccountActionResponse  {
  success: boolean;
  actionId?: string;
  message?: string;
  error?: any;
  [key: string]: any;
}

export interface AccountActionRecord  {
  id?: string;
  actionId?: string;
  ticketId?: any;
  targetUserId?: string;
  userId?: any;
  performedBy?: string;
  adminId?: any;
  action?: any;
  reason?: any;
  duration?: any;
  metadata?: Record<string, any>;
  createdAt?: any;
  expiresAt?: any;
  [key: string]: any;
}

export interface AssignTicketRequest  {
  ticketId: string;
  agentId: string;
  notes?: string;
  [key: string]: any;
}

export interface AssignTicketResponse  {
  success: boolean;
  message?: string;
  [key: string]: any;
}

export interface EscalateTicketRequest  {
  ticketId: string;
  escalationLevel: number;
  reason: string;
  targetTeam?: string;
  [key: string]: any;
}

export interface EscalateTicketResponse  {
  success: boolean;
  newPriority: string;
  message?: string;
  [key: string]: any;
}

export interface BulkTicketUpdateRequest  {
  ticketIds: string[];
  status?: string;
  priority?: string;
  assignedTo?: string;
  tags?: string[];
  [key: string]: any;
}

export interface BulkTicketUpdateResponse  {
  success: boolean;
  updatedCount: number;
  failedIds: string[];
  message?: string;
  [key: string]: any;
}

export interface TicketSearchRequest  {
  query?: string;
  status?: string[];
  priority?: string[];
  type?: string[];
  assignedTo?: string;
  userId?: string;
  dateFrom?: any;
  dateTo?: any;
  limit?: number;
  offset?: number;
  [key: string]: any;
}

export interface TicketSearchResponse  {
  tickets: SupportTicketExtended[];
  total: number;
  hasMore: boolean;
  [key: string]: any;
}

export interface TicketStatsRequest  {
  dateFrom?: any;
  dateTo?: any;
  groupBy?: 'day' | 'week' | 'month';
  [key: string]: any;
}

export interface TicketStatsResponse  {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  avgResolutionTimeHours: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  timeline: TicketStatPoint[];
  [key: string]: any;
}

export interface TicketStatPoint  {
  date: string;
  created: number;
  resolved: number;
  [key: string]: any;
}


// Additional types
export interface SupportMetrics  {
  totalTickets?: number;
  openTickets?: number;
  inProgressTickets?: number;
  resolvedTickets?: number;
  resolvedToday?: number;
  safetyTickets?: number;
  avgResolutionTimeHours?: number;
  averageResponseTime?: number;
  averageResolutionTime?: number;
  slaBreaches?: number;
  satisfactionScore?: number;
  ticketsByType?: any;
  ticketsByPriority?: any;
  timestamp?: string;
  [key: string]: any;
}

export function classifyTicketSafety(
  ticketType: string,
  description: string,
  related: Record<string, any>,
  fromPanic: boolean
): SafetyTicketMetadata | null {
  // Panic button always triggers CRITICAL
  if (fromPanic) {
    return {
      severity: 'CRITICAL',
      safetyType: 'PANIC',
      autoClassified: true,
      isSafety: true,
    };
  }

  // Check for violence/danger keywords
  const criticalKeywords = ['violence', 'threatening', 'danger', 'emergency', 'stalking', 'kill', 'hurt', 'attack'];
  const highKeywords = ['harassing', 'harassment', 'abuse', 'unsafe', 'scared'];
  
  const lowerDesc = description.toLowerCase();
  
  const hasCritical = criticalKeywords.some(kw => lowerDesc.includes(kw));
  const hasHigh = highKeywords.some(kw => lowerDesc.includes(kw));
  
  // Safety ticket types
  const safetyTypes = ['SAFETY_REPORT_FOLLOWUP', 'HARASSMENT_REPORT', 'ABUSE_REPORT'];
  const isSafetyType = safetyTypes.includes(ticketType);
  
  if (hasCritical) {
    return {
      severity: 'CRITICAL',
      autoClassified: true,
      isSafety: true,
      reportId: related?.reportId,
    };
  }
  
  if (hasHigh || isSafetyType) {
    return {
      severity: 'HIGH',
      autoClassified: true,
      isSafety: true,
      reportId: related?.reportId,
    };
  }
  
  return null;
}

export interface NotificationIntegrationPayload  {
  type?: string;
  ticketId?: string;
  userId?: string;
  message?: string;
  subject?: string;
  priority?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface AuditIntegrationPayload  {
  action?: string;
  ticketId?: string;
  performedBy?: string;
  timestamp?: any;
  eventType?: string;
  actorId?: string;
  actorType?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface RiskIntegrationPayload  {
  ticketId?: string;
  riskLevel?: string;
  riskFactors?: string[];
  recommendedAction?: string;
  userId?: string;
  riskType?: string;
  severity?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}









