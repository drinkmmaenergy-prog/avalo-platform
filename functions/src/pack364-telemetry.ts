/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Telemetry Implementation
 * 
 * Core telemetry logging system with PII protection.
 * Used by: Wallet operations, Chat, AI companions, Calendar, Events, Support, Safety flows
 */

import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import {
  TelemetryEvent,
  TelemetryDomain,
  TelemetryLevel,
  TelemetryActorType,
  TELEMETRY_OPERATIONS,
  TELEMETRY_ERROR_CODES
} from "./pack364-telemetry-types";

/**
 * Telemetry configuration
 */
interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  
  /** Minimum level to log */
  minLevel: TelemetryLevel;
  
  /** Whether to log to Firestore */
  persistToFirestore: boolean;
  
  /** Whether to log to console */
  logToConsole: boolean;
  
  /** Maximum metadata size in bytes */
  maxMetadataSize: number;
  
  /** Sampling rate (0-1, 1 = log all events) */
  samplingRate: number;
}

/**
 * Default telemetry configuration
 */
const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  minLevel: "INFO",
  persistToFirestore: true,
  logToConsole: true,
  maxMetadataSize: 10000, // 10KB
  samplingRate: 1.0 // Log all events by default
};

let config: TelemetryConfig = { ...DEFAULT_CONFIG };

/**
 * Level priority for filtering
 */
const LEVEL_PRIORITY: Record<TelemetryLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

/**
 * Configure telemetry system
 */
export function configureTelemetry(newConfig: Partial<TelemetryConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current telemetry configuration
 */
export function getTelemetryConfig(): TelemetryConfig {
  return { ...config };
}

/**
 * Sanitize metadata to remove PII and limit size
 */
function sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, any> = {};
  
  // Fields that should never be included (PII)
  const piiFields = [
    "email",
    "phone",
    "phoneNumber",
    "name",
    "firstName",
    "lastName",
    "fullName",
    "address",
    "ssn",
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "message",
    "messageText",
    "photoUrl",
    "photoURL",
    "imageUrl",
    "imageURL"
  ];

  for (const [key, value] of Object.entries(metadata)) {
    // Skip PII fields
    if (piiFields.some(pii => key.toLowerCase().includes(pii.toLowerCase()))) {
      continue;
    }

    // Truncate long strings
    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + "...";
    } else if (typeof value === "object" && value !== null) {
      // For objects, convert to string and truncate if too long
      const stringified = JSON.stringify(value);
      if (stringified.length > 500) {
        sanitized[key] = stringified.substring(0, 500) + "...";
      } else {
        sanitized[key] = value;
      }
    } else {
      sanitized[key] = value;
    }
  }

  // Check total size
  const serialized = JSON.stringify(sanitized);
  if (serialized.length > config.maxMetadataSize) {
    return { _truncated: true, _originalSize: serialized.length };
  }

  return sanitized;
}

/**
 * Check if event should be logged based on level and sampling
 */
function shouldLogEvent(level: TelemetryLevel): boolean {
  if (!config.enabled) return false;
  
  // Check minimum level
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.minLevel]) {
    return false;
  }

  // Apply sampling (always log CRITICAL and ERROR)
  if (level === "CRITICAL" || level === "ERROR") {
    return true;
  }

  return Math.random() < config.samplingRate;
}

/**
 * Log a telemetry event
 */
export async function logTelemetry(event: Omit<TelemetryEvent, "id" | "ts">): Promise<void> {
  try {
    // Check if we should log this event
    if (!shouldLogEvent(event.level)) {
      return;
    }

    // Create complete event
    const completeEvent: TelemetryEvent = {
      id: uuidv4(),
      ts: Date.now(),
      ...event,
      metadata: sanitizeMetadata(event.metadata)
    };

    // Log to console if enabled
    if (config.logToConsole) {
      const logLevel = event.level.toLowerCase();
      const logMessage = `[TELEMETRY:${event.domain}:${event.operation}] ${event.success ? "✓" : "✗"} ${event.latencyMs ? `${event.latencyMs}ms` : ""} ${event.errorCode || ""}`;
      
      if (logLevel === "critical" || logLevel === "error") {
        console.error(logMessage, completeEvent);
      } else if (logLevel === "warn") {
        console.warn(logMessage, completeEvent);
      } else {
        console.log(logMessage, completeEvent);
      }
    }

    // Persist to Firestore if enabled
    if (config.persistToFirestore) {
      const db = admin.firestore();
      await db.collection("telemetry_events").doc(completeEvent.id).set({
        ...completeEvent,
        // Add compound indexes for querying
        domainLevel: `${event.domain}_${event.level}`,
        domainOperation: `${event.domain}_${event.operation}`,
        successTimestamp: `${event.success}_${completeEvent.ts}`
      });
    }
  } catch (error) {
    // Never throw errors from telemetry - it should be invisible
    console.error("[TELEMETRY] Failed to log event:", error);
  }
}

/**
 * Helper to log successful operations
 */
export async function logSuccess(
  domain: TelemetryDomain,
  operation: string,
  options?: {
    actorType?: TelemetryActorType;
    actorId?: string;
    sessionId?: string;
    latencyMs?: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  await logTelemetry({
    domain,
    level: "INFO",
    actorType: options?.actorType || "system",
    actorId: options?.actorId,
    sessionId: options?.sessionId,
    operation,
    success: true,
    latencyMs: options?.latencyMs,
    metadata: options?.metadata
  });
}

/**
 * Helper to log failed operations
 */
export async function logError(
  domain: TelemetryDomain,
  operation: string,
  errorCode: string,
  options?: {
    level?: TelemetryLevel;
    actorType?: TelemetryActorType;
    actorId?: string;
    sessionId?: string;
    latencyMs?: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  await logTelemetry({
    domain,
    level: options?.level || "ERROR",
    actorType: options?.actorType || "system",
    actorId: options?.actorId,
    sessionId: options?.sessionId,
    operation,
    success: false,
    errorCode,
    latencyMs: options?.latencyMs,
    metadata: options?.metadata
  });
}

/**
 * Helper to time an operation and log the result
 */
export async function timeOperation<T>(
  domain: TelemetryDomain,
  operation: string,
  fn: () => Promise<T>,
  options?: {
    actorType?: TelemetryActorType;
    actorId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }
): Promise<T> {
  const startTime = Date.now();
  let success = true;
  let errorCode: string | undefined;
  let result: T;

  try {
    result = await fn();
    return result;
  } catch (error: any) {
    success = false;
    errorCode = error.code || TELEMETRY_ERROR_CODES.UNKNOWN;
    throw error;
  } finally {
    const latencyMs = Date.now() - startTime;
    
    if (success) {
      await logSuccess(domain, operation, {
        ...options,
        latencyMs
      });
    } else {
      await logError(domain, operation, errorCode!, {
        ...options,
        latencyMs,
        level: "ERROR"
      });
    }
  }
}

/**
 * Query telemetry events with filters
 */
export async function queryTelemetry(filters: {
  domain?: TelemetryDomain;
  level?: TelemetryLevel;
  operation?: string;
  success?: boolean;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<TelemetryEvent[]> {
  const db = admin.firestore();
  let query: admin.firestore.Query = db.collection("telemetry_events");

  // Apply filters
  if (filters.domain) {
    query = query.where("domain", "==", filters.domain);
  }
  if (filters.level) {
    query = query.where("level", "==", filters.level);
  }
  if (filters.operation) {
    query = query.where("operation", "==", filters.operation);
  }
  if (filters.success !== undefined) {
    query = query.where("success", "==", filters.success);
  }
  if (filters.startTime) {
    query = query.where("ts", ">=", filters.startTime);
  }
  if (filters.endTime) {
    query = query.where("ts", "<=", filters.endTime);
  }

  // Order by timestamp descending
  query = query.orderBy("ts", "desc");

  // Apply limit
  query = query.limit(filters.limit || 100);

  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as TelemetryEvent);
}

/**
 * Calculate error rate for a domain/operation
 */
export async function calculateErrorRate(
  domain: TelemetryDomain,
  operation?: string,
  windowMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days default
): Promise<number> {
  const now = Date.now();
  const startTime = now - windowMs;

  const filters: any = {
    domain,
    startTime,
    endTime: now,
    limit: 10000 // Get more events for accurate calculation
  };

  if (operation) {
    filters.operation = operation;
  }

  const events = await queryTelemetry(filters);
  
  if (events.length === 0) return 0;

  const failedCount = events.filter(e => !e.success).length;
  return (failedCount / events.length) * 100;
}

/**
 * Calculate P95 latency for a domain/operation
 */
export async function calculateP95Latency(
  domain: TelemetryDomain,
  operation?: string,
  windowMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days default
): Promise<number> {
  const now = Date.now();
  const startTime = now - windowMs;

  const filters: any = {
    domain,
    startTime,
    endTime: now,
    limit: 10000
  };

  if (operation) {
    filters.operation = operation;
  }

  const events = await queryTelemetry(filters);
  const latencies = events
    .filter(e => e.latencyMs !== undefined)
    .map(e => e.latencyMs!)
    .sort((a, b) => a - b);

  if (latencies.length === 0) return 0;

  const p95Index = Math.floor(latencies.length * 0.95);
  return latencies[p95Index];
}

/**
 * Export telemetry operations and error codes for convenience
 */
export { TELEMETRY_OPERATIONS, TELEMETRY_ERROR_CODES };
