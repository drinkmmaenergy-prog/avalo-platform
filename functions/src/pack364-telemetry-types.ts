/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Telemetry Types & Model
 * 
 * Defines unified event schema for product & infrastructure telemetry.
 * Rules:
 * - No raw PII (no names, emails, messages, photos)
 * - Only IDs, codes, durations, flags
 */

/**
 * Telemetry domains representing different parts of the Avalo platform
 */
export type TelemetryDomain =
  | "auth"
  | "chat"
  | "ai"
  | "wallet"
  | "calendar"
  | "events"
  | "support"
  | "safety"
  | "infra";

/**
 * Telemetry severity levels
 */
export type TelemetryLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

/**
 * Actor types that can generate telemetry events
 */
export type TelemetryActorType = "user" | "system" | "admin";

/**
 * Core telemetry event structure
 * All telemetry events must conform to this interface
 */
export interface TelemetryEvent {
  /** Unique event identifier */
  id: string;
  
  /** Event timestamp (Unix milliseconds) */
  ts: number;
  
  /** Domain/category of the event */
  domain: TelemetryDomain;
  
  /** Severity level */
  level: TelemetryLevel;
  
  /** Type of actor generating the event */
  actorType: TelemetryActorType;
  
  /** Actor identifier (user ID, system name, admin ID) */
  actorId?: string;
  
  /** Session identifier for correlation */
  sessionId?: string;
  
  /** Operation identifier (e.g., "chat.send", "wallet.spend", "event.book") */
  operation: string;
  
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Operation latency in milliseconds */
  latencyMs?: number;
  
  /** Error code if operation failed */
  errorCode?: string;
  
  /** Additional metadata (sanitized, non-PII) */
  metadata?: Record<string, any>;
}

/**
 * SLO (Service Level Objective) definition
 */
export interface SLODefinition {
  /** Unique SLO identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Associated domain */
  domain: TelemetryDomain;
  
  /** Metric being measured */
  metric: string;
  
  /** Target value (e.g., 99.5 for 99.5% availability) */
  target: number;
  
  /** Unit of measurement (e.g., "percent", "milliseconds") */
  unit: "percent" | "milliseconds" | "count";
  
  /** Error budget percentage */
  errorBudgetPercent: number;
  
  /** Time window in days */
  windowDays: number;
  
  /** Description of what this SLO measures */
  description: string;
}

/**
 * Error budget status
 */
export interface ErrorBudgetStatus {
  /** Associated SLO ID */
  sloId: string;
  
  /** Current error budget consumption (0-100%) */
  consumedPercent: number;
  
  /** Remaining error budget (0-100%) */
  remainingPercent: number;
  
  /** Status health indicator */
  status: "healthy" | "warning" | "critical";
  
  /** Time window start (Unix ms) */
  windowStart: number;
  
  /** Time window end (Unix ms) */
  windowEnd: number;
  
  /** Number of incidents in window */
  incidentCount: number;
}

/**
 * Predefined SLO definitions for core domains
 */
export const CORE_SLOS: SLODefinition[] = [
  {
    id: "slo_chat_delivery",
    name: "Chat Delivery SLO",
    domain: "chat",
    metric: "p95_latency",
    target: 300,
    unit: "milliseconds",
    errorBudgetPercent: 0.5,
    windowDays: 30,
    description: "P95 chat.send latency < 300ms, availability ≥ 99.5%"
  },
  {
    id: "slo_wallet_operations",
    name: "Wallet Operations SLO",
    domain: "wallet",
    metric: "success_rate",
    target: 99.8,
    unit: "percent",
    errorBudgetPercent: 0.2,
    windowDays: 30,
    description: "Success rate of wallet operations ≥ 99.8%"
  },
  {
    id: "slo_panic_safety",
    name: "Panic/Safety SLO",
    domain: "safety",
    metric: "p95_latency",
    target: 2000,
    unit: "milliseconds",
    errorBudgetPercent: 0.1,
    windowDays: 30,
    description: "P95 panic event processing < 2s, 100% success"
  },
  {
    id: "slo_ai_companions",
    name: "AI Companions SLO",
    domain: "ai",
    metric: "p95_latency",
    target: 2500,
    unit: "milliseconds",
    errorBudgetPercent: 1.0,
    windowDays: 30,
    description: "P95 AI response completion < 2.5s"
  },
  {
    id: "slo_support_system",
    name: "Support System SLO",
    domain: "support",
    metric: "availability",
    target: 99.9,
    unit: "percent",
    errorBudgetPercent: 0.1,
    windowDays: 30,
    description: "Support APIs uptime ≥ 99.9%"
  },
  {
    id: "slo_api_overall",
    name: "API Overall SLO",
    domain: "infra",
    metric: "error_rate",
    target: 1.0,
    unit: "percent",
    errorBudgetPercent: 1.0,
    windowDays: 30,
    description: "API error rate (5xx) ≤ 1% over rolling 30 days"
  }
];

/**
 * Common operation identifiers for telemetry
 */
export const TELEMETRY_OPERATIONS = {
  // Auth operations
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_SIGNUP: "auth.signup",
  AUTH_REFRESH: "auth.refresh",
  
  // Chat operations
  CHAT_SEND: "chat.send",
  CHAT_RECEIVE: "chat.receive",
  CHAT_DELETE: "chat.delete",
  CHAT_EDIT: "chat.edit",
  
  // AI operations
  AI_REQUEST: "ai.request",
  AI_RESPONSE: "ai.response",
  AI_STREAM: "ai.stream",
  AI_ERROR: "ai.error",
  
  // Wallet operations
  WALLET_SPEND: "wallet.spend",
  WALLET_REFUND: "wallet.refund",
  WALLET_PAYOUT_REQUEST: "wallet.payout_request",
  WALLET_BALANCE_CHECK: "wallet.balance_check",
  
  // Calendar operations
  CALENDAR_VIEW: "calendar.view",
  CALENDAR_SLOT_CREATE: "calendar.slot_create",
  CALENDAR_SLOT_DELETE: "calendar.slot_delete",
  
  // Event operations
  EVENT_BOOK: "event.book",
  EVENT_CANCEL: "event.cancel",
  EVENT_COMPLETE: "event.complete",
  
  // Support operations
  SUPPORT_TICKET_CREATE: "support.ticket_create",
  SUPPORT_TICKET_REPLY: "support.ticket_reply",
  SUPPORT_TICKET_CLOSE: "support.ticket_close",
  
  // Safety operations
  PANIC_PRESS: "safety.panic_press",
  PANIC_PROCESS: "safety.panic_process",
  BLOCK_USER: "safety.block_user",
  REPORT_USER: "safety.report_user"
} as const;

/**
 * Common error codes for telemetry
 */
export const TELEMETRY_ERROR_CODES = {
  // Generic errors
  UNKNOWN: "ERR_UNKNOWN",
  TIMEOUT: "ERR_TIMEOUT",
  NETWORK: "ERR_NETWORK",
  
  // Auth errors
  AUTH_INVALID: "ERR_AUTH_INVALID",
  AUTH_EXPIRED: "ERR_AUTH_EXPIRED",
  
  // Validation errors
  VALIDATION_FAILED: "ERR_VALIDATION_FAILED",
  INVALID_INPUT: "ERR_INVALID_INPUT",
  
  // Resource errors
  NOT_FOUND: "ERR_NOT_FOUND",
  ALREADY_EXISTS: "ERR_ALREADY_EXISTS",
  
  // Permission errors
  FORBIDDEN: "ERR_FORBIDDEN",
  UNAUTHORIZED: "ERR_UNAUTHORIZED",
  
  // Rate limiting
  RATE_LIMITED: "ERR_RATE_LIMITED",
  
  // Wallet errors
  INSUFFICIENT_FUNDS: "ERR_INSUFFICIENT_FUNDS",
  PAYMENT_FAILED: "ERR_PAYMENT_FAILED",
  
  // AI errors
  AI_TIMEOUT: "ERR_AI_TIMEOUT",
  AI_OVERLOADED: "ERR_AI_OVERLOADED",
  
  // Infrastructure errors
  DB_ERROR: "ERR_DB_ERROR",
  STORAGE_ERROR: "ERR_STORAGE_ERROR",
  SERVICE_UNAVAILABLE: "ERR_SERVICE_UNAVAILABLE"
} as const;
