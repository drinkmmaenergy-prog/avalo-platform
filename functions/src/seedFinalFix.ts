import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function seed() {

  // system_config docs
  await db.collection('system_config').doc('payouts').set({ initialized: true });
  await db.collection('system_config').doc('safety').set({ initialized: true });
  await db.collection('system_config').doc('error_tracking').set({ initialized: true });

  // panic mode
  await db.collection('pack413_panic_state').doc('global').set({ active: false });

  // rating defense
  await db.collection('pack410_rating_defense').doc('config').set({ enabled: true });

  // regional launch
  await db.collection('pack412_regional_launch').doc('config').set({ region: 'EU' });

  console.log('All remaining audit configs seeded.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

























