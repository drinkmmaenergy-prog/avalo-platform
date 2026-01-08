/**
 * ========================================================================
 * AVALO FIREBASE INTEGRATION TEST - CONFIGURATION
 * ========================================================================
 */

export interface TestConfig {
  projectId: string;
  region: string;
  emulatorPorts: {
    auth: number;
    firestore: number;
    functions: number;
    hosting: number;
    storage: number;
    ui: number;
  };
  timeout: number;
  endpoints: {
    functions: string;
    auth: string;
    firestore: string;
    storage: string;
  };
  requiredEnvVars: string[];
  forbiddenEnvVars: string[];
}

export const testConfig: TestConfig = {
  projectId: 'avalo-c8c46',
  region: 'europe-west3',
  emulatorPorts: {
    auth: 9099,
    firestore: 8080,
    functions: 5001,
    hosting: 5000,
    storage: 9199,
    ui: 4000,
  },
  timeout: 600000, // 10 minutes in milliseconds
  endpoints: {
    functions: 'http://127.0.0.1:5001/avalo-c8c46/europe-west3',
    auth: 'http://127.0.0.1:9099',
    firestore: 'http://127.0.0.1:8080',
    storage: 'http://127.0.0.1:9199',
  },
  requiredEnvVars: [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'GOOGLE_CLIENT_ID',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'NODE_ENV',
    'FUNCTIONS_REGION',
  ],
  forbiddenEnvVars: [
    'FIREBASE_CONFIG',
    'GCLOUD_PROJECT',
  ],
};

export const testEndpoints = [
  'ping',
  'getSystemInfo',
  'getGlobalFeedV1',
  'purchaseTokensV2',
  'getTransactionHistoryV2',
  'connectWalletV1',
];