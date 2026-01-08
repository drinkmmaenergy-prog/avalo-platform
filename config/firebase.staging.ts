// Firebase configuration for STAGING environment
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_STAGING_API_KEY || "",
  authDomain: "avalo-staging.firebaseapp.com",
  projectId: "avalo-staging",
  storageBucket: "avalo-staging.appspot.com",
  messagingSenderId: process.env.FIREBASE_STAGING_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_STAGING_APP_ID || ""
};

export const environment = {
  name: 'staging',
  production: false,
  useEmulators: false,
  stripe: {
    publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY || ""
  },
  ai: {
    openaiKey: process.env.OPENAI_STAGING_KEY || "",
    anthropicKey: process.env.ANTHROPIC_STAGING_KEY || ""
  },
  kyc: {
    provider: process.env.KYC_STAGING_PROVIDER || "",
    apiKey: process.env.KYC_STAGING_API_KEY || ""
  },
  sms: {
    provider: process.env.SMS_STAGING_PROVIDER || "",
    apiKey: process.env.SMS_STAGING_API_KEY || ""
  },
  email: {
    provider: process.env.EMAIL_STAGING_PROVIDER || "",
    apiKey: process.env.EMAIL_STAGING_API_KEY || ""
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