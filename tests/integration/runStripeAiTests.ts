/**
 * ========================================================================
 * STRIPE & AI MODERATION TEST RUNNER
 * ========================================================================
 * 
 * Standalone script to run Stripe & AI tests and generate reports
 */

import * as path from 'path';
import * as fs from 'fs';
import { StripeAiTestSuite } from './stripeAiTestSuite';
import { formatDuration } from './utils';

/**
 * Generate Markdown report for Stripe & AI tests
 */
function generateMarkdownReport(report: any): string {
  const { timestamp, projectId, region, totalTests, passed, failed, warnings, skipped, duration } = report;
  const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(2) : '0.00';

  let markdown = `# 💳🤖 AVALO Stripe & AI Moderation Test Report

**Generated:** ${new Date(timestamp).toLocaleString()}  
**Project ID:** ${projectId}  
**Region:** ${region}  
**Duration:** ${formatDuration(duration)}

---

## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${totalTests} |
| ✅ Passed | ${passed} |
| 🔥 Failed | ${failed} |
| ⚠️ Warnings | ${warnings} |
| ⏭️ Skipped | ${skipped} |
| **Pass Rate** | **${passRate}%** |

---

## 💳 Stripe Integration Status

| Component | Status |
|-----------|--------|
| Webhook Configured | ${report.stripeDetails.webhookConfigured ? '✅ Yes' : '❌ No'} |
| Test Mode | ${report.stripeDetails.testMode ? '✅ Test Mode' : '⚠️ Live Mode'} |
| Webhook Status | ${report.stripeDetails.webhookStatus === 'pass' ? '✅ Working' : report.stripeDetails.webhookStatus === 'warning' ? '⚠️ Warning' : '❌ Failed'} |

### Payment Flow Endpoints

- **Purchase Tokens:** \`${report.paymentFlowDetails.tokenPurchaseEndpoint}\`
- **Transaction History:** \`${report.paymentFlowDetails.transactionHistoryEndpoint}\`
- **User Wallets:** \`${report.paymentFlowDetails.walletEndpoint}\`
- **Pricing Logic:** ${report.paymentFlowDetails.pricingLogicValid ? '✅ Valid' : '❌ Invalid'}

---

## 🤖 AI Moderation Status

### OpenAI Integration

| Metric | Value |
|--------|-------|
| Configured | ${report.aiDetails.openai.configured ? '✅ Yes' : '❌ No'} |
| Latency | ${report.aiDetails.openai.latency ? formatDuration(report.aiDetails.openai.latency) : 'N/A'} |
| NSFW Detection | ${report.aiDetails.openai.nsfwDetection ? '✅ Working' : '⚠️ Not Tested'} |

### Anthropic Integration

| Metric | Value |
|--------|-------|
| Configured | ${report.aiDetails.anthropic.configured ? '✅ Yes' : '❌ No'} |
| Latency | ${report.aiDetails.anthropic.latency ? formatDuration(report.aiDetails.anthropic.latency) : 'N/A'} |
| NSFW Detection | ${report.aiDetails.anthropic.nsfwDetection ? '✅ Working' : '⚠️ Not Tested'} |

---

## 📋 Detailed Test Results

`;

  // Group results by category
  const categories: Record<string, any[]> = {
    'Environment Setup': [],
    'Stripe Configuration': [],
    'Payment APIs': [],
    'Token Pricing': [],
    'Stripe Webhooks': [],
    'OpenAI Moderation': [],
    'Anthropic Moderation': [],
    'Performance': [],
  };

  for (const result of report.results) {
    if (result.name.includes('Environment')) {
      categories['Environment Setup'].push(result);
    } else if (result.name.includes('Stripe:')) {
      categories['Stripe Configuration'].push(result);
    } else if (result.name.includes('API:')) {
      categories['Payment APIs'].push(result);
    } else if (result.name.includes('Pricing:')) {
      categories['Token Pricing'].push(result);
    } else if (result.name.includes('Webhook:')) {
      categories['Stripe Webhooks'].push(result);
    } else if (result.name.includes('OpenAI:')) {
      categories['OpenAI Moderation'].push(result);
    } else if (result.name.includes('Anthropic:')) {
      categories['Anthropic Moderation'].push(result);
    } else if (result.name.includes('Performance:')) {
      categories['Performance'].push(result);
    }
  }

  for (const [category, results] of Object.entries(categories)) {
    if (results.length === 0) continue;

    markdown += `### ${category}\n\n`;

    for (const result of results) {
      const icon = result.status === 'pass' ? '✅' : 
                   result.status === 'fail' ? '🔥' : 
                   result.status === 'warning' ? '⚠️' : '⏭️';

      markdown += `${icon} **${result.name}** - ${formatDuration(result.duration)}\n`;

      if (result.message) {
        markdown += `   📝 ${result.message}\n`;
      }

      if (result.error) {
        markdown += `   ❌ Error: \`${result.error}\`\n`;
      }

      markdown += '\n';
    }
  }

  markdown += `---

## 🎯 Key Findings

`;

  // Critical issues
  if (failed > 0) {
    markdown += `### 🔥 Critical Issues (${failed})\n\n`;
    const failedTests = report.results.filter((r: any) => r.status === 'fail');
    for (const test of failedTests) {
      markdown += `- **${test.name}**: ${test.error || 'Unknown error'}\n`;
    }
    markdown += '\n';
  }

  // Warnings
  if (warnings > 0) {
    markdown += `### ⚠️ Warnings (${warnings})\n\n`;
    const warningTests = report.results.filter((r: any) => r.status === 'warning');
    for (const test of warningTests) {
      markdown += `- **${test.name}**: ${test.message || 'Review required'}\n`;
    }
    markdown += '\n';
  }

  // Performance insights
  markdown += `### ⚡ Performance Insights\n\n`;
  
  if (report.aiDetails.openai.latency) {
    markdown += `- OpenAI Moderation: ${formatDuration(report.aiDetails.openai.latency)}\n`;
  }
  
  if (report.aiDetails.anthropic.latency) {
    markdown += `- Anthropic Moderation: ${formatDuration(report.aiDetails.anthropic.latency)}\n`;
  }

  markdown += `\n---

## 💡 Recommendations

`;

  const recommendations: string[] = [];

  if (!report.stripeDetails.testMode) {
    recommendations.push('⚠️ **Switch to Stripe Test Mode** for development/testing to avoid real charges');
  }

  if (!report.stripeDetails.webhookConfigured) {
    recommendations.push('🔧 **Configure Stripe Webhook** to handle payment events automatically');
  }

  if (!report.aiDetails.openai.configured && !report.aiDetails.anthropic.configured) {
    recommendations.push('🤖 **Configure AI API Keys** to enable content moderation features');
  }

  if (report.aiDetails.openai.latency && report.aiDetails.openai.latency > 2000) {
    recommendations.push('⚡ **Optimize OpenAI Response Time** - current latency exceeds 2s threshold');
  }

  if (report.aiDetails.anthropic.latency && report.aiDetails.anthropic.latency > 2000) {
    recommendations.push('⚡ **Optimize Anthropic Response Time** - current latency exceeds 2s threshold');
  }

  if (failed > 0) {
    recommendations.push('🔥 **Address Critical Failures** before deployment to production');
  }

  if (recommendations.length === 0) {
    markdown += '✅ All systems operational. No critical recommendations at this time.\n';
  } else {
    for (const rec of recommendations) {
      markdown += `${rec}\n\n`;
    }
  }

  markdown += `---

## 📊 Token Pricing Matrix

**Baseline Price:** 0.20 PLN per token

| Tokens | Price per Token | Total (PLN) | Discount |
|--------|----------------|-------------|----------|
| 10 | 0.20 PLN | 2.00 PLN | 0% |
| 50 | 0.19 PLN | 9.50 PLN | 5% |
| 100 | 0.18 PLN | 18.00 PLN | 10% |
| 500 | 0.17 PLN | 85.00 PLN | 15% |
| 1000 | 0.16 PLN | 160.00 PLN | 20% |

---

*Report generated by Avalo Stripe & AI Test Suite v1.0.0*
`;

  return markdown;
}

/**
 * Save reports to files
 */
function saveReports(report: any): void {
  const reportsDir = path.join(process.cwd(), 'reports');
  
  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Save JSON report
  const jsonPath = path.join(reportsDir, 'stripe_ai_verification.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 JSON report saved: ${jsonPath}`);

  // Save Markdown report
  const markdown = generateMarkdownReport(report);
  const mdPath = path.join(reportsDir, 'stripe_ai_verification.md');
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`📄 Markdown report saved: ${mdPath}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AVALO STRIPE & AI MODERATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n');

  try {
    const suite = new StripeAiTestSuite();
    const report = await suite.runAll();

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TEST EXECUTION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n');

    console.log('📊 SUMMARY:');
    console.log(`   Total Tests:    ${report.totalTests}`);
    console.log(`   ✅ Passed:      ${report.passed}`);
    console.log(`   🔥 Failed:      ${report.failed}`);
    console.log(`   ⚠️  Warnings:    ${report.warnings}`);
    console.log(`   ⏭️  Skipped:     ${report.skipped}`);
    console.log(`   ⏱️  Duration:    ${formatDuration(report.duration)}`);
    
    const passRate = report.totalTests > 0 ? ((report.passed / report.totalTests) * 100).toFixed(2) : '0.00';
    console.log(`   📈 Pass Rate:   ${passRate}%\n`);

    // Save reports
    saveReports(report);

    console.log('\n✅ Test suite completed successfully!\n');

    // Exit with appropriate code
    if (report.failed > 0) {
      console.log('⚠️  Some tests failed. Review the report for details.\n');
      process.exit(1);
    } else if (report.warnings > 0) {
      console.log('⚠️  Some tests have warnings. Review the report for details.\n');
      process.exit(0);
    } else {
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n🔥 Test suite execution failed:');
    console.error(error.message);
    console.error('\n');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };