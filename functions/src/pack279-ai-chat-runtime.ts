/**
 * PACK 279A — AI Chat Runtime + Token Billing Integration
 * Real-time OpenAI/Claude API calls with token billing via wallet
 * 
 * Features:
 * - Real AI chat for companions
 * - Token billing via PACK 277/321 wallet
 * - Correct 65/35 or 100% Avalo revenue logic
 * - Word-bucket billing (11/7 words per bucket)
 * - Safety enforcement (age, verification, blocking)
 * - Content moderation integration
 */

import { https } from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';
import { spendTokens } from './pack277-wallet-service';
import { generateAIReply } from './services/aiProvider.service';
import { moderateText, logModerationIncident } from './contentModerationEngine';
import { canSendMessage } from './moderationEngine';

// ============================================================================
// TYPES
// ============================================================================

interface AIChatSession {
  sessionId: string;
  userId: string;
  companionId: string;
  isAvaloAI: boolean;        // If true, 100% Avalo revenue
  isUserAI: boolean;          // If true, 65/35 split with AI owner
  aiOwnerId?: string;         // User who owns this AI companion
  systemPrompt: string;
  personality: string;
  nsfwEnabled: boolean;
  context: string[];          // Last N messages for context
  totalBucketsCharged: number;
  totalMessagesCount: number;
  isBlocked: boolean;
  createdAt: any;
  lastMessageAt: any;
  updatedAt: any;
}

interface AICompanionMessage {
  messageId: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  wordCount: number;
  bucketsCharged: number;
  tokensCharged: number;
  wasFree: boolean;
  createdAt: any;
}

interface SendMessageRequest {
  sessionId: string;
  userId: string;
  messageText: string;
}

interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  assistantReply?: string;
  bucketsCharged?: number;
  tokensCharged?: number;
  newBalance?: number;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WORDS_PER_BUCKET_STANDARD = 11;
const WORDS_PER_BUCKET_ROYAL = 7;
const TOKENS_PER_BUCKET = 100;

// Revenue splits
const AVALO_ONLY_SPLIT = { creator: 0, avalo: 1.0 };      // 100% Avalo
const USER_AI_SPLIT = { creator: 0.65, avalo: 0.35 };     // 65/35 split

const MIN_AGE = 18;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_MESSAGES = 20;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count words in text (same logic as existing chat systems)
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (simplified pattern for TS compatibility)
  cleaned = cleaned.replace(/[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Check if user is Royal member
 */
async function isRoyalMember(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  return userData?.royalClubTier !== undefined || userData?.roles?.royal === true;
}

/**
 * Get user age
 */
async function getUserAge(userId: string): Promise<number | null> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;
  
  const userData = userDoc.data();
  const birthDate = userData?.birthDate;
  
  if (!birthDate) return null;
  
  const age = Math.floor((Date.now() - birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age;
}

/**
 * Check if user is verified
 */
async function isUserVerified(userId: string): Promise<boolean> {
  const verificationDoc = await db.collection('verifications').doc(userId).get();
  if (!verificationDoc.exists) return false;
  
  const verificationData = verificationDoc.data();
  return verificationData?.status === 'VERIFIED';
}

/**
 * Load AI chat session
 */
async function loadSession(sessionId: string): Promise<AIChatSession | null> {
  const sessionDoc = await db.collection('aiChatSessions').doc(sessionId).get();
  if (!sessionDoc.exists) return null;
  
  return sessionDoc.data() as AIChatSession;
}

// ============================================================================
// MAIN FUNCTION: pack279_aiChatSendMessage
// ============================================================================

/**
 * Send message to AI companion and get response with token billing
 */
export const pack279_aiChatSendMessage = https.onCall(
  async (request): Promise<SendMessageResponse> => {
    
    const { sessionId, userId, messageText } = request.data as SendMessageRequest;
    const auth = request.auth;
    
    // ========================================================================
    // 1. AUTHENTICATION & AUTHORIZATION
    // ========================================================================
    
    if (!auth || auth.uid !== userId) {
      return {
        success: false,
        error: 'Unauthorized',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    if (!sessionId || !messageText) {
      return {
        success: false,
        error: 'Missing required parameters',
        errorCode: 'INVALID_REQUEST',
      };
    }
    
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return {
        success: false,
        error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        errorCode: 'MESSAGE_TOO_LONG',
      };
    }
    
    // ========================================================================
    // 2. SAFETY ENFORCEMENT (Hard Gates)
    // ========================================================================
    
    // Check age
    const userAge = await getUserAge(userId);
    if (userAge === null || userAge < MIN_AGE) {
      return {
        success: false,
        error: 'You must be 18 or older to use AI chat',
        errorCode: 'AGE_RESTRICTED',
      };
    }
    
    // Check verification
    const isVerified = await isUserVerified(userId);
    if (!isVerified) {
      return {
        success: false,
        error: 'Account verification required to use AI chat',
        errorCode: 'VERIFICATION_REQUIRED',
      };
    }
    
    // Check moderation enforcement
    const messagingCheck = await canSendMessage(userId);
    if (!messagingCheck.allowed) {
      return {
        success: false,
        error: 'Your account is restricted from sending messages',
        errorCode: messagingCheck.reason || 'ACCOUNT_RESTRICTED',
      };
    }
    
    // ========================================================================
    // 3. LOAD SESSION
    // ========================================================================
    
    const session = await loadSession(sessionId);
    
    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        errorCode: 'SESSION_NOT_FOUND',
      };
    }
    
    if (session.userId !== userId) {
      return {
        success: false,
        error: 'Session does not belong to user',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    if (session.isBlocked) {
      return {
        success: false,
        error: 'This AI chat session has been blocked',
        errorCode: 'SESSION_BLOCKED',
      };
    }
    
    // ========================================================================
    // 4. CONTENT MODERATION (Input)
    // ========================================================================
    
    try {
      const moderationResult = await moderateText({
        userId,
        text: messageText,
        language: 'en', // Could detect or use user's language preference
        source: 'ai_chat_prompt',
      });
      
      // If content should be blocked
      if (moderationResult.actions.includes('BLOCK_CONTENT')) {
        // Log incident
        await logModerationIncident(
          { userId, text: messageText, source: 'ai_chat_prompt' },
          moderationResult
        );
        
        return {
          success: false,
          error: 'Your message contains inappropriate content and cannot be sent',
          errorCode: 'CONTENT_BLOCKED',
        };
      }
      
      // Log if flagged but not blocked
      if (moderationResult.category !== 'NONE') {
        await logModerationIncident(
          { userId, text: messageText, source: 'ai_chat_prompt' },
          moderationResult
        );
      }
    } catch (error) {
      // Non-blocking: if moderation fails, log and continue
      console.error('Content moderation error (non-blocking):', error);
    }
    
    // ========================================================================
    // 5. DETERMINE BILLING
    // ========================================================================
    
    const isRoyal = await isRoyalMember(userId);
    const wordsPerBucket = isRoyal ? WORDS_PER_BUCKET_ROYAL : WORDS_PER_BUCKET_STANDARD;
    
    // Determine revenue split
    let contextType: string;
    let earnerUserId: string | null = null;
    
    if (session.isAvaloAI) {
      contextType = 'AVALO_ONLY_REVENUE';
      earnerUserId = null; // 100% Avalo
    } else if (session.isUserAI && session.aiOwnerId) {
      contextType = 'AI_SESSION';
      earnerUserId = session.aiOwnerId; // 65/35 split
    } else {
      return {
        success: false,
        error: 'Invalid session configuration',
        errorCode: 'INVALID_SESSION',
      };
    }
    
    // ========================================================================
    // 6. GENERATE AI RESPONSE
    // ========================================================================
    
    let aiReply: string;
    let aiProvider: string;
    
    try {
      const aiResponse = await generateAIReply({
        systemPrompt: session.systemPrompt,
        contextMessages: session.context || [],
        userMessage: messageText,
        nsfwEnabled: session.nsfwEnabled,
        isMinor: false, // Already checked age >= 18
      });
      
      aiReply = aiResponse.reply;
      aiProvider = aiResponse.provider;
    } catch (error: any) {
      console.error('AI generation error:', error);
      
      return {
        success: false,
        error: 'AI service temporarily unavailable. Please try again.',
        errorCode: 'AI_UNAVAILABLE',
      };
    }
    
    // ========================================================================
    // 7. CONTENT MODERATION (Output)
    // ========================================================================
    
    try {
      const outputModeration = await moderateText({
        userId: 'system', // AI-generated content
        text: aiReply,
        language: 'en',
        source: 'ai_chat_prompt',
      });
      
      // If AI output is inappropriate, flag the session
      if (outputModeration.actions.includes('BLOCK_CONTENT')) {
        // Block the session
        await db.collection('aiChatSessions').doc(sessionId).update({
          isBlocked: true,
          blockReason: 'AI generated inappropriate content',
          blockedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        
        // Log incident
        await logModerationIncident(
          { userId: 'system', text: aiReply, source: 'ai_chat_prompt' },
          outputModeration
        );
        
        return {
          success: false,
          error: 'AI generated inappropriate content. This session has been blocked for review.',
          errorCode: 'AI_OUTPUT_BLOCKED',
        };
      }
    } catch (error) {
      // Non-blocking: if moderation fails, log and continue
      console.error('Output moderation error (non-blocking):', error);
    }
    
    // ========================================================================
    // 8. CALCULATE BILLING
    // ========================================================================
    
    const wordCount = countWords(aiReply);
    const requiredBuckets = Math.ceil(wordCount / wordsPerBucket);
    const tokensCharged = requiredBuckets * TOKENS_PER_BUCKET;
    
    // ========================================================================
    // 9. CHARGE TOKENS
    // ========================================================================
    
    let spendResult = null;
    
    if (tokensCharged > 0) {
      spendResult = await spendTokens({
        userId,
        amountTokens: tokensCharged,
        source: 'CHAT', // Using existing CHAT source type
        relatedId: sessionId,
        creatorId: earnerUserId || undefined,
        metadata: {
          sessionId,
          companionId: session.companionId,
          isAvaloAI: session.isAvaloAI,
          isUserAI: session.isUserAI,
          wordCount,
          requiredBuckets,
          wordsPerBucket,
          aiProvider,
          contextType,
        },
      });
      
      if (!spendResult.success) {
        return {
          success: false,
          error: spendResult.error || 'Failed to charge tokens',
          errorCode: 'INSUFFICIENT_BALANCE',
        };
      }
    }
    
    // ========================================================================
    // 10. STORE MESSAGES & UPDATE SESSION
    // ========================================================================
    
    const userMessageId = generateId();
    const assistantMessageId = generateId();
    
    const batch = db.batch();
    
    // Store user message
    const userMessageRef = db.collection('aiCompanionMessages').doc(userMessageId);
    const userMessage: AICompanionMessage = {
      messageId: userMessageId,
      sessionId,
      userId,
      role: 'user',
      content: messageText,
      wordCount: countWords(messageText),
      bucketsCharged: 0, // User doesn't pay for their own message
      tokensCharged: 0,
      wasFree: false,
      createdAt: serverTimestamp(),
    };
    batch.set(userMessageRef, userMessage);
    
    // Store assistant message
    const assistantMessageRef = db.collection('aiCompanionMessages').doc(assistantMessageId);
    const assistantMessage: AICompanionMessage = {
      messageId: assistantMessageId,
      sessionId,
      userId,
      role: 'assistant',
      content: aiReply,
      wordCount,
      bucketsCharged: requiredBuckets,
      tokensCharged,
      wasFree: tokensCharged === 0,
      createdAt: serverTimestamp(),
    };
    batch.set(assistantMessageRef, assistantMessage);
    
    // Update session
    const sessionRef = db.collection('aiChatSessions').doc(sessionId);
    const newContext = [
      ...session.context.slice(-MAX_CONTEXT_MESSAGES + 2),
      `User: ${messageText}`,
      `Bot: ${aiReply}`,
    ];
    
    batch.update(sessionRef, {
      context: newContext,
      totalBucketsCharged: increment(requiredBuckets),
      totalMessagesCount: increment(2),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    await batch.commit();
    
    // ========================================================================
    // 11. RETURN SUCCESS
    // ========================================================================
    
    return {
      success: true,
      messageId: assistantMessageId,
      assistantReply: aiReply,
      bucketsCharged: requiredBuckets,
      tokensCharged,
      newBalance: spendResult?.newBalance || 0,
    };
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack279_aiChatSendMessage,
};