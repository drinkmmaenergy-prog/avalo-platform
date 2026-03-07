process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-avalo";

import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "demo-avalo"
  });
}
