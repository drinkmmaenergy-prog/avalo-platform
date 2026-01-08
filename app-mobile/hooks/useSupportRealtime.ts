/**
 * PACK 363 — Support Ticket Realtime Hook
 * 
 * Provides realtime support ticket updates:
 * - New messages from support agents
 * - Status changes
 * - Ticket assignments
 * - Priority escalations
 */

import { useEffect, useState, useCallback } from 'react';
import { getRealtimeBus, RealtimeEvent } from '../lib/realtime/realtimeBus';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TicketStatus = 
  | 'open'
  | 'pending'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'
  | 'closed';

export type TicketPriority = 
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent'
  | 'critical';

export type TicketCategory =
  | 'account'
  | 'payment'
  | 'safety'
  | 'technical'
  | 'content'
  | 'abuse'
  | 'billing'
  | 'other';

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: 'user' | 'agent' | 'system';
  content: string;
  attachments?: string[];
  createdAt: number;
  isRead?: boolean;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  firstResponseAt?: number;
  lastMessageAt?: number;
}

export interface SupportRealtimeState {
  tickets: SupportTicket[];
  currentTicket: SupportTicket | null;
  messages: SupportMessage[];
  unreadCount: number;
  isConnected: boolean;
  isLoading: boolean;
}

export interface SupportRealtimeActions {
  sendMessage: (ticketId: string, content: string) => Promise<void>;
  createTicket: (subject: string, category: TicketCategory, initialMessage: string) => Promise<string>;
  markAsRead: (messageId: string) => Promise<void>;
  closeTicket: (ticketId: string) => Promise<void>;
  reopenTicket: (ticketId: string) => Promise<void>;
}

// ============================================================================
// SUPPORT REALTIME HOOK
// ============================================================================

export function useSupportRealtime(
  userId: string,
  ticketId?: string // Optional: subscribe to specific ticket
): [SupportRealtimeState, SupportRealtimeActions] {
  
  const [state, setState] = useState<SupportRealtimeState>({
    tickets: [],
    currentTicket: null,
    messages: [],
    unreadCount: 0,
    isConnected: false,
    isLoading: false
  });

  const realtimeBus = getRealtimeBus();

  // ==========================================================================
  // SUBSCRIPTION SETUP
  // ==========================================================================

  useEffect(() => {
    if (!userId) return;

    // Subscribe to support events
    const subscriptionOptions = ticketId
      ? { resourceId: ticketId }
      : { filters: { 'payload.userId': userId } };

    const unsubscribe = realtimeBus.subscribe<any>(
      'support',
      handleRealtimeEvent,
      subscriptionOptions
    );

    // Load ticket details if specific ticket
    if (ticketId) {
      loadTicketDetails(ticketId);
    }

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
    };
  }, [userId, ticketId]);

  // ==========================================================================
  // LOAD TICKET DETAILS
  // ==========================================================================

  const loadTicketDetails = async (ticketId: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const ticketDoc = await getDoc(doc(db, 'support_tickets', ticketId));
      
      if (ticketDoc.exists()) {
        const data = ticketDoc.data();
        const ticket: SupportTicket = {
          id: ticketDoc.id,
          userId: data.userId,
          subject: data.subject,
          category: data.category,
          status: data.status,
          priority: data.priority,
          assignedTo: data.assignedTo,
          assignedToName: data.assignedToName,
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          resolvedAt: data.resolvedAt?.toMillis?.(),
          firstResponseAt: data.firstResponseAt?.toMillis?.(),
          lastMessageAt: data.lastMessageAt?.toMillis?.()
        };

        setState(prev => ({
          ...prev,
          currentTicket: ticket,
          isLoading: false
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[useSupportRealtime] Load ticket error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // ==========================================================================
  // EVENT HANDLER
  // ==========================================================================

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'ticket_message_added':
        handleMessageAdded(event.payload);
        break;
      
      case 'ticket_status_changed':
        handleStatusChanged(event.payload);
        break;
      
      case 'ticket_assigned':
        handleTicketAssigned(event.payload);
        break;
      
      case 'ticket_priority_changed':
        handlePriorityChanged(event.payload);
        break;
      
      case 'ticket_created':
        handleTicketCreated(event.payload);
        break;
      
      default:
        console.log('[useSupportRealtime] Unknown event type:', event.type);
    }
  }, []);

  // ==========================================================================
  // MESSAGE HANDLERS
  // ==========================================================================

  const handleMessageAdded = (payload: any) => {
    const message: SupportMessage = {
      id: payload.messageId,
      ticketId: payload.ticketId,
      senderId: payload.senderId,
      senderType: payload.senderType,
      content: payload.content,
      attachments: payload.attachments,
      createdAt: payload.timestamp || Date.now(),
      isRead: false
    };

    setState(prev => {
      // Update messages if viewing this ticket
      const newMessages = prev.currentTicket?.id === payload.ticketId
        ? [message, ...prev.messages]
        : prev.messages;

      // Increment unread if from agent
      const newUnreadCount = payload.senderType === 'agent'
        ? prev.unreadCount + 1
        : prev.unreadCount;

      return {
        ...prev,
        messages: newMessages,
        unreadCount: newUnreadCount
      };
    });
  };

  const handleStatusChanged = (payload: any) => {
    setState(prev => ({
      ...prev,
      tickets: prev.tickets.map(t =>
        t.id === payload.ticketId
          ? { ...t, status: payload.newStatus, updatedAt: payload.timestamp || Date.now() }
          : t
      ),
      currentTicket: prev.currentTicket?.id === payload.ticketId
        ? { ...prev.currentTicket, status: payload.newStatus, updatedAt: payload.timestamp || Date.now() }
        : prev.currentTicket
    }));
  };

  const handleTicketAssigned = (payload: any) => {
    setState(prev => ({
      ...prev,
      tickets: prev.tickets.map(t =>
        t.id === payload.ticketId
          ? { 
              ...t, 
              assignedTo: payload.agentId,
              assignedToName: payload.agentName,
              updatedAt: payload.timestamp || Date.now()
            }
          : t
      ),
      currentTicket: prev.currentTicket?.id === payload.ticketId
        ? { 
            ...prev.currentTicket, 
            assignedTo: payload.agentId,
            assignedToName: payload.agentName,
            updatedAt: payload.timestamp || Date.now()
          }
        : prev.currentTicket
    }));
  };

  const handlePriorityChanged = (payload: any) => {
    setState(prev => ({
      ...prev,
      tickets: prev.tickets.map(t =>
        t.id === payload.ticketId
          ? { ...t, priority: payload.newPriority, updatedAt: payload.timestamp || Date.now() }
          : t
      ),
      currentTicket: prev.currentTicket?.id === payload.ticketId
        ? { ...prev.currentTicket, priority: payload.newPriority, updatedAt: payload.timestamp || Date.now() }
        : prev.currentTicket
    }));
  };

  const handleTicketCreated = (payload: any) => {
    const ticket: SupportTicket = {
      id: payload.ticketId,
      userId: payload.userId,
      subject: payload.subject,
      category: payload.category,
      status: 'open',
      priority: payload.priority || 'normal',
      createdAt: payload.timestamp || Date.now(),
      updatedAt: payload.timestamp || Date.now()
    };

    setState(prev => ({
      ...prev,
      tickets: [ticket, ...prev.tickets]
    }));
  };

  // ==========================================================================
  // ACTIONS: SEND MESSAGE
  // ==========================================================================

  const sendMessage = useCallback(async (ticketId: string, content: string) => {
    if (!content.trim()) return;

    try {
      // Add message to Firestore
      const messageDoc = await addDoc(collection(db, 'support_messages'), {
        ticketId,
        senderId: userId,
        senderType: 'user',
        content,
        createdAt: serverTimestamp()
      });

      // Publish realtime event
      await realtimeBus.publish('support', {
        channel: 'support',
        type: 'ticket_message_added',
        payload: {
          messageId: messageDoc.id,
          ticketId,
          senderId: userId,
          senderType: 'user',
          content,
          timestamp: Date.now()
        },
        priority: 'normal'
      });

    } catch (error) {
      console.error('[useSupportRealtime] Send message error:', error);
      throw error;
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: CREATE TICKET
  // ==========================================================================

  const createTicket = useCallback(async (
    subject: string,
    category: TicketCategory,
    initialMessage: string
  ): Promise<string> => {
    try {
      // Create ticket in Firestore
      const ticketDoc = await addDoc(collection(db, 'support_tickets'), {
        userId,
        subject,
        category,
        status: 'open',
        priority: 'normal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Add initial message
      await addDoc(collection(db, 'support_messages'), {
        ticketId: ticketDoc.id,
        senderId: userId,
        senderType: 'user',
        content: initialMessage,
        createdAt: serverTimestamp()
      });

      // Publish realtime event
      await realtimeBus.publish('support', {
        channel: 'support',
        type: 'ticket_created',
        payload: {
          ticketId: ticketDoc.id,
          userId,
          subject,
          category,
          priority: 'normal',
          timestamp: Date.now()
        },
        priority: 'normal'
      });

      return ticketDoc.id;

    } catch (error) {
      console.error('[useSupportRealtime] Create ticket error:', error);
      throw error;
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: MARK AS READ
  // ==========================================================================

  const markAsRead = useCallback(async (messageId: string) => {
    try {
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === messageId ? { ...m, isRead: true } : m
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1)
      }));

    } catch (error) {
      console.error('[useSupportRealtime] Mark as read error:', error);
    }
  }, []);

  // ==========================================================================
  // ACTIONS: CLOSE TICKET
  // ==========================================================================

  const closeTicket = useCallback(async (ticketId: string) => {
    try {
      // Publish status change
      await realtimeBus.publish('support', {
        channel: 'support',
        type: 'ticket_status_changed',
        payload: {
          ticketId,
          userId,
          newStatus: 'closed',
          timestamp: Date.now()
        },
        priority: 'normal'
      });

    } catch (error) {
      console.error('[useSupportRealtime] Close ticket error:', error);
      throw error;
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: REOPEN TICKET
  // ==========================================================================

  const reopenTicket = useCallback(async (ticketId: string) => {
    try {
      // Publish status change
      await realtimeBus.publish('support', {
        channel: 'support',
        type: 'ticket_status_changed',
        payload: {
          ticketId,
          userId,
          newStatus: 'open',
          timestamp: Date.now()
        },
        priority: 'normal'
      });

    } catch (error) {
      console.error('[useSupportRealtime] Reopen ticket error:', error);
      throw error;
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // RETURN STATE & ACTIONS
  // ==========================================================================

  return [
    state,
    {
      sendMessage,
      createTicket,
      markAsRead,
      closeTicket,
      reopenTicket
    }
  ];
}

export default useSupportRealtime;
