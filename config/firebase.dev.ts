// Firebase configuration for DEV environment
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_DEV_API_KEY || "",
  authDomain: "avalo-dev.firebaseapp.com",
  projectId: "avalo-dev",
  storageBucket: "avalo-dev.appspot.com",
  messagingSenderId: process.env.FIREBASE_DEV_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_DEV_APP_ID || ""
};

export const environment = {
  name: 'dev',
  production: false,
  useEmulators: true,
  emulatorHosts: {
    auth: 'http://127.0.0.1:9099',
    firestore: 'http://127.0.0.1:8080',
    functions: 'http://127.0.0.1:5001',
    storage: 'http://127.0.0.1:9199'
  },
  stripe: {
    publishableKey: process.env.STRIPE_DEV_PUBLISHABLE_KEY || ""
  },
  ai: {
    openaiKey: process.env.OPENAI_DEV_KEY || "",
    anthropicKey: process.env.ANTHROPIC_DEV_KEY || ""
  },
  features: {
    aiCompanions: true,
    videoCalls: true,
    calendarPayments: true,
    events: true,
    refundButtons: true,
    panicTracking: true
  }
};