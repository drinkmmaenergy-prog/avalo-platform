/**
 * Chat Types
 * Defines chat-related types and interfaces
 */

// ============================================================================
// CHAT MESSAGE STATUS (PACK 45)
// ============================================================================

export type ChatMessageStatus =
  | "local"      // Not yet synced to server
  | "synced"     // Stored on server
  | "delivered"  // Received on partner device
  | "read";      // Partner opened the chat

// ============================================================================
// MEDIA UPLOAD STATUS (PACK 47)
// ============================================================================

export type MediaUploadStatus =
  | "none"       // no media attached
  | "pending"    // waiting to upload
  | "uploading"  // actively uploading
  | "uploaded"   // successfully uploaded
  | "failed";    // upload failed, can retry

// ============================================================================
// CHAT MESSAGE
// ============================================================================

export interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  
  // PACK 41: Token-Boosted Replies (Priority Messages)
  isBoosted?: boolean;         // true if boost was applied
  boostExtraTokens?: number;   // how many extra tokens were paid
  
  // PACK 42: Pay-Per-Action Media (PPM)
  mediaType?: 'photo' | 'audio' | 'video';  // type of media attached
  mediaUri?: string;                         // local file path / asset URI
  payToUnlock?: boolean;                     // true if media requires payment
  unlockPriceTokens?: number;                // price if locked
  unlockedBy?: string[];                     // userIds who have paid to unlock
  
  // PACK 45: Delivery Guarantees
  status: ChatMessageStatus;                 // Message delivery status
  serverCreatedAt?: number;                  // Server timestamp when synced
  deliveredAt?: number;                      // When delivered to partner
  readAt?: number;                           // When read by partner
  
  // PACK 47: Cloud Media Delivery
  mediaUploadStatus?: MediaUploadStatus;     // Upload status (default "none")
  mediaStoragePath?: string;                 // e.g. "chat-media/{conversationId}/{messageId}.jpg"
  mediaRemoteUrl?: string;                   // download URL from Firebase Storage
  
  // Additional optional fields
  read?: boolean;
  delivered?: boolean;
  type?: 'text' | 'image' | 'voice' | 'system';
  metadata?: Record<string, any>;
}

// ============================================================================
// CHAT CONVERSATION
// ============================================================================

export interface ChatConversation {
  id: string;
  participants: string[];
  lastMessage?: ChatMessage;
  lastMessageAt: number;
  unreadCount?: number;
}
