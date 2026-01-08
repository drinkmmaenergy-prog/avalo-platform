#!/usr/bin/env node

/**
 * Accessibility Test Script
 * Uses axe-core to check WCAG compliance
 */

const { chromium } = require('playwright');
const { injectAxe, checkA11y, getViolations } = require('axe-playwright');
const fs = require('fs');
const path = require('path');

const ROUTES_TO_TEST = [
  { url: 'http://localhost:3000/', name: 'homepage' },
  { url: 'http://localhost:3000/auth/login', name: 'login' },
  { url: 'http://localhost:3000/feed', name: 'feed' },
  { url: 'http://localhost:3000/messages', name: 'chat' },
  { url: 'http://localhost:3000/events', name: 'events' }
];

const AXE_OPTIONS = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  }
};

async function testAccessibility(page, route) {
  console.log(`\n♿ Testing ${route.name}: ${route.url}`);
  
  try {
    await page.goto(route.url, { waitUntil: 'networkidle' });
    
    // Inject axe-core
    await injectAxe(page);
    
    // Run accessibility checks
    const results = await page.evaluate(async (options) => {
      return await window.axe.run(document, options);
    }, AXE_OPTIONS);
    
    const violations = results.violations;
    const passes = results.passes;
    
    console.log(`  ✅ Passes: ${passes.length}`);
    console.log(`  ❌ Violations: ${violations.length}`);
    
    if (violations.length > 0) {
      console.log('\n  Issues found:');
      violations.forEach((violation, index) => {
        console.log(`\n  ${index + 1}. ${violation.id} (${violation.impact})`);
        console.log(`     ${violation.description}`);
        console.log(`     Affected elements: ${violation.nodes.length}`);
        violation.nodes.slice(0, 3).forEach(node => {
          console.log(`     - ${node.html.substring(0, 100)}...`);
        });
      });
    }
    
    return {
      route: route.name,
      url: route.url,
      violations,
      passes,
      summary: {
        critical: violations.filter(v => v.impact === 'critical').length,
        serious: violations.filter(v => v.impact === 'serious').length,
        moderate: violations.filter(v => v.impact === 'moderate').length,
        minor: violations.filter(v => v.impact === 'minor').length
      }
    };
  } catch (error) {
    console.error(`  ❌ Error testing ${route.name}:`, error.message);
    return {
      route: route.name,
      url: route.url,
      error: error.message
    };
  }
}

async function main() {
  console.log('🚀 Starting Avalo Web Accessibility Check\n');
  console.log('📋 Testing WCAG 2.1 Level A & AA compliance\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  
  for (const route of ROUTES_TO_TEST) {
    const result = await testAccessibility(page, route);
    results.push(result);
  }
  
  await browser.close();
  
  // Generate summary
  console.log('\n\n📝 Accessibility Summary\n');
  console.log('='.repeat(60));
  
  let totalViolations = 0;
  let totalCritical = 0;
  let totalSerious = 0;
  
  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.route}: ERROR - ${result.error}`);
    } else {
      const violationCount = result.violations.length;
      totalViolations += violationCount;
      if (result.summary) {
        totalCritical += result.summary.critical;
        totalSerious += result.summary.serious;
      }
      
      const status = violationCount === 0 ? '✅' : 
                    result.summary?.critical > 0 ? '🔴' :
                    result.summary?.serious > 0 ? '🟡' : '🟢';
      
      console.log(`${status} ${result.route}: ${violationCount} violations`);
      if (result.summary) {
        const parts = [];
        if (result.summary.critical > 0) parts.push(`${result.summary.critical} critical`);
        if (result.summary.serious > 0) parts.push(`${result.summary.serious} serious`);
        if (result.summary.moderate > 0) parts.push(`${result.summary.moderate} moderate`);
        if (result.summary.minor > 0) parts.push(`${result.summary.minor} minor`);
        if (parts.length > 0) {
          console.log(`   (${parts.join(', ')})`);
        }
      }
    }
  });
  
  console.log('='.repeat(60));
  console.log(`\nTotal Violations: ${totalViolations}`);
  console.log(`Critical: ${totalCritical}`);
  console.log(`Serious: ${totalSerious}\n`);
  
  // Save report
  const reportPath = path.join(__dirname, '..', 'accessibility-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  
  // Generate markdown report
  const mdReport = generateMarkdownReport(results);
  const mdPath = path.join(__dirname, '..', 'ACCESSIBILITY_REPORT.md');
  fs.writeFileSync(mdPath, mdReport);
  console.log(`📄 Markdown report saved to: ${mdPath}\n`);
  
  // Exit with error if critical violations found
  process.exit(totalCritical > 0 ? 1 : 0);
}

function generateMarkdownReport(results) {
  const timestamp = new Date().toISOString();
  
  let md = `# Accessibility Report\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  md += `**Standard:** WCAG 2.1 Level A & AA\n\n`;
  
  md += `## Summary\n\n`;
  
  const totalViolations = results.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
  const totalCritical = results.reduce((sum, r) => sum + (r.summary?.critical || 0), 0);
  const totalSerious = results.reduce((sum, r) => sum + (r.summary?.serious || 0), 0);
  const totalModerate = results.reduce((sum, r) => sum + (r.summary?.moderate || 0), 0);
  const totalMinor = results.reduce((sum, r) => sum + (r.summary?.minor || 0), 0);
  
  md += `| Severity | Count |\n`;
  md += `|----------|-------|\n`;
  md += `| Critical | ${totalCritical} |\n`;
  md += `| Serious | ${totalSerious} |\n`;
  md += `| Moderate | ${totalModerate} |\n`;
  md += `| Minor | ${totalMinor} |\n`;
  md += `| **Total** | **${totalViolations}** |\n\n`;
  
  md += `## Results by Route\n\n`;
  
  results.forEach(result => {
    if (result.error) {
      md += `### ❌ ${result.route}\n\n`;
      md += `**Error:** ${result.error}\n\n`;
    } else {
      const status = result.violations.length === 0 ? '✅' : '⚠️';
      md += `### ${status} ${result.route}\n\n`;
      md += `**URL:** ${result.url}\n\n`;
      
      if (result.violations.length === 0) {
        md += `✅ No accessibility violations found!\n\n`;
      } else {
        md += `**Violations:** ${result.violations.length}\n\n`;
        
        if (result.summary) {
          md += `| Severity | Count |\n`;
          md += `|----------|-------|\n`;
          md += `| Critical | ${result.summary.critical} |\n`;
          md += `| Serious | ${result.summary.serious} |\n`;
          md += `| Moderate | ${result.summary.moderate} |\n`;
          md += `| Minor | ${result.summary.minor} |\n\n`;
        }
        
        md += `#### Issues\n\n`;
        result.violations.forEach((violation, index) => {
          md += `${index + 1}. **${violation.id}** (${violation.impact})\n`;
          md += `   - ${violation.description}\n`;
          md += `   - Help: ${violation.helpUrl}\n`;
          md += `   - Affected elements: ${violation.nodes.length}\n\n`;
        });
      }
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

module.exports = { testAccessibility, main };