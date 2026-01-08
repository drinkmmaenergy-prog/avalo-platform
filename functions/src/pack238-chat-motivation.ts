/**
 * PACK 238 — Chat Motivation Engine
 * AI-driven conversation boosters that increase chemistry → paid chat duration → paid calls/meetings
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  ChatMotivation,
  Booster,
  BoosterType,
  MessageAnalysis,
  ConversationContext,
  ChemistryInput,
  ChemistryRange,
  SafetyCheckResult,
  BoosterSelectionResult,
  ActivationCondition,
  ChemistryHistoryEntry,
  IntentTracking,
  MonetizationIntent
} from './types/pack238-chat-motivation';

const db = admin.firestore();

/**
 * Constants
 */
const SILENCE_THRESHOLD_SECONDS = 20;
const BOOSTER_EXPIRY_MINUTES = 15;
const MIN_MESSAGES_FOR_ANALYSIS = 5;
const CHEMISTRY_UPDATE_INTERVAL_MINUTES = 5;

/**
 * Chemistry Score Ranges
 */
const CHEMISTRY_CONFIGS: Record<ChemistryRange, {
  min: number;
  max: number;
  frequency: 'none' | 'low' | 'medium' | 'high' | 'very_low';
  cooldownMinutes: number;
  style: string;
}> = {
  very_low: { min: 0, max: 2, frequency: 'low', cooldownMinutes: 15, style: 'small_talk_rescue' },
  low: { min: 3, max: 4, frequency: 'medium', cooldownMinutes: 10, style: 'topic_discovery' },
  medium: { min: 5, max: 6, frequency: 'high', cooldownMinutes: 7, style: 'topic_discovery' },
  high: { min: 7, max: 8, frequency: 'high', cooldownMinutes: 5, style: 'chemistry_amplifiers' },
  very_high: { min: 9, max: 10, frequency: 'very_low', cooldownMinutes: 30, style: 'maintain_flow' }
};

/**
 * Booster Templates (App-Store Safe)
 */
const BOOSTER_TEMPLATES: Record<BoosterType, Record<ChemistryRange, string[]>> = {
  topic: {
    very_low: [
      "You both mentioned {topic} — ask about their experience with it.",
      "They seem interested in {topic}. What's your take on it?",
      "Create a connection: ask about their first time experiencing {topic}."
    ],
    low: [
      "You both love {topic} — ask what got them into it.",
      "Deep dive: what's their favorite thing about {topic}?",
      "Ask about their dream {topic} experience."
    ],
    medium: [
      "You both mentioned {topic} — maybe share a story related to it?",
      "Ask what {topic} means to them personally.",
      "Connect through {topic}: ask about their most memorable moment."
    ],
    high: [
      "Strong connection on {topic} — ask what they'd do if they could master it.",
      "Turn {topic} into a shared dream — ask about their ultimate goal with it.",
      "You both love {topic} — what would doing it together look like?"
    ],
    very_high: [
      "Your {topic} chemistry is perfect — let the conversation flow naturally."
    ]
  },
  memory: {
    very_low: [
      "They mentioned {memory} before — bring it up to reignite the conversation.",
      "Remember when they talked about {memory}? Ask for an update."
    ],
    low: [
      "They once shared about {memory} — ask how it's been going.",
      "Callback: they mentioned {memory} earlier. Circle back to it?"
    ],
    medium: [
      "You both talked about {memory} — ask if anything new happened.",
      "Build on {memory}: they seemed excited about it before."
    ],
    high: [
      "Strong memory hook on {memory} — ask what they've been doing about it.",
      "They really cared about {memory} — follow up meaningfully."
    ],
    very_high: [
      "You share deep memories around {memory} — conversation is flowing perfectly."
    ]
  },
  chemistry: {
    very_low: [
      "They responded positively — ask what makes them feel appreciated.",
      "Show interest: what's something they're proud of today?"
    ],
    low: [
      "They're warming up — ask what makes them smile.",
      "Connection building: what's something they value in conversation?"
    ],
    medium: [
      "Chemistry rising — ask what they first noticed about you.",
      "They like your vibe — what quality do they value most in people?"
    ],
    high: [
      "Strong chemistry — ask what they find attractive about how you think.",
      "Ask what excites them about getting to know you better.",
      "You have real chemistry — what do they appreciate most about you so far?"
    ],
    very_high: [
      "Perfect chemistry — let the natural flow continue."
    ]
  },
  challenge: {
    very_low: [
      "Playful spark: 1–10, how adventurous are you? No explanations.",
      "Quick challenge: would you rather {option1} or {option2}?",
      "Fun question: what's one thing you're secretly competitive about?"
    ],
    low: [
      "Energy boost: if you could master any skill instantly, what would it be?",
      "Playful: what's your boldest unpopular opinion?",
      "Challenge them: what's something you'd do if fear wasn't a factor?"
    ],
    medium: [
      "Raise the stakes: 1–10, how spontaneous are you really?",
      "Friendly challenge: what's one thing you think you're better at than most people?",
      "Playful depth: what's a risk you've been thinking about taking?"
    ],
    high: [
      "Bold move: what's something you'd dare them to try?",
      "High-energy challenge: what would you do together if you had no limits?",
      "Push boundaries (safely): what's the most interesting place you'd take them?"
    ],
    very_high: [
      "Energy is perfect — no challenges needed right now."
    ]
  },
  flirt: {
    very_low: [
      "Ice breaker: what's something that made them smile today?",
      "Subtle: ask what they notice most about people they connect with."
    ],
    low: [
      "Light flirt: ask what makes someone interesting to them.",
      "Build interest: what quality catches their attention first?"
    ],
    medium: [
      "Warming up: ask what they found intriguing about your profile.",
      "Chemistry hint: what's something they've noticed about you they like?",
      "Gentle tease: would they describe themselves as a romantic or a realist?"
    ],
    high: [
      "Stronger flirt: ask what they'd do on a perfect date night.",
      "Increase chemistry: what's one thing they wish more people knew about them?",
      "Confidence boost: compliment something genuine, then ask a follow-up question.",
      "Ask what they're looking forward to learning about you."
    ],
    very_high: [
      "Chemistry is already strong — let natural attraction flow."
    ]
  }
};

/**
 * Analyze message for sentiment, topics, and conversation patterns
 */
export async function analyzeMessage(
  messageId: string,
  chatId: string,
  content: string,
  senderId: string
): Promise<MessageAnalysis> {
  // Simplified local sentiment analysis (in production, use ML model)
  const sentimentScore = calculateSimpleSentiment(content);
  const emotionalIntensity = detectEmotionalIntensity(content);
  
  const analysis: MessageAnalysis = {
    messageId,
    chatId,
    sentimentScore,
    emotionalIntensity,
    isCompliment: detectCompliment(content),
    hasQuestion: content.includes('?'),
    hasLaughter: detectLaughter(content),
    topicCategories: extractTopics(content),
    isSmallTalk: detectSmallTalk(content),
    isDeepConversation: detectDeepConversation(content),
    energyLevel: emotionalIntensity > 0.6 ? 'high' : emotionalIntensity > 0.3 ? 'medium' : 'low',
    mentionedInterests: extractInterests(content),
    referencedPastTopic: false, // Would require conversation history
    analyzedAt: admin.firestore.Timestamp.now(),
    model: 'local' // Privacy-first local analysis
  };
  
  // Store analysis
  await db
    .collection('chats')
    .doc(chatId)
    .collection('messages')
    .doc(messageId)
    .collection('analysis')
    .doc('latest')
    .set(analysis);
  
  return analysis;
}

/**
 * Simple sentiment analysis (replace with ML model in production)
 */
function calculateSimpleSentiment(text: string): number {
  const positiveWords = ['love', 'amazing', 'great', 'wonderful', 'happy', 'excited', 'perfect', 'awesome', 'fantastic'];
  const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'sad', 'angry', 'upset', 'boring', 'annoying'];
  
  const lowerText = text.toLowerCase();
  let score = 0;
  
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 0.2;
  });
  
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 0.2;
  });
  
  return Math.max(-1, Math.min(1, score));
}

/**
 * Detect emotional intensity
 */
function detectEmotionalIntensity(text: string): number {
  const exclamationCount = (text.match(/!/g) || []).length;
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  const emojiCount = (text.match(/[\uD800-\uDFFF]/g) || []).length;
  
  const intensity = (exclamationCount * 0.15) + (capsRatio * 0.5) + (emojiCount * 0.1);
  return Math.min(1, intensity);
}

/**
 * Detect compliments
 */
function detectCompliment(text: string): boolean {
  const complimentWords = ['beautiful', 'handsome', 'smart', 'funny', 'interesting', 'attractive', 'cute', 'gorgeous'];
  const lowerText = text.toLowerCase();
  return complimentWords.some(word => lowerText.includes(word));
}

/**
 * Detect laughter
 */
function detectLaughter(text: string): boolean {
  return /\b(haha|lol|😂|😄|😆|🤣)\b/i.test(text);
}

/**
 * Extract topics from message
 */
function extractTopics(text: string): string[] {
  const topicKeywords: Record<string, string[]> = {
    travel: ['travel', 'trip', 'vacation', 'destination', 'country', 'city'],
    food: ['food', 'cooking', 'restaurant', 'recipe', 'meal', 'dinner'],
    music: ['music', 'song', 'concert', 'band', 'artist', 'playlist'],
    sports: ['sports', 'game', 'team', 'play', 'workout', 'fitness'],
    movies: ['movie', 'film', 'watch', 'series', 'show', 'netflix'],
    books: ['book', 'read', 'author', 'story', 'novel'],
    art: ['art', 'painting', 'gallery', 'creative', 'design'],
    technology: ['tech', 'app', 'computer', 'phone', 'software']
  };
  
  const lowerText = text.toLowerCase();
  const topics: string[] = [];
  
  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(topic);
    }
  });
  
  return topics;
}

/**
 * Detect small talk
 */
function detectSmallTalk(text: string): boolean {
  const smallTalkPatterns = /\b(hey|hi|hello|how are you|what's up|good morning|good night)\b/i;
  return smallTalkPatterns.test(text) && text.length < 50;
}

/**
 * Detect deep conversation
 */
function detectDeepConversation(text: string): boolean {
  const deepWords = ['feel', 'think', 'believe', 'value', 'important', 'meaning', 'why', 'because'];
  const lowerText = text.toLowerCase();
  return deepWords.filter(word => lowerText.includes(word)).length >= 2;
}

/**
 * Extract interests
 */
function extractInterests(text: string): string[] {
  const interests = extractTopics(text);
  return interests;
}

/**
 * Calculate chemistry score from conversation data
 */
export async function calculateChemistryScore(input: ChemistryInput): Promise<number> {
  // Weighted factors for chemistry calculation
  const sentimentWeight = 0.25;
  const engagementWeight = 0.25;
  const depthWeight = 0.20;
  const reciprocityWeight = 0.15;
  const sharedInterestsWeight = 0.15;
  
  // Normalize sentiment to 0-10 scale
  const sentimentScore = ((input.averageSentiment + 1) / 2) * 10;
  
  // Calculate engagement (based on frequency and response time)
  const engagementScore = Math.min(10, (input.messageFrequency / 10) * 10);
  
  // Calculate depth (based on emotional depth and non-small-talk ratio)
  const depthScore = Math.min(10, input.emotionalDepth * 10);
  
  // Calculate reciprocity (balanced questions and compliments)
  const reciprocityScore = Math.min(10, ((input.questionsAsked + input.complimentsGiven) / 10) * 10);
  
  // Calculate shared interests impact
  const sharedInterestsScore = Math.min(10, input.sharedInterests.length * 2);
  
  // Weighted sum
  const chemistryScore = 
    (sentimentScore * sentimentWeight) +
    (engagementScore * engagementWeight) +
    (depthScore * depthWeight) +
    (reciprocityScore * reciprocityWeight) +
    (sharedInterestsScore * sharedInterestsWeight);
  
  return Math.round(chemistryScore * 10) / 10; // Round to 1 decimal
}

/**
 * Get chemistry range from score
 */
function getChemistryRange(score: number): ChemistryRange {
  if (score <= 2) return 'very_low';
  if (score <= 4) return 'low';
  if (score <= 6) return 'medium';
  if (score <= 8) return 'high';
  return 'very_high';
}

/**
 * Check if boosters are allowed (safety enforcement)
 */
export async function checkSafetyCompliance(chatId: string): Promise<SafetyCheckResult> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  const chatData = chatDoc.data();
  
  if (!chatData) {
    return { allowed: false, reason: 'Chat not found' };
  }
  
  // Check Sleep Mode
  if (chatData.sleepModeActive) {
    return { allowed: false, reason: 'Sleep Mode is active', blockedBy: 'sleep_mode' };
  }
  
  // Check Breakup Recovery
  if (chatData.breakupRecoveryActive) {
    return { allowed: false, reason: 'Breakup Recovery is active', blockedBy: 'breakup_recovery' };
  }
  
  // Check Safety Incident
  if (chatData.safetyIncidentFlagged) {
    return { allowed: false, reason: 'Safety incident flagged', blockedBy: 'safety_incident' };
  }
  
  // Check Age Gap Safety
  if (chatData.ageGapSafetyTriggered) {
    return { allowed: false, reason: 'Age gap safety threshold triggered', blockedBy: 'age_gap_threshold' };
  }
  
  // Check Stalker Risk
  if (chatData.stalkerRiskHigh) {
    return { allowed: false, reason: 'Stalker risk detected', blockedBy: 'stalker_risk' };
  }
  
  return { allowed: true };
}

/**
 * Build conversation context
 */
export async function buildConversationContext(chatId: string): Promise<ConversationContext> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  const chatData = chatDoc.data();
  
  if (!chatData) {
    throw new Error('Chat not found');
  }
  
  // Get recent messages
  const messagesSnapshot = await db
    .collection('chats')
    .doc(chatId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  
  const lastMessages = messagesSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      senderId: data.senderId,
      content: data.content,
      sentimentScore: data.sentimentScore || 0,
      timestamp: data.createdAt
    };
  });
  
  // Calculate timing
  const now = admin.firestore.Timestamp.now();
  const lastMessage = lastMessages[0];
  const lastMessageReadAt = lastMessage ? chatData.lastReadAt : now;
  const lastMessageRepliedAt = lastMessages.length > 1 ? lastMessages[1].timestamp : null;
  
  const silenceDuration = lastMessageReadAt 
    ? now.seconds - lastMessageReadAt.seconds 
    : 0;
  
  // Determine conversation energy
  const recentSentiments = lastMessages.slice(0, 5).map(m => m.sentimentScore);
  const avgRecent = recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length;
  const olderSentiments = lastMessages.slice(5, 10).map(m => m.sentimentScore);
  const avgOlder = olderSentiments.length ? olderSentiments.reduce((a, b) => a + b, 0) / olderSentiments.length : avgRecent;
  
  const conversationEnergy: 'rising' | 'falling' | 'stable' = 
    avgRecent > avgOlder + 0.15 ? 'rising' :
    avgRecent < avgOlder - 0.15 ? 'falling' : 'stable';
  
  return {
    chatId,
    participants: [
      {
        userId: chatData.user1Id,
        profile: {
          interests: chatData.user1Interests || [],
          recentTopics: chatData.user1RecentTopics || [],
          communicationStyle: chatData.user1CommunicationStyle || 'detailed'
        }
      },
      {
        userId: chatData.user2Id,
        profile: {
          interests: chatData.user2Interests || [],
          recentTopics: chatData.user2RecentTopics || [],
          communicationStyle: chatData.user2CommunicationStyle || 'detailed'
        }
      }
    ],
    lastMessages,
    averageResponseTime: chatData.averageResponseTime || 300,
    lastMessageReadAt,
    lastMessageRepliedAt,
    silenceDuration,
    conversationEnergy,
    topicExhaustion: detectTopicExhaustion(lastMessages),
    analyzedAt: now
  };
}

/**
 * Detect topic exhaustion
 */
function detectTopicExhaustion(messages: any[]): boolean {
  if (messages.length < 5) return false;
  
  const recentContent = messages.slice(0, 5).map(m => m.content.toLowerCase()).join(' ');
  const words = recentContent.split(/\s+/);
  const uniqueWords = new Set(words);
  
  // If unique word ratio is very low, topic might be exhausted
  return uniqueWords.size / words.length < 0.4;
}

/**
 * Select appropriate booster based on context
 */
export async function selectBooster(
  context: ConversationContext,
  chemistryScore: number,
  lastBoosterType: BoosterType | 'none',
  lastBoosterTime: admin.firestore.Timestamp | null
): Promise<BoosterSelectionResult> {
  const chemistryRange = getChemistryRange(chemistryScore);
  const config = CHEMISTRY_CONFIGS[chemistryRange];
  
  // Check cooldown
  if (lastBoosterTime) {
    const minutesSinceLastBooster = (context.analyzedAt.seconds - lastBoosterTime.seconds) / 60;
    if (minutesSinceLastBooster < config.cooldownMinutes) {
      return {
        shouldTrigger: false,
        selectedBooster: null,
        reason: `Cooldown active (${Math.round(config.cooldownMinutes - minutesSinceLastBooster)}m remaining)`,
        confidence: 0
      };
    }
  }
  
  // Determine activation condition
  const condition = determineActivationCondition(context, chemistryScore);
  
  if (!condition) {
    return {
      shouldTrigger: false,
      selectedBooster: null,
      reason: 'No activation condition met',
      confidence: 0
    };
  }
  
  // Select booster type based on condition
  const boosterType = selectBoosterType(condition, lastBoosterType, chemistryRange);
  
  // Generate booster prompt
  const prompt = generateBoosterPrompt(boosterType, chemistryRange, context);
  
  // Create booster
  const booster: Booster = {
    id: db.collection('chats').doc().id,
    chatId: context.chatId,
    type: boosterType,
    prompt,
    targetUserId: context.lastMessages[0]?.senderId === context.participants[0].userId 
      ? context.participants[1].userId 
      : context.participants[0].userId,
    triggeredBy: condition,
    chemistryScoreAtTrigger: chemistryScore,
    active: true,
    seen: false,
    dismissed: false,
    used: false,
    leadToMessage: false,
    leadToCall: false,
    leadToEvent: false,
    paidWordsGenerated: 0,
    createdAt: context.analyzedAt,
    seenAt: null,
    dismissedAt: null,
    usedAt: null,
    expiresAt: admin.firestore.Timestamp.fromMillis(
      context.analyzedAt.toMillis() + (BOOSTER_EXPIRY_MINUTES * 60 * 1000)
    )
  };
  
  return {
    shouldTrigger: true,
    selectedBooster: booster,
    reason: `Condition: ${condition.type}, Chemistry: ${chemistryRange}`,
    confidence: 0.8
  };
}

/**
 * Determine activation condition
 */
function determineActivationCondition(
  context: ConversationContext,
  chemistryScore: number
): ActivationCondition | null {
  const now = context.analyzedAt;
  
  // Silence after read
  if (context.silenceDuration > SILENCE_THRESHOLD_SECONDS && context.lastMessageReadAt) {
    return {
      type: 'silence_after_read',
      threshold: SILENCE_THRESHOLD_SECONDS,
      detectedAt: now,
      contextData: { silenceDuration: context.silenceDuration }
    };
  }
  
  // Small talk loop
  if (context.topicExhaustion && chemistryScore < 5) {
    return {
      type: 'small_talk_loop',
      detectedAt: now,
      contextData: { chemistryScore }
    };
  }
  
  // Compliment with no follow-up
  const lastMessage = context.lastMessages[0];
  if (lastMessage && lastMessage.content) {
    const hasCompliment = detectCompliment(lastMessage.content);
    const hasQuestion = lastMessage.content.includes('?');
    
    if (hasCompliment && !hasQuestion) {
      return {
        type: 'compliment_no_follow',
        detectedAt: now
      };
    }
  }
  
  // High laughter frequency
  const laughterCount = context.lastMessages.slice(0, 5).filter(m => detectLaughter(m.content)).length;
  if (laughterCount >= 3) {
    return {
      type: 'high_laughter',
      detectedAt: now,
      contextData: { laughterCount }
    };
  }
  
  // Emotional topic  
  const emotionalMessages = context.lastMessages.slice(0, 3).filter(m => detectDeepConversation(m.content));
  if (emotionalMessages.length >= 2) {
    return {
      type: 'emotional_topic',
      detectedAt: now
    };
  }
  
  // Shared interest detected
  const user1Topics = new Set(context.participants[0].profile.interests);
  const user2Topics = new Set(context.participants[1].profile.interests);
  const sharedInterests = Array.from(user1Topics).filter(topic => user2Topics.has(topic));
  
  if (sharedInterests.length > 0) {
    return {
      type: 'shared_interest',
      detectedAt: now,
      contextData: { sharedInterests }
    };
  }
  
  return null;
}

/**
 * Select booster type based on condition
 */
function selectBoosterType(
  condition: ActivationCondition,
  lastType: BoosterType | 'none',
  chemistryRange: ChemistryRange
): BoosterType {
  const typeMap: Record<string, BoosterType> = {
    silence_after_read: 'topic',
    small_talk_loop: 'topic',
    compliment_no_follow: 'chemistry',
    high_laughter: 'challenge',
    emotional_topic: 'chemistry',
    shared_interest: 'topic'
  };
  
  let selectedType = typeMap[condition.type] || 'topic';
  
  // Avoid repetition
  if (selectedType === lastType && (lastType as string) !== 'none') {
    const alternatives: BoosterType[] = ['topic', 'memory', 'chemistry', 'challenge', 'flirt'];
    const filtered = alternatives.filter(t => t !== (lastType as BoosterType));
    selectedType = filtered[Math.floor(Math.random() * filtered.length)];
  }
  
  // High chemistry prefers chemistry and flirt boosters
  if (chemistryRange === 'high' || chemistryRange === 'very_high') {
    if (Math.random() > 0.5) {
      selectedType = Math.random() > 0.5 ? 'chemistry' : 'flirt';
    }
  }
  
  return selectedType;
}

/**
 * Generate booster prompt
 */
function generateBoosterPrompt(
  type: BoosterType,
  range: ChemistryRange,
  context: ConversationContext
): string {
  const templates = BOOSTER_TEMPLATES[type][range];
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Replace placeholders
  let prompt = template;
  
  // Extract topics from recent messages
  const recentTopics = context.lastMessages
    .flatMap(m => extractTopics(m.content))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);
  
  if (recentTopics.length > 0) {
    prompt = prompt.replace('{topic}', recentTopics[0]);
    prompt = prompt.replace('{memory}', recentTopics[0]);
  }
  
  return prompt;
}

/**
 * Cloud Function: Analyze message and trigger boosters
 */
export const onMessageSent = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const messageData = snapshot.data();
    const { chatId, messageId } = context.params;
    
    try {
      // Analyze message
      const analysis = await analyzeMessage(
        messageId,
        chatId,
        messageData.content,
        messageData.senderId
      );
      
      // Check if enough messages for analysis
      const messagesCount = await db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .count()
        .get();
      
      if (messagesCount.data().count < MIN_MESSAGES_FOR_ANALYSIS) {
        console.log(`Not enough messages for analysis: ${messagesCount.data().count}`);
        return;
      }
      
      // Build conversation context
      const conversationContext = await buildConversationContext(chatId);
      
      // Get recent analyses for chemistry calculation
      const analysesSnapshot = await db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      const recentAnalyses: MessageAnalysis[] = [];
      for (const doc of analysesSnapshot.docs) {
        const analysisDoc = await doc.ref.collection('analysis').doc('latest').get();
        if (analysisDoc.exists) {
          recentAnalyses.push(analysisDoc.data() as MessageAnalysis);
        }
      }
      
      // Calculate chemistry score
      const chemistryInput: ChemistryInput = {
        recentMessages: recentAnalyses,
        conversationDuration: 30, // minutes (would calculate from actual data)
        messageFrequency: recentAnalyses.length / 30 * 60, // messages per hour
        averageSentiment: recentAnalyses.reduce((sum, a) => sum + a.sentimentScore, 0) / recentAnalyses.length,
        sentimentVariance: calculateVariance(recentAnalyses.map(a => a.sentimentScore)),
        questionsAsked: recentAnalyses.filter(a => a.hasQuestion).length,
        complimentsGiven: recentAnalyses.filter(a => a.isCompliment).length,
        sharedInterests: findSharedInterests(conversationContext),
        emotionalDepth: recentAnalyses.reduce((sum, a) => sum + a.emotionalIntensity, 0) / recentAnalyses.length
      };
      
      const chemistryScore = await calculateChemistryScore(chemistryInput);
      
      // Get current motivation state
      const motivationDoc = await db
        .collection('chats')
        .doc(chatId)
        .collection('chatMotivation')
        .doc('current')
        .get();
      
      const motivationData = motivationDoc.exists 
        ? motivationDoc.data() as ChatMotivation
        : null;
      
      // Update chemistry score
      await db
        .collection('chats')
        .doc(chatId)
        .collection('chatMotivation')
        .doc('current')
        .set({
          chatId,
          chemistryScore,
          lastTriggered: motivationData?.lastTriggered || null,
          lastType: motivationData?.lastType || 'none',
          totalBoostersTriggered: motivationData?.totalBoostersTriggered || 0,
          totalBoostersUsed: motivationData?.totalBoostersUsed || 0,
          conversionToCall: motivationData?.conversionToCall || false,
          conversionToEvent: motivationData?.conversionToEvent || false,
          updatedAt: admin.firestore.Timestamp.now(),
          createdAt: motivationData?.createdAt || admin.firestore.Timestamp.now()
        }, { merge: true });
      
      // Record chemistry history
      const chemistryRange = getChemistryRange(chemistryScore);
      await db
        .collection('chats')
        .doc(chatId)
        .collection('chemistryHistory')
        .add({
          chatId,
          score: chemistryScore,
          range: chemistryRange,
          factors: {
            sentiment: chemistryInput.averageSentiment,
            engagement: chemistryInput.messageFrequency,
            depth: chemistryInput.emotionalDepth,
            reciprocity: (chemistryInput.questionsAsked + chemistryInput.complimentsGiven) / 10
          },
          timestamp: admin.firestore.Timestamp.now()
        } as ChemistryHistoryEntry);
      
      // Check safety compliance
      const safetyCheck = await checkSafetyCompliance(chatId);
      if (!safetyCheck.allowed) {
        console.log(`Boosters blocked: ${safetyCheck.reason}`);
        return;
      }
      
      // Select booster
      const boosterSelection = await selectBooster(
        conversationContext,
        chemistryScore,
        motivationData?.lastType || 'none',
        motivationData?.lastTriggered || null
      );
      
      if (boosterSelection.shouldTrigger && boosterSelection.selectedBooster) {
        // Save booster
        await db
          .collection('chats')
          .doc(chatId)
          .collection('boosters')
          .doc(boosterSelection.selectedBooster.id)
          .set(boosterSelection.selectedBooster);
        
        // Update motivation state
        await db
          .collection('chats')
          .doc(chatId)
          .collection('chatMotivation')
          .doc('current')
          .update({
            lastTriggered: admin.firestore.Timestamp.now(),
            lastType: boosterSelection.selectedBooster.type,
            totalBoostersTriggered: admin.firestore.FieldValue.increment(1)
          });
        
        console.log(`Booster triggered: ${boosterSelection.selectedBooster.type} for chat ${chatId}`);
      } else {
        console.log(`No booster triggered: ${boosterSelection.reason}`);
      }
      
    } catch (error) {
      console.error('Error in chat motivation engine:', error);
    }
  });

/**
 * Calculate variance of sentiment scores
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Find shared interests between participants
 */
function findSharedInterests(context: ConversationContext): string[] {
  const interests1 = new Set(context.participants[0].profile.interests);
  const interests2 = new Set(context.participants[1].profile.interests);
  return Array.from(interests1).filter(i => interests2.has(i));
}

/**
 * Cloud Function: Clean up expired boosters
 */
export const cleanupExpiredBoosters = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    
    const expiredBoostersSnapshot = await db
      .collectionGroup('boosters')
      .where('active', '==', true)
      .where('expiresAt', '<=', now)
      .get();
    
    const batch = db.batch();
    expiredBoostersSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { active: false });
    });
    
    await batch.commit();
    console.log(`Cleaned up ${expiredBoostersSnapshot.size} expired boosters`);
  });