/**
 * PACK 344 — In-App AI Helpers
 * Message Suggestions · Anti Copy-Paste Guard · Discovery & Profile Coach
 * 
 * Features:
 * 1. Chat Message Helper - Generate contextual message suggestions
 * 2. Anti Copy-Paste Guard - Detect spam & repeated messages
 * 3. Discovery & Profile Coach - Tips for profile improvement
 * 
 * Safety: No explicit content, respects moderation rules
 * Rate Limited: Max 50 suggestions per user per day
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init.js';

// Configuration
const PACK344_CONFIG = {
  dailySuggestionLimit: 50,
  repeatDetectionThreshold: 5, // Same message to X+ different recipients in Y minutes
  repeatDetectionWindowMinutes: 15,
  maxSuggestions: 3,
  maxSuggestionLength: 200, // chars per suggestion
  aiApiKey: process.env.AI_API_KEY || '',
};

// Rate limiting types
interface DailySuggestionUsage {
  count: number;
  date: string; // YYYY-MM-DD
}

interface RepeatMessagePattern {
  messageHash: string;
  recipients: string[];
  firstSeenAt: FirebaseFirestore.Timestamp;
  lastSeenAt: FirebaseFirestore.Timestamp;
}

/**
 * pack344_getMessageSuggestions
 * Generate 2-3 short message suggestions based on context
 */
export const pack344_getMessageSuggestions = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const {
      sessionId,
      receiverProfileSummary,
      contextType,
      lastUserMessage,
      lastPartnerMessage,
      locale = 'en',
    } = data;

    // Validate input
    if (!sessionId || !receiverProfileSummary || !contextType) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required parameters'
      );
    }

    if (!['FIRST_MESSAGE', 'REPLY'].includes(contextType)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid context type'
      );
    }

    try {
      // Rate limiting: Check daily usage
      const today = new Date().toISOString().split('T')[0];
      const usageRef = db.collection('pack344_suggestion_usage').doc(userId);
      const usageDoc = await usageRef.get();
      const usage = usageDoc.data() as DailySuggestionUsage | undefined;

      if (usage && usage.date === today && usage.count >= PACK344_CONFIG.dailySuggestionLimit) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Daily suggestion limit reached. Try again tomorrow.'
        );
      }

      // Generate suggestions using AI
      const suggestions = await generateMessageSuggestions({
        receiverProfile: receiverProfileSummary,
        contextType,
        lastUserMessage,
        lastPartnerMessage,
        locale,
      });

      // Update usage counter
      await usageRef.set({
        count: (usage?.date === today ? usage.count : 0) + 1,
        date: today,
      });

      // Log analytics
      await db.collection('pack344_analytics').add({
        userId,
        eventType: 'suggestion_generated',
        contextType,
        locale,
        suggestionsCount: suggestions.length,
        timestamp: serverTimestamp(),
      });

      return { suggestions };
    } catch (error: any) {
      console.error('[PACK 344] Error generating suggestions:', error);
      throw new functions.https.HttpsError(
        'internal',
        'AI suggestions are temporarily unavailable. Try again later.'
      );
    }
  }
);

/**
 * pack344_flagRepeatedMessagePattern
 * Backend detection of spam-like repeated messages
 */
export const pack344_flagRepeatedMessagePattern = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { messageHash, chatId } = data;

    if (!messageHash || !chatId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required parameters'
      );
    }

    try {
      // Get or create pattern tracking document
      const patternRef = db
        .collection('pack344_message_patterns')
        .doc(`${userId}_${messageHash}`);
      const patternDoc = await patternRef.get();
      const now = new Date();

      let pattern: RepeatMessagePattern = patternDoc.exists
        ? (patternDoc.data() as any)
        : {
            messageHash,
            recipients: [],
            firstSeenAt: now,
            lastSeenAt: now,
          };

      // Check time window
      const windowStartTime = new Date(
        now.getTime() - PACK344_CONFIG.repeatDetectionWindowMinutes * 60 * 1000
      );

      // If pattern is too old, reset
      const lastSeenTime = pattern.lastSeenAt && typeof pattern.lastSeenAt === 'object' && 'toDate' in pattern.lastSeenAt
        ? (pattern.lastSeenAt as any).toDate()
        : new Date(pattern.lastSeenAt as any);
      if (lastSeenTime < windowStartTime) {
        pattern = {
          messageHash,
          recipients: [chatId],
          firstSeenAt: now as any,
          lastSeenAt: now as any,
        };
      } else {
        // Add recipient if not already tracked
        if (!pattern.recipients.includes(chatId)) {
          pattern.recipients.push(chatId);
        }
        pattern.lastSeenAt = now as any;
      }

      // Save pattern
      await patternRef.set(pattern);

      // Check if spam-like pattern detected
      const isSpamLike = pattern.recipients.length >= PACK344_CONFIG.repeatDetectionThreshold;

      // Log analytics
      if (isSpamLike) {
        await db.collection('pack344_analytics').add({
          userId,
          eventType: 'spam_pattern_detected',
          recipientsCount: pattern.recipients.length,
          timestamp: serverTimestamp(),
        });
      }

      return {
        isSpamLike,
        recipientsCount: pattern.recipients.length,
        threshold: PACK344_CONFIG.repeatDetectionThreshold,
      };
    } catch (error: any) {
      console.error('[PACK 344] Error checking message pattern:', error);
      // Don't block user on error - just return false
      return {
        isSpamLike: false,
        recipientsCount: 0,
        threshold: PACK344_CONFIG.repeatDetectionThreshold,
      };
    }
  }
);

/**
 * pack344_getProfileAndDiscoveryTips
 * Generate personalized tips for profile improvement and discovery success
 */
export const pack344_getProfileAndDiscoveryTips = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { profileSummary, statsSummary, locale = 'en', countryCode } = data;

    if (!profileSummary) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Profile summary required'
      );
    }

    try {
      // Rate limiting
      const today = new Date().toISOString().split('T')[0];
      const usageRef = db.collection('pack344_suggestion_usage').doc(userId);
      const usageDoc = await usageRef.get();
      const usage = usageDoc.data() as DailySuggestionUsage | undefined;

      if (usage && usage.date === today && usage.count >= PACK344_CONFIG.dailySuggestionLimit) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Daily suggestion limit reached. Try again tomorrow.'
        );
      }

      // Generate tips using AI
      const tips = await generateProfileAndDiscoveryTips({
        profileSummary,
        statsSummary,
        locale,
        countryCode,
      });

      // Update usage counter
      await usageRef.set({
        count: (usage?.date === today ? usage.count : 0) + 1,
        date: today,
      });

      // Log analytics
      await db.collection('pack344_analytics').add({
        userId,
        eventType: 'tips_generated',
        locale,
        countryCode,
        timestamp: serverTimestamp(),
      });

      return tips;
    } catch (error: any) {
      console.error('[PACK 344] Error generating tips:', error);
      throw new functions.https.HttpsError(
        'internal',
        'AI tips are temporarily unavailable. Try again later.'
      );
    }
  }
);

/**
 * Helper: Generate message suggestions using OpenAI
 */
async function generateMessageSuggestions(params: {
  receiverProfile: any;
  contextType: 'FIRST_MESSAGE' | 'REPLY';
  lastUserMessage?: string;
  lastPartnerMessage?: string;
  locale: string;
}): Promise<Array<{ id: string; text: string; tone: string }>> {
  const { receiverProfile, contextType, lastUserMessage, lastPartnerMessage, locale } = params;

  // Build context prompt
  const isFirstMessage = contextType === 'FIRST_MESSAGE';
  const language = locale === 'pl' ? 'Polish' : 'English';

  let prompt = `You are a dating app assistant. Generate ${PACK344_CONFIG.maxSuggestions} short, engaging message suggestions in ${language}.\n\n`;

  prompt += `Context:\n`;
  prompt += `- Receiver: ${receiverProfile.nickname || 'User'}, age ${receiverProfile.age || '?'}\n`;
  if (receiverProfile.interests && receiverProfile.interests.length > 0) {
    prompt += `- Interests: ${receiverProfile.interests.join(', ')}\n`;
  }
  if (receiverProfile.locationCountry) {
    prompt += `- Location: ${receiverProfile.locationCountry}\n`;
  }

  if (isFirstMessage) {
    prompt += `\nThis is a FIRST MESSAGE. Create ice-breaker messages that:\n`;
    prompt += `- Are friendly and respectful\n`;
    prompt += `- Reference their interests if available\n`;
    prompt += `- Are max 2 sentences each\n`;
    prompt += `- Show genuine curiosity\n`;
  } else {
    prompt += `\nThis is a REPLY.\n`;
    if (lastPartnerMessage) {
      prompt += `Partner said: "${lastPartnerMessage}"\n`;
    }
    if (lastUserMessage) {
      prompt += `You previously said: "${lastUserMessage}"\n`;
    }
    prompt += `\nCreate reply suggestions that:\n`;
    prompt += `- Continue the conversation naturally\n`;
    prompt += `- Are friendly and engaging\n`;
    prompt += `- Are max 2 sentences each\n`;
  }

  prompt += `\nIMPORTANT RULES:\n`;
  prompt += `- NO explicit sexual content\n`;
  prompt += `- NO hate speech or offensive language\n`;
  prompt += `- NO violent or illegal suggestions\n`;
  prompt += `- Keep it flirty but respectful\n`;
  prompt += `- Each suggestion should have a different tone: playful, polite, or confident\n\n`;

  prompt += `Return ONLY a JSON array with this structure:\n`;
  prompt += `[{"text": "message 1", "tone": "playful"}, {"text": "message 2", "tone": "polite"}, {"text": "message 3", "tone": "confident"}]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PACK344_CONFIG.aiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful dating app assistant that creates respectful, engaging message suggestions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data: any = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '[]';
    const suggestions = JSON.parse(responseText);

    // Validate and format suggestions
    return suggestions
      .slice(0, PACK344_CONFIG.maxSuggestions)
      .map((s: any, index: number) => ({
        id: `sug_${Date.now()}_${index}`,
        text: s.text.substring(0, PACK344_CONFIG.maxSuggestionLength),
        tone: s.tone || 'polite',
      }));
  } catch (error) {
    console.error('[PACK 344] OpenAI API error:', error);
    // Fallback suggestions
    return generateFallbackSuggestions(contextType, locale);
  }
}

/**
 * Helper: Generate profile and discovery tips using AI
 */
async function generateProfileAndDiscoveryTips(params: {
  profileSummary: any;
  statsSummary?: any;
  locale: string;
  countryCode?: string;
}): Promise<{ profileTips: string[]; discoveryTips: string[] }> {
  const { profileSummary, statsSummary, locale, countryCode } = params;

  const language = locale === 'pl' ? 'Polish' : 'English';

  let prompt = `You are a dating app success coach. Analyze this profile and provide specific, actionable tips in ${language}.\n\n`;

  prompt += `Profile:\n`;
  prompt += `- Gender: ${profileSummary.gender}\n`;
  prompt += `- Age: ${profileSummary.age || '?'}\n`;
  prompt += `- Bio: ${profileSummary.bio ? `"${profileSummary.bio}"` : 'Empty'}\n`;
  prompt += `- Interests: ${profileSummary.interests?.length || 0} listed\n`;
  prompt += `- Photos: ${profileSummary.photosCount || 0}\n`;
  prompt += `- Video bio: ${profileSummary.hasVideoBio ? 'Yes' : 'No'}\n`;

  if (statsSummary) {
    prompt += `\nRecent Activity (last 7 days):\n`;
    prompt += `- Matches: ${statsSummary.matchesLast7Days || 0}\n`;
    prompt += `- Chats started: ${statsSummary.chatsStartedLast7Days || 0}\n`;
    prompt += `- Paid chats: ${statsSummary.paidChatsLast7Days || 0}\n`;
  }

  if (countryCode) {
    prompt += `\nLocation: ${countryCode}\n`;
  }

  prompt += `\nProvide:\n`;
  prompt += `1. "profileTips": Max 5 bullet points on improving the profile\n`;
  prompt += `2. "discoveryTips": Max 5 bullet points on starting good conversations\n\n`;

  prompt += `Focus on:\n`;
  prompt += `- Specific, actionable advice\n`;
  prompt += `- Safe, respectful dating practices\n`;
  prompt += `- Genuine connection over shallow interactions\n`;
  prompt += `- Cultural sensitivity if country known\n\n`;

  prompt += `Return ONLY valid JSON:\n`;
  prompt += `{"profileTips": ["tip 1", "tip 2", ...], "discoveryTips": ["tip 1", "tip 2", ...]}\n`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PACK344_CONFIG.aiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional dating coach providing respectful, actionable advice.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data: any = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '{}';
    const tips = JSON.parse(responseText);

    return {
      profileTips: (tips.profileTips || []).slice(0, 5),
      discoveryTips: (tips.discoveryTips || []).slice(0, 5),
    };
  } catch (error) {
    console.error('[PACK 344] OpenAI API error:', error);
    // Fallback tips
    return generateFallbackTips(locale);
  }
}

/**
 * Fallback suggestions when AI fails
 */
function generateFallbackSuggestions(
  contextType: string,
  locale: string
): Array<{ id: string; text: string; tone: string }> {
  const isPolish = locale === 'pl';

  if (contextType === 'FIRST_MESSAGE') {
    return isPolish
      ? [
          {
            id: 'fb_1',
            text: 'Cześć! Widzę, że masz ciekawe zainteresowania. Chętnie dowiem się więcej!',
            tone: 'polite',
          },
          {
            id: 'fb_2',
            text: 'Hej! Twój profil przyciągnął moją uwagę. Jak minął Ci dzień?',
            tone: 'playful',
          },
        ]
      : [
          {
            id: 'fb_1',
            text: "Hi! I noticed we have some common interests. Would love to know more about you!",
            tone: 'polite',
          },
          {
            id: 'fb_2',
            text: "Hey! Your profile caught my eye. How's your day going?",
            tone: 'playful',
          },
        ];
  }

  return isPolish
    ? [
        { id: 'fb_1', text: 'To brzmi interesująco! Opowiedz mi więcej.', tone: 'curious' },
        { id: 'fb_2', text: 'Zgadzam się! Myślę podobnie.', tone: 'polite' },
      ]
    : [
        { id: 'fb_1', text: 'That sounds interesting! Tell me more.', tone: 'curious' },
        { id: 'fb_2', text: 'I completely agree! I feel the same way.', tone: 'polite' },
      ];
}

/**
 * Fallback tips when AI fails
 */
function generateFallbackTips(locale: string): {
  profileTips: string[];
  discoveryTips: string[];
} {
  const isPolish = locale === 'pl';

  if (isPolish) {
    return {
      profileTips: [
        'Dodaj co najmniej 3 zdjęcia pokazujące Twoje zainteresowania',
        'Napisz krótkie bio (2-3 zdania) o sobie',
        'Wymień konkretne hobby zamiast ogólników',
        'Dodaj zdjęcie z uśmiechem - sprawia, że profil jest bardziej przyj azny',
      ],
      discoveryTips: [
        'Zacznij od czegoś z profilu drugiej osoby, nie od "cześć"',
        'Zadawaj pytania otwarte, nie tylko tak/nie',
        'Bądź autentyczny - to przyciąga prawdziwe połączenia',
        'Odpowiadaj w ciągu 24h, aby utrzymać dynamikę rozmowy',
      ],
    };
  }

  return {
    profileTips: [
      'Add at least 3 photos that show your personality and interests',
      'Write a short bio (2-3 sentences) about yourself',
      'List specific hobbies instead of generic interests',
      'Include a smiling photo - it makes your profile more approachable',
    ],
    discoveryTips: [
      'Start with something from their profile, not just "hi"',
      'Ask open-ended questions, not just yes/no questions',
      'Be authentic - it attracts genuine connections',
      'Reply within 24 hours to keep conversation momentum',
    ],
  };
}

/**
 * Scheduled cleanup: Remove old message patterns (runs daily)
 */
export const pack344_cleanupOldPatterns = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      const oldPatterns = await db
        .collection('pack344_message_patterns')
        .where('lastSeenAt', '<', cutoffDate)
        .get();

      const batch = db.batch();
      oldPatterns.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`[PACK 344] Cleaned up ${oldPatterns.size} old message patterns`);
    } catch (error) {
      console.error('[PACK 344] Error cleaning up patterns:', error);
    }
  });
