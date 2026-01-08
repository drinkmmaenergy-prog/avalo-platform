#!/usr/bin/env node

/**
 * Performance Check Script using Lighthouse
 * Runs Lighthouse audits on key pages and outputs results
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

const ROUTES_TO_TEST = [
  { url: 'http://localhost:3000/', name: 'homepage' },
  { url: 'http://localhost:3000/feed', name: 'feed' },
  { url: 'http://localhost:3000/messages', name: 'chat' },
  { url: 'http://localhost:3000/events', name: 'events' }
];

const PERFORMANCE_BUDGETS = {
  'largest-contentful-paint': 2500,
  'first-contentful-paint': 1500,
  'cumulative-layout-shift': 0.1,
  'total-blocking-time': 300,
  'speed-index': 3000,
  'interactive': 3500
};

async function launchChromeAndRunLighthouse(url, opts = {}, config = null) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  opts.port = chrome.port;
  
  const results = await lighthouse(url, opts, config);
  await chrome.kill();
  
  return results;
}

async function runAudit(route) {
  console.log(`\n🔍 Testing ${route.name}: ${route.url}`);
  
  const opts = {
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
    output: 'json',
    emulatedFormFactor: 'mobile',
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
    }
  };
  
  try {
    const results = await launchChromeAndRunLighthouse(route.url, opts);
    const { lhr } = results;
    
    // Extract key metrics
    const metrics = {
      performance: lhr.categories.performance.score * 100,
      accessibility: lhr.categories.accessibility.score * 100,
      bestPractices: lhr.categories['best-practices'].score * 100,
      lcp: lhr.audits['largest-contentful-paint'].numericValue,
      fcp: lhr.audits['first-contentful-paint'].numericValue,
      cls: lhr.audits['cumulative-layout-shift'].numericValue,
      tbt: lhr.audits['total-blocking-time'].numericValue,
      si: lhr.audits['speed-index'].numericValue,
      tti: lhr.audits['interactive'].numericValue
    };
    
    // Check against budgets
    const budgetStatus = {
      lcp: metrics.lcp <= PERFORMANCE_BUDGETS['largest-contentful-paint'],
      fcp: metrics.fcp <= PERFORMANCE_BUDGETS['first-contentful-paint'],
      cls: metrics.cls <= PERFORMANCE_BUDGETS['cumulative-layout-shift'],
      tbt: metrics.tbt <= PERFORMANCE_BUDGETS['total-blocking-time'],
      si: metrics.si <= PERFORMANCE_BUDGETS['speed-index'],
      tti: metrics.tti <= PERFORMANCE_BUDGETS['interactive']
    };
    
    // Print results
    console.log('\n📊 Scores:');
    console.log(`  Performance: ${metrics.performance.toFixed(0)}/100`);
    console.log(`  Accessibility: ${metrics.accessibility.toFixed(0)}/100`);
    console.log(`  Best Practices: ${metrics.bestPractices.toFixed(0)}/100`);
    
    console.log('\n⏱️  Metrics:');
    console.log(`  LCP: ${(metrics.lcp / 1000).toFixed(2)}s ${budgetStatus.lcp ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['largest-contentful-paint'] / 1000}s)`);
    console.log(`  FCP: ${(metrics.fcp / 1000).toFixed(2)}s ${budgetStatus.fcp ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['first-contentful-paint'] / 1000}s)`);
    console.log(`  CLS: ${metrics.cls.toFixed(3)} ${budgetStatus.cls ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['cumulative-layout-shift']})`);
    console.log(`  TBT: ${metrics.tbt.toFixed(0)}ms ${budgetStatus.tbt ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['total-blocking-time']}ms)`);
    console.log(`  SI: ${(metrics.si / 1000).toFixed(2)}s ${budgetStatus.si ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['speed-index'] / 1000}s)`);
    console.log(`  TTI: ${(metrics.tti / 1000).toFixed(2)}s ${budgetStatus.tti ? '✅' : '❌'} (target: ${PERFORMANCE_BUDGETS['interactive'] / 1000}s)`);
    
    return {
      route: route.name,
      metrics,
      budgetStatus,
      passed: Object.values(budgetStatus).every(v => v)
    };
  } catch (error) {
    console.error(`❌ Error testing ${route.name}:`, error.message);
    return {
      route: route.name,
      error: error.message,
      passed: false
    };
  }
}

async function main() {
  console.log('🚀 Starting Avalo Web Performance Check\n');
  console.log('📋 Performance Budgets:');
  console.log(`  LCP: < ${PERFORMANCE_BUDGETS['largest-contentful-paint'] / 1000}s`);
  console.log(`  FCP: < ${PERFORMANCE_BUDGETS['first-contentful-paint'] / 1000}s`);
  console.log(`  CLS: < ${PERFORMANCE_BUDGETS['cumulative-layout-shift']}`);
  console.log(`  TBT: < ${PERFORMANCE_BUDGETS['total-blocking-time']}ms`);
  
  const results = [];
  
  for (const route of ROUTES_TO_TEST) {
    const result = await runAudit(route);
    results.push(result);
  }
  
  // Generate summary report
  console.log('\n\n📝 Summary Report\n');
  console.log('='.repeat(50));
  
  const passedRoutes = results.filter(r => r.passed).length;
  const totalRoutes = results.length;
  
  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.route}: ERROR - ${result.error}`);
    } else {
      console.log(`${result.passed ? '✅' : '⚠️'}  ${result.route}: ${result.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);
    }
  });
  
  console.log('='.repeat(50));
  console.log(`\n${passedRoutes}/${totalRoutes} routes passed performance budgets\n`);
  
  // Save detailed report
  const reportPath = path.join(__dirname, '..', 'performance-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  
  // Save markdown summary
  const mdReport = generateMarkdownReport(results);
  const mdPath = path.join(__dirname, '..', 'PERFORMANCE_REPORT.md');
  fs.writeFileSync(mdPath, mdReport);
  console.log(`📄 Markdown report saved to: ${mdPath}\n`);
  
  // Exit with error if not all routes passed
  process.exit(passedRoutes === totalRoutes ? 0 : 1);
}

function generateMarkdownReport(results) {
  const timestamp = new Date().toISOString();
  
  let md = `# Performance Report\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  md += `## Summary\n\n`;
  
  const passedRoutes = results.filter(r => r.passed).length;
  md += `**Overall:** ${passedRoutes}/${results.length} routes passed\n\n`;
  
  md += `## Budget Targets\n\n`;
  md += `| Metric | Target |\n`;
  md += `|--------|--------|\n`;
  md += `| LCP | < ${PERFORMANCE_BUDGETS['largest-contentful-paint'] / 1000}s |\n`;
  md += `| FCP | < ${PERFORMANCE_BUDGETS['first-contentful-paint'] / 1000}s |\n`;
  md += `| CLS | < ${PERFORMANCE_BUDGETS['cumulative-layout-shift']} |\n`;
  md += `| TBT | < ${PERFORMANCE_BUDGETS['total-blocking-time']}ms |\n\n`;
  
  md += `## Results by Route\n\n`;
  
  results.forEach(result => {
    if (result.error) {
      md += `### ❌ ${result.route}\n\n`;
      md += `**Error:** ${result.error}\n\n`;
    } else {
      md += `### ${result.passed ? '✅' : '⚠️'} ${result.route}\n\n`;
      md += `| Metric | Value | Status |\n`;
      md += `|--------|-------|--------|\n`;
      md += `| Performance Score | ${result.metrics.performance.toFixed(0)}/100 | - |\n`;
      md += `| Accessibility Score | ${result.metrics.accessibility.toFixed(0)}/100 | - |\n`;
      md += `| LCP | ${(result.metrics.lcp / 1000).toFixed(2)}s | ${result.budgetStatus.lcp ? '✅' : '❌'} |\n`;
      md += `| FCP | ${(result.metrics.fcp / 1000).toFixed(2)}s | ${result.budgetStatus.fcp ? '✅' : '❌'} |\n`;
      md += `| CLS | ${result.metrics.cls.toFixed(3)} | ${result.budgetStatus.cls ? '✅' : '❌'} |\n`;
      md += `| TBT | ${result.metrics.tbt.toFixed(0)}ms | ${result.budgetStatus.tbt ? '✅' : '❌'} |\n\n`;
    }
  });
  
  return md;
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAudit, main };