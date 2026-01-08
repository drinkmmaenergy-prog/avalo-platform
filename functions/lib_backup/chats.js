"use strict";
/**
 * Chat System Callable Functions
 * Handles chat creation, messaging, billing, and refunds
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundByEarnerCallable = exports.closeChatCallable = exports.sendMessageCallable = exports.startChatCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const init_1 = require("./init");
const config_1 = require("./config");
/**
 * Determine who pays and who earns based on gender and settings
 */
async function determineChatRoles(initiatorUid, receiverUid) {
    const initiatorSnap = await init_1.db.collection("users").doc(initiatorUid).get();
    const receiverSnap = await init_1.db.collection("users").doc(receiverUid).get();
    const initiator = initiatorSnap.data();
    const receiver = receiverSnap.data();
    if (!initiator || !receiver) {
        throw new https_1.HttpsError("not-found", "User profile not found");
    }
    const roles = {
        payer: initiatorUid,
        earner: null,
        initiator: initiatorUid,
        receiver: receiverUid,
    };
    // Hetero rules: Woman always earns, man always pays
    if ((initiator.gender === config_1.Gender.MALE && receiver.gender === config_1.Gender.FEMALE) ||
        (initiator.gender === config_1.Gender.FEMALE && receiver.gender === config_1.Gender.MALE)) {
        // Hetero chat
        roles.payer = initiator.gender === config_1.Gender.MALE ? initiatorUid : receiverUid;
        roles.earner =
            receiver.gender === config_1.Gender.FEMALE ? receiverUid : initiatorUid;
        return roles;
    }
    // Homo and NB rules: Initiator pays, receiver earns if Earn=ON
    roles.payer = initiatorUid;
    roles.earner = receiver.modes?.earnFromChat ? receiverUid : null;
    return roles;
}
/**
 * Count words in text (exclude URLs and emojis)
 */
function countWords(text) {
    // Remove URLs
    const withoutUrls = text.replace(/https?:\/\/[^\s]+/g, "");
    // Remove emoji ranges (basic removal)
    const withoutEmojis = withoutUrls.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
    // Split by whitespace and count
    const words = withoutEmojis.trim().split(/\s+/).filter(Boolean);
    return words.length;
}
/**
 * Calculate tokens from word count based on user role
 */
function calculateTokens(wordCount, isRoyalEarner) {
    const rate = isRoyalEarner
        ? config_1.WORDS_PER_TOKEN_ROYAL_EARNER
        : config_1.WORDS_PER_TOKEN_STANDARD;
    return Math.ceil(wordCount / rate);
}
/**
 * Start a paid chat (after 3 free messages)
 * POST /v1/chat/start
 */
exports.startChatCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    // Auth check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const initiatorUid = request.auth.uid;
    const { receiverUid, chatId: existingChatId } = request.data;
    try {
        // Get or create chat
        const chatId = existingChatId || (0, init_1.generateId)();
        const chatRef = init_1.db.collection("chats").doc(chatId);
        // Determine roles
        const roles = await determineChatRoles(initiatorUid, receiverUid);
        // Check wallet balance
        const walletSnap = await init_1.db
            .collection("users")
            .doc(roles.payer)
            .collection("wallet")
            .doc("current")
            .get();
        const wallet = walletSnap.data();
        if (!wallet || wallet.balance < config_1.CHAT_INITIAL_DEPOSIT_TOKENS) {
            throw new https_1.HttpsError("failed-precondition", "Insufficient tokens. Please add funds.");
        }
        // Calculate split
        const platformFee = Math.ceil(config_1.CHAT_INITIAL_DEPOSIT_TOKENS * (config_1.CHAT_PLATFORM_FEE_PCT / 100));
        const escrow = config_1.CHAT_INITIAL_DEPOSIT_TOKENS - platformFee;
        // Use transaction to ensure atomicity
        await init_1.db.runTransaction(async (transaction) => {
            // Deduct from payer
            transaction.update(init_1.db.collection("users").doc(roles.payer).collection("wallet").doc("current"), {
                balance: (0, init_1.increment)(-config_1.CHAT_INITIAL_DEPOSIT_TOKENS),
                pending: (0, init_1.increment)(escrow),
            });
            // Create or update chat
            const chatData = {
                chatId,
                participants: [initiatorUid, receiverUid],
                status: config_1.ChatStatus.ACTIVE,
                deposit: {
                    amount: config_1.CHAT_INITIAL_DEPOSIT_TOKENS,
                    fee: platformFee,
                    escrow: escrow,
                    paidBy: roles.payer,
                    paidAt: (0, init_1.serverTimestamp)(),
                },
                billing: {
                    currentBalance: escrow,
                    totalSpent: 0,
                    wordsSent: 0,
                    tokensSent: 0,
                },
                roles: {
                    payer: roles.payer,
                    earner: roles.earner,
                },
                freeMessagesUsed: {
                    [initiatorUid]: config_1.CHAT_FREE_MESSAGES_PER_USER,
                    [receiverUid]: config_1.CHAT_FREE_MESSAGES_PER_USER,
                },
                lastActivityAt: (0, init_1.serverTimestamp)(),
                createdAt: (0, init_1.serverTimestamp)(),
                updatedAt: (0, init_1.serverTimestamp)(),
            };
            transaction.set(chatRef, chatData, { merge: true });
            // Record transaction for platform fee (instant, non-refundable)
            const txId = (0, init_1.generateId)();
            transaction.set(init_1.db.collection("transactions").doc(txId), {
                txId,
                uid: roles.payer,
                type: config_1.TransactionType.MESSAGE,
                amountTokens: platformFee,
                split: {
                    platformTokens: platformFee,
                    creatorTokens: 0,
                },
                status: "completed",
                metadata: { chatId },
                createdAt: (0, init_1.serverTimestamp)(),
                completedAt: (0, init_1.serverTimestamp)(),
            });
        });
        return {
            ok: true,
            data: {
                chatId,
                deposit: {
                    amount: config_1.CHAT_INITIAL_DEPOSIT_TOKENS,
                    fee: platformFee,
                    escrow,
                },
            },
        };
    }
    catch (error) {
        console.error("Error starting chat:", error);
        return {
            ok: false,
            error: error.message || "Failed to start chat",
        };
    }
});
/**
 * Send a message and bill tokens
 * POST /v1/chat/message
 */
exports.sendMessageCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const senderUid = request.auth.uid;
    const { chatId, text, media } = request.data;
    try {
        // Moderation check
        if (text && (0, config_1.containsBannedTerms)(text)) {
            throw new https_1.HttpsError("invalid-argument", "Message contains prohibited content");
        }
        // Get chat
        const chatSnap = await init_1.db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatSnap.data();
        // Check if sender is participant
        if (!chat.participants.includes(senderUid)) {
            throw new https_1.HttpsError("permission-denied", "Not a participant");
        }
        // Calculate tokens to charge
        let tokensCharged = 0;
        let wordCount = 0;
        if (text) {
            wordCount = countWords(text);
            // Check if sender is Royal earner for word rate
            const senderSnap = await init_1.db.collection("users").doc(senderUid).get();
            const sender = senderSnap.data();
            const isRoyalEarner = sender.roles?.royal && chat.roles.earner === senderUid;
            tokensCharged = calculateTokens(wordCount, isRoyalEarner);
        }
        else if (media?.type === "voice") {
            // Voice: 30 seconds = 1 token
            tokensCharged = Math.ceil((media.durationSec || 0) / 30);
        }
        // Only charge if sender is the payer
        if (senderUid === chat.roles.payer && tokensCharged > 0) {
            // Check escrow balance
            if (chat.billing.currentBalance < tokensCharged) {
                // Check auto-reload
                if (chat.autoReload &&
                    chat.billing.currentBalance < config_1.AUTO_RELOAD_THRESHOLD_TOKENS) {
                    // Trigger auto-reload (would be separate function, simplified here)
                    throw new https_1.HttpsError("resource-exhausted", "Auto-reload triggered, please retry");
                }
                throw new https_1.HttpsError("resource-exhausted", "Insufficient escrow balance");
            }
            // Deduct from escrow and credit earner
            await init_1.db.runTransaction(async (transaction) => {
                // Update chat billing
                transaction.update(chatSnap.ref, {
                    "billing.currentBalance": (0, init_1.increment)(-tokensCharged),
                    "billing.totalSpent": (0, init_1.increment)(tokensCharged),
                    "billing.wordsSent": (0, init_1.increment)(wordCount),
                    "billing.tokensSent": (0, init_1.increment)(tokensCharged),
                    lastActivityAt: (0, init_1.serverTimestamp)(),
                    updatedAt: (0, init_1.serverTimestamp)(),
                });
                // Credit earner if exists
                if (chat.roles.earner) {
                    transaction.update(init_1.db
                        .collection("users")
                        .doc(chat.roles.earner)
                        .collection("wallet")
                        .doc("current"), {
                        balance: (0, init_1.increment)(tokensCharged),
                        earned: (0, init_1.increment)(tokensCharged),
                    });
                    // Update payer pending
                    transaction.update(init_1.db
                        .collection("users")
                        .doc(chat.roles.payer)
                        .collection("wallet")
                        .doc("current"), {
                        pending: (0, init_1.increment)(-tokensCharged),
                    });
                }
                // Save message
                const messageId = (0, init_1.generateId)();
                const messageData = {
                    messageId,
                    chatId,
                    senderId: senderUid,
                    text,
                    media: media ? { ...media, url: media.url || "", duration: media.durationSec } : undefined,
                    wordCount,
                    tokensCharged,
                    createdAt: (0, init_1.serverTimestamp)(),
                };
                transaction.set(init_1.db
                    .collection("chats")
                    .doc(chatId)
                    .collection("messages")
                    .doc(messageId), messageData);
            });
        }
        else {
            // Free message or receiver sending
            const messageId = (0, init_1.generateId)();
            await init_1.db
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .doc(messageId)
                .set({
                messageId,
                chatId,
                senderId: senderUid,
                text,
                media: media ? { ...media, url: media.url || "", duration: media.durationSec } : undefined,
                wordCount,
                tokensCharged: 0,
                createdAt: (0, init_1.serverTimestamp)(),
            });
            await chatSnap.ref.update({
                lastActivityAt: (0, init_1.serverTimestamp)(),
                updatedAt: (0, init_1.serverTimestamp)(),
            });
        }
        return {
            ok: true,
            data: {
                messageId: (0, init_1.generateId)(),
                tokensCharged,
            },
        };
    }
    catch (error) {
        console.error("Error sending message:", error);
        return {
            ok: false,
            error: error.message || "Failed to send message",
        };
    }
});
/**
 * Close chat manually (refund unused escrow)
 * POST /v1/chat/close
 */
exports.closeChatCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const userUid = request.auth.uid;
    const { chatId } = request.data;
    try {
        const chatSnap = await init_1.db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatSnap.data();
        if (!chat.participants.includes(userUid)) {
            throw new https_1.HttpsError("permission-denied", "Not a participant");
        }
        const refundAmount = chat.billing.currentBalance;
        await init_1.db.runTransaction(async (transaction) => {
            // Refund escrow to payer
            if (refundAmount > 0) {
                transaction.update(init_1.db
                    .collection("users")
                    .doc(chat.roles.payer)
                    .collection("wallet")
                    .doc("current"), {
                    balance: (0, init_1.increment)(refundAmount),
                    pending: (0, init_1.increment)(-refundAmount),
                });
                // Record refund transaction
                const txId = (0, init_1.generateId)();
                transaction.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: chat.roles.payer,
                    type: config_1.TransactionType.REFUND,
                    amountTokens: refundAmount,
                    status: "completed",
                    metadata: { chatId },
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
            }
            // Close chat
            transaction.update(chatSnap.ref, {
                status: config_1.ChatStatus.CLOSED,
                "billing.currentBalance": 0,
                updatedAt: (0, init_1.serverTimestamp)(),
            });
        });
        return {
            ok: true,
            data: { refundedTokens: refundAmount },
        };
    }
    catch (error) {
        console.error("Error closing chat:", error);
        return {
            ok: false,
            error: error.message || "Failed to close chat",
        };
    }
});
/**
 * Earner voluntary refund
 * POST /v1/chat/refund
 */
exports.refundByEarnerCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const earnerUid = request.auth.uid;
    const { chatId } = request.data;
    try {
        const chatSnap = await init_1.db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatSnap.data();
        if (chat.roles.earner !== earnerUid) {
            throw new https_1.HttpsError("permission-denied", "Only earner can issue refund");
        }
        const refundAmount = chat.billing.currentBalance;
        await init_1.db.runTransaction(async (transaction) => {
            if (refundAmount > 0) {
                // Refund to payer
                transaction.update(init_1.db
                    .collection("users")
                    .doc(chat.roles.payer)
                    .collection("wallet")
                    .doc("current"), {
                    balance: (0, init_1.increment)(refundAmount),
                    pending: (0, init_1.increment)(-refundAmount),
                });
                // Record refund
                const txId = (0, init_1.generateId)();
                transaction.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: chat.roles.payer,
                    type: config_1.TransactionType.REFUND,
                    amountTokens: refundAmount,
                    status: "completed",
                    metadata: { chatId, refundedBy: earnerUid },
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
            }
            // Update chat
            transaction.update(chatSnap.ref, {
                "billing.currentBalance": 0,
                updatedAt: (0, init_1.serverTimestamp)(),
            });
        });
        return {
            ok: true,
            data: { refundedTokens: refundAmount },
        };
    }
    catch (error) {
        console.error("Error processing refund:", error);
        return {
            ok: false,
            error: error.message || "Failed to process refund",
        };
    }
});
//# sourceMappingURL=chats.js.map