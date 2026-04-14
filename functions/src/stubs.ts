import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * Stubs Module - Provides stub implementations for missing functions
 * These are type-safe no-op implementations to satisfy TypeScript
 */

import { logger } from './runtime';

// Feature flags - supports both (flagName, default) and (uid, flagName, default) signatures
export async function getFeatureFlag(
  flagNameOrUid: string,
  defaultValueOrFlagName?: boolean | string,
  defaultValue?: boolean
): Promise<boolean> {
  // If second arg is a string, it's the (uid, flagName, default) signature
  if (typeof defaultValueOrFlagName === 'string') {
    return defaultValue ?? false;
  }
  // Otherwise it's the (flagName, default) signature
  return defaultValueOrFlagName ?? false;
}

// Broadcasting - supports both (userIds, eventString, data) and (userIds, eventObject) signatures
export async function broadcastToUsers(userIds: string[], eventOrData: string | any, data?: any): Promise<void> {
  logger.debug('broadcastToUsers stub called', { userIds, eventOrData });
}

export async function broadcastToUser(userId: string, eventOrData: string | any, data?: any): Promise<void> {
  logger.debug('broadcastToUser stub called', { userId, eventOrData });
}

// Content moderation
export function containsBannedTerms(text: string): boolean {
  return false;
}

// Logging
export function logServerEvent(event: string, userIdOrData?: string | Record<string, any>, data?: Record<string, any>): void {
  if (typeof userIdOrData === 'string') {
    logger.info(event, { userId: userIdOrData, ...data });
  } else {
    logger.info(event, userIdOrData);
  }
}

export function logPaymentEvent(event: string, data?: Record<string, any>): void {
  logger.info(`Payment: ${event}`, data);
}

export function logPayoutEvent(event: string, data?: Record<string, any>): void {
  logger.info(`Payout: ${event}`, data);
}

// Stripe helpers
export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || '';
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

// Analytics
export async function aggregateEventCounters(userId: string): Promise<Record<string, number>> {
  return {};
}

export async function computeTasteProfile(userId: string): Promise<any> {
  return {};
}

// Audit
export async function auditLog(action: string, details?: Record<string, any>): Promise<void> {
  logger.info(`Audit: ${action}`, details);
}

// Fraud
export async function checkFraudLimits(userId: string): Promise<boolean> {
  return true;
}

// Region routing
export function routeRegion(region: string): string {
  return region || 'us-central1';
}

// Notifications
export async function notifyOps(
  messageOrOptions: string | { title?: string; message: string; priority?: string; link?: string },
  severity?: string
): Promise<void> {
  const msg = typeof messageOrOptions === 'object' ? messageOrOptions.message : messageOrOptions;
  const sev = typeof messageOrOptions === 'object' ? messageOrOptions.priority : severity;
  logger.warn(`Ops notification: ${msg}`, { severity: sev });
}

// Pack 299 Analytics
export async function getPack299Analytics(): Promise<any> {
  return {};
}

























