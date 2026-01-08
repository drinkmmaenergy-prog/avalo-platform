/**
 * ========================================================================
 * AVALO POST-DEPLOYMENT VERIFICATION - REPORT GENERATOR
 * ========================================================================
 * Generates comprehensive reports in Markdown and JSON formats
 */

import * as fs from 'fs';
import * as path from 'path';
import { VerificationReport, PerformanceMetrics } from './postDeploymentSuite';
import { formatDuration } from '../integration/utils';

/**
 * Generate detailed Markdown report
 */
export function generateMarkdownReport(report: VerificationReport): string {
  const { timestamp, projectId, region, totalDuration, stages, performanceMetrics, summary, recommendations } = report;

  let markdown = `# 🔥 AVALO POST-DEPLOYMENT VERIFICATION REPORT

**Generated:** ${new Date(timestamp).toLocaleString('en-US', { timeZone: 'UTC' })} UTC  
**Project ID:** ${projectId}  
**Region:** ${region}  
**Execution Mode:** ${report.executionMode}  
**Total Duration:** ${formatDuration(totalDuration)}

---

## 📊 EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| **Total Tests** | ${summary.totalTests} | |
| **✅ Passed** | ${summary.passed} | ${getStatusEmoji(summary.passed, summary.totalTests)} |
| **🔥 Failed** | ${summary.failed} | ${summary.failed > 0 ? '❌' : '✅'} |
| **⚠️ Warnings** | ${summary.warnings} | ${summary.warnings > 0 ? '⚠️' : '✅'} |
| **⏭️ Skipped** | ${summary.skipped} | ℹ️ |
| **Pass Rate** | ${summary.passRate.toFixed(2)}% | ${summary.passRate >= 95 ? '🟢' : summary.passRate >= 80 ? '🟡' : '🔴'} |

`;

  // Add critical status based on failures
  if (summary.failed > 0) {
    markdown += `\n### 🚨 CRITICAL ISSUES DETECTED\n\n`;
    markdown += `**${summary.failed}** tests failed. Immediate action required before production deployment.\n\n`;
  } else if (summary.warnings > 0) {
    markdown += `\n### ⚠️ WARNINGS PRESENT\n\n`;
    markdown += `**${summary.warnings}** warnings detected. Review recommended before production deployment.\n\n`;
  } else {
    markdown += `\n### ✅ VERIFICATION PASSED\n\n`;
    markdown += `All critical systems verified successfully. System is production-ready.\n\n`;
  }

  markdown += `---

## 📋 VERIFICATION STAGES

`;

  // Generate stage-by-stage results
  const stageOrder = [
    { key: 'core_health', name: '🏥 Stage 1: Core Health' },
    { key: 'backend_frontend', name: '🔗 Stage 2: Backend-Frontend Link' },
    { key: 'payments', name: '💳 Stage 3: Payments Integration' },
    { key: 'loyalty', name: '🎮 Stage 4: Loyalty & Gamification' },
    { key: 'ai', name: '🤖 Stage 5: AI & Moderation' },
    { key: 'i18n', name: '🌍 Stage 6: Internationalization' },
    { key: 'security', name: '🔒 Stage 7: Security' },
    { key: 'performance', name: '⚡ Stage 8: Performance & Reliability' },
    { key: 'firestore', name: '🗄️ Stage 9: Firestore Index & Rules' },
  ];

  for (const { key, name } of stageOrder) {
    const stage = stages[key];
    if (!stage) continue;

    const stageTotal = stage.passed + stage.failed + stage.warnings + stage.skipped;
    const stagePassRate = stageTotal > 0 ? ((stage.passed / stageTotal) * 100).toFixed(1) : '0.0';

    markdown += `### ${name}

**Tests:** ${stageTotal} | **Passed:** ${stage.passed} | **Failed:** ${stage.failed} | **Warnings:** ${stage.warnings} | **Skipped:** ${stage.skipped} | **Pass Rate:** ${stagePassRate}%

`;

    // List test results
    for (const result of stage.results) {
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

    markdown += '\n';
  }

  markdown += `---

## ⚡ PERFORMANCE METRICS

`;

  if (performanceMetrics.length > 0) {
    markdown += `### Endpoint Latency Analysis

| Endpoint | Min | Avg | P50 | P95 | P99 | Max | Status |
|----------|-----|-----|-----|-----|-----|-----|--------|
`;

    for (const metric of performanceMetrics) {
      const status = metric.p95 > 1000 ? '🔴 Slow' :
                     metric.p95 > 500 ? '🟡 OK' : '🟢 Fast';
      
      markdown += `| /${metric.endpoint} | ${metric.min}ms | ${metric.avg}ms | ${metric.p50}ms | ${metric.p95}ms | ${metric.p99}ms | ${metric.max}ms | ${status} |\n`;
    }

    markdown += '\n';

    // Performance summary
    const avgP95 = performanceMetrics.reduce((sum, m) => sum + m.p95, 0) / performanceMetrics.length;
    markdown += `**Average P95 Latency:** ${Math.round(avgP95)}ms\n\n`;

    if (avgP95 > 1000) {
      markdown += `⚠️ **WARNING:** Average P95 latency is high. Consider optimization.\n\n`;
    }
  } else {
    markdown += `*No performance metrics collected (endpoints may be unreachable)*\n\n`;
  }

  markdown += `---

## 🎯 RECOMMENDATIONS

`;

  if (recommendations.length > 0) {
    for (const rec of recommendations) {
      markdown += `- ${rec}\n`;
    }
  } else {
    markdown += `✅ No specific recommendations. All systems operating within expected parameters.\n`;
  }

  markdown += `\n---

## 📈 DETAILED FINDINGS

`;

  // Critical failures
  const criticalFailures: string[] = [];
  for (const [stageName, stage] of Object.entries(stages)) {
    for (const result of stage.results) {
      if (result.status === 'fail') {
        criticalFailures.push(`**[${stageName.toUpperCase()}]** ${result.name}: ${result.error || 'Unknown error'}`);
      }
    }
  }

  if (criticalFailures.length > 0) {
    markdown += `### 🔥 Critical Failures

`;
    for (const failure of criticalFailures) {
      markdown += `1. ${failure}\n`;
    }
    markdown += '\n';
  }

  // Warnings
  const warningsList: string[] = [];
  for (const [stageName, stage] of Object.entries(stages)) {
    for (const result of stage.results) {
      if (result.status === 'warning') {
        warningsList.push(`**[${stageName.toUpperCase()}]** ${result.name}: ${result.message || 'Review required'}`);
      }
    }
  }

  if (warningsList.length > 0) {
    markdown += `### ⚠️ Warnings

`;
    for (const warning of warningsList) {
      markdown += `- ${warning}\n`;
    }
    markdown += '\n';
  }

  markdown += `---

## 🔄 NEXT STEPS

`;

  if (summary.failed > 0) {
    markdown += `### ❌ FAILED - DO NOT DEPLOY

1. **Review all failed tests** listed above
2. **Fix critical issues** before proceeding
3. **Re-run verification suite** after fixes
4. **Only deploy after** all tests pass

`;
  } else if (summary.warnings > 0) {
    markdown += `### ⚠️ WARNINGS - REVIEW BEFORE DEPLOY

1. **Review all warnings** listed above
2. **Assess risk level** for each warning
3. **Address critical warnings** if possible
4. **Document accepted risks** for remaining warnings
5. **Proceed with caution** or re-run after fixes

`;
  } else {
    markdown += `### ✅ PASSED - READY FOR DEPLOYMENT

1. **All systems verified** successfully
2. **No critical issues** detected
3. **Proceed with deployment** to production
4. **Monitor systems** after deployment
5. **Keep logs** for audit trail

`;
  }

  markdown += `---

## 📝 SYSTEM INFORMATION

**Test Configuration:**
- **Firebase Project:** ${projectId}
- **Region:** ${region}
- **Execution Mode:** ${report.executionMode}
- **Timeout:** 15 minutes
- **Auto-retry:** Enabled

**Function Endpoints:**
- Functions: http://127.0.0.1:5001/${projectId}/${region}
- Firestore: http://127.0.0.1:8080
- Auth: http://127.0.0.1:9099
- Storage: http://127.0.0.1:9199

---

*Report generated by Avalo Post-Deployment Verification Suite v1.0.0*  
*Execution completed at ${new Date(timestamp).toISOString()}*
`;

  return markdown;
}

/**
 * Generate JSON report
 */
export function generateJSONReport(report: VerificationReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Save reports to disk
 */
export function saveReports(report: VerificationReport): void {
  const reportsDir = path.join(process.cwd(), 'reports');
  
  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Generate reports
  const markdown = generateMarkdownReport(report);
  const json = generateJSONReport(report);

  // Save to files
  const mdPath = path.join(reportsDir, 'avalo_post_deploy_verification.md');
  const jsonPath = path.join(reportsDir, 'avalo_post_deploy_verification.json');
  const logPath = path.join(reportsDir, 'logs', 'post_deploy_run.log');

  fs.writeFileSync(mdPath, markdown, 'utf-8');
  fs.writeFileSync(jsonPath, json, 'utf-8');

  // Create log file with execution summary
  const logDir = path.join(reportsDir, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logContent = `AVALO POST-DEPLOYMENT VERIFICATION LOG
========================================
Timestamp: ${new Date(report.timestamp).toISOString()}
Project: ${report.projectId}
Region: ${report.region}
Duration: ${formatDuration(report.totalDuration)}

SUMMARY:
- Total Tests: ${report.summary.totalTests}
- Passed: ${report.summary.passed}
- Failed: ${report.summary.failed}
- Warnings: ${report.summary.warnings}
- Skipped: ${report.summary.skipped}
- Pass Rate: ${report.summary.passRate.toFixed(2)}%

STATUS: ${report.summary.failed > 0 ? 'FAILED' : report.summary.warnings > 0 ? 'WARNINGS' : 'PASSED'}

Reports saved to:
- ${mdPath}
- ${jsonPath}
`;

  fs.writeFileSync(logPath, logContent, 'utf-8');

  console.log('\n📄 Reports saved:');
  console.log(`   📋 ${mdPath}`);
  console.log(`   📊 ${jsonPath}`);
  console.log(`   📝 ${logPath}`);
}

/**
 * Print summary to console
 */
export function printSummary(report: VerificationReport): void {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║                  VERIFICATION SUMMARY                      ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const { summary, totalDuration } = report;

  console.log('📊 Overall Results:');
  console.log('   ─────────────────────────────────────────────');
  console.log(`   Total Tests:     ${summary.totalTests}`);
  console.log(`   ✅ Passed:       ${summary.passed}`);
  console.log(`   🔥 Failed:       ${summary.failed}`);
  console.log(`   ⚠️  Warnings:     ${summary.warnings}`);
  console.log(`   ⏭️  Skipped:      ${summary.skipped}`);
  console.log(`   📈 Pass Rate:    ${summary.passRate.toFixed(2)}%`);
  console.log(`   ⏱️  Duration:     ${formatDuration(totalDuration)}`);
  console.log('');

  // Stage breakdown
  console.log('📋 Stage Breakdown:');
  console.log('   ─────────────────────────────────────────────');

  const stageNames: Record<string, string> = {
    core_health: 'Core Health',
    backend_frontend: 'Backend-Frontend',
    payments: 'Payments',
    loyalty: 'Loyalty & Gamification',
    ai: 'AI & Moderation',
    i18n: 'Internationalization',
    security: 'Security',
    performance: 'Performance',
    firestore: 'Firestore',
  };

  for (const [key, name] of Object.entries(stageNames)) {
    const stage = report.stages[key];
    if (!stage) continue;

    const total = stage.passed + stage.failed + stage.warnings + stage.skipped;
    const icon = stage.failed > 0 ? '🔥' : stage.warnings > 0 ? '⚠️' : '✅';
    
    console.log(`   ${icon} ${name.padEnd(22)} P:${stage.passed} F:${stage.failed} W:${stage.warnings} S:${stage.skipped}`);
  }

  console.log('');

  // Performance summary
  if (report.performanceMetrics.length > 0) {
    const avgP95 = report.performanceMetrics.reduce((sum, m) => sum + m.p95, 0) / report.performanceMetrics.length;
    console.log('⚡ Performance:');
    console.log('   ─────────────────────────────────────────────');
    console.log(`   Average P95 Latency: ${Math.round(avgP95)}ms`);
    console.log('');
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('🎯 Recommendations:');
    console.log('   ─────────────────────────────────────────────');
    for (const rec of report.recommendations.slice(0, 5)) {
      console.log(`   ${rec}`);
    }
    if (report.recommendations.length > 5) {
      console.log(`   ... and ${report.recommendations.length - 5} more`);
    }
    console.log('');
  }

  // Final verdict
  console.log('🏁 Final Verdict:');
  console.log('   ─────────────────────────────────────────────');
  if (summary.failed > 0) {
    console.log('   ❌ VERIFICATION FAILED');
    console.log('   ⚠️  DO NOT DEPLOY - Critical issues detected');
  } else if (summary.warnings > 0) {
    console.log('   ⚠️  VERIFICATION PASSED WITH WARNINGS');
    console.log('   📋 Review warnings before deployment');
  } else {
    console.log('   ✅ VERIFICATION PASSED');
    console.log('   🚀 System is production-ready');
  }
  console.log('');
}

/**
 * Helper: Get status emoji
 */
function getStatusEmoji(value: number, total: number): string {
  const percent = (value / total) * 100;
  if (percent >= 95) return '🟢';
  if (percent >= 80) return '🟡';
  return '🔴';
}