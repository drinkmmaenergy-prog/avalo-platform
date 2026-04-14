import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import * as admin from "firebase-admin";

export async function clearCollection(path: string) {
  const db = admin.firestore();

  const snapshot = await db.collection(path).get();

  if (snapshot.empty) return;

  const batch = db.batch();

  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}
















