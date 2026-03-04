import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function seed() {

  const configs = [
    'paid_events'
  ];

  for (const id of configs) {
    await db.collection('system_config').doc(id).set(
      {
        initialized: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    console.log('Initialized: ' + id);
  }

  console.log('Paid events seeded.');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});









