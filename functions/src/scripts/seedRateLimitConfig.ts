/**
 * PACK 70 - Rate Limiting Configuration Seeding
 * 
 * Script to initialize rate limit configurations in Firestore
 * Run this once to set up default rate limits
 */

import { db, serverTimestamp } from '../init.js';
import { Timestamp } from 'firebase-admin/firestore';

interface RateLimitRuleConfig {
  perUser?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  perIp?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  perDevice?: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  hardLimit?: boolean;
  escalateThresholdPerDay?: number;
}

async function seedRateLimitConfig() {
  console.log('🔧 Seeding Rate Limit Configuration...');

  // Global configuration (baseline for all environments)
  const globalConfig = {
    environment: 'GLOBAL' as const,
    rules: {
      // Auth & Signup
      'AUTH_LOGIN': {
        perUser: {
          perMinute: 5,
          perHour: 20,
          perDay: 100
        },
        perIp: {
          perMinute: 10,
          perHour: 50,
          perDay: 200
        },
        hardLimit: true,
        escalateThresholdPerDay: 150
      } as RateLimitRuleConfig,

      'AUTH_SIGNUP': {
        perIp: {
          perMinute: 2,
          perHour: 5,
          perDay: 10
        },
        perDevice: {
          perDay: 3
        },
        hardLimit: true,
        escalateThresholdPerDay: 15
      } as RateLimitRuleConfig,

      // Chat
      'CHAT_SEND': {
        perUser: {
          perMinute: 30,
          perHour: 500,
          perDay: 5000
        },
        perDevice: {
          perMinute: 40,
          perHour: 600
        },
        hardLimit: true,
        escalateThresholdPerDay: 10000
      } as RateLimitRuleConfig,

      // AI Companion
      'AI_MESSAGE': {
        perUser: {
          perMinute: 10,
          perHour: 100,
          perDay: 500
        },
        hardLimit: true,
        escalateThresholdPerDay: 1000
      } as RateLimitRuleConfig,

      // Media Upload
      'MEDIA_UPLOAD': {
        perUser: {
          perMinute: 5,
          perHour: 50,
          perDay: 200
        },
        perDevice: {
          perMinute: 5,
          perHour: 60
        },
        hardLimit: true,
        escalateThresholdPerDay: 500
      } as RateLimitRuleConfig,

      // Reservations
      'RESERVATION_CREATE': {
        perUser: {
          perMinute: 2,
          perHour: 10,
          perDay: 50
        },
        hardLimit: true,
        escalateThresholdPerDay: 100
      } as RateLimitRuleConfig,

      // Payouts
      'PAYOUT_REQUEST': {
        perUser: {
          perHour: 3,
          perDay: 5
        },
        hardLimit: true,
        escalateThresholdPerDay: 10
      } as RateLimitRuleConfig,

      // Support
      'SUPPORT_TICKET_CREATE': {
        perUser: {
          perHour: 3,
          perDay: 10
        },
        perIp: {
          perHour: 5,
          perDay: 20
        },
        hardLimit: true,
        escalateThresholdPerDay: 20
      } as RateLimitRuleConfig,

      // Referral Clicks (Web Landing)
      'REFERRAL_CLICK': {
        perIp: {
          perMinute: 10,
          perHour: 100,
          perDay: 500
        },
        hardLimit: false, // Soft limit - log but don't block
        escalateThresholdPerDay: 1000
      } as RateLimitRuleConfig
    },
    updatedAt: serverTimestamp() as any
  };

  // Production configuration (more restrictive)
  const prodConfig = {
    environment: 'PROD' as const,
    rules: {
      'AUTH_LOGIN': {
        perUser: {
          perMinute: 5,
          perHour: 15,
          perDay: 80
        },
        perIp: {
          perMinute: 8,
          perHour: 40,
          perDay: 150
        },
        hardLimit: true,
        escalateThresholdPerDay: 120
      } as RateLimitRuleConfig,

      'CHAT_SEND': {
        perUser: {
          perMinute: 25,
          perHour: 400,
          perDay: 4000
        },
        hardLimit: true,
        escalateThresholdPerDay: 8000
      } as RateLimitRuleConfig,

      'AI_MESSAGE': {
        perUser: {
          perMinute: 8,
          perHour: 80,
          perDay: 400
        },
        hardLimit: true,
        escalateThresholdPerDay: 800
      } as RateLimitRuleConfig
    },
    updatedAt: serverTimestamp() as any
  };

  // Staging configuration (more lenient for testing)
  const stageConfig = {
    environment: 'STAGE' as const,
    rules: {
      'AUTH_LOGIN': {
        perUser: {
          perMinute: 10,
          perHour: 50,
          perDay: 200
        },
        hardLimit: false // Soft limit for testing
      } as RateLimitRuleConfig,

      'CHAT_SEND': {
        perUser: {
          perMinute: 60,
          perHour: 1000
        },
        hardLimit: false
      } as RateLimitRuleConfig,

      'AI_MESSAGE': {
        perUser: {
          perMinute: 20,
          perHour: 200
        },
        hardLimit: false
      } as RateLimitRuleConfig
    },
    updatedAt: serverTimestamp() as any
  };

  try {
    // Write configurations to Firestore
    await db.collection('rate_limit_config').doc('global').set(globalConfig);
    console.log('✅ Global config created');

    await db.collection('rate_limit_config').doc('prod').set(prodConfig);
    console.log('✅ Production config created');

    await db.collection('rate_limit_config').doc('stage').set(stageConfig);
    console.log('✅ Stage config created');

    console.log('✨ Rate limit configuration seeding complete!');
  } catch (error) {
    console.error('❌ Failed to seed rate limit config:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedRateLimitConfig()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { seedRateLimitConfig };