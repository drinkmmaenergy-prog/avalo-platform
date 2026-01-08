/**
 * PACK 196 — PUSH NOTIFICATION PSYCHOLOGY — REVISED v2
 * Desire, Urgency, Ego Reward
 * 
 * Ethical engagement notifications that ignite action, curiosity, and ego.
 * Templates focus on positive reinforcement and momentum.
 */

import { notificationEngine } from './notifications/engine';
import { NotificationCategory, NotificationPriority } from './notifications/types';

/**
 * Notification Psychology Template
 */
export interface PsychologyNotificationTemplate {
  id: string;
  trigger: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  templates: {
    title: string;
    body: string;
    variables: string[];
  }[];
  psychologyTags: ('desire' | 'urgency' | 'ego' | 'curiosity' | 'momentum')[];
  cooldownHours: number;
}

/**
 * PACK 196 Psychology-Driven Notification Templates
 */
export const PSYCHOLOGY_TEMPLATES: PsychologyNotificationTemplate[] = [
  // PROFILE ATTENTION
  {
    id: 'profile_views_spike',
    trigger: 'profile_view_spike',
    category: 'content',
    priority: 'medium',
    templates: [
      {
        title: '👀 Getting Attention',
        body: "Someone who likes your type just matched your profile — don't let the spark die.",
        variables: ['viewer_name'],
      },
      {
        title: "🔥 You're Trending",
        body: "Your latest photo is trending — capitalize on it.",
        variables: [],
      },
      {
        title: '⚡ Momentum Alert',
        body: "You're getting attention — ride the momentum.",
        variables: [],
      },
    ],
    psychologyTags: ['desire', 'urgency', 'momentum'],
    cooldownHours: 6,
  },

  // PROFILE VISITOR
  {
    id: 'profile_repeat_visitor',
    trigger: 'repeat_profile_view',
    category: 'content',
    priority: 'high',
    templates: [
      {
        title: "💫 Someone's Interested",
        body: "{{viewer_name}} keeps checking your profile — maybe say hi first?",
        variables: ['viewer_name'],
      },
      {
        title: '👋 Make the First Move',
        body: "{{viewer_name}} viewed your profile 3 times — they're waiting for you.",
        variables: ['viewer_name'],
      },
    ],
    psychologyTags: ['curiosity', 'urgency', 'ego'],
    cooldownHours: 12,
  },

  // ONLINE NOW
  {
    id: 'fan_online_now',
    trigger: 'fan_online',
    category: 'messages',
    priority: 'medium',
    templates: [
      {
        title: '🟢 Perfect Timing',
        body: "A new fan is online now — perfect moment to start a chat.",
        variables: ['fan_name'],
      },
      {
        title: '✨ Strike While Hot',
        body: "{{fan_name}} just came online and viewed your profile — don't miss it.",
        variables: ['fan_name'],
      },
    ],
    psychologyTags: ['urgency', 'momentum'],
    cooldownHours: 4,
  },

  // NEW MATCH
  {
    id: 'mutual_interest',
    trigger: 'mutual_like',
    category: 'content',
    priority: 'high',
    templates: [
      {
        title: '💕 Mutual Interest',
        body: "{{match_name}} likes you back — the chemistry is there.",
        variables: ['match_name'],
      },
      {
        title: '🎯 Perfect Match',
        body: "You matched with someone who fits your type perfectly — start the conversation.",
        variables: ['match_name'],
      },
    ],
    psychologyTags: ['desire', 'ego', 'urgency'],
    cooldownHours: 1,
  },

  // ENGAGEMENT STREAK
  {
    id: 'engagement_hot_streak',
    trigger: 'high_engagement_day',
    category: 'progress',
    priority: 'medium',
    templates: [
      {
        title: '🔥 On Fire Today',
        body: "Your profile is on fire — keep the energy going.",
        variables: [],
      },
      {
        title: '⚡ Peak Performance',
        body: "You're at peak attention — this is your moment.",
        variables: [],
      },
    ],
    psychologyTags: ['ego', 'momentum'],
    cooldownHours: 24,
  },

  // CONTENT PERFORMANCE
  {
    id: 'content_viral',
    trigger: 'content_high_engagement',
    category: 'content',
    priority: 'medium',
    templates: [
      {
        title: '📈 Going Viral',
        body: "Your recent post is getting serious attention — ride the wave.",
        variables: ['content_type'],
      },
      {
        title: '🌟 Viral Moment',
        body: "People can't stop talking about your {{content_type}} — capitalize now.",
        variables: ['content_type'],
      },
    ],
    psychologyTags: ['ego', 'momentum', 'urgency'],
    cooldownHours: 8,
  },

  // FIRST MESSAGE OPPORTUNITY
  {
    id: 'first_message_window',
    trigger: 'new_connection_window',
    category: 'messages',
    priority: 'high',
    templates: [
      {
        title: '💬 Golden Window',
        body: "{{match_name}} is active now — send the first message before the moment passes.",
        variables: ['match_name'],
      },
      {
        title: '⏰ Act Fast',
        body: "New match with {{match_name}} — they're online and waiting.",
        variables: ['match_name'],
      },
    ],
    psychologyTags: ['urgency', 'desire'],
    cooldownHours: 2,
  },

  // PROFILE COMPLETION
  {
    id: 'profile_power_boost',
    trigger: 'profile_milestone',
    category: 'progress',
    priority: 'low',
    templates: [
      {
        title: '💪 Profile Power',
        body: "Your profile is now 90% complete — finish strong for maximum visibility.",
        variables: ['completion_pct'],
      },
      {
        title: '🎯 Almost There',
        body: "One more photo and you'll get featured — complete your profile now.",
        variables: [],
      },
    ],
    psychologyTags: ['momentum', 'curiosity'],
    cooldownHours: 48,
  },

  // RESPONSE WAITING
  {
    id: 'response_pending',
    trigger: 'unanswered_message',
    category: 'messages',
    priority: 'medium',
    templates: [
      {
        title: "💭 They're Waiting",
        body: "{{sender_name}} is wondering if you saw their message — reply and keep it going.",
        variables: ['sender_name'],
      },
      {
        title: "⏳ Don't Ghost",
        body: "{{sender_name}} sent you something interesting — check it out.",
        variables: ['sender_name'],
      },
    ],
    psychologyTags: ['curiosity', 'momentum'],
    cooldownHours: 6,
  },

  // TIMING ADVANTAGE
  {
    id: 'timing_advantage',
    trigger: 'off_peak_advantage',
    category: 'content',
    priority: 'low',
    templates: [
      {
        title: '🎯 Strategic Timing',
        body: "Post now while competition is low — get maximum visibility.",
        variables: [],
      },
      {
        title: '📊 Smart Move',
        body: "Perfect time to share content — your audience is most active right now.",
        variables: [],
      },
    ],
    psychologyTags: ['urgency', 'curiosity'],
    cooldownHours: 12,
  },
];

/**
 * Send a psychology-driven notification
 */
export async function sendPsychologyNotification(params: {
  userId: string;
  templateId: string;
  variables?: Record<string, string>;
  overrideText?: {
    title?: string;
    body?: string;
  };
}): Promise<{ success: boolean; notificationId?: string; reason?: string }> {
  try {
    // Find template
    const template = PSYCHOLOGY_TEMPLATES.find((t) => t.id === params.templateId);
    if (!template) {
      return {
        success: false,
        reason: `Template not found: ${params.templateId}`,
      };
    }

    // Select random template variant
    const variant = template.templates[Math.floor(Math.random() * template.templates.length)];

    // Replace variables in text
    let title = params.overrideText?.title || variant.title;
    let body = params.overrideText?.body || variant.body;

    if (params.variables) {
      Object.entries(params.variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        title = title.replace(regex, value);
        body = body.replace(regex, value);
      });
    }

    // Send via notification engine
    const result = await notificationEngine.sendNotification({
      userId: params.userId,
      category: template.category,
      priority: template.priority,
      title,
      body,
      data: {
        templateId: params.templateId,
        psychologyTags: template.psychologyTags,
        trigger: template.trigger,
      },
    });

    return result;
  } catch (error) {
    console.error('Error sending psychology notification:', error);
    return {
      success: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get template by trigger
 */
export function getTemplateByTrigger(trigger: string): PsychologyNotificationTemplate | null {
  return PSYCHOLOGY_TEMPLATES.find((t) => t.trigger === trigger) || null;
}

/**
 * Get templates by psychology tag
 */
export function getTemplatesByTag(
  tag: 'desire' | 'urgency' | 'ego' | 'curiosity' | 'momentum'
): PsychologyNotificationTemplate[] {
  return PSYCHOLOGY_TEMPLATES.filter((t) => t.psychologyTags.includes(tag));
}

/**
 * Validate notification content against guidelines
 */
export function validateNotificationContent(content: {
  title: string;
  body: string;
}): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  const combined = `${content.title} ${content.body}`.toLowerCase();

  // Check for FORBIDDEN patterns (guilt-tripping, lecturing, anti-flirting)
  const forbiddenPatterns = [
    { pattern: /you should|you must|you need to/i, reason: 'Lecturing language' },
    { pattern: /bad|wrong|mistake|regret/i, reason: 'Guilt-tripping' },
    { pattern: /don't (flirt|date|message|talk)/i, reason: 'Anti-flirting messaging' },
    { pattern: /lonely|alone|nobody|no one likes/i, reason: 'Negative emotional manipulation' },
    { pattern: /last chance|final warning|or else/i, reason: 'Aggressive guilt-tripping' },
  ];

  forbiddenPatterns.forEach(({ pattern, reason }) => {
    if (pattern.test(combined)) {
      violations.push(reason);
    }
  });

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * PACK 196 — Export Configuration
 */
export const PACK_196_CONFIG = {
  version: '2.0.0',
  name: 'Push Notification Psychology',
  focus: ['Desire', 'Urgency', 'Ego Reward'],
  templateCount: PSYCHOLOGY_TEMPLATES.length,
  psychologyTags: ['desire', 'urgency', 'ego', 'curiosity', 'momentum'],
  guidelines: {
    do: [
      'Ignite action and curiosity',
      'Reward user ego positively',
      'Create sense of momentum and opportunity',
      'Use timing and urgency ethically',
      'Celebrate user achievements',
    ],
    dont: [
      'Guilt-trip users',
      'Lecture about morality or behavior',
      'Use anti-flirting messaging',
      'Manipulate with negative emotions',
      'Create false urgency',
    ],
  },
};