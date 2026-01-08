import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  getDoc,
  Timestamp,
  serverTimestamp,
  increment,
  writeBatch,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  createEscrow,
  getEscrow,
  deductFromEscrow,
  releaseEscrow,
  needsTopUp,
} from './escrowService';
import { calculateEscrowDeduction, EARN_TO_CHAT_CONFIG } from '../config/monetization';
import { sendLocalNotification } from './notificationService';
import {
  updateOnIncomingMessage,
  updateOnReply,
} from './profileRankService';
import { ChatMessage as ChatMessageType } from '../types/chat';
import { getChatPrice } from './messagePricingService';
import { registerMessageActivity } from './loyalStreakService';
import { syncMessage, syncTokenSpent } from './backSyncService';
import { recordPersonalizationEvent } from './personalizationService'; // PACK 49

// Re-export ChatMessage type from types/chat.ts
export type ChatMessage = ChatMessageType;

// Firestore message type (for backward compatibility)
interface FirestoreChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  // PACK 42 fields
  mediaType?: 'photo' | 'audio' | 'video';
  mediaUri?: string;
  payToUnlock?: boolean;
  unlockPriceTokens?: number;
  unlockedBy?: string[];
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastTimestamp: Timestamp;
  unreadCountPerUser: { [uid: string]: number };
  isMatched?: boolean;
  hasEscrow?: boolean;
}

export interface ChatWithUserData extends Chat {
  otherUserName?: string;
  otherUserPhoto?: string;
}

// Initialize Firestore
const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

/**
 * Find existing chat between two users
 */
export const findExistingChat = async (
  userId1: string, 
  userId2: string
): Promise<string | null> => {
  try {
    const db = getDb();
    const chatsRef = collection(db, 'chats');
    
    const q = query(
      chatsRef,
      where('participants', 'array-contains', userId1)
    );
    
    const snapshot = await getDocs(q);
    
    for (const doc of snapshot.docs) {
      const participants = doc.data().participants as string[];
      if (participants.includes(userId2)) {
        return doc.id;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding existing chat:', error);
    throw error;
  }
};

/**
 * Check if two users are matched
 */
const areUsersMatched = async (userId1: string, userId2: string): Promise<boolean> => {
  try {
    const db = getDb();
    // Check if users have matched (liked each other)
    const matchesRef = collection(db, 'matches');
    const q = query(matchesRef, where('users', 'array-contains', userId1));
    const snapshot = await getDocs(q);
    
    for (const doc of snapshot.docs) {
      const users = doc.data().users as string[];
      if (users.includes(userId2)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking match:', error);
    return false;
  }
};

/**
 * Create a new chat with initial message and Earn-to-Chat logic
 */
export const createChat = async (
  senderId: string,
  receiverId: string,
  initialMessage: string
): Promise<string> => {
  try {
    const db = getDb();
    const chatsRef = collection(db, 'chats');
    
    // Check if users are matched
    const isMatched = await areUsersMatched(senderId, receiverId);
    
    // Create chat document first to get chat ID
    const chatDoc = await addDoc(chatsRef, {
      participants: [senderId, receiverId],
      lastMessage: initialMessage,
      lastTimestamp: serverTimestamp(),
      unreadCountPerUser: {
        [senderId]: 0,
        [receiverId]: 1
      },
      isMatched,
      hasEscrow: false, // Will be updated if escrow created
    });
    
    // PACK 39/41/42: Get message price for token tracking
    const messagePrice = await getChatPrice(chatDoc.id);
    let tokensSpent = messagePrice;
    
    // If not matched, create escrow with initial deposit
    let hasEscrow = false;
    if (!isMatched) {
      try {
        await createEscrow(chatDoc.id, senderId, receiverId);
        hasEscrow = true;
        // Update chat to reflect escrow
        const chatRef = doc(db, 'chats', chatDoc.id);
        await updateDoc(chatRef, { hasEscrow: true });
      } catch (error: any) {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        throw error;
      }
    }
    
    // Add initial message
    const messagesRef = collection(db, `chats/${chatDoc.id}/messages`);
    const messageTimestamp = Date.now();
    const initialMessageRef = await addDoc(messagesRef, {
      senderId,
      text: initialMessage,
      timestamp: serverTimestamp(),
      status: 'local', // PACK 45: Initial status
    });
    
    // PACK 43: Register initial message activity for streak tracking
    try {
      await registerMessageActivity(senderId, receiverId, {
        isSender: true,
        tokensSpentByUser: tokensSpent,
        messageCreatedAt: messageTimestamp,
      });
    } catch (error) {
      console.error('[PACK 43] Error registering streak activity:', error);
      // Don't throw - streak tracking failure shouldn't break chat creation
    }
    
    // PACK 44/45: Backend sync - message (AFTER local success)
    try {
      const syncResult = await syncMessage({
        id: initialMessageRef.id,
        messageId: initialMessageRef.id,
        senderId,
        receiverId,
        text: initialMessage,
        createdAt: messageTimestamp,
        status: 'local', // Will be updated to 'synced' on backend
      } as any);
      
      // PACK 45: Update message with serverCreatedAt and status='synced' if successful
      if (syncResult.serverCreatedAt) {
        await updateDoc(initialMessageRef, {
          status: 'synced',
          serverCreatedAt: syncResult.serverCreatedAt,
        });
      }
    } catch (error) {
      console.error('[PACK 44] Error syncing message to backend:', error);
      // Don't throw - backend sync failure shouldn't break chat creation
    }
    
    // PACK 44: Backend sync - token spent (AFTER local success)
    if (tokensSpent > 0) {
      try {
        await syncTokenSpent(senderId, tokensSpent, 'message_send');
      } catch (error) {
        console.error('[PACK 44] Error syncing token spent to backend:', error);
        // Don't throw - backend sync failure shouldn't break chat creation
      }
    }
    
    // PACK 49: Record personalization events
    try {
      await recordPersonalizationEvent(senderId, 'CHAT_MESSAGE_SENT', {
        targetUserId: receiverId,
      });
      
      if (tokensSpent > 0) {
        await recordPersonalizationEvent(senderId, 'TOKENS_SPENT', {
          tokensSpent,
        });
      }
    } catch (error) {
      // Silently fail - personalization should never block chat
      console.debug('[PACK 49] Personalization event recording failed (non-blocking)');
    }
    
    // PACK 40: Update profile signals for incoming message
    await updateOnIncomingMessage(receiverId, messageTimestamp);
    
    return chatDoc.id;
  } catch (error) {
    console.error('Error creating chat:', error);
    throw error;
  }
};

/**
 * Send a message to existing chat with Earn-to-Chat billing
 */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  text: string
): Promise<void> => {
  try {
    const db = getDb();
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    const chatRef = doc(db, 'chats', chatId);
    
    // Get chat to determine other user and escrow status
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
      throw new Error('Chat not found');
    }
    
    const chatData = chatSnap.data();
    const participants = chatData.participants as string[];
    const otherUserId = participants.find(id => id !== senderId);
    
    if (!otherUserId) {
      throw new Error('Other user not found');
    }
    
    // PACK 39/41/42: Get message price for token tracking
    const messagePrice = await getChatPrice(chatId);
    let tokensSpent = messagePrice; // Track actual tokens spent by user
    
    // If chat has escrow, deduct tokens based on word count
    if (chatData.hasEscrow && !chatData.isMatched) {
      const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      
      try {
        const { tokensDeducted, remainingBalance } = await deductFromEscrow(chatId, wordCount);
        tokensSpent = tokensDeducted; // Use actual deducted amount
        
        // If balance is low, send notification to user
        if (remainingBalance < EARN_TO_CHAT_CONFIG.MIN_ESCROW_BALANCE) {
          try {
            await sendLocalNotification(
              '⚠️ Escrow Running Low',
              `Your Earn-to-Chat balance is below ${EARN_TO_CHAT_CONFIG.MIN_ESCROW_BALANCE} tokens. Top up to continue chatting!`,
              {
                type: 'escrow_low',
                chatId,
                remainingBalance,
              }
            );
          } catch (error) {
            console.error('Error sending escrow notification:', error);
          }
        }
        
        console.log(`Deducted ${tokensDeducted} tokens for message with ${wordCount} words. Remaining: ${remainingBalance}`);
        
        // After deduction, release tokens to receiver using escrow logic
        await releaseEscrow(chatId, tokensDeducted);
      } catch (error: any) {
        if (error.message === 'ESCROW_DEPLETED') {
          throw new Error('ESCROW_DEPLETED');
        }
        if (error.message === 'INSUFFICIENT_BALANCE') {
          throw new Error('ESCROW_DEPLETED');
        }
        throw error;
      }
    }
    
    const batch = writeBatch(db);
    
    // Add message
    const messageRef = doc(messagesRef);
    const messageTimestamp = Date.now();
    batch.set(messageRef, {
      senderId,
      text,
      timestamp: serverTimestamp(),
      status: 'local', // PACK 45: Initial status
    });
    
    // Update chat
    batch.update(chatRef, {
      lastMessage: text,
      lastTimestamp: serverTimestamp(),
      [`unreadCountPerUser.${otherUserId}`]: increment(1)
    });
    
    await batch.commit();
    
    // PACK 43: Register message activity for streak tracking
    try {
      await registerMessageActivity(senderId, otherUserId, {
        isSender: true,
        tokensSpentByUser: tokensSpent,
        messageCreatedAt: messageTimestamp,
      });
    } catch (error) {
      console.error('[PACK 43] Error registering streak activity:', error);
      // Don't throw - streak tracking failure shouldn't break message sending
    }
    
    // PACK 44/45: Backend sync - message (AFTER local success)
    try {
      const syncResult = await syncMessage({
        id: messageRef.id,
        messageId: messageRef.id,
        senderId,
        receiverId: otherUserId,
        text,
        createdAt: messageTimestamp,
        status: 'local',
      } as any);
      
      // PACK 45: Update message with serverCreatedAt and status='synced' if successful
      if (syncResult.serverCreatedAt) {
        await updateDoc(doc(db, `chats/${chatId}/messages`, messageRef.id), {
          status: 'synced',
          serverCreatedAt: syncResult.serverCreatedAt,
        });
      }
    } catch (error) {
      console.error('[PACK 44] Error syncing message to backend:', error);
      // Don't throw - backend sync failure shouldn't break message sending
    }
    
    // PACK 44: Backend sync - token spent (AFTER local success)
    if (tokensSpent > 0) {
      try {
        await syncTokenSpent(senderId, tokensSpent, 'message_send');
      } catch (error) {
        console.error('[PACK 44] Error syncing token spent to backend:', error);
        // Don't throw - backend sync failure shouldn't break message sending
      }
    }
    
    // PACK 49: Record personalization events
    try {
      await recordPersonalizationEvent(senderId, 'CHAT_MESSAGE_SENT', {
        targetUserId: otherUserId,
      });
      
      if (tokensSpent > 0) {
        await recordPersonalizationEvent(senderId, 'TOKENS_SPENT', {
          tokensSpent,
        });
      }
    } catch (error) {
      // Silently fail - personalization should never block chat
      console.debug('[PACK 49] Personalization event recording failed (non-blocking)');
    }
    
    // PACK 40: Update profile signals
    // Receiver gets incoming message
    await updateOnIncomingMessage(otherUserId, messageTimestamp);
    
    // Sender is replying - check if this is a reply by looking at message history
    const messagesSnapshot = await getDocs(query(messagesRef, orderBy('timestamp', 'desc')));
    if (messagesSnapshot.docs.length > 1) {
      // This is a reply (not first message)
      const previousMessages = messagesSnapshot.docs.slice(1); // Skip the just-added message
      const lastIncomingMessage = previousMessages.find(doc => {
        const data = doc.data();
        return data.senderId === otherUserId;
      });
      
      if (lastIncomingMessage) {
        const lastMessageData = lastIncomingMessage.data();
        const originalMessageTimestamp = lastMessageData.timestamp?.toMillis() || messageTimestamp - 60000;
        await updateOnReply(senderId, messageTimestamp, originalMessageTimestamp);
      }
    }
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Get or create chat, then send message
 */
export const getOrCreateChatAndSendMessage = async (
  senderId: string,
  receiverId: string,
  message: string
): Promise<string> => {
  try {
    // Check for existing chat
    let chatId = await findExistingChat(senderId, receiverId);
    
    if (chatId) {
      // Send message to existing chat
      await sendMessage(chatId, senderId, message);
      return chatId;
    } else {
      // Create new chat with initial message
      chatId = await createChat(senderId, receiverId, message);
      return chatId;
    }
  } catch (error) {
    console.error('Error in getOrCreateChatAndSendMessage:', error);
    throw error;
  }
};

/**
 * Subscribe to user's chats list
 */
export const subscribeToUserChats = (
  userId: string,
  onChatsUpdate: (chats: Chat[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const db = getDb();
    const chatsRef = collection(db, 'chats');
    
    const q = query(
      chatsRef,
      where('participants', 'array-contains', userId),
      orderBy('lastTimestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats: Chat[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        } as Chat));
        
        onChatsUpdate(chats);
      },
      (error) => {
        console.error('Error in chats subscription:', error);
        if (onError) {
          onError(error);
        }
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to chats:', error);
    throw error;
  }
};

/**
 * Subscribe to messages in a chat
 */
export const subscribeToMessages = (
  chatId: string,
  onMessagesUpdate: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const db = getDb();
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        } as ChatMessage));
        
        onMessagesUpdate(messages);
      },
      (error) => {
        console.error('Error in messages subscription:', error);
        if (onError) {
          onError(error);
        }
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to messages:', error);
    throw error;
  }
};

/**
 * Mark chat as read for current user
 */
export const markChatAsRead = async (
  chatId: string,
  userId: string
): Promise<void> => {
  try {
    const db = getDb();
    const chatRef = doc(db, 'chats', chatId);
    
    await updateDoc(chatRef, {
      [`unreadCountPerUser.${userId}`]: 0
    });
  } catch (error) {
    console.error('Error marking chat as read:', error);
    throw error;
  }
};

/**
 * Get chat details
 */
export const getChatDetails = async (chatId: string): Promise<Chat | null> => {
  try {
    const db = getDb();
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      return null;
    }
    
    return {
      id: chatSnap.id,
      ...chatSnap.data()
    } as Chat;
  } catch (error) {
    console.error('Error getting chat details:', error);
    throw error;
  }
};

/**
 * Get total unread count for user
 */
export const getTotalUnreadCount = async (userId: string): Promise<number> => {
  try {
    const db = getDb();
    const chatsRef = collection(db, 'chats');
    
    const q = query(
      chatsRef,
      where('participants', 'array-contains', userId)
    );
    
    const snapshot = await getDocs(q);
    let totalUnread = 0;
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const unreadCount = data.unreadCountPerUser?.[userId] || 0;
      totalUnread += unreadCount;
    });
    
    return totalUnread;
  } catch (error) {
    console.error('Error getting total unread count:', error);
    return 0;
  }
};