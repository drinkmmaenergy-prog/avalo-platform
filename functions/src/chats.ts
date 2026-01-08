/**
 * Chat System Callable Functions
 * Handles chat creation, messaging, billing, and refunds
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from "firebase-functions/v2/https";
;
import { CHAT_INITIAL_DEPOSIT_TOKENS, CHAT_FREE_MESSAGES_PER_USER, CHAT_PLATFORM_FEE_PCT, WORDS_PER_TOKEN_STANDARD, WORDS_PER_TOKEN_ROYAL_EARNER, AUTO_RELOAD_THRESHOLD_TOKENS, Gender, ChatStatus, TransactionType } from './config.js';
import { UserProfile, UserWallet, Chat, Message, Transaction, FunctionResponse, ChatRoles } from './types.js';

/**
 * Determine who pays and who earns based on gender and settings
 */
async function determineChatRoles(
  initiatorUid: string,
  receiverUid: string
): Promise<ChatRoles> {
  const initiatorSnap = await db.collection("users").doc(initiatorUid).get();
  const receiverSnap = await db.collection("users").doc(receiverUid).get();

  const initiator = initiatorSnap.data() as UserProfile;
  const receiver = receiverSnap.data() as UserProfile;

  if (!initiator || !receiver) {
    throw new HttpsError("not-found", "User profile not found");
  }

  const roles: ChatRoles = {
    payer: initiatorUid,
    earner: null,
    initiator: initiatorUid,
    receiver: receiverUid,
  };

  // Hetero rules: Woman always earns, man always pays
  if (
    (initiator.gender === Gender.MALE && receiver.gender === Gender.FEMALE) ||
    (initiator.gender === Gender.FEMALE && receiver.gender === Gender.MALE)
  ) {
    // Hetero chat
    roles.payer = initiator.gender === Gender.MALE ? initiatorUid : receiverUid;
    roles.earner =
      receiver.gender === Gender.FEMALE ? receiverUid : initiatorUid;
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
function countWords(text: string): number {
  // Remove URLs
  const withoutUrls = text.replace(/https?:\/\/[^\s]+/g, "");
  // Remove emoji ranges (basic removal)
  const withoutEmojis = withoutUrls.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ""
  );
  // Split by whitespace and count
  const words = withoutEmojis.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Calculate tokens from word count based on user role
 */
function calculateTokens(
  wordCount: number,
  isRoyalEarner: boolean
): number {
  const rate = isRoyalEarner
    ? WORDS_PER_TOKEN_ROYAL_EARNER
    : WORDS_PER_TOKEN_STANDARD;
  return Math.ceil(wordCount / rate);
}

/**
 * Start a paid chat (after 3 free messages)
 * POST /v1/chat/start
 */
export const startChatCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ chatId: string; deposit: any }>> => {
      // Auth check
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const initiatorUid = request.auth.uid;
      const { receiverUid, chatId: existingChatId } = request.data;

      try {
        // Get or create chat
        const chatId = existingChatId || generateId();
        const chatRef = db.collection("chats").doc(chatId);

        // Determine roles
        const roles = await determineChatRoles(initiatorUid, receiverUid);

        // Check wallet balance
        const walletSnap = await db
          .collection("users")
          .doc(roles.payer)
          .collection("wallet")
          .doc("current")
          .get();
        const wallet = walletSnap.data() as UserWallet;

        if (!wallet || wallet.balance < CHAT_INITIAL_DEPOSIT_TOKENS) {
          throw new HttpsError(
            "failed-precondition",
            "Insufficient tokens. Please add funds."
          );
        }

        // Calculate split
        const platformFee = Math.ceil(
          CHAT_INITIAL_DEPOSIT_TOKENS * (CHAT_PLATFORM_FEE_PCT / 100)
        );
        const escrow = CHAT_INITIAL_DEPOSIT_TOKENS - platformFee;

        // Use transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
          // Deduct from payer
          transaction.update(
            db.collection("users").doc(roles.payer).collection("wallet").doc("current"),
            {
              balance: increment(-CHAT_INITIAL_DEPOSIT_TOKENS),
              pending: increment(escrow),
            }
          );

          // Create or update chat
          const chatData: Partial<Chat> = {
            chatId,
            participants: [initiatorUid, receiverUid],
            status: ChatStatus.ACTIVE,
            deposit: {
              amount: CHAT_INITIAL_DEPOSIT_TOKENS,
              fee: platformFee,
              escrow: escrow,
              paidBy: roles.payer,
              paidAt: serverTimestamp() as any,
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
              [initiatorUid]: CHAT_FREE_MESSAGES_PER_USER,
              [receiverUid]: CHAT_FREE_MESSAGES_PER_USER,
            },
            lastActivityAt: serverTimestamp() as any,
            createdAt: serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
          };

          transaction.set(chatRef, chatData, { merge: true });

          // Record transaction for platform fee (instant, non-refundable)
          const txId = generateId();
          transaction.set(db.collection("transactions").doc(txId), {
            txId,
            uid: roles.payer,
            type: TransactionType.MESSAGE,
            amountTokens: platformFee,
            split: {
              platformTokens: platformFee,
              creatorTokens: 0,
            },
            status: "completed",
            metadata: { chatId },
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          } as Transaction);
        });

        return {
          ok: true,
          data: {
            chatId,
            deposit: {
              amount: CHAT_INITIAL_DEPOSIT_TOKENS,
              fee: platformFee,
              escrow,
            },
          },
        };
      } catch (error: any) {
        console.error("Error starting chat:", error);
        return {
          ok: false,
          error: error.message || "Failed to start chat",
        };
      }
    }
  );

/**
 * Send a message and bill tokens
 * POST /v1/chat/message
 */
export const sendMessageCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ messageId: string; tokensCharged: number }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const senderUid = request.auth.uid;
      const { chatId, text, media } = request.data;

      try {
        // Moderation check
        if (text && containsBannedTerms(text)) {
          throw new HttpsError(
            "invalid-argument",
            "Message contains prohibited content"
          );
        }

        // Get chat
        const chatSnap = await db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
          throw new HttpsError("not-found", "Chat not found");
        }

        const chat = chatSnap.data() as Chat;

        // Check if sender is participant
        if (!chat.participants.includes(senderUid)) {
          throw new HttpsError(
            "permission-denied",
            "Not a participant"
          );
        }

        // Calculate tokens to charge
        let tokensCharged = 0;
        let wordCount = 0;

        if (text) {
          wordCount = countWords(text);

          // Check if sender is Royal earner for word rate
          const senderSnap = await db.collection("users").doc(senderUid).get();
          const sender = senderSnap.data() as UserProfile;
          const isRoyalEarner =
            sender.roles?.royal && chat.roles.earner === senderUid;

          tokensCharged = calculateTokens(wordCount, isRoyalEarner);
        } else if (media?.type === "voice") {
          // Voice: 30 seconds = 1 token
          tokensCharged = Math.ceil((media.durationSec || 0) / 30);
        }

        // Only charge if sender is the payer
        if (senderUid === chat.roles.payer && tokensCharged > 0) {
          // Check escrow balance
          if (chat.billing.currentBalance < tokensCharged) {
            // Check auto-reload
            if (
              chat.autoReload &&
              chat.billing.currentBalance < AUTO_RELOAD_THRESHOLD_TOKENS
            ) {
              // Trigger auto-reload (would be separate function, simplified here)
              throw new HttpsError(
                "resource-exhausted",
                "Auto-reload triggered, please retry"
              );
            }

            throw new HttpsError(
              "resource-exhausted",
              "Insufficient escrow balance"
            );
          }

          // Deduct from escrow and credit earner
          await db.runTransaction(async (transaction) => {
            // Update chat billing
            transaction.update(chatSnap.ref, {
              "billing.currentBalance": increment(-tokensCharged),
              "billing.totalSpent": increment(tokensCharged),
              "billing.wordsSent": increment(wordCount),
              "billing.tokensSent": increment(tokensCharged),
              lastActivityAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            // Credit earner if exists
            if (chat.roles.earner) {
              transaction.update(
                db
                  .collection("users")
                  .doc(chat.roles.earner)
                  .collection("wallet")
                  .doc("current"),
                {
                  balance: increment(tokensCharged),
                  earned: increment(tokensCharged),
                }
              );

              // Update payer pending
              transaction.update(
                db
                  .collection("users")
                  .doc(chat.roles.payer)
                  .collection("wallet")
                  .doc("current"),
                {
                  pending: increment(-tokensCharged),
                }
              );
            }

            // Save message
            const messageId = generateId();
            const messageData: Message = {
              messageId,
              chatId,
              senderId: senderUid,
              text,
              media: media ? { ...media, url: media.url || "", duration: media.durationSec } : undefined,
              wordCount,
              tokensCharged,
              createdAt: serverTimestamp() as any,
            };

            transaction.set(
              db
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .doc(messageId),
              messageData
            );
          });
        } else {
          // Free message or receiver sending
          const messageId = generateId();
          await db
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
              createdAt: serverTimestamp(),
            } as Message);

          await chatSnap.ref.update({
            lastActivityAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {
          ok: true,
          data: {
            messageId: generateId(),
            tokensCharged,
          },
        };
      } catch (error: any) {
        console.error("Error sending message:", error);
        return {
          ok: false,
          error: error.message || "Failed to send message",
        };
      }
    }
  );

/**
 * Close chat manually (refund unused escrow)
 * POST /v1/chat/close
 */
export const closeChatCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ refundedTokens: number }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const userUid = request.auth.uid;
      const { chatId } = request.data;

      try {
        const chatSnap = await db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
          throw new HttpsError("not-found", "Chat not found");
        }

        const chat = chatSnap.data() as Chat;

        if (!chat.participants.includes(userUid)) {
          throw new HttpsError(
            "permission-denied",
            "Not a participant"
          );
        }

        const refundAmount = chat.billing.currentBalance;

        await db.runTransaction(async (transaction) => {
          // Refund escrow to payer
          if (refundAmount > 0) {
            transaction.update(
              db
                .collection("users")
                .doc(chat.roles.payer)
                .collection("wallet")
                .doc("current"),
              {
                balance: increment(refundAmount),
                pending: increment(-refundAmount),
              }
            );

            // Record refund transaction
            const txId = generateId();
            transaction.set(db.collection("transactions").doc(txId), {
              txId,
              uid: chat.roles.payer,
              type: TransactionType.REFUND,
              amountTokens: refundAmount,
              status: "completed",
              metadata: { chatId },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            } as Transaction);
          }

          // Close chat
          transaction.update(chatSnap.ref, {
            status: ChatStatus.CLOSED,
            "billing.currentBalance": 0,
            updatedAt: serverTimestamp(),
          });
        });

        return {
          ok: true,
          data: { refundedTokens: refundAmount },
        };
      } catch (error: any) {
        console.error("Error closing chat:", error);
        return {
          ok: false,
          error: error.message || "Failed to close chat",
        };
      }
    }
  );

/**
 * Earner voluntary refund
 * POST /v1/chat/refund
 */
export const refundByEarnerCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ refundedTokens: number }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const earnerUid = request.auth.uid;
      const { chatId } = request.data;

      try {
        const chatSnap = await db.collection("chats").doc(chatId).get();
        if (!chatSnap.exists) {
          throw new HttpsError("not-found", "Chat not found");
        }

        const chat = chatSnap.data() as Chat;

        if (chat.roles.earner !== earnerUid) {
          throw new HttpsError(
            "permission-denied",
            "Only earner can issue refund"
          );
        }

        const refundAmount = chat.billing.currentBalance;

        await db.runTransaction(async (transaction) => {
          if (refundAmount > 0) {
            // Refund to payer
            transaction.update(
              db
                .collection("users")
                .doc(chat.roles.payer)
                .collection("wallet")
                .doc("current"),
              {
                balance: increment(refundAmount),
                pending: increment(-refundAmount),
              }
            );

            // Record refund
            const txId = generateId();
            transaction.set(db.collection("transactions").doc(txId), {
              txId,
              uid: chat.roles.payer,
              type: TransactionType.REFUND,
              amountTokens: refundAmount,
              status: "completed",
              metadata: { chatId, refundedBy: earnerUid },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            } as Transaction);
          }

          // Update chat
          transaction.update(chatSnap.ref, {
            "billing.currentBalance": 0,
            updatedAt: serverTimestamp(),
          });
        });

        return {
          ok: true,
          data: { refundedTokens: refundAmount },
        };
      } catch (error: any) {
        console.error("Error processing refund:", error);
        return {
          ok: false,
          error: error.message || "Failed to process refund",
        };
      }
    }
  );


