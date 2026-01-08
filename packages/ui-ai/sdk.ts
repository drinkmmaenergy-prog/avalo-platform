/**
 * PACK 340 - AI Companions SDK Bindings
 * Wraps Firebase Cloud Functions from PACK 279
 */

import { functions } from '../../app-mobile/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import type {
  AICompanion,
  AIDiscoveryParams,
  AIChatSession,
  AISessionSummary,
  AIEarningsPreview,
  AIError,
} from './types';

/**
 * Get featured AI companions
 */
export async function getFeaturedCompanions(): Promise<AICompanion[]> {
  try {
    const fn = httpsCallable(functions, 'getFeaturedCompanions');
    const result = await fn();
    const data = result.data as { companions: AICompanion[] };
    return data.companions;
  } catch (error) {
    console.error('getFeaturedCompanions error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Discover AI companions with filters and sorting
 */
export async function discoverAICompanions(params: AIDiscoveryParams): Promise<{
  companions: AICompanion[];
  total: number;
}> {
  try {
    const fn = httpsCallable(functions, 'discoverAICompanions');
    const result = await fn(params);
    const data = result.data as { companions: AICompanion[]; total: number };
    return data;
  } catch (error) {
    console.error('discoverAICompanions error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Get a specific AI companion by ID
 */
export async function getAICompanion(companionId: string): Promise<AICompanion> {
  try {
    const fn = httpsCallable(functions, 'getAICompanion');
    const result = await fn({ companionId });
    const data = result.data as { companion: AICompanion };
    return data.companion;
  } catch (error) {
    console.error('getAICompanion error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Create a new AI chat session
 */
export async function createAIChatSession(
  companionId: string,
  sessionType: 'CHAT' | 'VOICE' | 'VIDEO'
): Promise<AIChatSession> {
  try {
    const fn = httpsCallable(functions, 'createAIChatSession');
    const result = await fn({ companionId, sessionType });
    const data = result.data as { session: AIChatSession };
    return data.session;
  } catch (error) {
    console.error('createAIChatSession error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Get an active AI chat session
 */
export async function getAIChatSession(sessionId: string): Promise<AIChatSession> {
  try {
    const fn = httpsCallable(functions, 'getAIChatSession');
    const result = await fn({ sessionId });
    const data = result.data as { session: AIChatSession };
    return data.session;
  } catch (error) {
    console.error('getAIChatSession error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Send a message in an AI chat session
 */
export async function sendAIChatMessage(
  sessionId: string,
  content: string
): Promise<{
  userMessage: any;
  aiResponse: any;
  tokensUsed: number;
  remaining: number;
}> {
  try {
    const fn = httpsCallable(functions, 'sendAIChatMessage');
    const result = await fn({ sessionId, content });
    return result.data as any;
  } catch (error) {
    console.error('sendAIChatMessage error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * End an AI chat session
 */
export async function endAIChatSession(sessionId: string): Promise<AISessionSummary> {
  try {
    const fn = httpsCallable(functions, 'endAIChatSession');
    const result = await fn({ sessionId });
    const data = result.data as { summary: AISessionSummary };
    return data.summary;
  } catch (error) {
    console.error('endAIChatSession error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Get user's AI companions (creator side)
 */
export async function getUserAICompanions(): Promise<AICompanion[]> {
  try {
    const fn = httpsCallable(functions, 'getUserAICompanions');
    const result = await fn();
    const data = result.data as { companions: AICompanion[] };
    return data.companions;
  } catch (error) {
    console.error('getUserAICompanions error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Get AI earnings preview (creator side)
 */
export async function getAIEarningsPreview(): Promise<AIEarningsPreview> {
  try {
    const fn = httpsCallable(functions, 'getAIEarningsPreview');
    const result = await fn();
    const data = result.data as AIEarningsPreview;
    return data;
  } catch (error) {
    console.error('getAIEarningsPreview error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Map Firebase errors to AIError
 */
function mapFirebaseError(error: any): AIError {
  const code = error?.code || 'unknown';
  const message = error?.message || 'An unknown error occurred';

  // Map Firebase error codes to AIErrorCode
  if (code.includes('insufficient-tokens') || message.includes('insufficient tokens')) {
    return {
      code: 'INSUFFICIENT_TOKENS',
      message: 'Insufficient tokens for this action',
      details: error,
    };
  }

  if (code.includes('offline') || message.includes('offline')) {
    return {
      code: 'AI_OFFLINE',
      message: 'AI companion is currently offline',
      details: error,
    };
  }

  if (code.includes('safety') || code.includes('blocked')) {
    return {
      code: 'SAFETY_BLOCK',
      message: 'This action is blocked by safety settings',
      details: error,
    };
  }

  if (code.includes('geo') || code.includes('region')) {
    return {
      code: 'GEO_BLOCK',
      message: 'This feature is not available in your region',
      details: error,
    };
  }

  if (code.includes('kyc') || message.includes('KYC')) {
    return {
      code: 'KYC_REQUIRED',
      message: 'KYC verification required to use this feature',
      details: error,
    };
  }

  if (code.includes('age') || message.includes('age verification')) {
    return {
      code: 'AGE_VERIFICATION_REQUIRED',
      message: 'Age verification required to access AI companions',
      details: error,
    };
  }

  if (code.includes('expired')) {
    return {
      code: 'SESSION_EXPIRED',
      message: 'Your session has expired',
      details: error,
    };
  }

  if (code.includes('rate-limit') || code.includes('too-many-requests')) {
    return {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later',
      details: error,
    };
  }

  // Default to safety block for unknown errors
  return {
    code: 'SAFETY_BLOCK',
    message,
    details: error,
  };
}
