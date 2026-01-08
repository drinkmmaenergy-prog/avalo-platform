/**
 * ========================================================================
 * AVALO AI MEMORY ENGINE
 * ========================================================================
 *
 * Persistent memory and context management for AI companions
 * Enables personalized, context-aware conversations across sessions
 *
 * Features:
 * - Long-term memory storage
 * - Semantic memory retrieval
 * - User preference tracking
 * - Conversation summarization
 * - Context window management
 * - Memory pruning and optimization
 * - PACK 49: Multi-session memory with LLM summarization
 *
 * @version 3.1.0 (PACK 49)
 * @module aiMemory
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, serverTimestamp } from './init';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryEntry {
  id: string;
  userId: string;
  companionId: string;
  type: "fact" | "preference" | "event" | "emotion";
  content: string;
  importance: number; // 0-1, higher = more important
  confidence: number; // 0-1, how confident the AI is
  createdAt: Timestamp;
  lastAccessedAt: Timestamp;
  accessCount: number;
  embedding?: number[]; // For semantic search (future)
}

export interface ConversationSummary {
  id: string;
  userId: string;
  companionId: string;
  sessionId: string;
  summary: string;
  keyTopics: string[];
  sentiment: "positive" | "neutral" | "negative";
  messageCount: number;
  createdAt: Timestamp;
}

export interface UserContext {
  userId: string;
  companionId: string;
  recentMemories: MemoryEntry[];
  longTermMemories: MemoryEntry[];
  conversationSummaries: ConversationSummary[];
  userPreferences: Record<string, any>;
}

// ============================================================================
// MEMORY STORAGE
// ============================================================================

/**
 * Store memory from conversation
 */
export async function storeMemory(
  userId: string,
  companionId: string,
  memory: {
    type: MemoryEntry["type"];
    content: string;
    importance: number;
    confidence: number;
  }
): Promise<string> {
  try {
    const memoryRef = db.collection("ai_memories").doc();

    const memoryEntry: MemoryEntry = {
      id: memoryRef.id,
      userId,
      companionId,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      confidence: memory.confidence,
      createdAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now(),
      accessCount: 0,
    };

    await memoryRef.set(memoryEntry);

    logger.info(`Stored memory for user ${userId}, companion ${companionId}: ${memory.type}`);

    return memoryRef.id;
  } catch (error: any) {
    logger.error("Failed to store memory:", error);
    throw error;
  }
}

/**
 * Retrieve relevant memories for context
 */
export async function getRelevantMemories(
  userId: string,
  companionId: string,
  limit: number = 10
): Promise<MemoryEntry[]> {
  try {
    // Get most important and recently accessed memories
    const snapshot = await db
      .collection("ai_memories")
      .where("userId", "==", userId)
      .where("companionId", "==", companionId)
      .orderBy("importance", "desc")
      .orderBy("lastAccessedAt", "desc")
      .limit(limit)
      .get();

    const memories = snapshot.docs.map((doc) => {
      const data = doc.data() as MemoryEntry;

      // Update access tracking
      doc.ref.update({
        lastAccessedAt: FieldValue.serverTimestamp(),
        accessCount: FieldValue.increment(1),
      }).catch((err) => logger.error("Failed to update memory access:", err));

      return data;
    });

    return memories;
  } catch (error: any) {
    logger.error("Failed to retrieve memories:", error);
    return [];
  }
}

/**
 * Extract memories from conversation
 */
export function extractMemoriesFromConversation(
  messages: Array<{ role: string; content: string }>
): Array<{ type: MemoryEntry["type"]; content: string; importance: number; confidence: number }> {
  const memories: Array<{ type: MemoryEntry["type"]; content: string; importance: number; confidence: number }> = [];

  // Simple extraction based on patterns
  // In production, use LLM to extract structured memories

  for (const message of messages) {
    if (message.role !== "user") continue;

    const content = message.content.toLowerCase();

    // Extract preferences (likes/dislikes)
    if (content.includes("i like") || content.includes("i love")) {
      const match = content.match(/i (?:like|love) ([^.!?]+)/i);
      if (match) {
        memories.push({
          type: "preference",
          content: `Likes: ${match[1]}`,
          importance: 0.7,
          confidence: 0.8,
        });
      }
    }

    if (content.includes("i don't like") || content.includes("i hate")) {
      const match = content.match(/i (?:don't like|hate) ([^.!?]+)/i);
      if (match) {
        memories.push({
          type: "preference",
          content: `Dislikes: ${match[1]}`,
          importance: 0.7,
          confidence: 0.8,
        });
      }
    }

    // Extract personal facts
    if (content.includes("my name is") || content.includes("i'm") || content.includes("i am")) {
      memories.push({
        type: "fact",
        content: message.content,
        importance: 0.9,
        confidence: 0.9,
      });
    }

    // Extract emotional states
    if (content.match(/i feel|i'm feeling|feeling/)) {
      memories.push({
        type: "emotion",
        content: message.content,
        importance: 0.5,
        confidence: 0.7,
      });
    }
  }

  return memories;
}

/**
 * Summarize conversation for long-term storage
 */
export async function summarizeConversation(
  userId: string,
  companionId: string,
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Extract key topics
    const keyTopics = new Set<string>();
    const userMessages = messages.filter((m) => m.role === "user");

    // Simple topic extraction (in production, use NLP)
    userMessages.forEach((msg) => {
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach((word) => {
        if (word.length > 5 && !["about", "really", "think", "would", "should"].includes(word)) {
          keyTopics.add(word);
        }
      });
    });

    // Analyze sentiment
    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    const positiveWords = ["good", "great", "love", "happy", "wonderful", "amazing"];
    const negativeWords = ["bad", "hate", "sad", "angry", "terrible", "awful"];

    const allText = userMessages.map((m) => m.content.toLowerCase()).join(" ");
    const positiveCount = positiveWords.filter((w) => allText.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => allText.includes(w)).length;

    if (positiveCount > negativeCount + 2) sentiment = "positive";
    else if (negativeCount > positiveCount + 2) sentiment = "negative";

    // Create summary (in production, use LLM for better summaries)
    const summary = `Conversation covered: ${Array.from(keyTopics).slice(0, 5).join(", ")}. User sentiment: ${sentiment}. ${messages.length} messages exchanged.`;

    // Store summary
    const summaryRef = db.collection("conversation_summaries").doc();
    const conversationSummary: ConversationSummary = {
      id: summaryRef.id,
      userId,
      companionId,
      sessionId,
      summary,
      keyTopics: Array.from(keyTopics).slice(0, 10),
      sentiment,
      messageCount: messages.length,
      createdAt: Timestamp.now(),
    };

    await summaryRef.set(conversationSummary);

    logger.info(`Summarized conversation for user ${userId}, companion ${companionId}`);

    return summary;
  } catch (error: any) {
    logger.error("Failed to summarize conversation:", error);
    return "Conversation summary unavailable";
  }
}

/**
 * Build context for AI from memories and summaries
 */
export async function buildAIContext(
  userId: string,
  companionId: string
): Promise<string> {
  try {
    // Get recent memories
    const memories = await getRelevantMemories(userId, companionId, 10);

    // Get recent summaries
    const summaries = await db
      .collection("conversation_summaries")
      .where("userId", "==", userId)
      .where("companionId", "==", companionId)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    let context = "";

    // Add memories
    if (memories.length > 0) {
      context += "What I remember about the user:\n";
      memories.forEach((mem) => {
        context += `- ${mem.content}\n`;
      });
      context += "\n";
    }

    // Add conversation history
    if (!summaries.empty) {
      context += "Previous conversations:\n";
      summaries.docs.forEach((doc) => {
        const summary = doc.data() as ConversationSummary;
        context += `- ${summary.summary}\n`;
      });
    }

    return context;
  } catch (error: any) {
    logger.error("Failed to build AI context:", error);
    return "";
  }
}

/**
 * Prune old memories (run periodically)
 */
export async function pruneOldMemories(daysOld: number = 90): Promise<number> {
  try {
    const cutoffDate = Timestamp.fromMillis(
      Date.now() - daysOld * 24 * 60 * 60 * 1000
    );

    const oldMemories = await db
      .collection("ai_memories")
      .where("lastAccessedAt", "<", cutoffDate)
      .where("importance", "<", 0.5) // Only prune low-importance memories
      .limit(500)
      .get();

    if (oldMemories.empty) return 0;

    const batch = db.batch();
    oldMemories.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    logger.info(`Pruned ${oldMemories.size} old memories`);
    return oldMemories.size;
  } catch (error: any) {
    logger.error("Failed to prune memories:", error);
    return 0;
  }
}

/**
 * Get user context for AI companion
 */
export async function getUserContext(
  userId: string,
  companionId: string
): Promise<UserContext> {
  const [recentMemories, summaries] = await Promise.all([
    getRelevantMemories(userId, companionId, 10),
    db
      .collection("conversation_summaries")
      .where("userId", "==", userId)
      .where("companionId", "==", companionId)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get(),
  ]);

  // Get user preferences from profile
  const userDoc = await db.collection("users").doc(userId).get();
  const userPreferences = userDoc.data()?.preferences || {};

  return {
    userId,
    companionId,
    recentMemories,
    longTermMemories: [], // Future: implement long-term memory retrieval
    conversationSummaries: summaries.docs.map((doc) => doc.data() as ConversationSummary),
    userPreferences,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PACK 49: MULTI-SESSION MEMORY WITH LLM
// ============================================================================

/**
 * AI User Memory structure for PACK 49
 */
export interface AiUserMemory {
  userId: string;
  companionId: string;
  memorySummary: string;
  keyFacts: string[];
  interests: string[];
  lastUpdatedAt: Timestamp;
  totalMessages: number;
}

/**
 * Rebuild AI user memory using LLM summarization
 * PACK 49: Creates structured memory from recent conversation history
 */
export async function rebuildAiUserMemory(
  userId: string,
  companionId: string
): Promise<AiUserMemory> {
  try {
    // Fetch recent messages from ai_conversations
    const conversationQuery = await db
      .collection('ai_conversations')
      .where('userId', '==', userId)
      .where('companionId', '==', companionId)
      .orderBy('lastMessageAt', 'desc')
      .limit(1)
      .get();

    if (conversationQuery.empty) {
      logger.warn(`No conversation found for user ${userId} and companion ${companionId}`);
      
      // Return empty memory structure
      const emptyMemory: AiUserMemory = {
        userId,
        companionId,
        memorySummary: '',
        keyFacts: [],
        interests: [],
        lastUpdatedAt: Timestamp.now(),
        totalMessages: 0,
      };
      
      return emptyMemory;
    }

    const conversationDoc = conversationQuery.docs[0];
    const conversationId = conversationDoc.id;

    // Fetch last 100 user messages from this conversation
    const messagesSnapshot = await db
      .collection('ai_conversations')
      .doc(conversationId)
      .collection('messages')
      .where('role', '==', 'user')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    if (messagesSnapshot.empty) {
      logger.warn(`No messages found for conversation ${conversationId}`);
      
      const emptyMemory: AiUserMemory = {
        userId,
        companionId,
        memorySummary: '',
        keyFacts: [],
        interests: [],
        lastUpdatedAt: Timestamp.now(),
        totalMessages: 0,
      };
      
      return emptyMemory;
    }

    const userMessages = messagesSnapshot.docs
      .map((doc) => doc.data().text || '')
      .reverse(); // Chronological order

    const totalMessages = messagesSnapshot.size;

    // Optional: Fetch user taste profile for additional context
    let tasteContext = '';
    try {
      const tasteProfileDoc = await db
        .collection('user_taste_profiles')
        .doc(userId)
        .get();
      
      if (tasteProfileDoc.exists) {
        const profile = tasteProfileDoc.data();
        tasteContext = `\nUser interests: ${profile?.likedInterests?.join(', ') || 'unknown'}`;
      }
    } catch (err) {
      logger.warn('Could not fetch taste profile:', err);
    }

    // Build prompt for LLM
    const prompt = `You are analyzing user messages from an AI companion chat. Extract structured information about the user.

User messages:
${userMessages.slice(0, 50).join('\n---\n')}
${tasteContext}

Based on these messages, provide:
1. A brief summary (2-3 sentences) of the user's preferences, personality, and communication style
2. Key facts as bullet points (e.g., "Works in IT", "Likes traveling to Spain", "Does not like smoking")
3. Interest tags in lowercase (e.g., travel, technology, fitness)

Return ONLY valid JSON in this exact format:
{
  "memorySummary": "...",
  "keyFacts": ["...", "..."],
  "interests": ["...", "..."]
}`;

    // Call LLM (using OpenAI GPT-4o-mini for cost efficiency)
    // NOTE: In production, use proper API key management
    let memorySummary = 'User has engaged in conversation with this AI companion.';
    let keyFacts: string[] = [];
    let interests: string[] = [];

    try {
      // Simple heuristic extraction (fallback if LLM not available)
      // In production, replace with actual LLM call using OpenAI or Anthropic
      
      const allText = userMessages.join(' ').toLowerCase();
      
      // Extract interests from common patterns
      const interestPatterns = [
        /i like ([a-z]+)/gi,
        /i love ([a-z]+)/gi,
        /interested in ([a-z]+)/gi,
        /enjoy ([a-z]+)/gi,
      ];
      
      const extractedInterests = new Set<string>();
      interestPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(allText)) !== null) {
          if (match[1] && match[1].length > 3) {
            extractedInterests.add(match[1].trim());
          }
        }
      });
      
      interests = Array.from(extractedInterests).slice(0, 10);
      
      // Extract key facts
      const factPatterns = [
        /my name is ([^.!?]+)/gi,
        /i work (?:as|in) ([^.!?]+)/gi,
        /i'm from ([^.!?]+)/gi,
        /i live in ([^.!?]+)/gi,
      ];
      
      factPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(allText)) !== null) {
          if (match[1]) {
            keyFacts.push(match[1].trim());
          }
        }
      });
      
      keyFacts = keyFacts.slice(0, 10);
      
      // Create summary
      if (keyFacts.length > 0 || interests.length > 0) {
        memorySummary = `User has shared information about themselves. `;
        if (interests.length > 0) {
          memorySummary += `Interested in: ${interests.slice(0, 3).join(', ')}. `;
        }
        memorySummary += `Total messages: ${totalMessages}.`;
      }
      
      logger.info(`Built memory for user ${userId}, companion ${companionId}: ${keyFacts.length} facts, ${interests.length} interests`);
    } catch (llmError) {
      logger.error('LLM memory extraction failed, using heuristics:', llmError);
    }

    // Create memory structure
    const memory: AiUserMemory = {
      userId,
      companionId,
      memorySummary,
      keyFacts,
      interests,
      lastUpdatedAt: Timestamp.now(),
      totalMessages,
    };

    // Store in ai_user_memory collection
    const memoryId = `${userId}_${companionId}`;
    await db.collection('ai_user_memory').doc(memoryId).set(memory, { merge: true });

    logger.info(`Rebuilt AI user memory for ${userId}/${companionId}`);

    return memory;
  } catch (error: any) {
    logger.error('Failed to rebuild AI user memory:', error);
    throw error;
  }
}

/**
 * GET /ai/memory?userId=...&companionId=...
 * Fetch AI user memory
 */
export const getAiUserMemory = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string; companionId: string }, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, companionId } = data;

      // Verify the caller is requesting their own memory
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot access other users\' AI memory'
        );
      }

      // Fetch memory document
      const memoryId = `${userId}_${companionId}`;
      const memoryDoc = await db.collection('ai_user_memory').doc(memoryId).get();

      if (!memoryDoc.exists) {
        return {
          ok: true,
          memory: null,
        };
      }

      const memory = memoryDoc.data() as AiUserMemory;

      return {
        ok: true,
        memory: {
          userId: memory.userId,
          companionId: memory.companionId,
          memorySummary: memory.memorySummary,
          keyFacts: memory.keyFacts || [],
          interests: memory.interests || [],
          totalMessages: memory.totalMessages,
          lastUpdatedAt: memory.lastUpdatedAt?.toMillis() || null,
        },
      };
    } catch (error: any) {
      logger.error('[getAiUserMemory] Error:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get AI memory');
    }
  });

/**
 * POST /ai/memory/rebuild
 * Rebuild AI user memory manually
 */
export const rebuildAiUserMemoryEndpoint = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string; companionId: string }, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, companionId } = data;

      // Verify the caller is acting on their own behalf
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot rebuild memory for other users'
        );
      }

      // Rebuild memory
      const memory = await rebuildAiUserMemory(userId, companionId);

      return {
        ok: true,
        memory: {
          userId: memory.userId,
          companionId: memory.companionId,
          memorySummary: memory.memorySummary,
          keyFacts: memory.keyFacts,
          interests: memory.interests,
          totalMessages: memory.totalMessages,
          lastUpdatedAt: memory.lastUpdatedAt.toMillis(),
        },
      };
    } catch (error: any) {
      logger.error('[rebuildAiUserMemoryEndpoint] Error:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message || 'Failed to rebuild AI memory');
    }
  });

/**
 * Scheduled job: Rebuild memories for active users
 * Runs daily to keep memories fresh
 */
export const scheduledMemoryRebuild = functions
  .region('europe-west3')
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      logger.info('[AI Memory] Starting scheduled memory rebuild');

      // Get conversations with messages in last 7 days
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const activeConversations = await db
        .collection('ai_conversations')
        .where('lastMessageAt', '>=', weekAgo)
        .limit(500) // Process max 500 per run
        .get();

      logger.info(`[AI Memory] Found ${activeConversations.size} active conversations`);

      // Rebuild memory for each conversation
      const rebuildPromises = activeConversations.docs.map((doc) => {
        const data = doc.data();
        return rebuildAiUserMemory(data.userId, data.companionId).catch((error) => {
          logger.error(`Failed to rebuild memory for ${data.userId}/${data.companionId}:`, error);
        });
      });

      await Promise.all(rebuildPromises);

      logger.info('[AI Memory] Scheduled memory rebuild completed');
    } catch (error) {
      logger.error('[scheduledMemoryRebuild] Error:', error);
    }
  });

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  storeMemory,
  getRelevantMemories,
  extractMemoriesFromConversation,
  summarizeConversation,
  buildAIContext,
  pruneOldMemories,
  getUserContext,
  // PACK 49 exports
  rebuildAiUserMemory,
  getAiUserMemory,
  rebuildAiUserMemoryEndpoint,
  scheduledMemoryRebuild,
};

