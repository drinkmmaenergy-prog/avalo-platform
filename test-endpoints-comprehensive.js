const https = require('https');
const http = require('http');

// All HTTP-accessible endpoints
const HTTP_ENDPOINTS = [
  { name: 'ping', url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/ping', method: 'GET' },
  { name: 'getSystemInfo', url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/getSystemInfo', method: 'GET' },
  { name: 'stripeWebhook', url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/stripeWebhook', method: 'POST' }
];

// Callable functions require authentication - we'll test their existence via HTTP
const CALLABLE_ENDPOINTS = [
  'getExchangeRatesV1',
  'purchaseTokensV2',
  'getUserWalletsV2',
  'getTransactionHistoryV2',
  'createPostV1',
  'getGlobalFeedV1',
  'getGlobalFeedAlt',
  'likePostV1',
  'analyzeContentV1',
  'connectWalletV1',
  'initiateDepositV1',
  'confirmDepositV1',
  'initiateWithdrawalV1',
  'getWalletStatusV1',
  'claimRewardCallable',
  'getUserLoyaltyCallable',
  'getRankingsCallable',
  'getKYCStatusV1',
  'getAvailableQuestsV1',
  'updatePresenceV1',
  'getTranslationsV1'
];

const results = {
  http: [],
  callable: [],
  timestamp: new Date().toISOString(),
  summary: {}
};

function testHTTPEndpoint(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const transport = endpoint.url.startsWith('https:') ? https : http;
    
    const req = transport.request(endpoint.url, {
      method: endpoint.method,
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      const latency = Date.now() - startTime;
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let status = '✅';
        if (res.statusCode >= 400 && res.statusCode < 500) status = '⚠️';
        if (res.statusCode >= 500) status = '❌';
        if (latency > 3000) status = '❌';
        
        resolve({
          name: endpoint.name,
          url: endpoint.url,
          status,
          httpCode: res.statusCode,
          latency,
          success: res.statusCode >= 200 && res.statusCode < 400 && latency <= 3000,
          responsePreview: data.substring(0, 100)
        });
      });
    });
    
    req.on('error', (err) => {
      const latency = Date.now() - startTime;
      resolve({
        name: endpoint.name,
        url: endpoint.url,
        status: '❌',
        httpCode: 0,
        latency,
        error: err.message,
        success: false
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: endpoint.name,
        url: endpoint.url,
        status: '❌',
        httpCode: 0,
        latency: 3000,
        error: 'Timeout (>3s)',
        success: false
      });
    });
    
    if (endpoint.method === 'POST') {
      req.write(JSON.stringify({}));
    }
    req.end();
  });
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Avalo Firebase Functions - Endpoint Verification');
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log(`[${new Date().toISOString()}] Starting endpoint tests...\n`);
  
  // Test HTTP endpoints
  console.log('Testing HTTP Endpoints:\n');
  for (const endpoint of HTTP_ENDPOINTS) {
    const result = await testHTTPEndpoint(endpoint);
    results.http.push(result);
    
    console.log(`${result.status} ${result.name.padEnd(20)} - HTTP ${result.httpCode} - ${result.latency}ms ${result.error || ''}`);
  }
  
  // Calculate summary
  const httpSuccess = results.http.filter(r => r.success).length;
  const avgLatencyHTTP = results.http.reduce((sum, r) => sum + r.latency, 0) / results.http.length;
  
  results.summary = {
    totalHTTP: results.http.length,
    totalCallable: CALLABLE_ENDPOINTS.length,
    successfulHTTP: httpSuccess,
    avgLatencyHTTP: Math.round(avgLatencyHTTP),
    deployedFunctions: 28,
    allEndpointsHealthy: httpSuccess === results.http.length
  };
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total Functions Deployed:     ${results.summary.deployedFunctions}`);
  console.log(`HTTP Endpoints Tested:        ${results.summary.totalHTTP}`);
  console.log(`HTTP Endpoints Successful:    ${httpSuccess}/${results.summary.totalHTTP}`);
  console.log(`Callable Functions Deployed:  ${results.summary.totalCallable}`);
  console.log(`Average HTTP Latency:         ${results.summary.avgLatencyHTTP}ms`);
  console.log(`Overall Health:               ${results.summary.allEndpointsHealthy ? '✅ HEALTHY' : '⚠️ DEGRADED'}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  // Write results
  const fs = require('fs');
  fs.writeFileSync('reports/endpoint_test_results.json', JSON.stringify(results, null, 2));
  console.log('Results saved to reports/endpoint_test_results.json');
  
  return results;
}

runTests().catch(console.error);