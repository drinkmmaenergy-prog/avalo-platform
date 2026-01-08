/**
 * Load Test Report Generator
 * 
 * Analyzes k6 test results and generates comprehensive reports with:
 * - Performance metrics (latency, throughput, error rates)
 * - Percentile analysis (p50, p95, p99)
 * - Cold start detection and frequency
 * - Scaling recommendations
 * - Visual charts (ASCII for markdown, data for JSON)
 */

const fs = require('fs');
const path = require('path');

// Result file paths
const RESULTS_DIR = path.join(__dirname, '../results');
const REPORTS_DIR = path.join(__dirname, '../../../reports');

const RESULT_FILES = {
  ping: path.join(RESULTS_DIR, 'ping-results.json'),
  purchase: path.join(RESULTS_DIR, 'purchase-results.json'),
  loyalty: path.join(RESULTS_DIR, 'loyalty-results.json'),
};

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Parse k6 JSON results
 */
function parseK6Results(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Results file not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  const metrics = {
    http_req_duration: [],
    http_req_waiting: [],
    http_req_failed: [],
    http_reqs: 0,
    vus: [],
    cold_starts: [],
    iterations: 0,
    data_received: 0,
    data_sent: 0,
  };

  lines.forEach(line => {
    try {
      const data = JSON.parse(line);
      
      if (data.type === 'Point' && data.metric) {
        const metricName = data.metric;
        const value = data.data.value;
        
        if (metricName === 'http_req_duration' && value !== undefined) {
          metrics.http_req_duration.push(value);
        } else if (metricName === 'http_req_waiting' && value !== undefined) {
          metrics.http_req_waiting.push(value);
        } else if (metricName === 'http_req_failed' && value !== undefined) {
          metrics.http_req_failed.push(value);
        } else if (metricName === 'http_reqs' && value !== undefined) {
          metrics.http_reqs += value;
        } else if (metricName === 'vus' && value !== undefined) {
          metrics.vus.push(value);
        } else if (metricName === 'cold_starts' && value !== undefined) {
          metrics.cold_starts.push(value);
        } else if (metricName === 'iterations' && value !== undefined) {
          metrics.iterations += value;
        } else if (metricName === 'data_received' && value !== undefined) {
          metrics.data_received += value;
        } else if (metricName === 'data_sent' && value !== undefined) {
          metrics.data_sent += value;
        }
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  });

  return metrics;
}

/**
 * Calculate percentiles
 */
function calculatePercentiles(values, percentiles = [50, 95, 99]) {
  if (!values || values.length === 0) return {};
  
  const sorted = values.slice().sort((a, b) => a - b);
  const result = {};
  
  percentiles.forEach(p => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[`p${p}`] = sorted[index];
  });
  
  return result;
}

/**
 * Calculate statistics
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, count: 0 };
  }
  
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    count: values.length,
  };
}

/**
 * Analyze test results
 */
function analyzeResults(testName, metrics) {
  if (!metrics) return null;
  
  const duration = calculateStats(metrics.http_req_duration);
  const percentiles = calculatePercentiles(metrics.http_req_duration, [50, 90, 95, 99]);
  
  // Calculate error rate
  const totalRequests = metrics.http_req_failed.length;
  const failedRequests = metrics.http_req_failed.filter(v => v > 0).length;
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  
  // Calculate cold start rate
  const coldStartCount = metrics.cold_starts.filter(v => v > 0).length;
  const coldStartRate = totalRequests > 0 ? (coldStartCount / totalRequests) * 100 : 0;
  
  // Calculate throughput (requests per second)
  const maxVus = Math.max(...metrics.vus, 0);
  const testDuration = metrics.vus.length > 0 ? metrics.vus.length : 1; // Approximate
  const throughput = metrics.http_reqs / testDuration;
  
  return {
    testName,
    summary: {
      totalRequests: totalRequests,
      failedRequests: failedRequests,
      successRate: (100 - errorRate).toFixed(2) + '%',
      errorRate: errorRate.toFixed(2) + '%',
      throughput: throughput.toFixed(2) + ' req/s',
      maxVirtualUsers: maxVus,
      totalDataReceived: (metrics.data_received / 1024 / 1024).toFixed(2) + ' MB',
      totalDataSent: (metrics.data_sent / 1024).toFixed(2) + ' KB',
    },
    latency: {
      min: duration.min.toFixed(2) + 'ms',
      max: duration.max.toFixed(2) + 'ms',
      avg: duration.avg.toFixed(2) + 'ms',
      median: duration.median.toFixed(2) + 'ms',
      p50: percentiles.p50.toFixed(2) + 'ms',
      p90: percentiles.p90.toFixed(2) + 'ms',
      p95: percentiles.p95.toFixed(2) + 'ms',
      p99: percentiles.p99.toFixed(2) + 'ms',
    },
    coldStarts: {
      count: coldStartCount,
      rate: coldStartRate.toFixed(2) + '%',
      frequency: coldStartCount > 0 ? `1 in ${Math.floor(totalRequests / coldStartCount)}` : 'None detected',
    },
    rawMetrics: {
      durationValues: duration,
      percentileValues: percentiles,
      errorRateValue: errorRate,
      coldStartRateValue: coldStartRate,
      throughputValue: throughput,
    }
  };
}

/**
 * Generate scaling recommendations
 */
function generateRecommendations(allResults) {
  const recommendations = [];
  
  // Analyze each test
  Object.entries(allResults).forEach(([testName, result]) => {
    if (!result) return;
    
    const { summary, latency, coldStarts, rawMetrics } = result;
    
    // Cold start recommendations
    if (rawMetrics.coldStartRateValue > 5) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Cold Starts',
        issue: `${testName} experiencing ${coldStarts.rate} cold start rate`,
        recommendation: 'Increase minimum instances to 1-2 to keep functions warm',
        implementation: 'Update firebase.json: { "minInstances": 2 }',
      });
    }
    
    // Latency recommendations
    if (parseFloat(rawMetrics.percentileValues.p95) > 1000) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Performance',
        issue: `${testName} p95 latency is ${latency.p95} (exceeds 1000ms threshold)`,
        recommendation: 'Optimize database queries and consider caching frequently accessed data',
        implementation: 'Implement Redis caching for hot data paths',
      });
    }
    
    if (parseFloat(rawMetrics.percentileValues.p99) > 3000) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Performance',
        issue: `${testName} p99 latency is ${latency.p99} (exceeds 3000ms threshold)`,
        recommendation: 'Investigate slow queries and add database indexes',
        implementation: 'Review Firestore indexes and add composite indexes for complex queries',
      });
    }
    
    // Error rate recommendations
    if (rawMetrics.errorRateValue > 2) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Reliability',
        issue: `${testName} error rate is ${summary.errorRate}`,
        recommendation: 'Review error logs and implement retry logic with exponential backoff',
        implementation: 'Add try-catch blocks and implement circuit breaker pattern',
      });
    }
    
    // Throughput recommendations
    if (rawMetrics.throughputValue < 50) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Scaling',
        issue: `${testName} throughput is ${summary.throughput} (below 50 req/s target)`,
        recommendation: 'Increase memory allocation and max instances',
        implementation: 'Update function config: { "memory": "2GB", "maxInstances": 100 }',
      });
    }
  });
  
  // General recommendations
  recommendations.push({
    priority: 'MEDIUM',
    category: 'Scaling',
    issue: 'Prepare for production traffic patterns',
    recommendation: 'Configure auto-scaling based on load test results',
    implementation: `
firebase.json configuration:
{
  "functions": {
    "memory": "1GB",
    "minInstances": 2,
    "maxInstances": 100,
    "concurrency": 80,
    "timeoutSeconds": 60
  }
}`,
  });
  
  recommendations.push({
    priority: 'LOW',
    category: 'Monitoring',
    issue: 'Need real-time performance visibility',
    recommendation: 'Enable Cloud Monitoring alerts for latency and error rates',
    implementation: 'Set up alerts for p95 > 500ms and error rate > 1%',
  });
  
  return recommendations;
}

/**
 * Generate ASCII chart
 */
function generateASCIIChart(values, title, width = 50) {
  if (!values || values.length === 0) return '';
  
  const sorted = values.slice().sort((a, b) => a - b);
  const max = Math.max(...sorted);
  const min = Math.min(...sorted);
  const range = max - min;
  
  let chart = `\n${title}\n${'='.repeat(title.length)}\n\n`;
  
  // Divide into buckets
  const buckets = 10;
  const bucketSize = range / buckets;
  const histogram = new Array(buckets).fill(0);
  
  sorted.forEach(v => {
    const bucket = Math.min(Math.floor((v - min) / bucketSize), buckets - 1);
    histogram[bucket]++;
  });
  
  const maxCount = Math.max(...histogram);
  
  histogram.forEach((count, i) => {
    const bucketMin = (min + i * bucketSize).toFixed(0);
    const bucketMax = (min + (i + 1) * bucketSize).toFixed(0);
    const barLength = Math.floor((count / maxCount) * width);
    const bar = '█'.repeat(barLength);
    chart += `${bucketMin.padStart(6)}-${bucketMax.padEnd(6)} | ${bar} ${count}\n`;
  });
  
  return chart;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(allResults, recommendations) {
  const timestamp = new Date().toISOString();
  
  let md = `# ⚡ Avalo Load Test Results\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  md += `**Test Environment:** Firebase Functions (europe-west3)\n\n`;
  md += `---\n\n`;
  
  // Executive Summary
  md += `## 📊 Executive Summary\n\n`;
  Object.entries(allResults).forEach(([testName, result]) => {
    if (!result) return;
    md += `### ${result.testName.toUpperCase()}\n\n`;
    md += `- **Total Requests:** ${result.summary.totalRequests}\n`;
    md += `- **Success Rate:** ${result.summary.successRate}\n`;
    md += `- **Avg Latency:** ${result.latency.avg}\n`;
    md += `- **p95 Latency:** ${result.latency.p95}\n`;
    md += `- **p99 Latency:** ${result.latency.p99}\n`;
    md += `- **Cold Starts:** ${result.coldStarts.rate}\n`;
    md += `- **Throughput:** ${result.summary.throughput}\n\n`;
  });
  
  // Detailed Metrics
  md += `---\n\n## 📈 Detailed Performance Metrics\n\n`;
  
  Object.entries(allResults).forEach(([testName, result]) => {
    if (!result) return;
    
    md += `### ${result.testName.toUpperCase()} - Detailed Analysis\n\n`;
    
    md += `#### Summary Statistics\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    Object.entries(result.summary).forEach(([key, value]) => {
      md += `| ${key.replace(/([A-Z])/g, ' $1').trim()} | ${value} |\n`;
    });
    md += `\n`;
    
    md += `#### Latency Breakdown\n\n`;
    md += `| Percentile | Latency |\n`;
    md += `|------------|----------|\n`;
    Object.entries(result.latency).forEach(([key, value]) => {
      md += `| ${key.toUpperCase()} | ${value} |\n`;
    });
    md += `\n`;
    
    md += `#### Cold Start Analysis\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Cold Start Count | ${result.coldStarts.count} |\n`;
    md += `| Cold Start Rate | ${result.coldStarts.rate} |\n`;
    md += `| Frequency | ${result.coldStarts.frequency} |\n`;
    md += `\n`;
    
    // Add ASCII chart for latency distribution
    if (result.rawMetrics && result.rawMetrics.durationValues) {
      md += `#### Latency Distribution\n\n`;
      md += `\`\`\`\n`;
      md += `Min: ${result.latency.min}, Max: ${result.latency.max}, Avg: ${result.latency.avg}\n`;
      md += `\`\`\`\n\n`;
    }
  });
  
  // Recommendations
  md += `---\n\n## 🎯 Scaling Recommendations\n\n`;
  
  const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
  const sortedRecs = recommendations.sort((a, b) => 
    priorityOrder[a.priority] - priorityOrder[b.priority]
  );
  
  sortedRecs.forEach((rec, i) => {
    md += `### ${i + 1}. ${rec.category} [${rec.priority}]\n\n`;
    md += `**Issue:** ${rec.issue}\n\n`;
    md += `**Recommendation:** ${rec.recommendation}\n\n`;
    md += `**Implementation:**\n\`\`\`\n${rec.implementation}\n\`\`\`\n\n`;
  });
  
  // Configuration Recommendations
  md += `---\n\n## ⚙️ Recommended [`firebase.json`](../firebase.json) Configuration\n\n`;
  md += `\`\`\`json\n`;
  md += `{
  "functions": {
    "runtime": "nodejs20",
    "region": "europe-west3",
    
    // Memory allocation (increase for better performance)
    "memory": "2GB",
    
    // Keep functions warm to reduce cold starts
    "minInstances": 2,
    
    // Allow auto-scaling during peak load
    "maxInstances": 100,
    
    // Enable concurrent request handling
    "concurrency": 80,
    
    // Increase timeout for complex operations
    "timeoutSeconds": 60,
    
    // Additional regions for global distribution
    "regions": ["europe-west3", "us-central1", "asia-east1"]
  }
}\n`;
  md += `\`\`\`\n\n`;
  
  // Next Steps
  md += `---\n\n## 🚀 Next Steps\n\n`;
  md += `1. **Immediate Actions:**\n`;
  md += `   - Address CRITICAL and HIGH priority recommendations\n`;
  md += `   - Implement recommended firebase.json configuration\n`;
  md += `   - Set up monitoring alerts for performance degradation\n\n`;
  md += `2. **Short-term (1-2 weeks):**\n`;
  md += `   - Optimize slow database queries\n`;
  md += `   - Implement caching for frequently accessed data\n`;
  md += `   - Add retry logic and circuit breakers\n\n`;
  md += `3. **Long-term (1-3 months):**\n`;
  md += `   - Consider regional deployment for global users\n`;
  md += `   - Implement advanced caching strategies (Redis/Memcached)\n`;
  md += `   - Set up comprehensive monitoring and alerting\n\n`;
  
  // Footer
  md += `---\n\n`;
  md += `**Load Test Framework:** k6\n\n`;
  md += `**Report Generated by:** Avalo Load Testing Suite v1.0\n\n`;
  md += `For questions or issues, contact the DevOps team.\n`;
  
  return md;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Generating Load Test Report...\n');
  
  // Parse all results
  const allResults = {};
  
  Object.entries(RESULT_FILES).forEach(([testName, filePath]) => {
    console.log(`📊 Analyzing ${testName} results...`);
    const metrics = parseK6Results(filePath);
    allResults[testName] = analyzeResults(testName, metrics);
  });
  
  // Generate recommendations
  console.log('\n🎯 Generating recommendations...');
  const recommendations = generateRecommendations(allResults);
  
  // Generate reports
  console.log('📝 Creating markdown report...');
  const markdownReport = generateMarkdownReport(allResults, recommendations);
  fs.writeFileSync(path.join(REPORTS_DIR, 'load_test_results.md'), markdownReport);
  
  console.log('📄 Creating JSON report...');
  const jsonReport = {
    timestamp: new Date().toISOString(),
    environment: 'Firebase Functions (europe-west3)',
    tests: allResults,
    recommendations: recommendations,
  };
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'load_test_results.json'),
    JSON.stringify(jsonReport, null, 2)
  );
  
  console.log('\n✅ Reports generated successfully!');
  console.log(`   - Markdown: ${path.join(REPORTS_DIR, 'load_test_results.md')}`);
  console.log(`   - JSON: ${path.join(REPORTS_DIR, 'load_test_results.json')}`);
  console.log('\n📊 Summary:');
  Object.entries(allResults).forEach(([testName, result]) => {
    if (!result) return;
    console.log(`\n   ${testName.toUpperCase()}:`);
    console.log(`   - Success Rate: ${result.summary.successRate}`);
    console.log(`   - p95 Latency: ${result.latency.p95}`);
    console.log(`   - Cold Starts: ${result.coldStarts.rate}`);
  });
  console.log('\n');
}

// Run the report generator
main().catch(console.error);