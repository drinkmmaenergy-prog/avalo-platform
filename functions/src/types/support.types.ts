/**
 * PACK 111 — White-Glove Customer Support & Priority Human Assistance
 * Type definitions for support system
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Support case categories
 */
export type SupportCategory =
  | 'TECHNICAL'           // Technical issues, bugs
  | 'BILLING'             // Payments, payouts, pricing
  | 'ACCOUNT'             // Account access, security
  | 'CONTENT'             // Content moderation questions
  | 'SAFETY'              // Safety concerns, harassment
  | 'LEGAL'               // Legal requests, compliance
  | 'FEATURE_REQUEST'     // Product feedback
  | 'OTHER';              // General inquiries

/**
 * Support case status
 */
export type SupportStatus =
  | 'OPEN'                // Newly created, awaiting assignment
  | 'ASSIGNED'            // Assigned to agent
  | 'WAITING_FOR_AGENT'   // User replied, awaiting agent
  | 'WAITING_FOR_USER'    // Agent replied, awaiting user
  | 'RESOLVED'            // Case resolved
  | 'CLOSED';             // Case closed (auto-close after 7 days)

/**
 * Support case source
 */
export type SupportSource =
  | 'IN_APP'              // Mobile app
  | 'WEB'                 // Web application
  | 'EMAIL'               // Email support
  | 'ESCALATION';         // Escalated from other system

/**
 * Support priority levels
 */
export type SupportPriority =
  | 'CRITICAL'            // Self-harm, threats, legal, underage
  | 'HIGH'                // Payout errors, KYC issues, security breach
  | 'NORMAL';             // Standard support request

/**
 * Platform types
 */
export type SupportPlatform =
  | 'android'
  | 'ios'
  | 'web'
  | 'unknown';

/**
 * Support message in a case
 */
export interface SupportMessage {
  messageId: string;
  fromUserId: string | null;         // null for agent messages
  fromAgentId: string | null;        // null for user messages
  message: string;
  originalLanguage: string;          // ISO language code
  translatedVersions?: Record<string, string>; // translations
  timestamp: Timestamp;
  attachments?: string[];            // URLs to attachments
  isInternal?: boolean;              // Internal agent notes
}

/**
 * Case resolution details
 */
export interface CaseResolution {
  resolvedAt: Timestamp;
  resolvedBy: string;                // agentId
  resolutionCategory: string;        // 'FIXED' | 'EXPLAINED' | 'NO_ACTION_NEEDED' | 'ESCALATED'
  resolutionNotes: string;
  userSatisfied?: boolean;           // User feedback
}

/**
 * Support case document
 */
export interface SupportCase {
  caseId: string;
  userId: string;
  category: SupportCategory;
  status: SupportStatus;
  source: SupportSource;
  language: string;                  // ISO language code
  platform: SupportPlatform;
  priority: SupportPriority;
  assignedTo: string | null;         // agentId
  subject: string;                   // Brief description
  messages: SupportMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUserMessage: Timestamp;
  lastAgentMessage: Timestamp | null;
  resolution: CaseResolution | null;
  metadata: {
    deviceInfo?: string;
    appVersion?: string;
    userId?: string;
    accountType?: string;            // 'BASIC' | 'VIP' | 'ROYAL'
    userEmail?: string;
    userName?: string;
    aiTriageFlags?: string[];        // Flags from AI triage
  };
  tags?: string[];                   // For categorization
  relatedCaseIds?: string[];         // Related support cases
}

/**
 * AI triage result
 */
export interface AITriageResult {
  category: SupportCategory;
  priority: SupportPriority;
  needsHumanReview: boolean;
  forwardToHumanImmediately: boolean;
  detectedFlags: {
    safetyRisk?: boolean;            // Self-harm, threats, etc.
    minorRisk?: boolean;             // Possible underage user
    financialRegulated?: boolean;    // Payout, KYC issues
    enforcementContest?: boolean;    // Appeal of suspension
    legalRequest?: boolean;          // Law enforcement, subpoena
  };
  suggestedResponse?: string;        // AI-generated draft (agent review required)
  confidence: number;                // 0-1 confidence score
  reasoningNotes: string;
}

/**
 * Support audit log entry
 */
export interface SupportAuditLog {
  logId: string;
  action: SupportAuditAction;
  actorId: string;                   // userId or agentId
  actorType: 'USER' | 'AGENT' | 'SYSTEM';
  caseId: string;
  timestamp: Timestamp;
  metadata: Record<string, any>;
  ipAddress?: string;
}

/**
 * Audit actions
 */
export type SupportAuditAction =
  | 'CASE_CREATED'
  | 'CASE_ASSIGNED'
  | 'CASE_REASSIGNED'
  | 'MESSAGE_SENT'
  | 'CASE_RESOLVED'
  | 'CASE_CLOSED'
  | 'CASE_REOPENED'
  | 'PRIORITY_CHANGED'
  | 'CATEGORY_CHANGED'
  | 'STATUS_CHANGED'
  | 'TAG_ADDED'
  | 'NOTE_ADDED';

/**
 * Support agent profile
 */
export interface SupportAgent {
  agentId: string;
  email: string;
  displayName: string;
  languages: string[];               // ISO language codes
  specializations: SupportCategory[];
  isActive: boolean;
  currentCaseLoad: number;
  maxCaseLoad: number;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

/**
 * Support statistics
 */
export interface SupportStats {
  totalCases: number;
  openCases: number;
  resolvedCases: number;
  avgResponseTime: number;           // Minutes
  avgResolutionTime: number;         // Minutes
  satisfactionRate: number;          // 0-1
  byCategory: Record<SupportCategory, number>;
  byPriority: Record<SupportPriority, number>;
}

/**
 * Support template message
 */
export interface SupportTemplate {
  templateId: string;
  name: string;
  category: SupportCategory;
  language: string;
  subject: string;
  body: string;
  variables?: string[];              // Variables like {userName}, {caseId}
  isActive: boolean;
}

/**
 * Support configuration
 */
export interface SupportConfig {
  maxCasesPerUser: number;           // Rate limiting
  autoCloseAfterDays: number;        // Auto-close resolved cases
  priorityResponseTimes: {           // Target response times in minutes
    CRITICAL: number;
    HIGH: number;
    NORMAL: number;
  };
  vipQueueBoost: boolean;            // VIP/Royal faster queue
  languagesSupported: string[];
  crisisResources: Record<string, {  // Region-specific crisis resources
    country: string;
    hotline: string;
    website: string;
  }>;
}