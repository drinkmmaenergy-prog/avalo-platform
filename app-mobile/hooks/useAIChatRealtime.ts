/**
 * PACK 363 — AI Companion Chat Realtime Hook
 * 
 * Provides realtime AI companion chat with:
 * - Streaming response chunks
 * - Thinking state indicators
 * - Token billing integration
 * - Battery-optimized throttling
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getRealtimeBus, RealtimeEvent } from '../lib/realtime/realtimeBus';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AIResponseState = 
  | "idle"
  | "queued"
  | "thinking"
  | "streaming"
  | "completed"
  | "error";

export interface AIMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  streamingContent?: string; // Partial content during streaming
  state: AIResponseState;
  createdAt: number;
  tokenCost?: number;
  wordCost?: number;
  error?: string;
}

export interface AIThinkingState {
  isThinking: boolean;
  stage?: 'processing' | 'generating' | 'finalizing';
  progress?: number; // 0-100
}

export interface AIChatRealtimeState {
  messages: AIMessage[];
  thinkingState: AIThinkingState;
  isConnected: boolean;
  sessionId: string;
}

export interface AIChatRealtimeActions {
  sendMessage: (content: string) => Promise<void>;
  cancelGeneration: () => Promise<void>;
  regenerateResponse: (messageId: string) => Promise<void>;
}

// ============================================================================
// AI CHAT REALTIME HOOK
// ============================================================================

export function useAIChatRealtime(
  sessionId: string,
  userId: string
): [AIChatRealtimeState, AIChatRealtimeActions] {
  
  const [state, setState] = useState<AIChatRealtimeState>({
    messages: [],
    thinkingState: { isThinking: false },
    isConnected: false,
    sessionId
  });

  const realtimeBus = getRealtimeBus();
  const currentGenerationRef = useRef<string | null>(null);
  const streamBufferRef = useRef<string>('');
  const throttleTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // ==========================================================================
  // SUBSCRIPTION SETUP
  // ==========================================================================

  useEffect(() => {
    if (!sessionId || !userId) return;

    // Subscribe to AI chat events
    const unsubscribe = realtimeBus.subscribe<any>(
      'aiChat',
      handleRealtimeEvent,
      { resourceId: sessionId }
    );

    // Check connection status
    const connectionStatus = realtimeBus.getStatus();
    setState(prev => ({ ...prev, isConnected: connectionStatus === 'connected' }));

    // Monitor connection changes
    const connectionInterval = setInterval(() => {
      const status = realtimeBus.getStatus();
      setState(prev => ({ ...prev, isConnected: status === 'connected' }));
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(connectionInterval);
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, [sessionId, userId]);

  // ==========================================================================
  // EVENT HANDLER
  // ==========================================================================

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'aiChat:request_queued':
        handleRequestQueued(event.payload);
        break;
      
      case 'aiChat:response_started':
        handleResponseStarted(event.payload);
        break;
      
      case 'aiChat:response_chunk':
        handleResponseChunk(event.payload);
        break;
      
      case 'aiChat:response_completed':
        handleResponseCompleted(event.payload);
        break;
      
      case 'aiChat:error':
        handleError(event.payload);
        break;
      
      default:
        console.log('[useAIChatRealtime] Unknown event type:', event.type);
    }
  }, []);

  // ==========================================================================
  // AI RESPONSE HANDLERS
  // ==========================================================================

  const handleRequestQueued = (payload: any) => {
    currentGenerationRef.current = payload.requestId;
    
    setState(prev => ({
      ...prev,
      thinkingState: {
        isThinking: true,
        stage: 'processing',
        progress: 0
      }
    }));
  };

  const handleResponseStarted = (payload: any) => {
    setState(prev => {
      // Add assistant message placeholder
      const assistantMessage: AIMessage = {
        id: payload.messageId,
        sessionId,
        role: 'assistant',
        content: '',
        streamingContent: '',
        state: 'streaming',
        createdAt: Date.now()
      };

      return {
        ...prev,
        messages: [assistantMessage, ...prev.messages],
        thinkingState: {
          isThinking: true,
          stage: 'generating',
          progress: 20
        }
      };
    });

    // Reset stream buffer
    streamBufferRef.current = '';
  };

  const handleResponseChunk = (payload: any) => {
    // Throttle chunk updates for battery optimization
    streamBufferRef.current += payload.chunk;

    if (throttleTimerRef.current) {
      return; // Already scheduled
    }

    throttleTimerRef.current = setTimeout(() => {
      const bufferedContent = streamBufferRef.current;
      
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === payload.messageId
            ? { ...m, streamingContent: bufferedContent }
            : m
        ),
        thinkingState: {
          ...prev.thinkingState,
          progress: Math.min(prev.thinkingState.progress || 0 + 10, 90)
        }
      }));

      throttleTimerRef.current = undefined;
    }, 150); // 150ms throttle for smooth but battery-friendly updates
  };

  const handleResponseCompleted = (payload: any) => {
    currentGenerationRef.current = null;
    streamBufferRef.current = '';

    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === payload.messageId
          ? {
              ...m,
              content: payload.fullContent,
              streamingContent: undefined,
              state: 'completed',
              tokenCost: payload.tokenCost,
              wordCost: payload.wordCost
            }
          : m
      ),
      thinkingState: {
        isThinking: false,
        stage: undefined,
        progress: 100
      }
    }));
  };

  const handleError = (payload: any) => {
    currentGenerationRef.current = null;
    streamBufferRef.current = '';

    setState(prev => {
      // If we have a specific message ID, update that message
      if (payload.messageId) {
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === payload.messageId
              ? { ...m, state: 'error', error: payload.error }
              : m
          ),
          thinkingState: { isThinking: false }
        };
      }

      // Otherwise, add error message
      const errorMessage: AIMessage = {
        id: `error-${Date.now()}`,
        sessionId,
        role: 'assistant',
        content: '',
        state: 'error',
        error: payload.error,
        createdAt: Date.now()
      };

      return {
        ...prev,
        messages: [errorMessage, ...prev.messages],
        thinkingState: { isThinking: false }
      };
    });
  };

  // ==========================================================================
  // ACTIONS: SEND MESSAGE
  // ==========================================================================

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    if (currentGenerationRef.current) {
      console.warn('[useAIChatRealtime] Generation already in progress');
      return;
    }

    // Add user message immediately
    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      state: 'completed',
      createdAt: Date.now()
    };

    setState(prev => ({
      ...prev,
      messages: [userMessage, ...prev.messages],
      thinkingState: {
        isThinking: true,
        stage: 'processing',
        progress: 0
      }
    }));

    try {
      // Send to AI backend
      const requestDoc = await addDoc(collection(db, 'ai_chat_requests'), {
        sessionId,
        userId,
        message: content,
        createdAt: serverTimestamp(),
        status: 'queued'
      });

      // Publish realtime event
      await realtimeBus.publish('aiChat', {
        channel: 'aiChat',
        type: 'aiChat:request_queued',
        payload: {
          requestId: requestDoc.id,
          sessionId,
          userId,
          message: content,
          timestamp: Date.now()
        },
        priority: 'normal'
      });

    } catch (error) {
      console.error('[useAIChatRealtime] Send message error:', error);
      
      setState(prev => ({
        ...prev,
        thinkingState: { isThinking: false }
      }));

      // Show error
      handleError({
        error: 'Failed to send message. Please try again.'
      });
    }
  }, [sessionId, userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: CANCEL GENERATION
  // ==========================================================================

  const cancelGeneration = useCallback(async () => {
    if (!currentGenerationRef.current) return;

    try {
      // Publish cancel event
      await realtimeBus.publish('aiChat', {
        channel: 'aiChat',
        type: 'aiChat:cancel_request',
        payload: {
          requestId: currentGenerationRef.current,
          sessionId,
          timestamp: Date.now()
        },
        priority: 'high'
      });

      currentGenerationRef.current = null;
      streamBufferRef.current = '';

      setState(prev => ({
        ...prev,
        thinkingState: { isThinking: false }
      }));

    } catch (error) {
      console.error('[useAIChatRealtime] Cancel generation error:', error);
    }
  }, [sessionId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: REGENERATE RESPONSE
  // ==========================================================================

  const regenerateResponse = useCallback(async (messageId: string) => {
    const message = state.messages.find(m => m.id === messageId);
    if (!message) return;

    // Find the previous user message
    const messageIndex = state.messages.findIndex(m => m.id === messageId);
    const userMessage = state.messages
      .slice(messageIndex + 1)
      .find(m => m.role === 'user');

    if (!userMessage) {
      console.warn('[useAIChatRealtime] No user message found for regeneration');
      return;
    }

    // Remove the old assistant message
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== messageId)
    }));

    // Send new request
    await sendMessage(userMessage.content);
  }, [state.messages, sendMessage]);

  // ==========================================================================
  // RETURN STATE & ACTIONS
  // ==========================================================================

  return [
    state,
    {
      sendMessage,
      cancelGeneration,
      regenerateResponse
    }
  ];
}

export default useAIChatRealtime;
