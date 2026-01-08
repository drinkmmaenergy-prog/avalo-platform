/**
 * Endpoint Testing Script
 * Tests critical Firebase Cloud Functions endpoints
 */

const BASE_URL = 'https://europe-west3-avalo-c8c46.cloudfunctions.net';

const endpoints = [
  { name: 'ping', path: '/ping' },
  { name: 'getSystemInfo', path: '/getSystemInfo' },
  { name: 'getExchangeRatesV1', path: '/getExchangeRatesV1' }
];

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const latency = Date.now() - startTime;
    const data = await response.json();
    
    return {
      name: endpoint.name,
      success: response.ok,
      status: response.status,
      latency: `${latency}ms`,
      data: data,
      error: null
    };
  } catch (error) {
    return {
      name: endpoint.name,
      success: false,
      status: 0,
      latency: 'N/A',
      data: null,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('🚀 Starting endpoint tests...\n');
  
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint.name}...`);
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    console.log(result.success ? '✅ PASS' : '❌ FAIL');
    console.log(`   Status: ${result.status} | Latency: ${result.latency}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }
  
  // Summary
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log('\n📊 Test Summary');
  console.log(`   Passed: ${passed}/${total}`);
  console.log(`   Failed: ${total - passed}/${total}`);
  
  return results;
}

// Run tests
runTests().then(() => {
  console.log('\n✅ Testing complete');
}).catch(error => {
  console.error('❌ Testing failed:', error);
  process.exit(1);
});