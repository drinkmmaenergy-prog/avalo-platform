// Load Test Configuration for Avalo Firebase Functions
export const config = {
  // Firebase Functions base URL
  baseUrl: process.env.FIREBASE_FUNCTIONS_URL || 'https://europe-west3-avalo-app.cloudfunctions.net',
  
  // Firebase project configuration
  projectId: process.env.FIREBASE_PROJECT_ID || 'avalo-app',
  
  // Test user credentials (for authenticated endpoints)
  testUsers: {
    user1: {
      uid: 'test-user-1',
      email: 'loadtest1@avalo.app',
      token: process.env.TEST_USER_1_TOKEN || ''
    },
    user2: {
      uid: 'test-user-2', 
      email: 'loadtest2@avalo.app',
      token: process.env.TEST_USER_2_TOKEN || ''
    }
  },
  
  // Load test parameters
  loadTest: {
    // Number of virtual users
    virtualUsers: {
      ping: 1000,
      purchase: 1000,
      loyalty: 500
    },
    
    // Test duration
    duration: {
      rampUp: '30s',    // Time to reach target VUs
      sustained: '2m',   // Time at peak load
      rampDown: '30s'    // Time to ramp down
    },
    
    // Thresholds for success criteria
    thresholds: {
      http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95th percentile < 500ms, 99th < 1s
      http_req_failed: ['rate<0.01'],                  // Less than 1% failures
      http_reqs: ['rate>100']                           // At least 100 req/s
    }
  },
  
  // Endpoints to test
  endpoints: {
    ping: '/ping',
    purchaseTokensV2: '/purchaseTokensV2',
    getUserLoyaltyCallable: '/getUserLoyaltyCallable',
    getSystemInfo: '/getSystemInfo'
  }
};

export default config;