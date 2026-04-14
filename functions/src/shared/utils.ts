import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * Shared Utilities
 */

export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}



























