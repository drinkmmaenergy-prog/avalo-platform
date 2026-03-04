/**
 * Call Reconnect Handler
 * PACK 124.4 - Auto-reconnect and graceful failure handling
 * 
 * Features:
 * - Automatic reconnection on network blips
 * - ICE connection failure recovery
 * - Timeout-based graceful degradation
 * - Clear error messaging
 */

import SimplePeer from 'simple-peer';
// Module augmentation for SimplePeer is in types/simple-peer.d.ts

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionState = 
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface ReconnectConfig {
  maxAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface CallError {
  type: 
    | 'CONNECTION_FAILED'
    | 'MEDIA_DEVICE_ERROR'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'PEER_DISCONNECTED'
    | 'ICE_FAILED'
    | 'UNSUPPORTED_BROWSER';
  message: string;
  retryable: boolean;
  userMessage: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 3,
  retryDelayMs: 2000,
  timeoutMs: 30000, // 30 seconds
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Create user-friendly error from WebRTC error
 */
export function createCallError(
  error: Error | string,
  context?: string
): CallError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerError = errorMessage.toLowerCase();

  // Media device errors
  if (
    lowerError.includes('permission') ||
    lowerError.includes('notallowed') ||
    lowerError.includes('denied')
  ) {
    return {
      type: 'MEDIA_DEVICE_ERROR',
      message: errorMessage,
      retryable: false,
      userMessage: 'Camera or microphone access denied. Please grant permissions in your browser settings.',
    };
  }

  if (
    lowerError.includes('notfound') ||
    lowerError.includes('no device')
  ) {
    return {
      type: 'MEDIA_DEVICE_ERROR',
      message: errorMessage,
      retryable: false,
      userMessage: 'No camera or microphone found. Please connect a device and try again.',
    };
  }

  if (
    lowerError.includes('notreadable') ||
    lowerError.includes('could not start')
  ) {
    return {
      type: 'MEDIA_DEVICE_ERROR',
      message: errorMessage,
      retryable: true,
      userMessage: 'Camera or microphone is in use by another application. Please close other apps and try again.',
    };
  }

  // Network errors
  if (
    lowerError.includes('network') ||
    lowerError.includes('connection') ||
    lowerError.includes('timeout')
  ) {
    return {
      type: 'NETWORK_ERROR',
      message: errorMessage,
      retryable: true,
      userMessage: 'Network connection issue detected. Please check your internet connection and try again.',
    };
  }

  // ICE failure
  if (lowerError.includes('ice') || lowerError.includes('negotiation')) {
    return {
      type: 'ICE_FAILED',
      message: errorMessage,
      retryable: true,
      userMessage: 'Failed to establish connection. Please check your firewall settings and try again.',
    };
  }

  // Generic connection failure
  return {
    type: 'CONNECTION_FAILED',
    message: errorMessage,
    retryable: true,
    userMessage: 'Failed to connect. Please try again.',
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: CallError): boolean {
  return error.retryable;
}

// ============================================================================
// RECONNECT HANDLER CLASS
// ============================================================================

export class CallReconnectHandler {
  private peer: SimplePeer.Instance | null = null;
  private config: ReconnectConfig;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  private lastState: ConnectionState = 'new';
  
  private onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
  private onReconnectSuccess?: () => void;
  private onReconnectFailed?: (error: CallError) => void;
  private onStateChange?: (state: ConnectionState) => void;

  constructor(
    config?: Partial<ReconnectConfig>,
    callbacks?: {
      onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
      onReconnectSuccess?: () => void;
      onReconnectFailed?: (error: CallError) => void;
      onStateChange?: (state: ConnectionState) => void;
    }
  ) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    this.onReconnectAttempt = callbacks?.onReconnectAttempt;
    this.onReconnectSuccess = callbacks?.onReconnectSuccess;
    this.onReconnectFailed = callbacks?.onReconnectFailed;
    this.onStateChange = callbacks?.onStateChange;
  }

  /**
   * Attach to a peer connection
   */
  attachToPeer(peer: SimplePeer.Instance): void {
    this.peer = peer;
    this.setupPeerListeners();
    this.startConnectionTimeout();
  }

  /**
   * Setup listeners for peer connection state
   */
  private setupPeerListeners(): void {
    if (!this.peer) return;

    this.peer.on('connect', () => {
      this.handleStateChange('connected');
      this.clearTimeouts();
      this.reconnectAttempts = 0;
    });

    this.peer.on('close', () => {
      this.handleStateChange('closed');
      this.clearTimeouts();
    });

    this.peer.on('error', (error: Error) => {
      console.error('Peer connection error:', error);
      this.handleConnectionError(error);
    });

    // Monitor ICE connection state if available
    if (this.peer._pc) {
      this.peer._pc.addEventListener('iceconnectionstatechange', () => {
        const iceState = this.peer?._pc?.iceConnectionState;
        this.handleIceStateChange(iceState);
      });
    }
  }

  /**
   * Handle ICE connection state changes
   */
  private handleIceStateChange(iceState?: RTCIceConnectionState): void {
    if (!iceState) return;

    switch (iceState) {
      case 'connected':
      case 'completed':
        this.handleStateChange('connected');
        break;
      case 'disconnected':
        this.handleStateChange('disconnected');
        this.attemptReconnect();
        break;
      case 'failed':
        this.handleStateChange('failed');
        this.handleConnectionFailure();
        break;
      case 'closed':
        this.handleStateChange('closed');
        break;
    }
  }

  /**
   * Handle state change
   */
  private handleStateChange(state: ConnectionState): void {
    if (state !== this.lastState) {
      this.lastState = state;
      this.onStateChange?.(state);
    }
  }

  /**
   * Start connection timeout
   */
  private startConnectionTimeout(): void {
    this.connectionTimeoutId = setTimeout(() => {
      if (this.lastState !== 'connected') {
        this.handleConnectionTimeout();
      }
    }, this.config.timeoutMs);
  }

  /**
   * Handle connection timeout
   */
  private handleConnectionTimeout(): void {
    const error: CallError = {
      type: 'TIMEOUT',
      message: 'Connection timeout',
      retryable: true,
      userMessage: 'Connection timed out. Please try again.',
    };
    this.onReconnectFailed?.(error);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.config.maxAttempts) {
      this.handleReconnectExhausted();
      return;
    }

    // Increment attempts
    this.reconnectAttempts++;
    this.onReconnectAttempt?.(this.reconnectAttempts, this.config.maxAttempts);

    // Clear existing timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    // Schedule reconnect attempt
    this.reconnectTimeoutId = setTimeout(() => {
      this.performReconnect();
    }, this.config.retryDelayMs * this.reconnectAttempts);
  }

  /**
   * Perform reconnect (to be implemented by user)
   */
  private performReconnect(): void {
    // This is a placeholder - actual reconnection would require
    // re-establishing the peer connection with new signaling
    console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.config.maxAttempts}`);
    
    // In a real implementation, this would trigger the app to:
    // 1. Create a new peer connection
    // 2. Re-exchange signaling data
    // 3. Re-attach media streams
  }

  /**
   * Handle reconnect attempts exhausted
   */
  private handleReconnectExhausted(): void {
    const error: CallError = {
      type: 'CONNECTION_FAILED',
      message: 'Maximum reconnection attempts exceeded',
      retryable: false,
      userMessage: 'Call disconnected due to network issues. Please try calling again.',
    };
    this.onReconnectFailed?.(error);
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Error): void {
    const callError = createCallError(error);
    
    if (isRetryableError(callError)) {
      this.attemptReconnect();
    } else {
      this.onReconnectFailed?.(callError);
    }
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(): void {
    const error: CallError = {
      type: 'ICE_FAILED',
      message: 'ICE connection failed',
      retryable: true,
      userMessage: 'Connection lost. Attempting to reconnect...',
    };
    
    if (this.reconnectAttempts < this.config.maxAttempts) {
      this.attemptReconnect();
    } else {
      this.onReconnectFailed?.(error);
    }
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  /**
   * Manually trigger reconnect
   */
  triggerReconnect(): void {
    this.reconnectAttempts = 0;
    this.attemptReconnect();
  }

  /**
   * Reset reconnect attempts
   */
  reset(): void {
    this.reconnectAttempts = 0;
    this.clearTimeouts();
    this.lastState = 'new';
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearTimeouts();
    this.peer = null;
  }

  /**
   * Get current reconnect attempts
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.reconnectTimeoutId !== null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create unsupported browser error
 */
export function createUnsupportedBrowserError(): CallError {
  return {
    type: 'UNSUPPORTED_BROWSER',
    message: 'WebRTC not supported',
    retryable: false,
    userMessage: 'Your browser does not support secure calling. Please update or use a different browser.',
  };
}

/**
 * Format error message for display
 */
export function formatErrorForUser(error: CallError): string {
  return error.userMessage;
}

/**
 * Check if should show retry option
 */
export function shouldShowRetry(error: CallError): boolean {
  return error.retryable;
}
