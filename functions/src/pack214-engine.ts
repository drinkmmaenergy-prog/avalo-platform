/**
 * PACK 214 - Return Trigger Engine
 * Core logic for smart re-engagement without spam
 */

import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  ReturnTriggerEventType,
  UserType,
  ReturnTriggerSettings,
  TriggerCooldown,
  SilenceRuleCheck,
  CreateReturnTriggerInput,
  ReturnTriggerEvent,
  UserBreakTracking,
  ReturnTriggerStats,
} from "./pack214-types";
import { getMessageTemplate, validateMessageTone, personalizeTemplate } from "./pack214-templates";
import { createNotification } from "./notificationHub";

const db = getFirestore();

/**
 * Cooldown periods for each event type (in hours)
 */
const COOLDOWN_PERIODS: Record<ReturnTriggerEventType, number> = {
  NEW_HIGH_PRIORITY_MATCH: 24,
  MESSAGE_FROM_MATCH: 6,
  NEW_LIKES: 12,
  WISHLIST_ADD: 12,
  HIGH_CHEMISTRY_PROFILE_VISIT: 24,
  GOOD_VIBE_BOOST: 48,
  TOKEN_SALE_OPPORTUNITY: 72,
  DISCOVERY_BOOST_ACTIVE: 12,
  BREAK_RETURN_7DAY: 168, // 7 days
  BREAK_RETURN_14DAY: 168,
  BREAK_RETURN_30DAY: 168,
  BREAK_RETURN_60DAY: 168,
  COLD_START_DAY_1: 24,
  COLD_START_DAY_2: 24,
  COLD_START_DAY_3: 24,
  COLD_START_DAY_4: 24,
  COLD_START_DAY_5: 24,
  COLD_START_DAY_6: 24,
  COLD_START_DAY_7: 24,
};

/**
 * Maximum triggers per user per day
 */
const MAX_TRIGGERS_PER_DAY = 3;

/**
 * Check silence rules - Dating is not desperate, Avalo respects personal space
 */
export async function checkSilenceRules(userId: string): Promise<SilenceRuleCheck> {
  try {
    // Get user settings
    const settingsDoc = await db
      .collection("return_trigger_settings")
      .doc(userId)
      .get();

    if (!settingsDoc.exists) {
      // No settings = new user, allow triggers
      return { allowed: true };
    }

    const settings = settingsDoc.data() as ReturnTriggerSettings;

    // Check if triggers are disabled
    if (!settings.enabled) {
      return { allowed: false, reason: "do_not_disturb" };
    }

    // Check panic mode
    if (settings.inPanicMode) {
      if (
        settings.panicModeCooldownUntil &&
        settings.panicModeCooldownUntil.toMillis() > Date.now()
      ) {
        return {
          allowed: false,
          reason: "panic_mode",
          cooldownExpiresAt: settings.panicModeCooldownUntil,
        };
      }
    }

    // Check unresolved incident
    if (settings.hasUnresolvedIncident) {
      return { allowed: false, reason: "unresolved_incident" };
    }

    // Check do not disturb
    if (settings.doNotDisturb) {
      return { allowed: false, reason: "do_not_disturb" };
    }

    // Check in meeting/event
    if (settings.inMeetingOrEvent) {
      return { allowed: false, reason: "in_meeting_event" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Error checking silence rules:", error);
    // Fail safe - allow trigger if check fails
    return { allowed: true };
  }
}

/**
 * Check cooldown for specific event type
 */
export async function checkCooldown(
  userId: string,
  eventType: ReturnTriggerEventType
): Promise<SilenceRuleCheck> {
  try {
    const cooldownDoc = await db
      .collection("trigger_cooldowns")
      .doc(`${userId}_${eventType}`)
      .get();

    if (!cooldownDoc.exists) {
      return { allowed: true };
    }

    const cooldown = cooldownDoc.data() as TriggerCooldown;

    if (cooldown.cooldownExpiresAt.toMillis() > Date.now()) {
      return {
        allowed: false,
        reason: "cooldown",
        cooldownExpiresAt: cooldown.cooldownExpiresAt,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Error checking cooldown:", error);
    return { allowed: true };
  }
}

/**
 * Check daily trigger limit
 */
export async function checkDailyLimit(userId: string): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const statsDoc = await db
      .collection("return_trigger_stats")
      .doc(userId)
      .get();

    if (!statsDoc.exists) {
      return true;
    }

    const stats = statsDoc.data() as ReturnTriggerStats;

    // Check if last trigger was today
    if (
      stats.lastTriggerSentAt &&
      stats.lastTriggerSentAt.toDate() >= today
    ) {
      return stats.triggersBy7Days < MAX_TRIGGERS_PER_DAY;
    }

    return true;
  } catch (error) {
    console.error("Error checking daily limit:", error);
    return true;
  }
}

/**
 * Set cooldown for event type
 */
async function setCooldown(
  userId: string,
  eventType: ReturnTriggerEventType
): Promise<void> {
  const cooldownHours = COOLDOWN_PERIODS[eventType];
  const expiresAt = Timestamp.fromMillis(
    Date.now() + cooldownHours * 60 * 60 * 1000
  );

  const cooldownDoc: TriggerCooldown = {
    userId,
    eventType,
    lastTriggeredAt: Timestamp.now(),
    triggerCount: 1,
    cooldownExpiresAt: expiresAt,
  };

  await db
    .collection("trigger_cooldowns")
    .doc(`${userId}_${eventType}`)
    .set(cooldownDoc, { merge: true });
}

/**
 * Update trigger statistics
 */
async function updateTriggerStats(userId: string): Promise<void> {
  const statsRef = db.collection("return_trigger_stats").doc(userId);

  await statsRef.set(
    {
      userId,
      totalTriggersSent: FieldValue.increment(1),
      lastTriggerSentAt: Timestamp.now(),
      triggersBy7Days: FieldValue.increment(1),
      triggersBy30Days: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Get user type from profile
 */
async function getUserType(userId: string): Promise<UserType> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return "LOW_POPULARITY"; // default
    }

    const userData = userDoc.data();

    // Determine user type from profile data
    if (userData?.isRoyal) {
      return "ROYAL_MALE";
    }

    if (userData?.isInfluencer || userData?.creatorMode) {
      return "INFLUENCER_EARNER";
    }

    if (userData?.gender === "nonbinary" || userData?.gender === "other") {
      return "NONBINARY";
    }

    if (userData?.earnerStatus === "active") {
      return "FEMALE_EARNER";
    }

    if (userData?.hasActiveSubscription) {
      return "MALE_PAYER";
    }

    // Check popularity metrics
    const popularity = userData?.popularityScore || 0;
    if (popularity < 30) {
      return "LOW_POPULARITY";
    }

    return "MALE_PAYER"; // default
  } catch (error) {
    console.error("Error getting user type:", error);
    return "LOW_POPULARITY";
  }
}

/**
 * Create and send a return trigger
 */
export async function createReturnTrigger(
  input: CreateReturnTriggerInput
): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Step 1: Check silence rules
    const silenceCheck = await checkSilenceRules(input.userId);
    if (!silenceCheck.allowed) {
      console.log(
        `Return trigger blocked for ${input.userId}: ${silenceCheck.reason}`
      );
      return { sent: false, reason: silenceCheck.reason };
    }

    // Step 2: Check cooldown (unless force delivery)
    if (!input.forceDelivery) {
      const cooldownCheck = await checkCooldown(input.userId, input.eventType);
      if (!cooldownCheck.allowed) {
        console.log(
          `Return trigger on cooldown for ${input.userId}: ${input.eventType}`
        );
        return { sent: false, reason: "cooldown" };
      }

      // Step 3: Check daily limit
      const withinLimit = await checkDailyLimit(input.userId);
      if (!withinLimit) {
        console.log(`Daily trigger limit reached for ${input.userId}`);
        return { sent: false, reason: "daily_limit" };
      }
    }

    // Step 4: Get user type for personalization
    const userType = await getUserType(input.userId);

    // Step 5: Get message template
    const template = getMessageTemplate(
      input.eventType,
      userType,
      input.context
    );

    // Step 6: Personalize template
    const personalizedTemplate = personalizeTemplate(template, input.context);

    // Step 7: Validate message tone
    const toneValidation = validateMessageTone(
      personalizedTemplate.title,
      personalizedTemplate.body
    );

    if (!toneValidation.valid) {
      console.error(
        `Invalid message tone: ${toneValidation.violations.join(", ")}`
      );
      return { sent: false, reason: "invalid_tone" };
    }

    // Step 8: Store trigger event
    const eventDoc: ReturnTriggerEvent = {
      eventId: db.collection("return_trigger_events").doc().id,
      userId: input.userId,
      eventType: input.eventType,
      context: input.context,
      createdAt: Timestamp.now(),
      processed: false,
    };

    await db
      .collection("return_trigger_events")
      .doc(eventDoc.eventId)
      .set(eventDoc);

    // Step 9: Create notification via existing system
    await createNotification({
      userId: input.userId,
      type: "RETURN_TRIGGER" as any, // Extend notification types
      title: personalizedTemplate.title,
      body: personalizedTemplate.body,
      context: {
        ...(input.context || {}),
        triggerEventId: eventDoc.eventId,
        deepLink: input.context?.deepLink,
      } as any,
    });

    // Step 10: Set cooldown
    await setCooldown(input.userId, input.eventType);

    // Step 11: Update stats
    await updateTriggerStats(input.userId);

    // Step 12: Mark event as processed
    await db
      .collection("return_trigger_events")
      .doc(eventDoc.eventId)
      .update({
        processed: true,
        processedAt: Timestamp.now(),
      });

    console.log(
      `Return trigger sent to ${input.userId}: ${input.eventType}`
    );

    return { sent: true };
  } catch (error) {
    console.error("Error creating return trigger:", error);
    throw error;
  }
}

/**
 * Initialize return trigger settings for new user
 */
export async function initializeReturnTriggerSettings(
  userId: string,
  accountCreatedAt?: Timestamp
): Promise<void> {
  const settings: ReturnTriggerSettings = {
    userId,
    enabled: true,
    userType: await getUserType(userId),
    lastActiveAt: Timestamp.now(),
    accountCreatedAt: accountCreatedAt || Timestamp.now(),
    inPanicMode: false,
    hasUnresolvedIncident: false,
    doNotDisturb: false,
    inMeetingOrEvent: false,
    updatedAt: Timestamp.now(),
  };

  await db
    .collection("return_trigger_settings")
    .doc(userId)
    .set(settings);
}

/**
 * Update user activity timestamp
 */
export async function updateUserActivity(userId: string): Promise<void> {
  await db
    .collection("return_trigger_settings")
    .doc(userId)
    .update({
      lastActiveAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
}

/**
 * Set panic mode for user
 */
export async function setPanicMode(
  userId: string,
  enabled: boolean,
  cooldownHours: number = 72
): Promise<void> {
  const updates: Partial<ReturnTriggerSettings> = {
    inPanicMode: enabled,
    updatedAt: Timestamp.now(),
  };

  if (enabled) {
    updates.panicModeCooldownUntil = Timestamp.fromMillis(
      Date.now() + cooldownHours * 60 * 60 * 1000
    );
  }

  await db
    .collection("return_trigger_settings")
    .doc(userId)
    .update(updates);
}