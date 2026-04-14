import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function seed() {
  const configs = [
    'kyc',
    'paid_chat',
    'paid_calls',
    'wallet',
    'payout',
    'revenue_split',
    'panic_mode',
    'safety_engine',
    'fraud_detection',
    'minor_protection',
    'fcm',
    'rating_defense',
    'regional_launch',
    'api_gateway'
  ];

  for (const key of configs) {
    await db.collection('system_config').doc(key).set({
      initialized: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Initialized: ' + key);
  }

  console.log('System config seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

























