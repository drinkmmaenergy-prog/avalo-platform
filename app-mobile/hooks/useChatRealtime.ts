/**
 * PACK 363 — Chat Realtime Hook
 * 
 * Provides realtime chat updates with:
 * - Optimistic local rendering
 * - Low-latency message delivery
 * - Typing indicators
 * - Presence (online/last seen)
 * - Delivery states
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getRealtimeBus, RealtimeEvent } from '../lib/realtime/realtimeBus';
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MessageDeliveryState = 
  | "local_pending" 
  | "sent" 
  | "delivered" 
  | "read" 
  | "failed";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'media' | 'word_bucket';
  deliveryState: MessageDeliveryState;
  createdAt: number;
  localId?: string; // For optimistic updates
  mediaUrl?: string;
  wordCost?: number;
}

export interface TypingIndicator {
  userId: string;
  conversationId: string;
  isTyping: boolean;
  timestamp: number;
}

export interface UserPresence {
  userId: string;
  online: boolean;
  lastSeen: number;
}

export interface ChatRealtimeState {
  messages: ChatMessage[];
  typingUsers: Map<string, TypingIndicator>;
  presence: Map<string, UserPresence>;
  isConnected: boolean;
}

export interface ChatRealtimeActions {
  sendMessage: (content: string, type?: ChatMessage['type']) => Promise<void>;
  setTyping: (isTyping: boolean) => void;
  markAsRead: (messageId: string) => Promise<void>;
  retryFailedMessage: (localId: string) => Promise<void>;
}

// ============================================================================
// CHAT REALTIME HOOK
// ============================================================================

export function useChatRealtime(
  conversationId: string,
  currentUserId: string
): [ChatRealtimeState, ChatRealtimeActions] {
  
  const [state, setState] = useState<ChatRealtimeState>({
    messages: [],
    typingUsers: new Map(),
    presence: new Map(),
    isConnected: false
  });

  const realtimeBus = getRealtimeBus();
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const localMessageQueueRef = useRef<ChatMessage[]>([]);

  // ==========================================================================
  // SUBSCRIPTION SETUP
  // ==========================================================================

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    // Subscribe to chat events
    const unsubscribe = realtimeBus.subscribe<any>(
      'chat',
      handleRealtimeEvent,
      { resourceId: conversationId }
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
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, currentUserId]);

  // ==========================================================================
  // EVENT HANDLER
  // ==========================================================================

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'message_sent':
        handleMessageSent(event.payload);
        break;
      
      case 'message_delivered':
        handleMessageDelivered(event.payload);
        break;
      
      case 'message_read':
        handleMessageRead(event.payload);
        break;
      
      case 'typing_indicator':
        handleTypingIndicator(event.payload);
        break;
      
      case 'presence_update':
        handlePresenceUpdate(event.payload);
        break;
      
      default:
        console.log('[useChatRealtime] Unknown event type:', event.type);
    }
  }, []);

  // ==========================================================================
  // MESSAGE HANDLERS
  // ==========================================================================

  const handleMessageSent = (payload: any) => {
    setState(prev => {
      // Check if message already exists (dedupe)
      const exists = prev.messages.some(m => m.id === payload.messageId);
      if (exists) {
        // Update delivery state
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === payload.messageId || m.localId === payload.localId
              ? { ...m, deliveryState: 'sent', id: payload.messageId }
              : m
          )
        };
      }

      // Add new message
      const newMessage: ChatMessage = {
        id: payload.messageId,
        conversationId: payload.conversationId,
        senderId: payload.senderId,
        content: payload.content,
        type: payload.type || 'text',
        deliveryState: 'sent',
        createdAt: payload.timestamp || Date.now(),
        mediaUrl: payload.mediaUrl,
        wordCost: payload.wordCost
      };

      return {
        ...prev,
        messages: [newMessage, ...prev.messages].sort((a, b) => b.createdAt - a.createdAt)
      };
    });
  };

  const handleMessageDelivered = (payload: any) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === payload.messageId
          ? { ...m, deliveryState: 'delivered' }
          : m
      )
    }));
  };

  const handleMessageRead = (payload: any) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === payload.messageId
          ? { ...m, deliveryState: 'read' }
          : m
      )
    }));
  };

  // ==========================================================================
  // TYPING INDICATOR
  // ==========================================================================

  const handleTypingIndicator = (payload: TypingIndicator) => {
    if (payload.userId === currentUserId) return; // Ignore own typing

    setState(prev => {
      const newTypingUsers = new Map(prev.typingUsers);
      
      if (payload.isTyping) {
        newTypingUsers.set(payload.userId, payload);
        
        // Auto-clear after 5 seconds
        setTimeout(() => {
          setState(current => {
            const updated = new Map(current.typingUsers);
            const existing = updated.get(payload.userId);
            if (existing && existing.timestamp === payload.timestamp) {
              updated.delete(payload.userId);
            }
            return { ...current, typingUsers: updated };
          });
        }, 5000);
      } else {
        newTypingUsers.delete(payload.userId);
      }

      return { ...prev, typingUsers: newTypingUsers };
    });
  };

  // ==========================================================================
  // PRESENCE
  // ==========================================================================

  const handlePresenceUpdate = (payload: UserPresence) => {
    setState(prev => {
      const newPresence = new Map(prev.presence);
      newPresence.set(payload.userId, payload);
      return { ...prev, presence: newPresence };
    });
  };

  // ==========================================================================
  // ACTIONS: SEND MESSAGE
  // ==========================================================================

  const sendMessage = useCallback(async (
    content: string,
    type: ChatMessage['type'] = 'text'
  ) => {
    if (!content.trim()) return;

    // Generate local ID for optimistic rendering
    const localId = `local-${Date.now()}-${Math.random()}`;
    
    // Create optimistic message
    const optimisticMessage: ChatMessage = {
      id: localId,
      conversationId,
      senderId: currentUserId,
      content,
      type,
      deliveryState: 'local_pending',
      createdAt: Date.now(),
      localId
    };

    // Add to local state immediately
    setState(prev => ({
      ...prev,
      messages: [optimisticMessage, ...prev.messages]
    }));

    // Add to queue for retry capability
    localMessageQueueRef.current.push(optimisticMessage);

    try {
      // Send to backend
      const messageDoc = await addDoc(collection(db, 'messages'), {
        conversationId,
        senderId: currentUserId,
        content,
        type,
        createdAt: serverTimestamp(),
        deliveryState: 'sent',
        localId
      });

      // Publish realtime event
      await realtimeBus.publish('chat', {
        channel: 'chat',
        type: 'message_sent',
        payload: {
          messageId: messageDoc.id,
          conversationId,
          senderId: currentUserId,
          content,
          type,
          timestamp: Date.now(),
          localId
        }
      });

      // Update local state with real ID
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.localId === localId
            ? { ...m, id: messageDoc.id, deliveryState: 'sent' }
            : m
        )
      }));

      // Remove from queue
      localMessageQueueRef.current = localMessageQueueRef.current.filter(
        m => m.localId !== localId
      );

    } catch (error) {
      console.error('[useChatRealtime] Send message error:', error);
      
      // Mark as failed
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.localId === localId
            ? { ...m, deliveryState: 'failed' }
            : m
        )
      }));
    }
  }, [conversationId, currentUserId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: TYPING INDICATOR
  // ==========================================================================

  const setTyping = useCallback((isTyping: boolean) => {
    // Debounce typing events
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Publish typing event
    realtimeBus.publish('chat', {
      channel: 'chat',
      type: 'typing_indicator',
      payload: {
        userId: currentUserId,
        conversationId,
        isTyping,
        timestamp: Date.now()
      }
    });

    if (isTyping) {
      // Auto-stop typing after 3 seconds
      typingTimeoutRef.current = setTimeout(() => {
        realtimeBus.publish('chat', {
          channel: 'chat',
          type: 'typing_indicator',
          payload: {
            userId: currentUserId,
            conversationId,
            isTyping: false,
            timestamp: Date.now()
          }
        });
      }, 3000);
    }
  }, [conversationId, currentUserId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: MARK AS READ
  // ==========================================================================

  const markAsRead = useCallback(async (messageId: string) => {
    try {
      // Update in Firestore
      await updateDoc(doc(db, 'messages', messageId), {
        readBy: { [currentUserId]: serverTimestamp() }
      });

      // Publish realtime event
      await realtimeBus.publish('chat', {
        channel: 'chat',
        type: 'message_read',
        payload: {
          messageId,
          conversationId,
          readBy: currentUserId,
          timestamp: Date.now()
        }
      });

    } catch (error) {
      console.error('[useChatRealtime] Mark as read error:', error);
    }
  }, [conversationId, currentUserId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: RETRY FAILED MESSAGE
  // ==========================================================================

  const retryFailedMessage = useCallback(async (localId: string) => {
    const failedMessage = state.messages.find(m => m.localId === localId);
    if (!failedMessage) return;

    // Reset to pending
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.localId === localId
          ? { ...m, deliveryState: 'local_pending' }
          : m
      )
    }));

    // Retry send
    await sendMessage(failedMessage.content, failedMessage.type);
  }, [state.messages, sendMessage]);

  // ==========================================================================
  // RETURN STATE & ACTIONS
  // ==========================================================================

  return [
    state,
    {
      sendMessage,
      setTyping,
      markAsRead,
      retryFailedMessage
    }
  ];
}

export default useChatRealtime;
