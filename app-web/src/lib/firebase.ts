// src/lib/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FB_CLIENT_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FB_CLIENT_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FB_CLIENT_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FB_CLIENT_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_CLIENT_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FB_CLIENT_APP_ID,
};

export const app =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');
