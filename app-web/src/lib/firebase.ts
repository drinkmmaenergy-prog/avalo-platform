import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FB_CLIENT_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FB_CLIENT_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FB_CLIENT_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FB_CLIENT_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_CLIENT_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FB_CLIENT_APP_ID,
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
