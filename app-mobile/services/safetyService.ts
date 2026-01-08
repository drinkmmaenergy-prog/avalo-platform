/**
 * PACK 153 — Safety Service
 * 
 * Client-side service for safety system
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// ============================================================================
// TYPES
// ============================================================================

export interface EvaluateMessageResult {
  allowed: boolean;
  action: string;
  violationType?: string;
  severity?: string;
  messageToUser: string;
  educationTipId?: string;
  incidentId?: string;
}

export interface SafetyStatus {
  userId: string;
  penaltyLevel: number;
  penaltyLevelName: string;
  incidentCount30d: number;
  minorIncidents: number;
  moderateIncidents: number;
  severeIncidents: number;
  restrictions: {
    slowDownActive: boolean;
    slowDownUntil?: any;
    featuresBanned: string[];
    featureBansUntil?: any;
    platformBanned: boolean;
    platformBanUntil?: any;
    platformBanReason?: string;
  };
  cleanStreak: number;
  lastIncidentAt?: any;
  reputationImpactApplied: boolean;
  lastUpdatedAt: any;
  createdAt: any;
}

// ============================================================================
// MESSAGE SAFETY
// ============================================================================

/**
 * Evaluate message safety before sending
 */
export async function evaluateMessage(params: {
  content: string;
  contentType?: string;
  targetUserId?: string;
  conversationId?: string;
  contextId?: string;
}): Promise<EvaluateMessageResult> {
  const evaluateMessageFn = httpsCallable(functions, 'pack153_evaluateMessage');
  const result = await evaluateMessageFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to evaluate message');
  }
  
  return data.data;
}

/**
 * Get user's safety status
 */
export async function getSafetyStatus(): Promise<SafetyStatus> {
  const getSafetyStatusFn = httpsCallable(functions, 'pack153_getSafetyStatus');
  const result = await getSafetyStatusFn({});
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get safety status');
  }
  
  return data.data;
}

/**
 * Get user's safety incidents
 */
export async function getMyIncidents(limit: number = 50): Promise<any[]> {
  const getMyIncidentsFn = httpsCallable(functions, 'pack153_getMyIncidents');
  const result = await getMyIncidentsFn({ limit });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get incidents');
  }
  
  return data.data;
}

/**
 * Get user's blocked messages
 */
export async function getBlockedMessages(limit: number = 20): Promise<any[]> {
  const getBlockedMessagesFn = httpsCallable(functions, 'pack153_getBlockedMessages');
  const result = await getBlockedMessagesFn({ limit });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get blocked messages');
  }
  
  return data.data;
}

// ============================================================================
// APPEALS
// ============================================================================

/**
 * Submit safety appeal
 */
export async function submitSafetyAppeal(params: {
  incidentId: string;
  reason: string;
  evidence?: string;
}): Promise<string> {
  const submitAppealFn = httpsCallable(functions, 'pack153_submitAppeal');
  const result = await submitAppealFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to submit appeal');
  }
  
  return data.data.appealId;
}

// ============================================================================
// EDUCATION
// ============================================================================

/**
 * Get safety education tip
 */
export async function getEducationTip(violationType: string): Promise<any> {
  const getEducationTipFn = httpsCallable(functions, 'pack153_getEducationTip');
  const result = await getEducationTipFn({ violationType });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get education tip');
  }
  
  return data.data;
}

// ============================================================================
// VOICE/VIDEO CALLS
// ============================================================================

/**
 * Start voice analysis session
 */
export async function startVoiceAnalysis(params: {
  callId: string;
  participantIds: string[];
}): Promise<string> {
  const startVoiceAnalysisFn = httpsCallable(functions, 'pack153_startVoiceAnalysis');
  const result = await startVoiceAnalysisFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to start voice analysis');
  }
  
  return data.data.sessionId;
}

/**
 * Process voice transcript
 */
export async function processVoiceTranscript(params: {
  sessionId: string;
  callId: string;
  transcriptSegment: string;
  timestamp?: number;
}): Promise<any> {
  const processVoiceTranscriptFn = httpsCallable(functions, 'pack153_processVoiceTranscript');
  const result = await processVoiceTranscriptFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to process voice transcript');
  }
  
  return data.data;
}

/**
 * End voice analysis session
 */
export async function endVoiceAnalysis(sessionId: string): Promise<void> {
  const endVoiceAnalysisFn = httpsCallable(functions, 'pack153_endVoiceAnalysis');
  const result = await endVoiceAnalysisFn({ sessionId });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to end voice analysis');
  }
}

// ============================================================================
// LIVESTREAM
// ============================================================================

/**
 * Start livestream moderation
 */
export async function startLivestreamModeration(params: {
  streamId: string;
  moderatorIds?: string[];
}): Promise<string> {
  const startLivestreamModerationFn = httpsCallable(functions, 'pack153_startLivestreamModeration');
  const result = await startLivestreamModerationFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to start livestream moderation');
  }
  
  return data.data.sessionId;
}

/**
 * Moderate livestream message
 */
export async function moderateLivestreamMessage(params: {
  sessionId: string;
  streamId: string;
  message: string;
  messageId: string;
}): Promise<any> {
  const moderateLivestreamMessageFn = httpsCallable(functions, 'pack153_moderateLivestreamMessage');
  const result = await moderateLivestreamMessageFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to moderate livestream message');
  }
  
  return data.data;
}

/**
 * Get livestream moderation stats
 */
export async function getLivestreamStats(sessionId: string): Promise<any> {
  const getLivestreamStatsFn = httpsCallable(functions, 'pack153_getLivestreamStats');
  const result = await getLivestreamStatsFn({ sessionId });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get livestream stats');
  }
  
  return data.data;
}

/**
 * End livestream moderation
 */
export async function endLivestreamModeration(sessionId: string): Promise<void> {
  const endLivestreamModerationFn = httpsCallable(functions, 'pack153_endLivestreamModeration');
  const result = await endLivestreamModerationFn({ sessionId });
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to end livestream moderation');
  }
}

// ============================================================================
// EVENT CHAT
// ============================================================================

/**
 * Monitor event chat message
 */
export async function monitorEventMessage(params: {
  eventId: string;
  message: string;
  messageId: string;
}): Promise<any> {
  const monitorEventMessageFn = httpsCallable(functions, 'pack153_monitorEventMessage');
  const result = await monitorEventMessageFn(params);
  const data = result.data as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to monitor event message');
  }
  
  return data.data;
}