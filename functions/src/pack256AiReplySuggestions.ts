/**
 * PACK 256: AI Reply Accelerator - Smart Message Suggestions
 * 
 * Generates AI-powered reply suggestions to boost chat engagement and revenue.
 * This system helps users who struggle with conversation by providing contextual,
 * tone-aware reply suggestions without replacing human authenticity.
 * 
 * Key Features:
 * - 6 tone modes: Flirty, Sweet, Confident, Elegant, Savage, NSFW
 * - Anti-manipulation filtering to prevent scams
 * - Consent-aware NSFW suggestions (requires PACK 249)
 * - Performance tracking and optimization
 * - Monetization integration for high-value moments
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import { HttpsError } from 'firebase-functions/v2/https';

// ============================================================================
// TYPES
// ============================================================================

export type SuggestionTone = 'flirty' | 'sweet' | 'confident' | 'elegant' | 'savage' | 'nsfw';

export type SuggestionTrigger =
  | 'first_message'           // First message in chat
  | 'long_pause'              // After extended silence
  | 'seen_no_reply'           // Read but not replied
  | 'after_argument'          // Detected tension
  | 'after_romantic'          // After romantic/flirty message
  | 'after_sexy'              // After sexy message (requires consent)
  | 'in_paid_chat'            // During paid chat session
  | 'after_media_unlock'      // After unlocking paid media
  | 'paywall_moment'          // Near chat paywall transition
  | 'manual_request';         // User manually requested

export interface SuggestionContext {
  chatId: string;
  userId: string;
  lastMessage?: {
    senderId: string;
    text: string;
    sentAt: Date;
  };
  conversationHistory: Array<{
    senderId: string;
    text: string;
    sentAt: Date;
  }>;
  chatMode: 'FREE_A' | 'FREE_B' | 'PAID';
  chatState: string;
  isPaidChat: boolean;
  participantGenders: { [userId: string]: string };
  trigger: SuggestionTrigger;
}

export interface SuggestionResult {
  suggestions: string[];
  tone: SuggestionTone;
  sessionId: string;
  expiresAt: Date;
  confidence: number;
  monetizationContext?: {
    isHighValue: boolean;
    nearPaywall: boolean;
    inPaidChat: boolean;
  };
}

export interface SuggestionTracking {
  sessionId: string;
  userId: string;
  chatId: string;
  suggestions: string[];
  tone: SuggestionTone;
  trigger: SuggestionTrigger;
  selectedIndex?: number;
  action: 'accepted' | 'edited' | 'ignored';
  editedText?: string;
  createdAt: Date;
  respondedAt?: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUGGESTION_COUNT = 3;
const SUGGESTION_EXPIRY_MINUTES = 5;
const LONG_PAUSE_THRESHOLD_MINUTES = 30;
const SEEN_NO_REPLY_THRESHOLD_MINUTES = 10;
const MAX_CONVERSATION_HISTORY = 20;

// Anti-manipulation keywords (reject suggestions containing these patterns)
const BLOCKED_PATTERNS = [
  /\bmoney\b/i,
  /\bcash\b/i,
  /\bgift\b/i,
  /\bvenmo\b/i,
  /\bpaypal\b/i,
  /\bzelle\b/i,
  /\bcashapp\b/i,
  /\bwire transfer\b/i,
  /\bemergency\b/i,
  /\bhelp me\b/i,
  /\bneed \$\b/i,
  /\bbuy me\b/i,
  /\bsend me\b/i,
  /\bbank account\b/i,
  /\bcredit card\b/i,
  /\bdonation\b/i,
  /\bsugar daddy\b/i,
  /\bsugar mommy\b/i,
  /\boffline\b/i,
  /\boutside.*app\b/i,
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /\bphone number\b/i,
  /\bemail\b/i,
  /\bsocial media\b/i,
  /\binstagram\b/i,
  /\bsnap\b/i,
  /\btiktok\b/i,
];

// ============================================================================
// CORE FUNCTION: Generate AI Suggestions
// ============================================================================

/**
 * Generate AI-powered reply suggestions based on chat context and tone
 * This is the main entry point for suggestion generation
 */
export async function generateReplySuggestions(
  context: SuggestionContext,
  requestedTone: SuggestionTone
): Promise<SuggestionResult> {
  
  // Validate user has consent for NSFW if requesting NSFW tone
  if (requestedTone === 'nsfw') {
    const hasConsent = await checkNSFWConsent(context.userId, context.chatId);
    if (!hasConsent) {
      throw new HttpsError(
        'failed-precondition',
        'NSFW suggestions require mutual consent from both participants'
      );
    }
  }
  
  // Check if user preferences allow AI suggestions
  const prefsEnabled = await checkUserPreferences(context.userId);
  if (!prefsEnabled) {
    throw new HttpsError(
      'failed-precondition',
      'AI suggestions are disabled in your preferences'
    );
  }
  
  // Analyze monetization context
  const monetizationContext = analyzeMonetizationContext(context);
  
  // Generate suggestions based on tone and context
  const rawSuggestions = await generateSuggestionsByTone(
    context,
    requestedTone,
    monetizationContext
  );
  
  // Filter out any suggestions that violate anti-manipulation rules
  const filteredSuggestions = filterManipulativeSuggestions(rawSuggestions);
  
  if (filteredSuggestions.length < SUGGESTION_COUNT) {
    // Fallback to safe suggestions if filtering removed too many
    const safeFallbacks = generateSafeFallbackSuggestions(requestedTone);
    while (filteredSuggestions.length < SUGGESTION_COUNT && safeFallbacks.length > 0) {
      filteredSuggestions.push(safeFallbacks.shift()!);
    }
  }
  
  // Create session for tracking
  const sessionId = generateId();
  const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_MINUTES * 60 * 1000);
  
  await db.collection('ai_suggestion_sessions').doc(sessionId).set({
    sessionId,
    userId: context.userId,
    chatId: context.chatId,
    suggestions: filteredSuggestions.slice(0, SUGGESTION_COUNT),
    tone: requestedTone,
    trigger: context.trigger,
    accepted: false,
    edited: false,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  
  // Track analytics (async, non-blocking)
  trackSuggestionGeneration(context.userId, context.chatId, requestedTone, context.trigger)
    .catch(err => console.error('Failed to track suggestion generation:', err));
  
  return {
    suggestions: filteredSuggestions.slice(0, SUGGESTION_COUNT),
    tone: requestedTone,
    sessionId,
    expiresAt,
    confidence: calculateConfidence(context, requestedTone),
    monetizationContext,
  };
}

// ============================================================================
// SUGGESTION GENERATION BY TONE
// ============================================================================

/**
 * Generate tone-specific suggestions based on conversation context
 * In production, this would call an LLM API (OpenAI, Claude, etc.)
 * For now, uses template-based generation
 */
async function generateSuggestionsByTone(
  context: SuggestionContext,
  tone: SuggestionTone,
  monetizationContext: { isHighValue: boolean; nearPaywall: boolean; inPaidChat: boolean }
): Promise<string[]> {
  
  const lastMessage = context.lastMessage?.text || '';
  const isFirstMessage = context.trigger === 'first_message';
  
  // Get conversation sentiment
  const sentiment = analyzeConversationSentiment(context.conversationHistory);
  
  // Template-based suggestions by tone
  // In production, replace with LLM API call
  switch (tone) {
    case 'flirty':
      return generateFlirtySuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    case 'sweet':
      return generateSweetSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    case 'confident':
      return generateConfidentSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    case 'elegant':
      return generateElegantSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    case 'savage':
      return generateSavageSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    case 'nsfw':
      return generateNSFWSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
    
    default:
      return generateSweetSuggestions(lastMessage, isFirstMessage, sentiment, monetizationContext);
  }
}

/**
 * Generate flirty suggestions - playful, teasing tone
 */
function generateFlirtySuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  if (isFirstMessage) {
    return [
      "Hey there! You've got a smile that could light up this whole app 😊",
      "Well aren't you a pleasant surprise in my notifications... 😏",
      "I was hoping you'd message me. Great timing! 💫",
    ];
  }
  
  if (monetization.inPaidChat) {
    return [
      "You know what? Every message from you makes my day better ❤️",
      "I'm really enjoying getting to know you... tell me more 😊",
      "This conversation is going somewhere special, I can feel it ✨",
    ];
  }
  
  return [
    "You're making it hard to focus on anything else right now 😏",
    "Is it just me, or is this getting more interesting by the message?",
    "I like where this is going... keep talking 😊",
  ];
}

/**
 * Generate sweet suggestions - warm, romantic tone
 */
function generateSweetSuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  if (isFirstMessage) {
    return [
      "Hi! I'm so glad we matched - your profile caught my eye 😊",
      "Hello! I'd love to get to know you better. How's your day going?",
      "Hey there! You seem really interesting, I'm excited to chat with you ☺️",
    ];
  }
  
  if (monetization.inPaidChat) {
    return [
      "I really appreciate you taking the time to talk with me ❤️",
      "This is exactly the kind of connection I was hoping to find here",
      "You have such a warm presence. I'm really enjoying our conversation 💕",
    ];
  }
  
  return [
    "That's so thoughtful of you to share that with me 💕",
    "I love how genuine you are. It's refreshing!",
    "You're making me smile so much right now 😊",
  ];
}

/**
 * Generate confident suggestions - bold, assertive tone
 */
function generateConfidentSuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  if (isFirstMessage) {
    return [
      "I saw your profile and had to reach out. Let's not waste time - what are you looking for?",
      "You caught my attention. I like what I see. Want to get to know each other?",
      "I don't usually message first, but something about you made me break that rule 😎",
    ];
  }
  
  if (monetization.nearPaywall) {
    return [
      "I think we have real chemistry here. Let's take this conversation deeper.",
      "I'm not here to play games. Are you feeling this connection too?",
      "This is going well. I want to keep talking - let's make it happen.",
    ];
  }
  
  return [
    "I like your energy. Tell me something that would surprise me.",
    "You're interesting. I want to know what makes you tick.",
    "Let's be real for a second - what do you really want from this?",
  ];
}

/**
 * Generate elegant suggestions - polite, classy tone
 */
function generateElegantSuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  if (isFirstMessage) {
    return [
      "Good evening! Your profile immediately caught my attention. I'd be delighted to know more about you.",
      "Hello! I must say, your interests align remarkably well with mine. Shall we chat?",
      "Greetings! I found your perspective quite intriguing. I'd love to continue this conversation.",
    ];
  }
  
  return [
    "That's a fascinating perspective. I'd love to hear more of your thoughts on this.",
    "Your insights are quite refreshing. It's rare to find someone who thinks this way.",
    "I appreciate your openness. It creates such a pleasant atmosphere for our conversation.",
  ];
}

/**
 * Generate savage suggestions - fun sarcasm, playful banter
 */
function generateSavageSuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  if (isFirstMessage) {
    return [
      "So... come here often? 😏 (Had to get that out of my system)",
      "Your profile made me laugh. Points for that. Let's see if you can keep up.",
      "I'm giving you 3 messages to impress me. No pressure 😉",
    ];
  }
  
  return [
    "Okay okay, I'll admit it - you're actually pretty funny 😂",
    "Bold of you to assume I'm that easy to win over... but keep trying, it's working",
    "Did you practice that line? Because it's almost smooth enough to work on me 😏",
  ];
}

/**
 * Generate NSFW suggestions - sexy, intimate tone (requires consent)
 */
function generateNSFWSuggestions(
  lastMessage: string,
  isFirstMessage: boolean,
  sentiment: string,
  monetization: any
): string[] {
  // NSFW suggestions should never be for first messages
  if (isFirstMessage) {
    return generateFlirtySuggestions(lastMessage, isFirstMessage, sentiment, monetization);
  }
  
  // Soft NSFW - suggestive but not explicit
  return [
    "You're making it very hard to behave right now... 😏",
    "I keep thinking about what you said earlier... it's driving me a little crazy 🔥",
    "The things I'm imagining right now... should I tell you or keep you guessing? 😈",
  ];
}

// ============================================================================
// ANTI-MANIPULATION FILTERING
// ============================================================================

/**
 * Filter out suggestions that contain manipulation patterns
 * Ensures compliance and user safety
 */
function filterManipulativeSuggestions(suggestions: string[]): string[] {
  return suggestions.filter(suggestion => {
    // Check against blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(suggestion)) {
        console.warn(`Filtered manipulative suggestion: ${suggestion}`);
        return false;
      }
    }
    
    // Additional checks
    if (suggestion.length > 300) return false; // Too long
    if (suggestion.length < 10) return false; // Too short
    
    return true;
  });
}

/**
 * Generate safe fallback suggestions when filtering removes too many
 */
function generateSafeFallbackSuggestions(tone: SuggestionTone): string[] {
  const fallbacks = {
    flirty: [
      "You're definitely keeping my attention 😊",
      "I'm curious to know more about you",
      "This conversation is going well!",
    ],
    sweet: [
      "That's really nice of you to say 😊",
      "I'm enjoying talking with you",
      "You seem like a really genuine person",
    ],
    confident: [
      "I appreciate your directness",
      "Let's keep this going",
      "I like your style",
    ],
    elegant: [
      "Thank you for sharing that perspective",
      "I find our conversation quite engaging",
      "Your thoughtfulness is appreciated",
    ],
    savage: [
      "Alright, you've got my attention",
      "Fair enough, I'll give you that one",
      "You might actually be worth my time 😏",
    ],
    nsfw: [
      "You're definitely on my mind right now 😏",
      "I like where your head's at",
      "This energy between us is interesting...",
    ],
  };
  
  return fallbacks[tone] || fallbacks.sweet;
}

// ============================================================================
// CONSENT & PREFERENCES
// ============================================================================

/**
 * Check if both participants have consented to NSFW content
 * Integrates with PACK 249 Adult Mode
 */
async function checkNSFWConsent(userId: string, chatId: string): Promise<boolean> {
  try {
    // Get chat participants
    const chatSnap = await db.collection('chats').doc(chatId).get();
    if (!chatSnap.exists) return false;
    
    const chat = chatSnap.data() as any;
    const participants = chat.participants || [];
    
    // Check both users have NSFW consent
    for (const participantId of participants) {
      const consentSnap = await db
        .collection('users')
        .doc(participantId)
        .collection('ai_preferences')
        .doc('chat_suggestions')
        .get();
      
      if (!consentSnap.exists) return false;
      
      const prefs = consentSnap.data();
      if (!prefs?.nsfwConsent) return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking NSFW consent:', error);
    return false;
  }
}

/**
 * Check if user has AI suggestions enabled
 */
async function checkUserPreferences(userId: string): Promise<boolean> {
  try {
    const prefsSnap = await db
      .collection('users')
      .doc(userId)
      .collection('ai_preferences')
      .doc('chat_suggestions')
      .get();
    
    if (!prefsSnap.exists) return true; // Default enabled
    
    const prefs = prefsSnap.data();
    return prefs?.enabled !== false;
  } catch (error) {
    console.error('Error checking user preferences:', error);
    return true; // Default enabled on error
  }
}

// ============================================================================
// CONTEXT ANALYSIS
// ============================================================================

/**
 * Analyze monetization context to optimize suggestion timing
 */
function analyzeMonetizationContext(context: SuggestionContext) {
  const isHighValue = 
    context.trigger === 'after_media_unlock' ||
    context.trigger === 'in_paid_chat' ||
    context.trigger === 'paywall_moment';
  
  const nearPaywall = 
    context.chatMode === 'FREE_B' ||
    context.trigger === 'paywall_moment';
  
  const inPaidChat = 
    context.chatMode === 'PAID' ||
    context.isPaidChat;
  
  return { isHighValue, nearPaywall, inPaidChat };
}

/**
 * Analyze conversation sentiment for better contextual suggestions
 */
function analyzeConversationSentiment(history: Array<{ text: string }>): string {
  if (history.length === 0) return 'neutral';
  
  const recentMessages = history.slice(-5);
  
  // Simple keyword-based sentiment analysis
  let positiveCount = 0;
  let negativeCount = 0;
  
  const positiveKeywords = ['love', 'great', 'amazing', 'wonderful', 'happy', 'excited', 'perfect', 'beautiful'];
  const negativeKeywords = ['bad', 'sad', 'angry', 'wrong', 'terrible', 'upset', 'disappointed', 'frustrat'];
  
  for (const msg of recentMessages) {
    const lowerText = msg.text.toLowerCase();
    positiveCount += positiveKeywords.filter(kw => lowerText.includes(kw)).length;
    negativeCount += negativeKeywords.filter(kw => lowerText.includes(kw)).length;
  }
  
  if (positiveCount > negativeCount + 1) return 'positive';
  if (negativeCount > positiveCount + 1) return 'negative';
  return 'neutral';
}

/**
 * Calculate confidence score for suggestions
 */
function calculateConfidence(context: SuggestionContext, tone: SuggestionTone): number {
  let confidence = 0.7; // Base confidence
  
  // Increase confidence with more conversation history
  if (context.conversationHistory.length > 5) confidence += 0.1;
  if (context.conversationHistory.length > 10) confidence += 0.1;
  
  // Decrease confidence for NSFW without sufficient context
  if (tone === 'nsfw' && context.conversationHistory.length < 5) confidence -= 0.2;
  
  // Increase confidence in paid chats (users more invested)
  if (context.isPaidChat) confidence += 0.1;
  
  return Math.min(Math.max(confidence, 0.3), 1.0);
}

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

/**
 * Determine if suggestions should be shown based on chat context
 */
export async function shouldShowSuggestions(
  chatId: string,
  userId: string
): Promise<{ should: boolean; trigger?: SuggestionTrigger; reason?: string }> {
  
  try {
    const chatSnap = await db.collection('chats').doc(chatId).get();
    if (!chatSnap.exists) {
      return { should: false, reason: 'Chat not found' };
    }
    
    const chat = chatSnap.data() as any;
    
    // Get recent messages
    const messagesSnap = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    const messages = messagesSnap.docs.map(doc => doc.data());
    
    // Check various triggers
    
    // 1. First message in chat
    if (messages.length === 0) {
      return { should: true, trigger: 'first_message' };
    }
    
    // 2. Long pause (30+ minutes)
    const lastMessage = messages[0];
    const lastMessageTime = lastMessage.createdAt?.toDate?.() || new Date();
    const minutesSinceLastMessage = (Date.now() - lastMessageTime.getTime()) / (1000 * 60);
    
    if (minutesSinceLastMessage > LONG_PAUSE_THRESHOLD_MINUTES) {
      return { should: true, trigger: 'long_pause' };
    }
    
    // 3. Seen but not replied (requires read receipts)
    // TODO: Implement read receipt checking when available
    
    // 4. In paid chat
    if (chat.mode === 'PAID' && chat.state === 'PAID_ACTIVE') {
      return { should: true, trigger: 'in_paid_chat' };
    }
    
    // 5. Near paywall
    if (chat.mode === 'FREE_B' && chat.state === 'AWAITING_DEPOSIT') {
      return { should: true, trigger: 'paywall_moment' };
    }
    
    // 6. After romantic/sexy message (detect keywords)
    if (messages.length > 0) {
      const lastText = messages[0].text?.toLowerCase() || '';
      const romanticKeywords = ['love', 'kiss', 'heart', 'beautiful', 'gorgeous', 'sexy', 'stunning'];
      
      if (romanticKeywords.some(kw => lastText.includes(kw))) {
        return { should: true, trigger: 'after_romantic' };
      }
    }
    
    return { should: false, reason: 'No active trigger detected' };
  } catch (error) {
    console.error('Error checking suggestion triggers:', error);
    return { should: false, reason: 'Error checking triggers' };
  }
}

// ============================================================================
// TRACKING & ANALYTICS
// ============================================================================

/**
 * Track when user accepts, edits, or ignores a suggestion
 */
export async function trackSuggestionAction(
  sessionId: string,
  action: 'accepted' | 'edited' | 'ignored',
  editedText?: string
): Promise<void> {
  try {
    const sessionSnap = await db.collection('ai_suggestion_sessions').doc(sessionId).get();
    if (!sessionSnap.exists) return;
    
    const session = sessionSnap.data();
    
    // Update session
    await db.collection('ai_suggestion_sessions').doc(sessionId).update({
      action,
      editedText: editedText || null,
      accepted: action === 'accepted',
      edited: action === 'edited',
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Track in chat-level analytics
    await db
      .collection('chats')
      .doc(session.chatId)
      .collection('suggestion_tracking')
      .doc(generateId())
      .set({
        sessionId,
        userId: session.userId,
        chatId: session.chatId,
        suggestionType: session.tone,
        action,
        trigger: session.trigger,
        editedText: editedText || null,
        createdAt: serverTimestamp(),
      });
    
    // Update user-level analytics (aggregated)
    await updateUserAnalytics(session.userId, action, session.tone);
    
  } catch (error) {
    console.error('Error tracking suggestion action:', error);
  }
}

/**
 * Track suggestion generation for analytics
 */
async function trackSuggestionGeneration(
  userId: string,
  chatId: string,
  tone: SuggestionTone,
  trigger: SuggestionTrigger
): Promise<void> {
  try {
    const analyticsRef = db.collection('ai_suggestion_analytics').doc(userId);
    
    await db.runTransaction(async (transaction) => {
      const analyticsSnap = await transaction.get(analyticsRef);
      
      if (!analyticsSnap.exists) {
        transaction.set(analyticsRef, {
          userId,
          totalGenerated: 1,
          byTone: { [tone]: 1 },
          byTrigger: { [trigger]: 1 },
          acceptanceRate: 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.update(analyticsRef, {
          totalGenerated: increment(1),
          [`byTone.${tone}`]: increment(1),
          [`byTrigger.${trigger}`]: increment(1),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    console.error('Error tracking suggestion generation:', error);
  }
}

/**
 * Update user-level analytics after action
 */
async function updateUserAnalytics(
  userId: string,
  action: 'accepted' | 'edited' | 'ignored',
  tone: SuggestionTone
): Promise<void> {
  try {
    const analyticsRef = db.collection('ai_suggestion_analytics').doc(userId);
    
    const updates: any = {
      totalActions: increment(1),
      [`actionsByType.${action}`]: increment(1),
      [`actionsByTone.${tone}.${action}`]: increment(1),
      updatedAt: serverTimestamp(),
    };
    
    if (action === 'accepted' || action === 'edited') {
      updates.totalAccepted = increment(1);
    }
    
    await analyticsRef.set(updates, { merge: true });
  } catch (error) {
    console.error('Error updating user analytics:', error);
  }
}
