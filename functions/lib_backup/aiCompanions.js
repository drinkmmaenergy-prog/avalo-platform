"use strict";
/**
 * AI Companions Module - Subscription-Based
 * Revenue: 100% Avalo (no external earners)
 * Billing: Subscription tiers + token-based media unlock
 * Anti-Abuse: Rate limiting, fraud prevention
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAIChatCallable = exports.unlockAIGalleryCallable = exports.sendAIMessageCallable = exports.startAIChatCallable = exports.listAICompanionsCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const init_1 = require("./init");
const zod_1 = require("zod");
// Rate limiting constants
const RATE_LIMIT_CHAT_START = {
    maxAttempts: 3,
    windowMs: 60000, // 1 minute
};
// Subscription Tiers
const SUBSCRIPTION_TIERS = {
    Free: {
        priceMonthly: 0,
        dailyMessageLimit: 10,
        aiAccessLimit: 3,
        nsfwAccess: false,
        creatorAccess: false,
    },
    Plus: {
        priceMonthly: 39, // PLN
        dailyMessageLimit: -1, // Unlimited
        aiAccessLimit: -1, // All standard AIs
        nsfwAccess: false,
        creatorAccess: false,
        mediaTokenCost: 2,
    },
    Intimate: {
        priceMonthly: 79, // PLN
        dailyMessageLimit: -1,
        aiAccessLimit: -1,
        nsfwAccess: true,
        creatorAccess: false,
        mediaTokenCost: 3,
    },
    Creator: {
        priceMonthly: 149, // PLN
        dailyMessageLimit: -1,
        aiAccessLimit: -1,
        nsfwAccess: true,
        creatorAccess: true,
        mediaTokenCost: 2,
        canCreateAI: true,
    },
};
/**
 * Get or Create AI Subscription for User
 */
async function getOrCreateSubscription(userId) {
    try {
        const subRef = init_1.db.collection("users").doc(userId).collection("aiSubscription").doc("current");
        const subSnap = await subRef.get();
        if (subSnap.exists) {
            const subscription = subSnap.data();
            console.log(`[getOrCreateSubscription] Found existing subscription for user ${userId}: ${subscription.tier}`);
            return subscription;
        }
        // Create Free tier subscription
        console.log(`[getOrCreateSubscription] Creating new Free tier subscription for user ${userId}`);
        const newSub = {
            userId,
            tier: "Free",
            status: "active",
            startDate: (0, init_1.serverTimestamp)(),
            dailyMessageCount: 0,
            lastResetDate: (0, init_1.serverTimestamp)(),
            createdAt: (0, init_1.serverTimestamp)(),
        };
        await subRef.set(newSub);
        return newSub;
    }
    catch (error) {
        console.error(`[getOrCreateSubscription] Error for user ${userId}:`, error);
        throw error;
    }
}
/**
 * Validate Subscription Tier Access
 */
async function validateTierAccess(userId, requiredTier) {
    try {
        const subscription = await getOrCreateSubscription(userId);
        console.log(`[validateTierAccess] User ${userId} has ${subscription.tier}, requires ${requiredTier}`);
        if (subscription.status !== "active") {
            console.warn(`[validateTierAccess] User ${userId} subscription status is ${subscription.status}`);
            return { ok: false, error: "Subscription is not active" };
        }
        const tierHierarchy = ["Free", "Plus", "Intimate", "Creator"];
        const userTierLevel = tierHierarchy.indexOf(subscription.tier);
        const requiredTierLevel = tierHierarchy.indexOf(requiredTier);
        if (userTierLevel < requiredTierLevel) {
            console.warn(`[validateTierAccess] User ${userId} tier level ${userTierLevel} < required ${requiredTierLevel}`);
            return {
                ok: false,
                error: `This requires ${requiredTier} subscription. You have ${subscription.tier}.`,
            };
        }
        console.log(`[validateTierAccess] User ${userId} access granted`);
        return { ok: true, subscription };
    }
    catch (error) {
        console.error(`[validateTierAccess] Error for user ${userId}:`, error);
        return { ok: false, error: `Failed to validate tier access: ${error.message}` };
    }
}
/**
 * Check and Reset Daily Message Limit (Free Tier Only)
 */
async function checkDailyMessageLimit(userId, subscription) {
    try {
        if (subscription.tier !== "Free") {
            console.log(`[checkDailyMessageLimit] User ${userId} has ${subscription.tier} tier - no limits`);
            return { ok: true }; // No limit for paid tiers
        }
        const subRef = init_1.db.collection("users").doc(userId).collection("aiSubscription").doc("current");
        // Check if we need to reset (new day)
        const now = new Date();
        let lastReset;
        if (subscription.lastResetDate) {
            const timestamp = subscription.lastResetDate;
            if (typeof timestamp.toDate === 'function') {
                lastReset = timestamp.toDate();
            }
            else if (timestamp._seconds) {
                lastReset = new Date(timestamp._seconds * 1000);
            }
            else {
                lastReset = new Date(0);
            }
        }
        else {
            lastReset = new Date(0);
        }
        console.log(`[checkDailyMessageLimit] User ${userId} - Current: ${now.toISOString()}, Last Reset: ${lastReset.toISOString()}`);
        const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`[checkDailyMessageLimit] User ${userId} - Days since reset: ${daysSinceReset}`);
        if (daysSinceReset >= 1) {
            // Reset daily count
            console.log(`[checkDailyMessageLimit] User ${userId} - Resetting daily count`);
            await subRef.update({
                dailyMessageCount: 0,
                lastResetDate: (0, init_1.serverTimestamp)(),
            });
            return { ok: true };
        }
        // Check limit
        const dailyCount = subscription.dailyMessageCount || 0;
        console.log(`[checkDailyMessageLimit] User ${userId} - Daily count: ${dailyCount}/${SUBSCRIPTION_TIERS.Free.dailyMessageLimit}`);
        if (dailyCount >= SUBSCRIPTION_TIERS.Free.dailyMessageLimit) {
            console.warn(`[checkDailyMessageLimit] User ${userId} - Limit reached: ${dailyCount}/${SUBSCRIPTION_TIERS.Free.dailyMessageLimit}`);
            return {
                ok: false,
                error: `Daily message limit reached (${SUBSCRIPTION_TIERS.Free.dailyMessageLimit}/day). Upgrade to Plus for unlimited messages.`,
            };
        }
        return { ok: true };
    }
    catch (error) {
        console.error(`[checkDailyMessageLimit] Error for user ${userId}:`, error);
        return { ok: false, error: `Failed to check message limit: ${error.message}` };
    }
}
/**
 * List AI Companions (with tier filtering)
 */
exports.listAICompanionsCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    try {
        if (!request.auth) {
            return { ok: false, error: "Not authenticated" };
        }
        const userId = request.auth.uid;
        const data = request.data;
        const limit = data.limit || 50;
        // Get user's subscription to filter by tier
        const subscription = await getOrCreateSubscription(userId);
        let query = init_1.db
            .collection("aiCompanions")
            .where("isActive", "==", true)
            .where("visibility", "in", ["public", undefined]);
        // Apply filters
        if (data.gender) {
            query = query.where("gender", "==", data.gender);
        }
        if (data.ethnicity) {
            query = query.where("ethnicity", "==", data.ethnicity);
        }
        if (data.personality) {
            query = query.where("personality", "==", data.personality);
        }
        const companionsSnapshot = await query.orderBy("popularityScore", "desc").limit(limit).get();
        const companions = companionsSnapshot.docs
            .map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }))
            .filter((companion) => {
            // Filter by tier access
            if (subscription.tier === "Free") {
                return companion.tierAccess?.includes("Free");
            }
            else if (subscription.tier === "Plus") {
                return companion.tierAccess?.some((t) => ["Free", "Plus"].includes(t));
            }
            else if (subscription.tier === "Intimate") {
                return companion.tierAccess?.some((t) => ["Free", "Plus", "Intimate"].includes(t));
            }
            else {
                return true; // Creator has access to all
            }
        })
            .filter((companion) => {
            // Filter by language if specified
            if (data.language) {
                return companion.language?.includes(data.language);
            }
            return true;
        });
        return {
            ok: true,
            data: {
                companions,
                subscription: {
                    tier: subscription.tier,
                    dailyMessagesRemaining: subscription.tier === "Free"
                        ? SUBSCRIPTION_TIERS.Free.dailyMessageLimit - (subscription.dailyMessageCount || 0)
                        : -1,
                },
            },
        };
    }
    catch (error) {
        console.error("List AI companions error:", error);
        return { ok: false, error: error.message };
    }
});
/**
 * Rate Limiting Helper
 */
async function checkRateLimit(userId, action, maxAttempts, windowMs) {
    try {
        const rateLimitRef = init_1.db.collection("rateLimits").doc(`${userId}_${action}`);
        const rateLimitDoc = await rateLimitRef.get();
        const now = Date.now();
        if (rateLimitDoc.exists) {
            const data = rateLimitDoc.data();
            const windowStart = data?.windowStart || 0;
            const attempts = data?.attempts || 0;
            // Check if window expired
            if (now - windowStart > windowMs) {
                // Reset window
                await rateLimitRef.set({
                    windowStart: now,
                    attempts: 1,
                });
                return { ok: true };
            }
            // Check if limit exceeded
            if (attempts >= maxAttempts) {
                const remainingMs = windowMs - (now - windowStart);
                const remainingSec = Math.ceil(remainingMs / 1000);
                console.warn(`[checkRateLimit] User ${userId} rate limited for ${action}: ${attempts}/${maxAttempts}`);
                return {
                    ok: false,
                    error: `Too many attempts. Please wait ${remainingSec} seconds and try again.`,
                };
            }
            // Increment attempts
            await rateLimitRef.update({
                attempts: (0, init_1.increment)(1),
            });
            return { ok: true };
        }
        else {
            // First attempt - create window
            await rateLimitRef.set({
                windowStart: now,
                attempts: 1,
            });
            return { ok: true };
        }
    }
    catch (error) {
        console.error(`[checkRateLimit] Error for user ${userId} action ${action}:`, error);
        // Allow request to proceed on rate limit check errors
        return { ok: true };
    }
}
/**
 * Start AI Chat (No deposit, subscription-based)
 * Anti-Abuse: Rate limited to 3 chats per minute
 */
exports.startAIChatCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    try {
        if (!request.auth) {
            return { ok: false, error: "Not authenticated" };
        }
        const userId = request.auth.uid;
        const data = request.data;
        const schema = zod_1.z.object({
            companionId: zod_1.z.string().min(1),
        });
        schema.parse(data);
        // Rate limiting - max 3 chat starts per minute
        const rateLimitCheck = await checkRateLimit(userId, "start_ai_chat", RATE_LIMIT_CHAT_START.maxAttempts, RATE_LIMIT_CHAT_START.windowMs);
        if (!rateLimitCheck.ok) {
            return { ok: false, error: rateLimitCheck.error };
        }
        // Get companion
        const companionDoc = await init_1.db.collection("aiCompanions").doc(data.companionId).get();
        if (!companionDoc.exists) {
            return { ok: false, error: "AI companion not found" };
        }
        const companion = companionDoc.data();
        if (!companion.isActive) {
            return { ok: false, error: "AI companion is not active" };
        }
        // Check if companion is flagged for moderation
        if (companion.isFlagged) {
            console.warn(`[startAIChat] Attempt to access flagged companion ${data.companionId} by user ${userId}`);
            return { ok: false, error: "This AI companion is currently unavailable" };
        }
        // Validate tier access
        const tierRequired = companion.nsfwAvailable ? "Intimate" : "Plus";
        const accessCheck = await validateTierAccess(userId, tierRequired);
        if (!accessCheck.ok) {
            return { ok: false, error: accessCheck.error };
        }
        // Prevent Free users from accessing Intimate/Creator profiles directly
        if (accessCheck.subscription && accessCheck.subscription.tier === "Free") {
            if (companion.tierAccess.includes("Intimate") || companion.tierAccess.includes("Creator")) {
                console.warn(`[startAIChat] Free user ${userId} attempted to access ${companion.tierAccess.join("/")} companion`);
                return {
                    ok: false,
                    error: "This AI companion requires a paid subscription. Upgrade to Plus, Intimate, or Creator to access.",
                };
            }
        }
        // Check for existing active chat
        const existingChatSnapshot = await init_1.db
            .collection("aiChats")
            .where("userId", "==", userId)
            .where("companionId", "==", data.companionId)
            .where("status", "==", "active")
            .limit(1)
            .get();
        if (!existingChatSnapshot.empty) {
            const existingChat = existingChatSnapshot.docs[0];
            console.log(`[startAIChat] Returning existing chat ${existingChat.id} for user ${userId}`);
            return {
                ok: true,
                data: {
                    chatId: existingChat.id,
                    isNew: false,
                },
            };
        }
        // Create AI chat (no deposit required)
        const chatRef = init_1.db.collection("aiChats").doc();
        const now = (0, init_1.serverTimestamp)();
        const newChat = {
            chatId: chatRef.id,
            userId,
            companionId: data.companionId,
            companionName: companion.name,
            status: "active",
            messagesCount: 0,
            mediaUnlocked: 0,
            tokensSpent: 0,
            lastMessage: null,
            lastActivityAt: now,
            createdAt: now,
            conversationHistory: [],
        };
        await chatRef.set(newChat);
        console.log(`[startAIChat] Created new chat ${chatRef.id} for user ${userId} with companion ${data.companionId}`);
        // Increment companion popularity
        await companionDoc.ref.update({
            popularityScore: (0, init_1.increment)(1),
        });
        return {
            ok: true,
            data: {
                chatId: chatRef.id,
                isNew: true,
                subscription: accessCheck.subscription,
            },
        };
    }
    catch (error) {
        console.error("[startAIChat] Error:", error);
        return { ok: false, error: error.message };
    }
});
/**
 * Send AI Message (Subscription-based, no per-word charging)
 */
exports.sendAIMessageCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    try {
        if (!request.auth) {
            return { ok: false, error: "Not authenticated" };
        }
        const userId = request.auth.uid;
        const data = request.data;
        const schema = zod_1.z.object({
            chatId: zod_1.z.string().min(1),
            text: zod_1.z.string().min(1).max(1000),
        });
        schema.parse(data);
        // Get chat
        const chatRef = init_1.db.collection("aiChats").doc(data.chatId);
        const chatSnap = await chatRef.get();
        if (!chatSnap.exists) {
            return { ok: false, error: "Chat not found" };
        }
        const chat = chatSnap.data();
        if (chat.userId !== userId) {
            return { ok: false, error: "Unauthorized" };
        }
        if (chat.status !== "active") {
            return { ok: false, error: "Chat is not active" };
        }
        // Get subscription and check limits
        const subscription = await getOrCreateSubscription(userId);
        const limitCheck = await checkDailyMessageLimit(userId, subscription);
        if (!limitCheck.ok) {
            return { ok: false, error: limitCheck.error };
        }
        // Get companion for system prompt
        const companionDoc = await init_1.db.collection("aiCompanions").doc(chat.companionId).get();
        const companion = companionDoc.data();
        // Create user message
        const userMessageRef = init_1.db.collection("aiChats").doc(data.chatId).collection("messages").doc();
        const now = (0, init_1.serverTimestamp)();
        await userMessageRef.set({
            messageId: userMessageRef.id,
            role: "user",
            text: data.text,
            createdAt: now,
        });
        // Generate AI response (placeholder - integrate with OpenAI/Claude in production)
        const aiResponse = await generateAIResponse(companion.systemPrompt || companion.description, chat.conversationHistory, data.text);
        // Create AI message
        const aiMessageRef = init_1.db.collection("aiChats").doc(data.chatId).collection("messages").doc();
        await aiMessageRef.set({
            messageId: aiMessageRef.id,
            role: "assistant",
            text: aiResponse,
            createdAt: now,
        });
        // Update chat and conversation history
        await chatRef.update({
            messagesCount: (0, init_1.increment)(2),
            lastMessage: data.text,
            lastActivityAt: now,
            conversationHistory: [
                ...(chat.conversationHistory || []).slice(-20), // Keep last 20 messages
                { role: "user", content: data.text },
                { role: "assistant", content: aiResponse },
            ],
        });
        // Increment daily message count for Free tier
        if (subscription.tier === "Free") {
            const subRef = init_1.db.collection("users").doc(userId).collection("aiSubscription").doc("current");
            await subRef.update({
                dailyMessageCount: (0, init_1.increment)(1),
            });
        }
        return {
            ok: true,
            data: {
                userMessageId: userMessageRef.id,
                aiMessageId: aiMessageRef.id,
                aiResponse,
                messagesRemaining: subscription.tier === "Free"
                    ? SUBSCRIPTION_TIERS.Free.dailyMessageLimit - (subscription.dailyMessageCount || 0) - 1
                    : -1,
            },
        };
    }
    catch (error) {
        console.error("Send AI message error:", error);
        return { ok: false, error: error.message };
    }
});
/**
 * Unlock AI Gallery Photo (Token-based)
 */
exports.unlockAIGalleryCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    try {
        if (!request.auth) {
            return { ok: false, error: "Not authenticated" };
        }
        const userId = request.auth.uid;
        const data = request.data;
        const schema = zod_1.z.object({
            companionId: zod_1.z.string().min(1),
            photoIndex: zod_1.z.number().min(0),
        });
        schema.parse(data);
        // Get companion
        const companionRef = init_1.db.collection("aiCompanions").doc(data.companionId);
        const companionDoc = await companionRef.get();
        if (!companionDoc.exists) {
            return { ok: false, error: "AI companion not found" };
        }
        const companion = companionDoc.data();
        // Check if photo exists
        if (data.photoIndex >= companion.unblurredGallery.length) {
            return { ok: false, error: "Photo index out of range" };
        }
        // Check if already unlocked
        const unlockedPhotos = companion.unlockedGallery?.[userId] || [];
        const photoUrl = companion.unblurredGallery[data.photoIndex];
        if (unlockedPhotos.includes(photoUrl)) {
            return {
                ok: true,
                data: {
                    photoUrl,
                    alreadyUnlocked: true,
                    tokensCharged: 0,
                },
            };
        }
        // Get user's subscription to determine token cost
        const subscription = await getOrCreateSubscription(userId);
        let tokenCost = 5; // Default
        if (subscription.tier === "Plus") {
            tokenCost = SUBSCRIPTION_TIERS.Plus.mediaTokenCost || 2;
        }
        else if (subscription.tier === "Intimate") {
            tokenCost = SUBSCRIPTION_TIERS.Intimate.mediaTokenCost || 3;
        }
        else if (subscription.tier === "Creator") {
            tokenCost = SUBSCRIPTION_TIERS.Creator.mediaTokenCost || 2;
        }
        // Check wallet balance
        const walletRef = init_1.db.collection("users").doc(userId).collection("wallet").doc("current");
        const walletSnap = await walletRef.get();
        if (!walletSnap.exists) {
            return { ok: false, error: "Wallet not found" };
        }
        const wallet = walletSnap.data();
        if (!wallet || wallet.balance < tokenCost) {
            return {
                ok: false,
                error: `Insufficient balance. Need ${tokenCost} tokens to unlock this photo.`,
            };
        }
        // Deduct tokens and unlock photo
        await init_1.db.runTransaction(async (transaction) => {
            const walletDoc = await transaction.get(walletRef);
            if (!walletDoc.exists) {
                throw new Error("Wallet not found");
            }
            const currentBalance = walletDoc.data()?.balance || 0;
            if (currentBalance < tokenCost) {
                throw new Error("Insufficient balance");
            }
            // Update wallet
            transaction.update(walletRef, {
                balance: (0, init_1.increment)(-tokenCost),
                spent: (0, init_1.increment)(tokenCost),
                updatedAt: (0, init_1.serverTimestamp)(),
            });
            // Update companion's unlocked gallery
            const updatedUnlocked = {
                ...companion.unlockedGallery,
                [userId]: [...unlockedPhotos, photoUrl],
            };
            transaction.update(companionRef, {
                unlockedGallery: updatedUnlocked,
            });
            // Record transaction
            const txnRef = init_1.db.collection("transactions").doc();
            transaction.set(txnRef, {
                txnId: txnRef.id,
                userId,
                type: "debit",
                amount: tokenCost,
                source: "ai_gallery_unlock",
                description: `Unlocked photo from ${companion.name}`,
                createdAt: (0, init_1.serverTimestamp)(),
                metadata: {
                    companionId: data.companionId,
                    photoIndex: data.photoIndex,
                    photoUrl,
                },
            });
        });
        return {
            ok: true,
            data: {
                photoUrl,
                alreadyUnlocked: false,
                tokensCharged: tokenCost,
            },
        };
    }
    catch (error) {
        console.error("Unlock AI gallery error:", error);
        return { ok: false, error: error.message };
    }
});
/**
 * Close AI Chat (No refund needed for subscription model)
 */
exports.closeAIChatCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    try {
        if (!request.auth) {
            return { ok: false, error: "Not authenticated" };
        }
        const userId = request.auth.uid;
        const data = request.data;
        const chatRef = init_1.db.collection("aiChats").doc(data.chatId);
        const chatSnap = await chatRef.get();
        if (!chatSnap.exists) {
            return { ok: false, error: "Chat not found" };
        }
        const chat = chatSnap.data();
        if (chat.userId !== userId) {
            return { ok: false, error: "Unauthorized" };
        }
        // Close chat
        await chatRef.update({
            status: "closed",
            closedAt: (0, init_1.serverTimestamp)(),
        });
        return {
            ok: true,
            data: { chatId: data.chatId },
        };
    }
    catch (error) {
        console.error("Close AI chat error:", error);
        return { ok: false, error: error.message };
    }
});
/**
 * Helper: Generate AI Response (Mock - integrate with OpenAI/Claude in production)
 */
async function generateAIResponse(systemPrompt, history, userMessage) {
    // TODO: In production, integrate with OpenAI or Claude API
    // const response = await openai.chat.completions.create({
    //   model: "gpt-4",
    //   messages: [
    //     { role: "system", content: systemPrompt },
    //     ...history,
    //     { role: "user", content: userMessage }
    //   ]
    // });
    // return response.choices[0].message.content;
    const responses = [
        "That's really interesting! I'd love to hear more about that.",
        "I completely understand what you mean. Tell me more!",
        "You have such a unique perspective on this!",
        "I'm really enjoying our conversation. What else is on your mind?",
        "That's fascinating! I never thought about it that way before.",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}
//# sourceMappingURL=aiCompanions.js.map