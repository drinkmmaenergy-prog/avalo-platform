import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 302 - Fraud Detection Stub
 * Provides fraud detection and rate limiting functionality
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export interface FraudCheckResult {
  allowed: boolean;
  blocked?: boolean;
  reason?: string;
  riskScore: number;
  limits: {
    messagesRemaining: number;
    tokensRemaining: number;
  };
}

export interface FraudLimits {
  maxMessagesPerHour: number;
  maxTokensPerDay: number;
  maxRecipientsPerHour: number;
}

const DEFAULT_LIMITS: FraudLimits = {
  maxMessagesPerHour: 100,
  maxTokensPerDay: 10000,
  maxRecipientsPerHour: 50,
};

/**
 * Check if user is within fraud limits
 */
export async function checkFraudLimits(
  userId: string,
  action: string | { action?: string; recipientId?: string; timestamp?: Date; [key: string]: any } = 'message'
): Promise<FraudCheckResult> {
  // Normalize action to string
  const actionStr = typeof action === 'object' ? (action.action || 'message') : action;
  try {
    // Get user's recent activity
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) {
      return {
        allowed: true,
        riskScore: 0,
        limits: {
          messagesRemaining: DEFAULT_LIMITS.maxMessagesPerHour,
          tokensRemaining: DEFAULT_LIMITS.maxTokensPerDay,
        },
      };
    }
    
    // Check if user is banned
    if (userData.banned) {
      return {
        allowed: false,
        reason: 'User is banned',
        riskScore: 100,
        limits: { messagesRemaining: 0, tokensRemaining: 0 },
      };
    }
    
    // Default: allow with full limits
    return {
      allowed: true,
      riskScore: userData.riskScore || 0,
      limits: {
        messagesRemaining: DEFAULT_LIMITS.maxMessagesPerHour,
        tokensRemaining: DEFAULT_LIMITS.maxTokensPerDay,
      },
    };
  } catch (error) {
    console.error('Fraud check error:', error);
    // Fail open for now
    return {
      allowed: true,
      riskScore: 0,
      limits: {
        messagesRemaining: DEFAULT_LIMITS.maxMessagesPerHour,
        tokensRemaining: DEFAULT_LIMITS.maxTokensPerDay,
      },
    };
  }
}

/**
 * Report suspicious activity
 */
export async function reportSuspiciousActivity(
  userId: string,
  activityType: string,
  details: Record<string, any>
): Promise<void> {
  await db.collection('fraudReports').add({
    userId,
    activityType,
    details,
    timestamp: Timestamp.now(),
    status: 'PENDING',
  });
}

























