/**
 * PACK 310 — AI Companions & Avatar Builder
 * Cloud Functions for AI avatar management and chat
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, increment, generateId } from './init.js';
import { getUserContext } from './chatMonetization.js';
import { generateAIResponse, validateAvatarConfig } from './aiGenerationService.js';
import type {
  AIAvatar,
  AISession,
  AIChatMessage,
  AvatarCreationRequest,
  AvatarUpdateRequest,
  AIGenerationRequest,
  AIAvatarEvent
} from './aiCompanionTypes.js';

// Configuration
const MAX_AVATARS_PER_USER = 3;
const FREE_STARTER_MESSAGES_AI = 6; // Same as human chat
const AI_WORDS_PER_TOKEN = 7; // AI avatars use Royal rate (owner benefit)

/**
 * Helper: Check if user is eligible to create AI avatars
 */
async function checkAvatarCreationEligibility(userId: string): Promise<void> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const user = userSnap.data() as any;

  // Must be 18+
  if (!user.age || user.age < 18) {
    if (!user.verified18Plus) {
      throw new HttpsError(
        'permission-denied',
        'You must be 18+ to create AI avatars'
      );
    }
  }

  // Must have earnOnChat enabled
  if (!user.modes?.earnFromChat) {
    throw new HttpsError(
      'permission-denied',
      'You must enable earning from chat to create AI avatars'
    );
  }

  // Check avatar count limit
  const existingAvatars = await db.collection('aiAvatars')
    .where('ownerId', '==', userId)
    .where('status', 'in', ['DRAFT', 'ACTIVE', 'PAUSED'])
    .get();

  if (existingAvatars.size >= MAX_AVATARS_PER_USER) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_AVATARS_PER_USER} AI avatars per user`
    );
  }
}

/**
 * Create AI Avatar
 */
export const createAIAvatar = onCall<AvatarCreationRequest>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data;

    // Check eligibility
    await checkAvatarCreationEligibility(userId);

    // Validate avatar configuration
    const validation = validateAvatarConfig(
      data.displayName,
      data.shortTagline,
      data.personaProfile
    );

    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.errors.join('; '));
    }

    // Validate photos
    if (!data.photoIds || data.photoIds.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one photo is required');
    }

    if (data.photoIds.length > 3) {
      throw new HttpsError('invalid-argument', 'Maximum 3 photos allowed');
    }

    if (!data.photoIds.includes(data.primaryPhotoId)) {
      throw new HttpsError('invalid-argument', 'Primary photo must be in photo list');
    }

    // Create avatar
    const avatarId = generateId();
    const now = new Date().toISOString();

    const avatar: AIAvatar = {
      avatarId,
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
      displayName: data.displayName,
      shortTagline: data.shortTagline,
      languageCodes: data.languageCodes,
      personaProfile: data.personaProfile,
      styleConfig: data.styleConfig,
      media: {
        avatarPhotoIds: data.photoIds,
        primaryPhotoId: data.primaryPhotoId
      },
      status: 'DRAFT',
      safety: {
        lastSafetyReviewAt: null,
        nsfwScore: 0,
        riskLevel: 'LOW'
      }
    };

    await db.collection('aiAvatars').doc(avatarId).set(avatar);

    // Initialize analytics
    await db.collection('aiAvatarAnalytics').doc(avatarId).set({
      avatarId,
      ownerId: userId,
      totalSessions: 0,
      activeSessions: 0,
      totalMessages: 0,
      totalEarnings: 0,
      averageSessionDuration: 0,
      averageTokensPerSession: 0,
      lastSessionAt: null,
      updatedAt: now
    });

    // Log event
    await logAvatarEvent({
      eventType: 'AI_AVATAR_CREATED',
      userId,
      avatarId,
      ownerId: userId,
      timestamp: now
    });

    return { success: true, avatarId };
  }
);

/**
 * Update AI Avatar
 */
export const updateAIAvatar = onCall<AvatarUpdateRequest>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { avatarId, ...updates } = request.data;

    // Get existing avatar
    const avatarSnap = await db.collection('aiAvatars').doc(avatarId).get();
    
    if (!avatarSnap.exists) {
      throw new HttpsError('not-found', 'Avatar not found');
    }

    const avatar = avatarSnap.data() as AIAvatar;

    // Check ownership
    if (avatar.ownerId !== userId) {
      throw new HttpsError('permission-denied', 'You can only update your own avatars');
    }

    // Validate updates
    if (updates.displayName || updates.shortTagline || updates.personaProfile) {
      const validation = validateAvatarConfig(
        updates.displayName || avatar.displayName,
        updates.shortTagline || avatar.shortTagline,
        updates.personaProfile ? { ...avatar.personaProfile, ...updates.personaProfile } : avatar.personaProfile
      );

      if (!validation.valid) {
        throw new HttpsError('invalid-argument', validation.errors.join('; '));
      }
    }

    // Apply updates
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (updates.displayName) updateData.displayName = updates.displayName;
    if (updates.shortTagline) updateData.shortTagline = updates.shortTagline;
    if (updates.languageCodes) updateData.languageCodes = updates.languageCodes;
    if (updates.personaProfile) {
      updateData.personaProfile = { ...avatar.personaProfile, ...updates.personaProfile };
    }
    if (updates.styleConfig) {
      updateData.styleConfig = { ...avatar.styleConfig, ...updates.styleConfig };
    }
    if (updates.status) updateData.status = updates.status;

    await db.collection('aiAvatars').doc(avatarId).update(updateData);

    // Log event
    if (updates.status) {
      const eventType = updates.status === 'ACTIVE' ? 'AI_AVATAR_ACTIVATED' :
                       updates.status === 'PAUSED' ? 'AI_AVATAR_PAUSED' : 'AI_AVATAR_UPDATED';
      
      await logAvatarEvent({
        eventType,
        userId,
        avatarId,
        ownerId: avatar.ownerId,
        timestamp: new Date().toISOString()
      });
    }

    return { success: true };
  }
);

/**
 * Start AI Chat Session
 */
export const startAIChatSession = onCall<{ avatarId: string }>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { avatarId } = request.data;

    // Get avatar
    const avatarSnap = await db.collection('aiAvatars').doc(avatarId).get();
    
    if (!avatarSnap.exists) {
      throw new HttpsError('not-found', 'Avatar not found');
    }

    const avatar = avatarSnap.data() as AIAvatar;

    // Check status
    if (avatar.status !== 'ACTIVE') {
      throw new HttpsError('failed-precondition', 'Avatar is not active');
    }

    // Can't chat with own avatar
    if (avatar.ownerId === userId) {
      throw new HttpsError('permission-denied', 'You cannot chat with your own AI avatar');
    }

    // Check for existing active session
    const existingSession = await db.collection('aiSessions')
      .where('avatarId', '==', avatarId)
      .where('payerId', '==', userId)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (!existingSession.empty) {
      const session = existingSession.docs[0].data() as AISession;
      return { success: true, sessionId: session.sessionId };
    }

    // Create new session
    const sessionId = generateId();
    const now = new Date().toISOString();

    const session: AISession = {
      sessionId,
      avatarId,
      ownerId: avatar.ownerId,
      payerId: userId,
      createdAt: now,
      lastMessageAt: now,
      active: true,
      tokensCharged: 0,
      tokensCreatorShare: 0,
      tokensAvaloShare: 0
    };

    await db.collection('aiSessions').doc(sessionId).set(session);

    // Update analytics
    await db.collection('aiAvatarAnalytics').doc(avatarId).update({
      totalSessions: increment(1),
      activeSessions: increment(1),
      updatedAt: now
    });

    // Log event
    await logAvatarEvent({
      eventType: 'AI_AVATAR_CHAT_STARTED',
      userId,
      avatarId,
      ownerId: avatar.ownerId,
      metadata: { sessionId },
      timestamp: now
    });

    return { success: true, sessionId };
  }
);

/**
 * Send Message to AI Avatar
 */
export const sendAIMessage = onCall<{
  sessionId: string;
  message: string;
  language?: string;
}>(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, message, language = 'en' } = request.data;

  // Get session
  const sessionSnap = await db.collection('aiSessions').doc(sessionId).get();
  
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data() as AISession;

  // Check ownership
  if (session.payerId !== userId) {
    throw new HttpsError('permission-denied', 'Not your session');
  }

  // Check active
  if (!session.active) {
    throw new HttpsError('failed-precondition', 'Session is closed');
  }

  // Get avatar
  const avatarSnap = await db.collection('aiAvatars').doc(session.avatarId).get();
  const avatar = avatarSnap.data() as AIAvatar;

  // Get chat history (last 10 messages)
  const historySnap = await db.collection('chats')
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  const chatHistory = historySnap.docs.reverse().map(doc => {
    const msg = doc.data() as AIChatMessage;
    return {
      role: msg.isAI ? 'assistant' : 'user',
      content: msg.text
    };
  }) as Array<{ role: 'user' | 'assistant'; content: string }>;

  // Generate AI response
  const aiRequest: AIGenerationRequest = {
    sessionId,
    avatarId: session.avatarId,
    userMessage: message,
    chatHistory,
    userLanguage: language
  };

  const aiResponse = await generateAIResponse(avatar, aiRequest);

  // Check if moderation failed
  if (!aiResponse.moderationPassed) {
    // Log to moderation queue
    await db.collection('aiModerationQueue').add({
      sessionId,
      avatarId: session.avatarId,
      ownerId: avatar.ownerId,
      payerId: userId,
      userMessage: message,
      aiResponse: aiResponse.response,
      flags: aiResponse.moderationFlags,
      createdAt: serverTimestamp()
    });
  }

  // Calculate billing
  const tokensCharged = aiResponse.tokensCharged;
  const creatorShare = Math.floor(tokensCharged * 0.65); // 65%
  const avaloShare = tokensCharged - creatorShare; // 35%

  // Check if user has enough tokens
  const userContext = await getUserContext(userId);
  const walletSnap = await db.collection('users')
    .doc(userId)
    .collection('wallet')
    .doc('current')
    .get();
  
  const balance = walletSnap.data()?.balance || 0;

  if (balance < tokensCharged) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient tokens. Need ${tokensCharged}, have ${balance}`
    );
  }

  // Process transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from payer
    const payerWalletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
    transaction.update(payerWalletRef, {
      balance: increment(-tokensCharged),
      spent: increment(tokensCharged)
    });

    // Credit creator
    const creatorWalletRef = db.collection('users').doc(avatar.ownerId).collection('wallet').doc('current');
    transaction.update(creatorWalletRef, {
      balance: increment(creatorShare),
      earned: increment(creatorShare)
    });

    // Save user message
    const userMsgRef = db.collection('chats').doc(sessionId).collection('messages').doc();
    transaction.set(userMsgRef, {
      messageId: userMsgRef.id,
      chatId: sessionId,
      sessionId,
      senderId: userId,
      text: message,
      isAI: false,
      avatarId: null,
      numWords: 0,
      tokensCharged: 0,
      createdAt: new Date().toISOString()
    });

    // Save AI message
    const aiMsgRef = db.collection('chats').doc(sessionId).collection('messages').doc();
    transaction.set(aiMsgRef, {
      messageId: aiMsgRef.id,
      chatId: sessionId,
      sessionId,
      senderId: avatar.avatarId,
      text: aiResponse.response,
      isAI: true,
      avatarId: session.avatarId,
      numWords: aiResponse.numWords,
      tokensCharged,
      createdAt: new Date().toISOString(),
      moderationFlags: aiResponse.moderationFlags
    });

    // Update session
    const sessionRef = db.collection('aiSessions').doc(sessionId);
    transaction.update(sessionRef, {
      lastMessageAt: new Date().toISOString(),
      tokensCharged: increment(tokensCharged),
      tokensCreatorShare: increment(creatorShare),
      tokensAvaloShare: increment(avaloShare)
    });

    // Update analytics
    const analyticsRef = db.collection('aiAvatarAnalytics').doc(session.avatarId);
    transaction.update(analyticsRef, {
      totalMessages: increment(2), // user + AI
      totalEarnings: increment(creatorShare),
      lastSessionAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Record transaction
    const txRef = db.collection('transactions').doc();
    transaction.set(txRef, {
      userId,
      type: 'ai_chat',
      amount: -tokensCharged,
      metadata: {
        sessionId,
        avatarId: session.avatarId,
        creatorShare,
        avaloShare
      },
      createdAt: serverTimestamp()
    });
  });

  // Log earning event
  await logAvatarEvent({
    eventType: 'AI_AVATAR_EARNED_TOKENS',
    userId: avatar.ownerId,
    avatarId: session.avatarId,
    ownerId: avatar.ownerId,
    metadata: { tokensEarned: creatorShare, sessionId },
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    aiResponse: aiResponse.response,
    tokensCharged
  };
});

/**
 * Close AI Session
 */
export const closeAISession = onCall<{ sessionId: string }>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { sessionId } = request.data;

    // Get session
    const sessionSnap = await db.collection('aiSessions').doc(sessionId).get();
    
    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const session = sessionSnap.data() as AISession;

    // Check ownership
    if (session.payerId !== userId) {
      throw new HttpsError('permission-denied', 'Not your session');
    }

    // Close session
    await db.collection('aiSessions').doc(sessionId).update({
      active: false,
      closedReason: 'USER_CLOSED'
    });

    // Update analytics
    await db.collection('aiAvatarAnalytics').doc(session.avatarId).update({
      activeSessions: increment(-1),
      updatedAt: new Date().toISOString()
    });

    return { success: true };
  }
);

/**
 * Get User's AI Avatars
 */
export const getUserAIAvatars = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const avatarsSnap = await db.collection('aiAvatars')
    .where('ownerId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  const avatars = avatarsSnap.docs.map(doc => doc.data());

  // Get analytics for each
  const analyticsPromises = avatars.map(avatar =>
    db.collection('aiAvatarAnalytics').doc(avatar.avatarId).get()
  );
  
  const analyticsSnaps = await Promise.all(analyticsPromises);
  const analytics = analyticsSnaps.map(snap => snap.data());

  return {
    success: true,
    avatars: avatars.map((avatar, i) => ({
      ...avatar,
      analytics: analytics[i]
    }))
  };
});

/**
 * Helper: Log avatar event
 */
async function logAvatarEvent(event: AIAvatarEvent): Promise<void> {
  await db.collection('analytics_events').add({
    ...event,
    createdAt: serverTimestamp()
  });
}