/**
 * PACK 214 - Return Trigger Message Templates
 * Natural, attractive, and personalized — NOT needy or aggressive
 * 
 * Allowed tones: exciting, confident, flirt-coded, positive, aspirational
 * Forbidden: guilt, insecurity, jealousy, degrading language
 */

import {
  ReturnTriggerEventType,
  UserType,
  ReturnTriggerTemplate,
  MessageTone,
} from "./pack214-types";

/**
 * Get message template for specific event and user type
 */
export function getMessageTemplate(
  eventType: ReturnTriggerEventType,
  userType: UserType,
  context?: any
): ReturnTriggerTemplate {
  const templates = getTemplateMap();
  const key = `${eventType}_${userType}`;
  
  // Try user-specific template first
  if (templates.has(key)) {
    return templates.get(key)!;
  }
  
  // Fall back to generic template
  const genericKey = `${eventType}_GENERIC`;
  if (templates.has(genericKey)) {
    return templates.get(genericKey)!;
  }
  
  // Default fallback
  return {
    eventType,
    userType,
    title: "Something exciting happened on Avalo",
    body: "Check out what's new",
    tone: "positive",
    emoji: "✨",
    channels: { push: true, email: false, inApp: true },
  };
}

/**
 * Build complete template map
 */
function getTemplateMap(): Map<string, ReturnTriggerTemplate> {
  const map = new Map<string, ReturnTriggerTemplate>();
  
  // ============================================
  // NEW HIGH PRIORITY MATCH
  // ============================================
  map.set("NEW_HIGH_PRIORITY_MATCH_MALE_PAYER", {
    eventType: "NEW_HIGH_PRIORITY_MATCH",
    userType: "MALE_PAYER",
    title: "Someone your type just joined Avalo",
    body: "This match has an incredibly high chemistry score with you",
    tone: "exciting",
    emoji: "✨",
    channels: { push: true, email: true, inApp: true },
  });
  
  map.set("NEW_HIGH_PRIORITY_MATCH_FEMALE_EARNER", {
    eventType: "NEW_HIGH_PRIORITY_MATCH",
    userType: "FEMALE_EARNER",
    title: "A high-spending member wants to connect",
    body: "They're interested in premium conversations",
    tone: "confident",
    emoji: "💎",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("NEW_HIGH_PRIORITY_MATCH_ROYAL_MALE", {
    eventType: "NEW_HIGH_PRIORITY_MATCH",
    userType: "ROYAL_MALE",
    title: "A high-demand profile is now available",
    body: "Royal members get first access",
    tone: "aspirational",
    emoji: "👑",
    channels: { push: true, email: true, inApp: true },
  });
  
  map.set("NEW_HIGH_PRIORITY_MATCH_NONBINARY", {
    eventType: "NEW_HIGH_PRIORITY_MATCH",
    userType: "NONBINARY",
    title: "Someone with your vibe joined Avalo",
    body: "Your interests and values align perfectly",
    tone: "positive",
    emoji: "🌈",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("NEW_HIGH_PRIORITY_MATCH_INFLUENCER_EARNER", {
    eventType: "NEW_HIGH_PRIORITY_MATCH",
    userType: "INFLUENCER_EARNER",
    title: "A potential high-value fan discovered you",
    body: "They're ready to engage with your content",
    tone: "confident",
    emoji: "🚀",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // MESSAGE FROM MATCH
  // ============================================
  map.set("MESSAGE_FROM_MATCH_GENERIC", {
    eventType: "MESSAGE_FROM_MATCH",
    userType: "MALE_PAYER",
    title: "Someone is waiting for your reply",
    body: "Keep the conversation flowing",
    tone: "flirt-coded",
    emoji: "💬",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // NEW LIKES / WISHLIST
  // ============================================
  map.set("NEW_LIKES_LOW_POPULARITY", {
    eventType: "NEW_LIKES",
    userType: "LOW_POPULARITY",
    title: "You're getting attention today",
    body: "People are noticing your profile",
    tone: "positive",
    emoji: "❤️",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("NEW_LIKES_GENERIC", {
    eventType: "NEW_LIKES",
    userType: "MALE_PAYER",
    title: "You caught someone's attention",
    body: "They added you to their favorites",
    tone: "exciting",
    emoji: "❤️",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("WISHLIST_ADD_FEMALE_EARNER", {
    eventType: "WISHLIST_ADD",
    userType: "FEMALE_EARNER",
    title: "You're on someone's wishlist",
    body: "They're interested in exclusive content",
    tone: "confident",
    emoji: "⭐",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // HIGH CHEMISTRY PROFILE VISIT
  // ============================================
  map.set("HIGH_CHEMISTRY_PROFILE_VISIT_GENERIC", {
    eventType: "HIGH_CHEMISTRY_PROFILE_VISIT",
    userType: "MALE_PAYER",
    title: "A person very likely to match viewed your profile",
    body: "Your chemistry score is through the roof",
    tone: "exciting",
    emoji: "🔥",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // GOOD VIBE BOOST
  // ============================================
  map.set("GOOD_VIBE_BOOST_GENERIC", {
    eventType: "GOOD_VIBE_BOOST",
    userType: "MALE_PAYER",
    title: "Your recent date gave you a good vibe mark",
    body: "You're trending on Avalo",
    tone: "positive",
    emoji: "⭐",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // TOKEN SALE OPPORTUNITY
  // ============================================
  map.set("TOKEN_SALE_OPPORTUNITY_MALE_PAYER", {
    eventType: "TOKEN_SALE_OPPORTUNITY",
    userType: "MALE_PAYER",
    title: "Special token offer just for you",
    body: "Limited time — get more value for your connections",
    tone: "confident",
    emoji: "💎",
    channels: { push: true, email: true, inApp: true },
  });
  
  // ============================================
  // DISCOVERY BOOST ACTIVE
  // ============================================
  map.set("DISCOVERY_BOOST_ACTIVE_GENERIC", {
    eventType: "DISCOVERY_BOOST_ACTIVE",
    userType: "MALE_PAYER",
    title: "You're at the top of discovery right now",
    body: "Don't miss this visibility window",
    tone: "exciting",
    emoji: "🚀",
    channels: { push: true, email: false, inApp: true },
  });
  
  // ============================================
  // BREAK RETURN SEQUENCES
  // ============================================
  map.set("BREAK_RETURN_7DAY_GENERIC", {
    eventType: "BREAK_RETURN_7DAY",
    userType: "MALE_PAYER",
    title: "We've missed you on Avalo",
    body: "See what's new while you were away",
    tone: "positive",
    emoji: "👋",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("BREAK_RETURN_14DAY_GENERIC", {
    eventType: "BREAK_RETURN_14DAY",
    userType: "MALE_PAYER",
    title: "Something special is waiting for you",
    body: "A high-chemistry match appeared while you were away",
    tone: "exciting",
    emoji: "✨",
    channels: { push: true, email: true, inApp: true },
  });
  
  map.set("BREAK_RETURN_30DAY_GENERIC", {
    eventType: "BREAK_RETURN_30DAY",
    userType: "MALE_PAYER",
    title: "Your profile is getting a visibility boost",
    body: "Welcome back — you're back on top of discovery",
    tone: "aspirational",
    emoji: "🚀",
    channels: { push: true, email: true, inApp: true },
  });
  
  map.set("BREAK_RETURN_60DAY_GENERIC", {
    eventType: "BREAK_RETURN_60DAY",
    userType: "MALE_PAYER",
    title: "Comeback reward unlocked",
    body: "Premium visibility + spotlight for 48 hours",
    tone: "exciting",
    emoji: "🎁",
    channels: { push: true, email: true, inApp: true },
  });
  
  // ============================================
  // COLD START SEQUENCE (Day 0-7)
  // ============================================
  map.set("COLD_START_DAY_1_GENERIC", {
    eventType: "COLD_START_DAY_1",
    userType: "MALE_PAYER",
    title: "7 people added you to their wishlist",
    body: "Want to see who's interested?",
    tone: "exciting",
    emoji: "🔥",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_2_GENERIC", {
    eventType: "COLD_START_DAY_2",
    userType: "MALE_PAYER",
    title: "Your discovery boost is active",
    body: "You're at the top of the feed — free today",
    tone: "confident",
    emoji: "🚀",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_3_GENERIC", {
    eventType: "COLD_START_DAY_3",
    userType: "MALE_PAYER",
    title: "Someone with incredible compatibility appeared",
    body: "Your chemistry score is exceptional",
    tone: "exciting",
    emoji: "✨",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_4_GENERIC", {
    eventType: "COLD_START_DAY_4",
    userType: "MALE_PAYER",
    title: "Your first chemistry-based match is here",
    body: "See who you vibe with naturally",
    tone: "positive",
    emoji: "💫",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_5_GENERIC", {
    eventType: "COLD_START_DAY_5",
    userType: "MALE_PAYER",
    title: "Your match priority just accelerated",
    body: "High-chemistry profiles are seeing you first",
    tone: "aspirational",
    emoji: "⚡",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_6_GENERIC", {
    eventType: "COLD_START_DAY_6",
    userType: "MALE_PAYER",
    title: "Your type is online right now",
    body: "Perfect timing to start a conversation",
    tone: "flirt-coded",
    emoji: "💬",
    channels: { push: true, email: false, inApp: true },
  });
  
  map.set("COLD_START_DAY_7_GENERIC", {
    eventType: "COLD_START_DAY_7",
    userType: "MALE_PAYER",
    title: "Start a conversation challenge",
    body: "Match with 3 people this week and unlock rewards",
    tone: "exciting",
    emoji: "🎯",
    channels: { push: true, email: false, inApp: true },
  });
  
  return map;
}

/**
 * Validate message tone (no forbidden patterns)
 */
export function validateMessageTone(title: string, body: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const combined = `${title} ${body}`.toLowerCase();
  
  // Forbidden patterns
  const forbiddenPatterns = [
    { pattern: /why (aren't|haven't) you/, reason: "guilt messaging" },
    { pattern: /where (have|did) you (been|go)/, reason: "guilt messaging" },
    { pattern: /someone better/, reason: "insecurity trigger" },
    { pattern: /you're missing out on/, reason: "insecurity trigger" },
    { pattern: /they're more/, reason: "insecurity trigger" },
    { pattern: /jealous/, reason: "jealousy pushing" },
    { pattern: /don't let .* steal/, reason: "jealousy pushing" },
    { pattern: /(loser|pathetic|desperate)/, reason: "degrading language" },
  ];
  
  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(combined)) {
      violations.push(reason);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations: Array.from(new Set(violations)), // unique violations
  };
}

/**
 * Get personalized template with context data
 */
export function personalizeTemplate(
  template: ReturnTriggerTemplate,
  context?: any
): ReturnTriggerTemplate {
  let { title, body } = template;
  
  if (!context) {
    return template;
  }
  
  // Replace placeholders with actual data
  if (context.counterpartyName) {
    title = title.replace("Someone", context.counterpartyName);
    body = body.replace("someone", context.counterpartyName);
  }
  
  if (context.chemistryScore) {
    const scoreDesc = 
      context.chemistryScore >= 90 ? "exceptional" :
      context.chemistryScore >= 80 ? "very high" :
      context.chemistryScore >= 70 ? "high" : "good";
    body = body.replace("chemistry score", `${scoreDesc} chemistry score`);
  }
  
  if (context.messageCount) {
    body = body.replace("waiting for your reply", `${context.messageCount} messages waiting`);
  }
  
  if (context.likeCount) {
    title = title.replace("someone", `${context.likeCount} people`);
  }
  
  return {
    ...template,
    title,
    body,
  };
}