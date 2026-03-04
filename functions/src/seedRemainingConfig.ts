import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function seed() {
  const configs = [
    'payout',
    'panic_mode',
    'safety_engine',
    'rating_defense',
    'regional_launch',
    'error_tracking'
  ];

  for (const key of configs) {
    await db.collection('system_config').doc(key).set({
      initialized: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Initialized: ' + key);
  }

  console.log('Remaining configs seeded.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});









