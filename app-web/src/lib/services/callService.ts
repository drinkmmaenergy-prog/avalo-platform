"use client";

/**
 * WebRTC Call Service - PACK 124.4 Enhanced
 * Handles voice/video calls with per-minute token billing
 * - Voice: 10 tokens/min (VIP/Standard), 6 tokens/min (Royal)
 * - Video: 15 tokens/min (VIP/Standard), 10 tokens/min (Royal)
 * - 80/20 split (earner/Avalo)
 * - Auto-disconnect after 6 minutes idle
 *
 * PACK 124.4 Enhancements:
 * - Secure TURN/STUN configuration
 * - Call quality monitoring
 * - Auto-reconnect on network blips
 * - Graceful failure handling
 */

import SimplePeer from 'simple-peer';
// Import type augmentation for SimplePeer._pc
import '../types/simple-peer';
import { requireDb, requireFunctions } from '../firebase';
import { doc, onSnapshot, Unsubscribe, updateDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CallSession, CallType } from '../types';
import { CALL_CONFIG } from '../monetization';
import { getWebRTCConfig as getWebRTCConfigInternal } from '../webrtc-config';
import { CallQualityMonitor, QualityStatus } from '../call-quality-monitor';
import { CallReconnectHandler, CallError } from '../call-reconnect-handler';

/**
 * Extended SimplePeer instance with internal _pc property
 * SimplePeer exposes the underlying RTCPeerConnection as _pc
 */
interface SimplePeerWithPc extends SimplePeer.Instance {
  _pc?: RTCPeerConnection;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CallInitParams {
  userAId: string;
  userBId: string;
  initiatorId: string;
  callType: CallType;
}

export interface CallInfo {
  callId: string;
  pricePerMinute: number;
  payerId: string;
}

export interface SignalingData {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
}

// ============================================================================
// CALL INITIALIZATION
// ============================================================================

/**
 * Check if user can afford call
 */
export async function checkCallBalance(params: {
  userId: string;
  callType: CallType;
  durationMinutes?: number;
}): Promise<{
  hasBalance: boolean;
  userBalance: number;
  requiredTokens: number;
  pricePerMinute: number;
}> {
  try {
    const check = httpsCallable<typeof params, {
      hasBalance: boolean;
      userBalance: number;
      requiredTokens: number;
      pricePerMinute: number;
    }>(requireFunctions(), 'checkCallBalance');
    
    const result = await check(params);
    return result.data;
  } catch (error) {
    console.error('Error checking call balance:', error);
    throw error;
  }
}

/**
 * Start a call session
 * Backend validates balance, determines payer/earner, creates session
 */
export async function startCall(params: CallInitParams): Promise<CallInfo> {
  try {
    const start = httpsCallable<CallInitParams, CallInfo>(requireFunctions(),
      'startCall'
    );
    
    const result = await start(params);
    return result.data;
  } catch (error) {
    console.error('Error starting call:', error);
    throw error;
  }
}

/**
 * End call and process billing
 * Calculates duration (ceiling), applies per-minute cost, splits 80/20
 */
export async function endCall(params: {
  callId: string;
  endedBy: string;
}): Promise<{
  durationMinutes: number;
  totalTokens: number;
  earnerReceived: number;
  avaloReceived: number;
}> {
  try {
    const end = httpsCallable<typeof params, {
      durationMinutes: number;
      totalTokens: number;
      earnerReceived: number;
      avaloReceived: number;
    }>(requireFunctions(), 'endCall');
    
    const result = await end(params);
    return result.data;
  } catch (error) {
    console.error('Error ending call:', error);
    throw error;
  }
}

/**
 * Update call activity (prevents auto-disconnect)
 * Should be called every 2-3 minutes during active call
 */
export async function updateCallActivity(callId: string): Promise<void> {
  try {
    const update = httpsCallable<{ callId: string }, void>(requireFunctions(),
      'updateCallActivity'
    );
    await update({ callId });
  } catch (error) {
    console.error('Error updating call activity:', error);
  }
}

/**
 * Subscribe to call session updates
 */
export function subscribeToCall(
  callId: string,
  callback: (call: CallSession | null) => void
): Unsubscribe {
  const callRef = doc(requireDb(), 'calls', callId);
  
  return onSnapshot(callRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    
    callback({
      callId: snapshot.id,
      ...snapshot.data(),
    } as CallSession);
  });
}

// ============================================================================
// WEBRTC PEER CONNECTION
// ============================================================================

/**
 * Get WebRTC configuration (STUN/TURN servers)
 * Now uses enhanced configuration layer from webrtc-config.ts
 */
export async function getWebRTCConfig() {
  return getWebRTCConfigInternal();
}

/**
 * Create WebRTC peer connection
 */
export async function createPeer(params: {
  initiator: boolean;
  callType: CallType;
  stream?: MediaStream;
  onSignal: (signal: any) => void;
  onStream: (stream: MediaStream) => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onQualityChange?: (status: QualityStatus) => void;
}): Promise<{
  peer: SimplePeer.Instance;
  qualityMonitor: CallQualityMonitor;
  reconnectHandler: CallReconnectHandler;
}> {
  const config = await getWebRTCConfig();
  
  const peer = new SimplePeer({
    initiator: params.initiator,
    trickle: true,
    config: {
      iceServers: config.iceServers,
    },
    stream: params.stream,
  });

  peer.on('signal', params.onSignal);
  peer.on('stream', params.onStream);
  peer.on('close', params.onClose);
  peer.on('error', params.onError);

  // Setup quality monitoring
  const peerWithPc = peer as SimplePeerWithPc;
  const qualityMonitor = new CallQualityMonitor(
    peerWithPc._pc!,
    params.onQualityChange
  );

  // Setup reconnect handler
  const reconnectHandler = new CallReconnectHandler(
    {
      maxAttempts: 3,
      retryDelayMs: 2000,
      timeoutMs: 30000,
    },
    {
      onReconnectAttempt: (attempt, max) => {
        console.log(`Reconnect attempt ${attempt}/${max}`);
      },
      onReconnectFailed: (error) => {
        console.error('Reconnect failed:', error);
        params.onError(new Error(error.userMessage));
      },
    }
  );

  reconnectHandler.attachToPeer(peer);

  return { peer, qualityMonitor, reconnectHandler };
}

/**
 * Get user media stream
 */
export async function getUserMedia(callType: CallType): Promise<MediaStream> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'VIDEO' ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      } : false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (error) {
    console.error('Error getting user media:', error);
    throw new Error('Failed to access camera/microphone. Please grant permissions.');
  }
}

/**
 * Stop media stream
 */
export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => {
    track.stop();
  });
}

// ============================================================================
// SIGNALING
// ============================================================================

/**
 * Send signaling data via Firestore
 */
export async function sendSignalingData(params: {
  callId: string;
  fromUserId: string;
  toUserId: string;
  data: SignalingData;
}): Promise<void> {
  try {
    const send = httpsCallable<typeof params, void>(requireFunctions(),
      'sendSignalingData'
    );
    await send(params);
  } catch (error) {
    console.error('Error sending signaling data:', error);
  }
}

/**
 * Subscribe to signaling data
 */
export function subscribeToSignaling(
  callId: string,
  userId: string,
  callback: (data: SignalingData) => void
): Unsubscribe {
  const signalingRef = doc(requireDb(), 'calls', callId, 'signaling', userId);
  
  return onSnapshot(signalingRef, (snapshot) => {
    if (!snapshot.exists()) return;
    
    const data = snapshot.data();
    if (data) {
      callback(data as SignalingData);
    }
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get call pricing info for display
 */
export function getCallPricingInfo(callType: CallType, userStatus: 'STANDARD' | 'VIP' | 'ROYAL' = 'STANDARD'): {
  pricePerMinute: number;
  estimatedCost5Min: number;
  estimatedCost15Min: number;
} {
  const config = callType === 'VOICE' ? CALL_CONFIG.VOICE : CALL_CONFIG.VIDEO;
  
  let pricePerMinute: number;
  switch (userStatus) {
    case 'ROYAL':
      pricePerMinute = config.BASE_COST_ROYAL;
      break;
    case 'VIP':
      pricePerMinute = config.BASE_COST_VIP;
      break;
    default:
      pricePerMinute = config.BASE_COST_STANDARD;
  }

  return {
    pricePerMinute,
    estimatedCost5Min: pricePerMinute * 5,
    estimatedCost15Min: pricePerMinute * 15,
  };
}

/**
 * Format call duration
 */
export function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate estimated cost based on elapsed time
 */
export function calculateEstimatedCost(elapsedSeconds: number, pricePerMinute: number): number {
  const minutes = Math.ceil(elapsedSeconds / 60);
  return minutes * pricePerMinute;
}

/**
 * Check if browser supports WebRTC
 */
export function isWebRTCSupported(): boolean {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    window.RTCPeerConnection
  );
}

// ============================================================================
// PACK 124.4 - QUALITY METRICS & SAFETY INTEGRATION
// ============================================================================

/**
 * Update call session with quality metrics
 * Called when call ends to store aggregated metrics
 */
export async function updateCallQualityMetrics(params: {
  callId: string;
  avgJitterMs: number;
  avgPacketLoss: number;
  avgRttMs: number;
}): Promise<void> {
  try {
    if (false /* requireDb handles null */) throw new Error('Firestore not initialized');
    
    const callRef = doc(requireDb(), 'calls', params.callId);
    
    // Determine quality rating
    let qualityRating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    if (params.avgJitterMs <= 20 && params.avgPacketLoss <= 0.5 && params.avgRttMs <= 100) {
      qualityRating = 'Excellent';
    } else if (params.avgJitterMs <= 40 && params.avgPacketLoss <= 2 && params.avgRttMs <= 200) {
      qualityRating = 'Good';
    } else if (params.avgJitterMs <= 80 && params.avgPacketLoss <= 5 && params.avgRttMs <= 400) {
      qualityRating = 'Fair';
    } else {
      qualityRating = 'Poor';
    }
    
    await updateDoc(callRef, {
      avgJitterMs: params.avgJitterMs,
      avgPacketLoss: params.avgPacketLoss,
      avgRttMs: params.avgRttMs,
      qualityRating,
      metricsUpdatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating call quality metrics:', error);
  }
}

/**
 * Emit call ended event (for analytics & risk engine)
 */
export async function emitCallEndedEvent(params: {
  callId: string;
  durationMinutes: number;
  qualityRating?: string;
  panicActive?: boolean;
}): Promise<void> {
  try {
    const emitEvent = httpsCallable<typeof params, void>(requireFunctions(),
      'emitCallEndedEvent'
    );
    await emitEvent(params);
  } catch (error) {
    console.error('Error emitting call ended event:', error);
  }
}

/**
 * Emit call ended with panic event (for risk & safety monitoring)
 */
export async function emitCallEndedWithPanicEvent(params: {
  callId: string;
  userId: string;
  panicReason?: string;
}): Promise<void> {
  try {
    const emitEvent = httpsCallable<typeof params, void>(requireFunctions(),
      'emitCallEndedWithPanicEvent'
    );
    await emitEvent(params);
  } catch (error) {
    console.error('Error emitting call ended with panic event:', error);
  }
}

/**
 * Complete call lifecycle with quality metrics and events
 * Handles: end call, update quality metrics, emit events
 */
export async function completeCallWithMetrics(params: {
  callId: string;
  endedBy: string;
  qualityMetrics?: {
    avgJitterMs: number;
    avgPacketLoss: number;
    avgRttMs: number;
  };
  panicActive?: boolean;
  panicReason?: string;
}): Promise<{
  durationMinutes: number;
  totalTokens: number;
  earnerReceived: number;
  avaloReceived: number;
}> {
  try {
    // End the call and process billing
    const billing = await endCall({
      callId: params.callId,
      endedBy: params.endedBy,
    });

    // Update quality metrics if available
    if (params.qualityMetrics) {
      await updateCallQualityMetrics({
        callId: params.callId,
        ...params.qualityMetrics,
      });
    }

    // Emit appropriate event
    if (params.panicActive) {
      await emitCallEndedWithPanicEvent({
        callId: params.callId,
        userId: params.endedBy,
        panicReason: params.panicReason,
      });
    } else {
      await emitCallEndedEvent({
        callId: params.callId,
        durationMinutes: billing.durationMinutes,
        qualityRating: params.qualityMetrics ? 'recorded' : undefined,
        panicActive: false,
      });
    }

    return billing;
  } catch (error) {
    console.error('Error completing call with metrics:', error);
    throw error;
  }
}
