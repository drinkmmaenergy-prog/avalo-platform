// Firebase configuration for PRODUCTION environment
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_PROD_API_KEY || "",
  authDomain: "avalo-c8c46.firebaseapp.com",
  projectId: "avalo-c8c46",
  storageBucket: "avalo-c8c46.appspot.com",
  messagingSenderId: process.env.FIREBASE_PROD_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_PROD_APP_ID || ""
};

export const environment = {
  name: 'production',
  production: true,
  useEmulators: false,
  stripe: {
    publishableKey: process.env.STRIPE_LIVE_PUBLISHABLE_KEY || ""
  },
  ai: {
    openaiKey: process.env.OPENAI_PROD_KEY || "",
    anthropicKey: process.env.ANTHROPIC_PROD_KEY || ""
  },
  kyc: {
    provider: process.env.KYC_PROD_PROVIDER || "",
    apiKey: process.env.KYC_PROD_API_KEY || ""
  },
  sms: {
    provider: process.env.SMS_PROD_PROVIDER || "",
    apiKey: process.env.SMS_PROD_API_KEY || ""
  },
  email: {
    provider: process.env.EMAIL_PROD_PROVIDER || "",
    apiKey: process.env.EMAIL_PROD_API_KEY || ""
  },
  appStore: {
    googlePlay: {
      serviceAccountKey: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || ""
    },
    apple: {
      keyId: process.env.APPLE_KEY_ID || "",
      issuerId: process.env.APPLE_ISSUER_ID || "",
      key: process.env.APPLE_PRIVATE_KEY || ""
    }
  },
  features: {
    aiCompanions: false, // Controlled by feature flags
    videoCalls: false,
    calendarPayments: false,
    events: false,
    refundButtons: true,
    panicTracking: true
  }
};