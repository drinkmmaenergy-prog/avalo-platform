/**
 * PACK 169 - Notification Governance Middleware
 * Detects and blocks romantic, manipulative, and addictive notification patterns
 */

import { GovernanceResult } from './types';

interface NotificationContent {
  title: string;
  body: string;
  category?: string;
  data?: Record<string, any>;
}

// Forbidden patterns - romantic manipulation
const ROMANTIC_PATTERNS = [
  /\b(miss(es)?|missed|missing)\s+(you|u)\b/i,
  /\b(waiting|waited)\s+(for\s+)?(you|u)\b/i,
  /\b(your|ur)\s+(creator|partner|babe|hun|honey|darling)\b/i,
  /\b(she|he)['']?s\s+(waiting|lonely|sad|missing)\b/i,
  /\b(come\s+back|return)\s+(to\s+(me|us))?\b/i,
  /\b(don['']?t\s+(leave|go|ignore))\b/i,
  /\b(hurry|quick|fast).*(back|return|open)\b/i,
  /\b(exclusive|special)\s+(time|moment)\s+(together|with)\b/i,
  /❤️|💋|😘|💕|💖|😍|🥰/,
];

// Forbidden patterns - guilt manipulation
const GUILT_PATTERNS = [
  /\b(you\s+)?(haven['']?t|didn['']?t)\s+(support(ed)?|help(ed)?|visit(ed)?)\b/i,
  /\b(if\s+you\s+)?(care(d)?|love(d)?)\b/i,
  /\b(disappointed|sad|upset)\s+(in|with|about)\s+you\b/i,
  /\b(let(ting)?\s+(me|us)\s+down)\b/i,
  /\b(where\s+(have|did)\s+you\s+(been|go))\b/i,
  /\b(forget|forgot)\s+(about\s+)?(me|us)\b/i,
  /\b(thought\s+you\s+cared)\b/i,
];

// Forbidden patterns - jealousy triggers
const JEALOUSY_PATTERNS = [
  /\b(others|everyone)\s+(are|is)\s+(paying|spending|giving)\s+more\b/i,
  /\b(more\s+attention|more\s+support)\s+(than\s+you)\b/i,
  /\b(least\s+active|least\s+engaged)\b/i,
  /\b(falling\s+behind|last\s+place)\b/i,
  /\b(losing\s+(your|ur)\s+spot)\b/i,
  /💔|😢|😭/,
];

// Forbidden patterns - seductive urgency
const URGENCY_SEDUCTION_PATTERNS = [
  /\b(before\s+(she|he|they)\s+(leave|disappear|go))\b/i,
  /\b(limited\s+time|last\s+chance).*(with|together)\b/i,
  /\b(exclusive\s+access|private\s+moment)\b/i,
  /\b(won['']?t\s+be\s+here\s+long)\b/i,
  /\b(catch\s+(her|him|them)\s+now)\b/i,
];

// Forbidden patterns - dependency creation
const DEPENDENCY_PATTERNS = [
  /\b(need(s)?\s+you|depend(s)?\s+on\s+you)\b/i,
  /\b(can['']?t\s+(live|survive|continue)\s+without)\b/i,
  /\b(only\s+you\s+can)\b/i,
  /\b(your\s+support\s+means\s+everything)\b/i,
];

// Forbidden patterns - flirty/sexual
const FLIRTY_PATTERNS = [
  /\b(want\s+some\s+fun)\b/i,
  /\b(feeling\s+(hot|sexy|naughty))\b/i,
  /\b(come\s+play|let['']?s\s+play)\b/i,
  /😏|😉|🍑|🍆|💦/,
];

// Addictive psychology patterns
const ADDICTIVE_PATTERNS = [
  /\b(don['']?t\s+miss\s+out|FOMO)\b/i,
  /\b(everyone\s+is|everyone['']?s)\b/i,
  /\b(last\s+chance|final\s+opportunity)\b/i,
  /\b(act\s+now|right\s+now|immediately)\b/i,
  /\b(only\s+\d+\s+(left|remaining))\b/i,
];

// Excessive urgency patterns
const EXCESSIVE_URGENCY_PATTERNS = [
  /URGENT|EMERGENCY|CRITICAL/i,
  /!!!+/,
  /🔥{3,}/,
  /\b(NOW|ASAP|IMMEDIATELY)\b/,
];

export class NotificationGovernance {
  /**
   * Check notification content against governance rules
   */
  checkNotification(content: NotificationContent): GovernanceResult {
    const flags: string[] = [];
    const blockReasons: string[] = [];
    let severity: GovernanceResult['severity'] = 'none';

    const text = `${content.title} ${content.body}`;

    // Check romantic patterns (CRITICAL - always block)
    if (this.matchesPatterns(text, ROMANTIC_PATTERNS)) {
      flags.push('romantic_manipulation');
      blockReasons.push('Contains romantic or intimate language');
      severity = 'critical';
    }

    // Check guilt patterns (CRITICAL - always block)
    if (this.matchesPatterns(text, GUILT_PATTERNS)) {
      flags.push('guilt_manipulation');
      blockReasons.push('Contains guilt-inducing language');
      severity = 'critical';
    }

    // Check jealousy patterns (CRITICAL - always block)
    if (this.matchesPatterns(text, JEALOUSY_PATTERNS)) {
      flags.push('jealousy_trigger');
      blockReasons.push('Contains jealousy-inducing language');
      severity = 'critical';
    }

    // Check urgency seduction (CRITICAL - always block)
    if (this.matchesPatterns(text, URGENCY_SEDUCTION_PATTERNS)) {
      flags.push('urgency_seduction');
      blockReasons.push('Contains manipulative urgency language');
      severity = 'critical';
    }

    // Check dependency patterns (CRITICAL - always block)
    if (this.matchesPatterns(text, DEPENDENCY_PATTERNS)) {
      flags.push('dependency_creation');
      blockReasons.push('Attempts to create emotional dependency');
      severity = 'critical';
    }

    // Check flirty patterns (CRITICAL - always block)
    if (this.matchesPatterns(text, FLIRTY_PATTERNS)) {
      flags.push('flirty_content');
      blockReasons.push('Contains flirtatious or sexual content');
      severity = 'critical';
    }

    // Check addictive patterns (HIGH - block and flag)
    if (this.matchesPatterns(text, ADDICTIVE_PATTERNS)) {
      flags.push('addictive_psychology');
      blockReasons.push('Uses addictive psychology patterns');
      if (severity === 'none') severity = 'high';
    }

    // Check excessive urgency (HIGH - block and flag)
    if (this.matchesPatterns(text, EXCESSIVE_URGENCY_PATTERNS)) {
      flags.push('excessive_urgency');
      blockReasons.push('Uses excessive urgency or alarm tactics');
      if (severity === 'none') severity = 'high';
    }

    // Check for excessive capitalization
    if (this.hasExcessiveCaps(text)) {
      flags.push('excessive_capitalization');
      if (severity === 'none') severity = 'medium';
    }

    // Check for excessive emoji
    if (this.hasExcessiveEmoji(text)) {
      flags.push('excessive_emoji');
      if (severity === 'none') severity = 'low';
    }

    const approved = blockReasons.length === 0;

    return {
      approved,
      flags,
      blockReasons,
      severity,
    };
  }

  /**
   * Check if text matches any pattern in array
   */
  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * Check for excessive capitalization (> 30% of letters)
   */
  private hasExcessiveCaps(text: string): boolean {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 10) return false;
    const caps = text.replace(/[^A-Z]/g, '');
    return caps.length / letters.length > 0.3;
  }

  /**
   * Check for excessive emoji (> 5)
   */
  private hasExcessiveEmoji(text: string): boolean {
    // Count emoji-like characters (hearts, faces, symbols)
    const emojiCount = (text.match(/[\u2600-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDEFF]/g) || []).length;
    return emojiCount > 5;
  }

  /**
   * Validate notification category matches content
   */
  validateCategory(content: NotificationContent): boolean {
    const category = content.category;
    if (!category) return true;

    // Ensure system notifications don't contain promotional content
    if (category === 'system') {
      const promotionalWords = /\b(buy|purchase|discount|sale|offer|deal|limited)\b/i;
      if (promotionalWords.test(`${content.title} ${content.body}`)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if notification respects user's engagement limits
   */
  checkRateLimits(
    userNotificationCount: number,
    categoryCount: number,
    settings: {
      maxPerDay: number;
      maxPerHour: number;
      categoryMaxPerDay: number;
    }
  ): { allowed: boolean; reason?: string } {
    if (userNotificationCount >= settings.maxPerDay) {
      return {
        allowed: false,
        reason: `Daily limit of ${settings.maxPerDay} notifications reached`,
      };
    }

    if (categoryCount >= settings.categoryMaxPerDay) {
      return {
        allowed: false,
        reason: `Category daily limit of ${settings.categoryMaxPerDay} reached`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user is in burnout protection mode
   */
  checkBurnoutProtection(
    engagementMinutes: number,
    settings: {
      enabled: boolean;
      dailyLimit: number;
      cooldownHours: number;
    }
  ): { protected: boolean; cooldownUntil?: Date } {
    if (!settings.enabled) {
      return { protected: false };
    }

    if (engagementMinutes >= settings.dailyLimit) {
      const cooldownUntil = new Date();
      cooldownUntil.setHours(cooldownUntil.getHours() + settings.cooldownHours);
      return {
        protected: true,
        cooldownUntil,
      };
    }

    return { protected: false };
  }
}

export const governance = new NotificationGovernance();