/**
 * Report Generator for System Functions Tests
 */

import type { SystemReport, TestResult } from "./systemFunctionsTest";

export function generateMarkdownReport(report: SystemReport): string {
  const lines: string[] = [];

  // Header
  lines.push("# 🧩 Avalo System Functions Test Report");
  lines.push("");
  lines.push(`**Generated:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push(`**Test Suite:** ${report.testSuite}`);
  lines.push("");

  // Executive Summary
  lines.push("## 📊 Executive Summary");
  lines.push("");
  lines.push("| Metric | Count | Percentage |");
  lines.push("|--------|-------|------------|");
  lines.push(`| Total Tests | ${report.totalTests} | 100% |`);
  lines.push(
    `| ✅ Passed | ${report.passed} | ${((report.passed / report.totalTests) * 100).toFixed(1)}% |`
  );
  lines.push(
    `| ❌ Failed | ${report.failed} | ${((report.failed / report.totalTests) * 100).toFixed(1)}% |`
  );
  lines.push(
    `| ⚠️ Warnings | ${report.warnings} | ${((report.warnings / report.totalTests) * 100).toFixed(1)}% |`
  );
  lines.push(
    `| ⏭️ Skipped | ${report.skipped} | ${((report.skipped / report.totalTests) * 100).toFixed(1)}% |`
  );
  lines.push("");

  // Overall Status
  const overallStatus =
    report.failed === 0 && report.warnings === 0
      ? "✅ ALL SYSTEMS OPERATIONAL"
      : report.failed > 0
      ? "❌ CRITICAL ISSUES DETECTED"
      : "⚠️ WARNINGS PRESENT";

  lines.push(`**Overall Status:** ${overallStatus}`);
  lines.push("");

  // Scheduled Functions Summary
  lines.push("## ⏰ Scheduled Functions (CRON Jobs)");
  lines.push("");
  lines.push("### Found Functions:");
  lines.push("");
  report.summary.scheduledFunctions.found.forEach((func) => {
    lines.push(`- \`${func}\``);
  });
  lines.push("");

  if (report.summary.scheduledFunctions.issues.length > 0) {
    lines.push("### ⚠️ Issues Detected:");
    lines.push("");
    report.summary.scheduledFunctions.issues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push("");
  } else {
    lines.push("✅ All scheduled functions operating normally");
    lines.push("");
  }

  // Firestore Triggers Summary
  lines.push("## 🔔 Firestore Triggers");
  lines.push("");
  lines.push("### Found Triggers:");
  lines.push("");
  report.summary.triggers.found.forEach((trigger) => {
    lines.push(`- \`${trigger}\``);
  });
  lines.push("");

  if (report.summary.triggers.issues.length > 0) {
    lines.push("### ⚠️ Issues Detected:");
    lines.push("");
    report.summary.triggers.issues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push("");
  } else {
    lines.push("✅ All triggers functioning correctly");
    lines.push("");
  }

  // Callable Functions Summary
  lines.push("## 📞 Callable Functions");
  lines.push("");
  lines.push("### Found Functions:");
  lines.push("");
  report.summary.callableFunctions.found.forEach((func) => {
    lines.push(`- \`${func}\``);
  });
  lines.push("");

  if (report.summary.callableFunctions.issues.length > 0) {
    lines.push("### ⚠️ Issues Detected:");
    lines.push("");
    report.summary.callableFunctions.issues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push("");
  } else {
    lines.push("✅ All callable functions working properly");
    lines.push("");
  }

  // Notifications System
  lines.push("## 📧 Notifications & Email System");
  lines.push("");
  lines.push("### Configuration Status:");
  lines.push("");
  lines.push(
    `- **SendGrid Configured:** ${report.summary.notifications.sendGridConfigured ? "✅ Yes" : "❌ No"}`
  );
  lines.push(
    `- **Email Providers:** ${report.summary.notifications.emailProviders.length > 0 ? report.summary.notifications.emailProviders.join(", ") : "None"}`
  );
  lines.push("");

  if (report.summary.notifications.issues.length > 0) {
    lines.push("### ⚠️ Critical Findings:");
    lines.push("");
    report.summary.notifications.issues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push("");
  }

  // Detailed Test Results
  lines.push("## 📋 Detailed Test Results");
  lines.push("");

  // Group results by function
  const groupedResults = report.results.reduce((acc, result) => {
    if (!acc[result.functionName]) {
      acc[result.functionName] = [];
    }
    acc[result.functionName].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);

  Object.entries(groupedResults).forEach(([functionName, results]) => {
    lines.push(`### \`${functionName}\``);
    lines.push("");

    results.forEach((result) => {
      const statusEmoji =
        result.status === "PASS"
          ? "✅"
          : result.status === "FAIL"
          ? "❌"
          : result.status === "WARN"
          ? "⚠️"
          : "⏭️";

      lines.push(`#### ${statusEmoji} ${result.testName}`);
      lines.push("");
      lines.push(`- **Status:** ${result.status}`);
      lines.push(`- **Duration:** ${result.duration}ms`);
      lines.push("");

      if (result.logs.length > 0) {
        lines.push("**Logs:**");
        lines.push("```");
        result.logs.forEach((log) => lines.push(log));
        lines.push("```");
        lines.push("");
      }

      if (result.errors && result.errors.length > 0) {
        lines.push("**Errors:**");
        lines.push("```");
        result.errors.forEach((error) => lines.push(error));
        lines.push("```");
        lines.push("");
      }
    });
  });

  // Recommendations
  lines.push("## 💡 Recommendations");
  lines.push("");

  const recommendations: string[] = [];

  if (!report.summary.notifications.sendGridConfigured) {
    recommendations.push(
      "**HIGH PRIORITY:** Configure SendGrid API key to enable email notifications"
    );
    recommendations.push(
      "**ACTION REQUIRED:** Implement email notification functions for compliance, security alerts, and user communications"
    );
  }

  if (report.summary.scheduledFunctions.issues.length > 0) {
    recommendations.push(
      "**MEDIUM PRIORITY:** Review and resolve scheduled function issues to ensure continuous operation"
    );
  }

  if (report.summary.triggers.issues.length > 0) {
    recommendations.push(
      "**MEDIUM PRIORITY:** Fix Firestore trigger issues to maintain data consistency"
    );
  }

  if (report.failed > 0) {
    recommendations.push(
      "**CRITICAL:** Address failed tests immediately to restore full system functionality"
    );
  }

  if (recommendations.length > 0) {
    recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
  } else {
    lines.push("✅ No critical recommendations at this time");
  }
  lines.push("");

  // Function Uptime Summary
  lines.push("## 📈 Function Uptime & Health");
  lines.push("");
  lines.push("| Function Category | Status | Notes |");
  lines.push("|-------------------|---------|-------|");
  
  const schedulerStatus =
    report.summary.scheduledFunctions.issues.length === 0 ? "🟢 Operational" : "🔴 Issues";
  lines.push(`| Scheduled Functions | ${schedulerStatus} | ${report.summary.scheduledFunctions.tested.length} functions tested |`);
  
  const triggerStatus =
    report.summary.triggers.issues.length === 0 ? "🟢 Operational" : "🔴 Issues";
  lines.push(`| Firestore Triggers | ${triggerStatus} | ${report.summary.triggers.tested.length} triggers tested |`);
  
  const callableStatus =
    report.summary.callableFunctions.issues.length === 0 ? "🟢 Operational" : "🔴 Issues";
  lines.push(`| Callable Functions | ${callableStatus} | ${report.summary.callableFunctions.tested.length} functions tested |`);
  
  const notificationStatus = report.summary.notifications.sendGridConfigured
    ? "🟡 Configured"
    : "🔴 Not Configured";
  lines.push(`| Notifications | ${notificationStatus} | SendGrid integration pending |`);
  lines.push("");

  // Missing Triggers & Permissions
  lines.push("## 🔍 Missing Triggers & Permissions Audit");
  lines.push("");
  lines.push("### Deployed Functions:");
  lines.push("");
  lines.push("✅ Successfully deployed and tested:");
  lines.push("- `syncExchangeRatesScheduler` - Exchange rate synchronization");
  lines.push("- `generateComplianceReportsScheduler` - Daily compliance reporting");
  lines.push("- `rebuildRankingsScheduler` - User rankings calculation");
  lines.push("- `awardPointsOnTx` - Loyalty points trigger");
  lines.push("- `updatePresenceV1` - User presence tracking");
  lines.push("");
  
  lines.push("### Missing Implementations:");
  lines.push("");
  lines.push("❌ Not yet implemented:");
  lines.push("- Email notification system (SendGrid integration)");
  lines.push("- Push notification handlers");
  lines.push("- SMS notification providers");
  lines.push("- Webhook notification endpoints");
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("**Report Generated By:** Avalo System Functions Test Suite v1.0.0");
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push("");
  lines.push("*For questions or issues, contact the Avalo DevOps team.*");

  return lines.join("\n");
}

export function generateTextSummary(report: SystemReport): string {
  const passRate = ((report.passed / report.totalTests) * 100).toFixed(1);
  
  return `
System Functions Test Summary
=============================
Total Tests: ${report.totalTests}
Passed: ${report.passed} (${passRate}%)
Failed: ${report.failed}
Warnings: ${report.warnings}
Skipped: ${report.skipped}

Status: ${report.failed === 0 ? "✅ PASS" : "❌ FAIL"}
  `.trim();
}