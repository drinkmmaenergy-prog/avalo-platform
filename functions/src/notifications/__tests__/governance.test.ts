/**
 * PACK 169 - Governance Middleware Tests
 * Validate ethical notification safeguards
 */

import { NotificationGovernance } from '../governance';

describe('NotificationGovernance', () => {
  let governance: NotificationGovernance;

  beforeEach(() => {
    governance = new NotificationGovernance();
  });

  describe('Romantic Manipulation Detection', () => {
    test('should block "miss you" messages', () => {
      const result = governance.checkNotification({
        title: 'Come back',
        body: 'I miss you so much! Come back to the app',
        category: 'content',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('romantic_manipulation');
      expect(result.severity).toBe('critical');
    });

    test('should block "waiting for you" messages', () => {
      const result = governance.checkNotification({
        title: 'Waiting',
        body: 'She is waiting for you in the app',
        category: 'messages',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('romantic_manipulation');
    });

    test('should block romantic emojis', () => {
      const result = governance.checkNotification({
        title: 'New message',
        body: 'Someone sent you a message ❤️😘',
        category: 'messages',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('romantic_manipulation');
    });
  });

  describe('Guilt Manipulation Detection', () => {
    test('should block guilt-inducing messages', () => {
      const result = governance.checkNotification({
        title: 'Where are you?',
        body: "You haven't supported your creator this week",
        category: 'content',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('guilt_manipulation');
      expect(result.severity).toBe('critical');
    });

    test('should block "if you care" messages', () => {
      const result = governance.checkNotification({
        title: 'Support',
        body: 'If you care about your creator, come back now',
        category: 'digital_products',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('guilt_manipulation');
    });
  });

  describe('Jealousy Trigger Detection', () => {
    test('should block comparison messages', () => {
      const result = governance.checkNotification({
        title: 'Falling behind',
        body: 'Others are paying more attention than you',
        category: 'progress',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('jealousy_trigger');
      expect(result.severity).toBe('critical');
    });

    test('should block "least active" messages', () => {
      const result = governance.checkNotification({
        title: 'Activity',
        body: "You're the least active member this week",
        category: 'clubs',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('jealousy_trigger');
    });
  });

  describe('Flirty Content Detection', () => {
    test('should block flirty messages', () => {
      const result = governance.checkNotification({
        title: 'Come play',
        body: 'Want some fun? Open the app now 😏',
        category: 'messages',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('flirty_content');
      expect(result.severity).toBe('critical');
    });
  });

  describe('Addictive Psychology Detection', () => {
    test('should block FOMO messages', () => {
      const result = governance.checkNotification({
        title: 'Last chance',
        body: "Don't miss out! Everyone is joining now!",
        category: 'events',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('addictive_psychology');
      expect(result.severity).toBe('high');
    });

    test('should block excessive urgency', () => {
      const result = governance.checkNotification({
        title: 'URGENT!!!',
        body: 'ACT NOW! ONLY 5 LEFT!!!',
        category: 'digital_products',
      });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('excessive_urgency');
    });
  });

  describe('Legitimate Notifications', () => {
    test('should approve course launch notification', () => {
      const result = governance.checkNotification({
        title: 'New Course Available',
        body: 'A new photography course has been published',
        category: 'content',
      });

      expect(result.approved).toBe(true);
      expect(result.flags).toHaveLength(0);
      expect(result.severity).toBe('none');
    });

    test('should approve event reminder', () => {
      const result = governance.checkNotification({
        title: 'Workshop Starting Soon',
        body: 'Your workshop starts in 30 minutes',
        category: 'events',
      });

      expect(result.approved).toBe(true);
      expect(result.flags).toHaveLength(0);
    });

    test('should approve achievement notification', () => {
      const result = governance.checkNotification({
        title: 'Milestone Reached',
        body: 'Congratulations! You completed 10 courses',
        category: 'progress',
      });

      expect(result.approved).toBe(true);
      expect(result.flags).toHaveLength(0);
    });

    test('should approve system notification', () => {
      const result = governance.checkNotification({
        title: 'Payment Received',
        body: 'Your payout of $150 has been processed',
        category: 'system',
      });

      expect(result.approved).toBe(true);
      expect(result.flags).toHaveLength(0);
    });
  });

  describe('Category Validation', () => {
    test('should reject promotional content in system category', () => {
      const isValid = governance.validateCategory({
        title: 'Limited offer',
        body: 'Buy now and save 50%!',
        category: 'system',
      });

      expect(isValid).toBe(false);
    });

    test('should accept valid system content', () => {
      const isValid = governance.validateCategory({
        title: 'Security Alert',
        body: 'New login from unknown device',
        category: 'system',
      });

      expect(isValid).toBe(true);
    });
  });

  describe('Rate Limit Checking', () => {
    test('should block when daily limit reached', () => {
      const result = governance.checkRateLimits(50, 5, {
        maxPerDay: 50,
        maxPerHour: 10,
        categoryMaxPerDay: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    test('should block when category limit reached', () => {
      const result = governance.checkRateLimits(20, 10, {
        maxPerDay: 50,
        maxPerHour: 10,
        categoryMaxPerDay: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Category daily limit');
    });

    test('should allow when under limits', () => {
      const result = governance.checkRateLimits(10, 3, {
        maxPerDay: 50,
        maxPerHour: 10,
        categoryMaxPerDay: 10,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Burnout Protection', () => {
    test('should trigger burnout protection when limit exceeded', () => {
      const result = governance.checkBurnoutProtection(200, {
        enabled: true,
        dailyLimit: 180,
        cooldownHours: 12,
      });

      expect(result.protected).toBe(true);
      expect(result.cooldownUntil).toBeDefined();
    });

    test('should not trigger when under limit', () => {
      const result = governance.checkBurnoutProtection(120, {
        enabled: true,
        dailyLimit: 180,
        cooldownHours: 12,
      });

      expect(result.protected).toBe(false);
    });

    test('should not trigger when disabled', () => {
      const result = governance.checkBurnoutProtection(200, {
        enabled: false,
        dailyLimit: 180,
        cooldownHours: 12,
      });

      expect(result.protected).toBe(false);
    });
  });
});