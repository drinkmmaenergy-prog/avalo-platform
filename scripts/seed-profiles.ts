/**
 * seed-profiles.ts — Seed 15 test profiles into Firestore (avalostaging)
 *
 * Writes to BOTH collections:
 *   - public_profiles/{uid}
 *   - users/{uid}
 *
 * Uses deterministic UIDs (seed_user_01 … seed_user_15) so the script
 * is idempotent — re-running overwrites existing seed data.
 *
 * ─── HOW TO RUN ────────────────────────────────────────────────────
 *
 *   1. Ensure you are authenticated:
 *        gcloud auth application-default login
 *      OR set GOOGLE_APPLICATION_CREDENTIALS to a service account key.
 *
 *   2. Install firebase-admin (if not already):
 *        cd scripts && npm install firebase-admin && cd ..
 *
 *   3. Run:
 *        npx ts-node scripts/seed-profiles.ts
 *      or (from the scripts dir):
 *        npx ts-node seed-profiles.ts
 *
 * ───────────────────────────────────────────────────────────────────
 */

import * as admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Initialize Firebase Admin SDK — avalostaging project
// ---------------------------------------------------------------------------

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'avalostaging' });
}

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Profile seed data
// ---------------------------------------------------------------------------

const profiles = [
  { uid: 'seed_user_01', displayName: 'Kasia', gender: 'Woman', dateOfBirth: '1995-03-15', city: 'Warszawa', bio: 'Kocham podróże i dobrą kawę ☕', lookingFor: 'Men', interests: ['Travel', 'Photography', 'Cooking'] },
  { uid: 'seed_user_02', displayName: 'Tomek', gender: 'Man', dateOfBirth: '1992-07-22', city: 'Kraków', bio: 'Programista by day, gitarzysta by night 🎸', lookingFor: 'Women', interests: ['Music', 'Gaming', 'Tech'] },
  { uid: 'seed_user_03', displayName: 'Ania', gender: 'Woman', dateOfBirth: '1998-11-08', city: 'Gdańsk', bio: 'Szukam kogoś na wspólne spacery nad morzem 🌊', lookingFor: 'Men', interests: ['Nature', 'Hiking', 'Yoga'] },
  { uid: 'seed_user_04', displayName: 'Mateusz', gender: 'Man', dateOfBirth: '1990-01-30', city: 'Wrocław', bio: 'Fitness enthusiast & foodie', lookingFor: 'Women', interests: ['Fitness', 'Cooking', 'Sports'] },
  { uid: 'seed_user_05', displayName: 'Zuzia', gender: 'Woman', dateOfBirth: '2000-05-12', city: 'Lublin', bio: 'Studentka sztuki, maluję i tańczę 💃', lookingFor: 'Everyone', interests: ['Art', 'Dancing', 'Music'] },
  { uid: 'seed_user_06', displayName: 'Jakub', gender: 'Man', dateOfBirth: '1988-09-03', city: 'Poznań', bio: 'Chef, traveler, dog person 🐕', lookingFor: 'Women', interests: ['Cooking', 'Travel', 'Animals'] },
  { uid: 'seed_user_07', displayName: 'Maja', gender: 'Woman', dateOfBirth: '1996-12-25', city: 'Warszawa', bio: 'Fotografka. Szukam inspiracji i dobrych ludzi.', lookingFor: 'Men', interests: ['Photography', 'Art', 'Movies'] },
  { uid: 'seed_user_08', displayName: 'Alex', gender: 'Non-binary', dateOfBirth: '1999-04-18', city: 'Kraków', bio: 'Creative soul, they/them 🌈', lookingFor: 'Everyone', interests: ['Art', 'Music', 'Volunteering'] },
  { uid: 'seed_user_09', displayName: 'Patrycja', gender: 'Woman', dateOfBirth: '1993-08-07', city: 'Łódź', bio: 'Biegam, czytam, podróżuję ✈️', lookingFor: 'Men', interests: ['Fitness', 'Reading', 'Travel'] },
  { uid: 'seed_user_10', displayName: 'Bartek', gender: 'Man', dateOfBirth: '1991-06-14', city: 'Katowice', bio: 'Muzyk i gamer. Gram na żywo w weekendy.', lookingFor: 'Women', interests: ['Music', 'Gaming', 'Nightlife'] },
  { uid: 'seed_user_11', displayName: 'Iga', gender: 'Woman', dateOfBirth: '1997-02-28', city: 'Warszawa', bio: 'Yoga teacher & plant mom 🌿', lookingFor: 'Everyone', interests: ['Yoga', 'Nature', 'Cooking'] },
  { uid: 'seed_user_12', displayName: 'Damian', gender: 'Man', dateOfBirth: '1985-10-10', city: 'Gdańsk', bio: 'Żeglarz, fotograf, marzy o dookoła świata', lookingFor: 'Women', interests: ['Travel', 'Photography', 'Sports'] },
  { uid: 'seed_user_13', displayName: 'Oliwia', gender: 'Woman', dateOfBirth: '2001-01-20', city: 'Lublin', bio: 'Filmoholiczka. Netflix & kino studyjne 🎬', lookingFor: 'Men', interests: ['Movies', 'Reading', 'Foodie'] },
  { uid: 'seed_user_14', displayName: 'Szymon', gender: 'Man', dateOfBirth: '1994-03-05', city: 'Wrocław', bio: 'Frontend dev. Buduję rzeczy w internecie.', lookingFor: 'Women', interests: ['Tech', 'Gaming', 'Fitness'] },
  { uid: 'seed_user_15', displayName: 'Nikola', gender: 'Woman', dateOfBirth: '1998-07-30', city: 'Poznań', bio: 'Fashionistka i zwierzolubka 🐱', lookingFor: 'Everyone', interests: ['Fashion', 'Animals', 'Dancing'] },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log(`🌱 Seeding ${profiles.length} profiles into avalostaging…\n`);

  const batch = db.batch();

  for (const p of profiles) {
    // ── public_profiles/{uid} ──────────────────────────────────────────
    const publicRef = db.collection('public_profiles').doc(p.uid);
    batch.set(
      publicRef,
      {
        uid: p.uid,
        displayName: p.displayName,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        city: p.city,
        bio: p.bio,
        lookingFor: p.lookingFor,
        interests: p.interests,
        photoURL: '',
        discoverable: true,
        isHuman: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // ── users/{uid} ────────────────────────────────────────────────────
    const userRef = db.collection('users').doc(p.uid);
    batch.set(
      userRef,
      {
        displayName: p.displayName,
        email: `${p.uid}@seed.avalo.app`,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        city: p.city,
        bio: p.bio,
        lookingFor: p.lookingFor,
        interests: p.interests,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`  ✅ ${p.uid} — ${p.displayName} (${p.gender}, ${p.city})`);
  }

  await batch.commit();
  console.log(`\n🎉 Done! ${profiles.length} profiles written to public_profiles + users.`);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
