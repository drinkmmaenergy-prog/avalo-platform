/**
 * PACK 188 — REVISED v2 — MESSAGE TEMPLATES
 * 
 * Avalo In-App Messaging Templates
 * Tone: Sexy, Bold, Romantic, Luxury
 * 
 * STRICT REQUIREMENT: All messaging MUST follow PACK_188_TONE_GUIDELINES_V2.md
 */

export const AVALO_MESSAGING_TONE = {
  PRINCIPLES: {
    sexyButClassy: true,
    confidentNotNeedy: true,
    playfulTeasing: true,
    luxuryNotCheap: true,
    emotionallyStimulating: true,
    romanceFriendly: true,
  },
  FORBIDDEN: [
    // All anti-dating language removed per PACK 207
  ],
} as const;

// ============================================================================
// PROFILE & PRESENCE MESSAGES
// ============================================================================

export const PROFILE_MESSAGES = {
  viewNotifications: [
    "Someone can't look away from your profile.",
    "Your profile stopped them mid-scroll.",
    "They keep coming back to your profile.",
    "You're unforgettable to someone special.",
    "Someone can't get you out of their mind.",
  ],
  
  profileBoost: [
    "Your profile is irresistible tonight.",
    "Your energy is magnetic right now.",
    "You're on fire tonight.",
    "Your vibe is unstoppable.",
  ],
  
  profileStrength: [
    "Your profile is turning heads.",
    "They can't stop looking at your profile.",
    "You're the main character tonight.",
    "Your presence is powerful.",
  ],
} as const;

// ============================================================================
// REAL-TIME ACTIVITY MESSAGES
// ============================================================================

export const ACTIVITY_MESSAGES = {
  onlineNow: [
    "Someone who likes your vibe is online now.",
    "Your type just came online.",
    "Someone interesting is checking you out.",
    "They're online. Ready to make a move?",
    "Perfect timing. They're here right now.",
  ],
  
  nearbyActivity: [
    "Someone nearby is feeling your energy.",
    "Your match is closer than you think.",
    "Chemistry is happening close to you.",
    "They're in your world right now.",
  ],
  
  liveEngagement: [
    "Someone's locked in on your profile.",
    "They're hooked. What's your next move?",
    "Real-time attraction happening now.",
    "The moment is yours. Take it.",
  ],
} as const;

// ============================================================================
// CALL TO ACTION MESSAGES
// ============================================================================

export const CTA_MESSAGES = {
  makeTheMove: [
    "If you feel the spark — say something.",
    "Make the move before someone else does.",
    "Don't let this moment slip away.",
    "Your move. Make it count.",
    "The chemistry is real. Act on it.",
  ],
  
  engagementPrompts: [
    "Someone's waiting for your message.",
    "Don't leave them on read too long.",
    "They're hoping you'll reach out.",
    "Make tonight unforgettable.",
    "The night is young. So are your options.",
  ],
  
  urgentActions: [
    "Strike while the iron's hot.",
    "Timing is everything. This is it.",
    "Don't miss your window.",
    "They won't wait forever.",
    "Now or never.",
  ],
} as const;

// ============================================================================
// MATCH & LIKE NOTIFICATIONS
// ============================================================================

export const MATCH_MESSAGES = {
  newMatch: [
    "Someone incredible just liked you back.",
    "This is chemistry. Take it further.",
    "They're into you. What's next?",
    "A match made for late nights.",
    "You two are a vibe.",
  ],
  
  mutualInterest: [
    "The feeling is mutual.",
    "You both felt it at the same time.",
    "This could be something special.",
    "Lightning just struck twice.",
    "Fate or chemistry? Both.",
  ],
  
  highQualityMatch: [
    "This one's different. You can feel it.",
    "Your standards just met their match.",
    "Worth your time and attention.",
    "This could be the one.",
    "Premium connection unlocked.",
  ],
} as const;

// ============================================================================
// PREMIUM/MONETIZATION MESSAGES
// ============================================================================

export const PREMIUM_MESSAGES = {
  upsellSeduction: [
    "Unlock the VIP experience.",
    "See who's obsessed with you.",
    "Get access to your biggest admirers.",
    "They're waiting behind the curtain.",
    "Premium access means premium people.",
  ],
  
  exclusiveFeatures: [
    "Experience Avalo at its finest.",
    "Where the real connections happen.",
    "Elevate your game completely.",
    "Join the inner circle.",
    "This is where it gets interesting.",
  ],
  
  valueProp: [
    "Your time is valuable. So is theirs.",
    "Quality over quantity wins every time.",
    "The best connections are worth it.",
    "Invest in something real.",
    "Premium people, premium experience.",
  ],
} as const;

// ============================================================================
// RE-ENGAGEMENT MESSAGES
// ============================================================================

export const REENGAGEMENT_MESSAGES = {
  pullBack: [
    "Someone's still thinking about you.",
    "Your absence has been noticed.",
    "They're wondering where you went.",
    "You left an impression.",
    "Someone's been checking for you.",
  ],
  
  curiosity: [
    "You're missing out on something good.",
    "Things got interesting while you were away.",
    "Your timing couldn't be better.",
    "Perfect moment to come back.",
    "The vibe shifted. You should see this.",
  ],
  
  fomo: [
    "They moved on while you were gone.",
    "Someone new caught your match's eye.",
    "Your spot got taken. Want it back?",
    "Tonight's different. You'll see.",
    "Don't let them forget about you.",
  ],
} as const;

// ============================================================================
// CONVERSATION STARTERS
// ============================================================================

export const CONVERSATION_STARTERS = {
  iceBreakers: [
    "Say something bold. They'll love it.",
    "First impressions matter. Make it count.",
    "Your opening line sets the tone.",
    "Be yourself, but be interesting.",
    "Confidence is attractive. Show it.",
  ],
  
  timingNudges: [
    "They just opened your message. Reply now.",
    "Strike while they're paying attention.",
    "They're waiting. Don't keep them hanging.",
    "Perfect timing for a great conversation.",
    "The moment is right. Go for it.",
  ],
  
  conversationRevival: [
    "Bring this back to life.",
    "Reignite the spark.",
    "They're worth a second try.",
    "Don't let chemistry die from silence.",
    "One message could change everything.",
  ],
} as const;

// ============================================================================
// SAFETY & MODERATION (TONE MAINTAINED)
// ============================================================================

export const SAFETY_MESSAGES = {
  guidancePositive: [
    "Keep it classy. They'll appreciate it.",
    "Real attraction doesn't need fake moves.",
    "Authenticity is your best advantage.",
    "Quality conversations lead to quality connections.",
    "Respect is the foundation of chemistry.",
  ],
  
  warning: [
    "That's not your style. Try again.",
    "You're better than that message.",
    "Keep it smooth, not aggressive.",
    "Dial it back. Stay classy.",
    "That approach won't get you far.",
  ],
  
  blocked: [
    "This conversation has run its course.",
    "Sometimes the chemistry just isn't there.",
    "Move on to better connections.",
    "Not every match is meant to be.",
    "Focus your energy where it's wanted.",
  ],
} as const;

// ============================================================================
// ONBOARDING MESSAGES
// ============================================================================

export const ONBOARDING_MESSAGES = {
  welcome: [
    "Welcome to where chemistry happens.",
    "Your most interesting connections start here.",
    "Get ready to meet your match.",
    "This is where it all begins.",
    "Your story starts now.",
  ],
  
  profileSetup: [
    "Show them who you really are.",
    "Make your first impression unforgettable.",
    "Your profile is your power move.",
    "Give them something to remember.",
    "Let your energy shine through.",
  ],
  
  firstSteps: [
    "Time to meet someone amazing.",
    "Your kind of people are here.",
    "Start making connections that matter.",
    "The possibilities are endless.",
    "Ready to feel the spark?",
  ],
} as const;

// ============================================================================
// DAILY ENGAGEMENT MESSAGES
// ============================================================================

export const DAILY_MESSAGES = {
  morningBoost: [
    "Fresh faces, fresh chances.",
    "Your kind of morning just arrived.",
    "Start the day with something exciting.",
    "New day, new possibilities.",
    "Someone woke up thinking about you.",
  ],
  
  eveningPrime: [
    "Tonight's lineup looks promising.",
    "Prime time for connections.",
    "The evening is yours to own.",
    "Make tonight memorable.",
    "Your best matches are online now.",
  ],
  
  weekendVibes: [
    "Weekend energy is unmatched.",
    "Perfect timing for something special.",
    "The weekend brings out the best people.",
    "Make this weekend count.",
    "Your vibe matches the weekend mood.",
  ],
} as const;

// ============================================================================
// ERROR & SYSTEM MESSAGES (ELEGANTLY HANDLED)
// ============================================================================

export const SYSTEM_MESSAGES = {
  loading: [
    "Building anticipation...",
    "Getting things ready for you...",
    "Almost there...",
    "Worth the wait.",
  ],
  
  error: [
    "Something interrupted the moment.",
    "Let's try that again.",
    "This wasn't supposed to happen.",
    "Give it another shot.",
  ],
  
  success: [
    "Done. Now make it count.",
    "All set. Time to shine.",
    "Ready when you are.",
    "Game on.",
  ],
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get random message from category
 */
export function getRandomMessage(category: readonly string[]): string {
  return category[Math.floor(Math.random() * category.length)];
}

/**
 * Validate message against tone principles
 */
export function validateTone(message: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  
  // PACK 207: All anti-dating language removed
  // Forbidden phrases no longer enforced
  
  // Check for corporate jargon
  const corporateTerms = ['platform', 'service', 'app', 'user', 'feature'];
  corporateTerms.forEach(term => {
    if (message.toLowerCase().includes(term)) {
      violations.push(`Contains corporate term: "${term}"`);
    }
  });
  
  // Check for desperate language
  const desperateTerms = ['please', 'we miss you', 'come back'];
  desperateTerms.forEach(term => {
    if (message.toLowerCase().includes(term)) {
      violations.push(`Contains desperate language: "${term}"`);
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Get personalized message with user context
 */
export function getPersonalizedMessage(
  baseMessage: string,
  context: {
    userName?: string;
    matchName?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  }
): string {
  let message = baseMessage;
  
  // Add time-appropriate touches
  if (context.timeOfDay === 'night') {
    message = message.replace('today', 'tonight').replace('day', 'night');
  }
  
  return message;
}

// ============================================================================
// EXPORT ALL MESSAGE TEMPLATES
// ============================================================================

export const AVALO_MESSAGES = {
  profile: PROFILE_MESSAGES,
  activity: ACTIVITY_MESSAGES,
  cta: CTA_MESSAGES,
  match: MATCH_MESSAGES,
  premium: PREMIUM_MESSAGES,
  reengagement: REENGAGEMENT_MESSAGES,
  conversation: CONVERSATION_STARTERS,
  safety: SAFETY_MESSAGES,
  onboarding: ONBOARDING_MESSAGES,
  daily: DAILY_MESSAGES,
  system: SYSTEM_MESSAGES,
} as const;

export default AVALO_MESSAGES;