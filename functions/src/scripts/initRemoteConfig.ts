/**
 * PACK 67 — Remote Config Initialization Script
 * Run this once to create initial remote_config documents in Firestore
 * 
 * Usage: npx ts-node functions/src/scripts/initRemoteConfig.ts
 */

import { db } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import { RemoteConfigDocument } from '../types/remoteConfig';

async function initRemoteConfig() {
  console.log('🚀 Initializing Remote Config documents...\n');

  try {
    // Global config (base defaults)
    const globalConfig: RemoteConfigDocument = {
      configId: 'global',
      environment: 'GLOBAL',
      features: {
        // Example: Daily tasks feature (default enabled)
        dailyTasksV2: {
          enabled: false, // Disabled by default, enable in prod
          rollout: {
            percentage: 0,
            platforms: ['android', 'ios'],
          },
        },
        // Example: New onboarding flow
        newOnboardingFlow: {
          enabled: false,
          rollout: {
            percentage: 0,
          },
        },
        // Example: Chat typing indicator V2
        chatTypingIndicatorV2: {
          enabled: false,
        },
      },
      experiments: {
        // Example: Onboarding copy test
        onboarding_copy_test: {
          active: false, // Not active by default
          description: 'Test different onboarding headlines',
          variants: {
            control: { weight: 1 },
            variantA: { weight: 1 },
            variantB: { weight: 1 },
          },
          rollout: {
            percentage: 100,
            platforms: ['android', 'ios'],
          },
        },
      },
      values: {
        // Example: Max sponsored cards per page (display limit only, not pricing)
        'discovery.maxSponsoredCardsPerPage': {
          type: 'number',
          value: 3,
        },
        // Example: Chat preload message count
        'chat.preloadMessageCount': {
          type: 'number',
          value: 50,
        },
        // Example: Max daily marketing pushes (cap, not pricing)
        'notifications.maxDailyMarketingPushes': {
          type: 'number',
          value: 3,
        },
      },
      updatedAt: Timestamp.now(),
    };

    await db.collection('remote_config').doc('global').set(globalConfig);
    console.log('✅ Created remote_config/global');

    // Production config (overrides for production)
    const prodConfig: RemoteConfigDocument = {
      configId: 'prod',
      environment: 'PROD',
      features: {
        // Override: Enable daily tasks V2 for 10% of prod users
        dailyTasksV2: {
          enabled: true,
          rollout: {
            percentage: 10,
            platforms: ['android', 'ios'],
          },
        },
        // Keep new onboarding disabled in prod initially
        newOnboardingFlow: {
          enabled: false,
        },
      },
      experiments: {
        // No experiments active in prod initially
      },
      values: {
        // Override: Show fewer sponsored cards in prod
        'discovery.maxSponsoredCardsPerPage': {
          type: 'number',
          value: 2,
        },
      },
      updatedAt: Timestamp.now(),
    };

    await db.collection('remote_config').doc('prod').set(prodConfig);
    console.log('✅ Created remote_config/prod');

    // Stage config (for testing)
    const stageConfig: RemoteConfigDocument = {
      configId: 'stage',
      environment: 'STAGE',
      features: {
        // Override: Enable all features in stage for testing
        dailyTasksV2: {
          enabled: true,
          rollout: {
            percentage: 100,
            platforms: ['android', 'ios'],
          },
        },
        newOnboardingFlow: {
          enabled: true,
          rollout: {
            percentage: 100,
          },
        },
        chatTypingIndicatorV2: {
          enabled: true,
        },
      },
      experiments: {
        // Enable experiment in stage for testing
        onboarding_copy_test: {
          active: true,
          description: 'Test different onboarding headlines',
          variants: {
            control: { weight: 1 },
            variantA: { weight: 1 },
            variantB: { weight: 1 },
          },
          rollout: {
            percentage: 100,
            platforms: ['android', 'ios'],
          },
        },
      },
      values: {
        // Same as global for stage
        'discovery.maxSponsoredCardsPerPage': {
          type: 'number',
          value: 3,
        },
      },
      updatedAt: Timestamp.now(),
    };

    await db.collection('remote_config').doc('stage').set(stageConfig);
    console.log('✅ Created remote_config/stage');

    console.log('\n🎉 Remote Config initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Review the configs in Firestore console');
    console.log('2. Adjust feature flags and experiments as needed');
    console.log('3. Test with mobile app');
    console.log('4. Monitor experiment assignments in experiment_assignments collection\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing remote config:', error);
    process.exit(1);
  }
}

// Run initialization
initRemoteConfig();