/**
 * PACK 53 - Notification Event Hooks
 * Integration hooks for existing systems to trigger notifications
 */

import { createNotification } from "./notificationHub";
import { NotificationType } from "./types/notification.types";

/**
 * Hook: New human message received
 * Called when a paid chat message is received
 */
export async function onNewMessage(params: {
  receiverId: string;
  senderId: string;
  conversationId: string;
  senderName: string;
  messagePreview: string;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.receiverId,
      type: "NEW_MESSAGE",
      title: `New message from ${params.senderName}`,
      body: params.messagePreview,
      context: {
        conversationId: params.conversationId,
        counterpartyId: params.senderId,
        deepLink: `chat/${params.conversationId}`,
      },
    });
  } catch (error) {
    console.error("Error in onNewMessage notification hook:", error);
  }
}

/**
 * Hook: AI Companion reply generated
 * Called when AI companion generates a reply
 */
export async function onAIReply(params: {
  userId: string;
  companionId: string;
  companionName: string;
  conversationId: string;
  replyPreview: string;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: "AI_REPLY",
      title: `${params.companionName} replied`,
      body: params.replyPreview,
      context: {
        companionId: params.companionId,
        conversationId: params.conversationId,
        deepLink: `ai-companion/${params.companionId}`,
      },
    });
  } catch (error) {
    console.error("Error in onAIReply notification hook:", error);
  }
}

/**
 * Hook: Paid media unlocked
 * Called when user's paid media content is purchased/unlocked
 */
export async function onMediaUnlock(params: {
  creatorId: string;
  buyerId: string;
  buyerName: string;
  mediaMessageId: string;
  conversationId: string;
  tokensEarned: number;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.creatorId,
      type: "MEDIA_UNLOCK",
      title: "Media content unlocked",
      body: `${params.buyerName} unlocked your content for ${params.tokensEarned} tokens`,
      context: {
        counterpartyId: params.buyerId,
        mediaMessageId: params.mediaMessageId,
        conversationId: params.conversationId,
        deepLink: `chat/${params.conversationId}`,
      },
    });
  } catch (error) {
    console.error("Error in onMediaUnlock notification hook:", error);
  }
}

/**
 * Hook: Streak milestone reached
 * Called when user reaches a streak milestone
 */
export async function onStreakMilestone(params: {
  userId: string;
  streakDays: number;
  milestone: number;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: "STREAK",
      title: `${params.milestone}-day streak! 🔥`,
      body: `You're on fire! Keep your streak going.`,
      context: {
        deepLink: "profile/streaks",
      },
    });
  } catch (error) {
    console.error("Error in onStreakMilestone notification hook:", error);
  }
}

/**
 * Hook: Royal Club tier changed
 * Called when user's Royal Club tier is updated
 */
export async function onRoyalTierChange(params: {
  userId: string;
  oldTier: string;
  newTier: string;
}): Promise<void> {
  try {
    const tierNames: Record<string, string> = {
      ROYAL_BRONZE: "Bronze",
      ROYAL_SILVER: "Silver",
      ROYAL_GOLD: "Gold",
      ROYAL_PLATINUM: "Platinum",
      ROYAL_DIAMOND: "Diamond",
    };

    const newTierName = tierNames[params.newTier] || params.newTier;

    await createNotification({
      userId: params.userId,
      type: "ROYAL_UPDATE",
      title: `Royal Club ${newTierName}! 👑`,
      body: `Congratulations! You've reached ${newTierName} tier.`,
      context: {
        deepLink: "profile/royal",
      },
    });
  } catch (error) {
    console.error("Error in onRoyalTierChange notification hook:", error);
  }
}

/**
 * Hook: Significant earnings event
 * Called when creator has significant earnings (e.g., daily threshold or big single event)
 */
export async function onEarningsEvent(params: {
  creatorId: string;
  earningsEventId: string;
  amount: number;
  type: "daily_summary" | "large_transaction";
}): Promise<void> {
  try {
    let title: string;
    let body: string;

    if (params.type === "daily_summary") {
      title = "Daily earnings summary";
      body = `You earned ${params.amount} tokens today`;
    } else {
      title = "Big earnings!";
      body = `You just earned ${params.amount} tokens`;
    }

    await createNotification({
      userId: params.creatorId,
      type: "EARNINGS",
      title,
      body,
      context: {
        earningsEventId: params.earningsEventId,
        deepLink: "earnings",
      },
    });
  } catch (error) {
    console.error("Error in onEarningsEvent notification hook:", error);
  }
}