/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Distributed Tracing
 * 
 * Trace context and hooks for critical flows.
 * Not full distributed tracing, but trace IDs for correlation and future APM integration.
 */

import { v4 as uuidv4 } from "uuid";
import * as admin from "firebase-admin";

/**
 * Trace context for correlating related operations
 */
export interface TraceContext {
  /** Unique trace identifier */
  traceId: string;
  
  /** Span identifier (optional for nested operations) */
  spanId?: string;
  
  /** Parent span identifier (for hierarchical traces) */
  parentSpanId?: string;
  
  /** Operation name */
  operation?: string;
  
  /** Start timestamp */
  startTime?: number;
}

/**
 * Completed trace span with timing and status
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, any>;
}

/**
 * Active traces map for tracking in-flight operations
 */
const activeTraces = new Map<string, TraceSpan>();

/**
 * Tracing configuration
 */
interface TracingConfig {
  enabled: boolean;
  persistToFirestore: boolean;
  logToConsole: boolean;
}

const DEFAULT_CONFIG: TracingConfig = {
  enabled: true,
  persistToFirestore: true,
  logToConsole: false
};

let config: TracingConfig = { ...DEFAULT_CONFIG };

/**
 * Configure tracing system
 */
export function configureTracing(newConfig: Partial<TracingConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Start a new trace for an operation
 * @example const trace = startTrace("wallet.spend");
 */
export function startTrace(operation: string, parentContext?: TraceContext): TraceContext {
  if (!config.enabled) {
    return {
      traceId: "disabled",
      spanId: "disabled"
    };
  }
  
  const traceId = parentContext?.traceId || uuidv4();
  const spanId = uuidv4();
  const startTime = Date.now();
  
  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId: parentContext?.spanId,
    operation,
    startTime
  };
  
  // Store active trace
  activeTraces.set(spanId, {
    traceId,
    spanId,
    parentSpanId: parentContext?.spanId,
    operation,
    startTime,
    endTime: 0,
    durationMs: 0,
    success: false
  });
  
  if (config.logToConsole) {
    console.log(`[TRACE:START] ${operation} - traceId=${traceId} spanId=${spanId}`);
  }
  
  return context;
}

/**
 * End a trace with success/failure status
 * @example endTrace(trace, true);
 */
export async function endTrace(
  ctx: TraceContext,
  success: boolean,
  errorCode?: string,
  metadata?: Record<string, any>
): Promise<void> {
  if (!config.enabled || !ctx.spanId) return;
  
  const endTime = Date.now();
  const span = activeTraces.get(ctx.spanId);
  
  if (!span) {
    console.warn(`[TRACE] Span not found: ${ctx.spanId}`);
    return;
  }
  
  // Complete the span
  span.endTime = endTime;
  span.durationMs = endTime - span.startTime;
  span.success = success;
  span.errorCode = errorCode;
  span.metadata = metadata;
  
  if (config.logToConsole) {
    const status = success ? "✓" : "✗";
    console.log(
      `[TRACE:END] ${status} ${span.operation} - ${span.durationMs}ms - traceId=${ctx.traceId} spanId=${ctx.spanId}`
    );
  }
  
  // Persist to Firestore
  if (config.persistToFirestore) {
    try {
      const db = admin.firestore();
      await db.collection("traces").doc(span.spanId).set(span);
    } catch (error) {
      console.error("[TRACE] Failed to persist trace:", error);
    }
  }
  
  // Remove from active traces
  activeTraces.delete(ctx.spanId);
}

/**
 * Wrap an async function with automatic tracing
 * @example 
 * const result = await traceOperation("wallet.spend", async () => {
 *   return await performWalletSpend(userId, amount);
 * });
 */
export async function traceOperation<T>(
  operation: string,
  fn: (ctx: TraceContext) => Promise<T>,
  parentContext?: TraceContext
): Promise<T> {
  const ctx = startTrace(operation, parentContext);
  let success = true;
  let errorCode: string | undefined;
  
  try {
    const result = await fn(ctx);
    return result;
  } catch (error: any) {
    success = false;
    errorCode = error.code || "UNKNOWN";
    throw error;
  } finally {
    await endTrace(ctx, success, errorCode);
  }
}

/**
 * Add metadata to an active trace
 */
export function addTraceMetadata(ctx: TraceContext, metadata: Record<string, any>): void {
  if (!config.enabled || !ctx.spanId) return;
  
  const span = activeTraces.get(ctx.spanId);
  if (span) {
    span.metadata = { ...span.metadata, ...metadata };
  }
}

/**
 * Query traces with filters
 */
export async function queryTraces(filters: {
  traceId?: string;
  operation?: string;
  success?: boolean;
  startTime?: number;
  endTime?: number;
  minDuration?: number;
  maxDuration?: number;
  limit?: number;
}): Promise<TraceSpan[]> {
  const db = admin.firestore();
  let query: admin.firestore.Query = db.collection("traces");
  
  // Apply filters
  if (filters.traceId) {
    query = query.where("traceId", "==", filters.traceId);
  }
  if (filters.operation) {
    query = query.where("operation", "==", filters.operation);
  }
  if (filters.success !== undefined) {
    query = query.where("success", "==", filters.success);
  }
  if (filters.startTime) {
    query = query.where("startTime", ">=", filters.startTime);
  }
  if (filters.endTime) {
    query = query.where("endTime", "<=", filters.endTime);
  }
  if (filters.minDuration) {
    query = query.where("durationMs", ">=", filters.minDuration);
  }
  if (filters.maxDuration) {
    query = query.where("durationMs", "<=", filters.maxDuration);
  }
  
  // Order by start time descending
  query = query.orderBy("startTime", "desc");
  
  // Apply limit
  query = query.limit(filters.limit || 100);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as TraceSpan);
}

/**
 * Get a complete trace tree (all spans for a traceId)
 */
export async function getTraceTree(traceId: string): Promise<TraceSpan[]> {
  const spans = await queryTraces({ traceId, limit: 1000 });
  
  // Sort by start time to maintain operation order
  return spans.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Get active traces count (for monitoring)
 */
export function getActiveTracesCount(): number {
  return activeTraces.size;
}

/**
 * Get all active traces (for debugging)
 */
export function getActiveTraces(): TraceSpan[] {
  return Array.from(activeTraces.values());
}

/**
 * Extract trace context from HTTP headers (for distributed tracing)
 */
export function extractTraceFromHeaders(headers: Record<string, string | undefined>): TraceContext | undefined {
  const traceId = headers["x-trace-id"] || headers["traceparent"];
  const spanId = headers["x-span-id"];
  
  if (!traceId) return undefined;
  
  return {
    traceId,
    spanId
  };
}

/**
 * Inject trace context into HTTP headers (for distributed tracing)
 */
export function injectTraceIntoHeaders(ctx: TraceContext): Record<string, string> {
  return {
    "x-trace-id": ctx.traceId,
    ...(ctx.spanId && { "x-span-id": ctx.spanId })
  };
}

/**
 * Critical operations that should always be traced
 */
export const TRACED_OPERATIONS = {
  // Wallet operations
  WALLET_SPEND: "wallet.spend",
  WALLET_REFUND: "wallet.refund",
  WALLET_PAYOUT: "wallet.payout",
  
  // Chat operations
  CHAT_SEND: "chat.send",
  CHAT_RECEIVE: "chat.receive",
  
  // AI operations
  AI_REQUEST: "ai.request",
  AI_RESPONSE: "ai.response",
  
  // Safety operations
  PANIC_PRESS: "safety.panic_press",
  PANIC_PROCESS: "safety.panic_process",
  
  // Support operations
  SUPPORT_TICKET_CREATE: "support.ticket_create",
  
  // Event operations
  EVENT_BOOK: "event.book",
  EVENT_COMPLETE: "event.complete"
} as const;
