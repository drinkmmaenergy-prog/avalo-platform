#!/usr/bin/env node
/**
 * ========================================================================
 * AVALO FIREBASE FULL INTEGRATION TEST - MAIN RUNNER
 * ========================================================================
 * Automated test suite for verifying all Firebase services, functions,
 * and integrations for the Avalo platform.
 * 
 * Usage:
 *   ts-node tests/integration/index.ts
 *   
 * Or compile and run:
 *   npx tsc tests/integration/index.ts && node tests/integration/index.js
 * ========================================================================
 */

import * as path from 'path';
import { AvaloIntegrationTestSuite } from './testSuite';
import { saveReport, formatDuration } from './utils';

async function main() {
  console.clear();
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║          🔥 AVALO FIREBASE FULL INTEGRATION TEST SUITE 🔥             ║
║                                                                        ║
║  Project: Avalo                                                       ║
║  Firebase Project ID: avalo-c8c46                                     ║
║  Region: europe-west3                                                 ║
║  Framework: Firebase Functions v2 (Node 20 + TypeScript 5.6)         ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

  console.log('Starting comprehensive test suite...\n');
  console.log('This will test:');
  console.log('  1. ✅ Environment validation');
  console.log('  2. 🔨 Build & deployment');
  console.log('  3. 🎮 Emulator suite');
  console.log('  4. 🌐 HTTP function endpoints');
  console.log('  5. 💳 Stripe integration');
  console.log('  6. 🗄️  Firestore validation');
  console.log('  7. 🔐 Authentication');
  console.log('  8. 📦 Storage');
  console.log('  9. 🤖 AI services');
  console.log('  10. ⚡ Health & performance');
  console.log('  11. 🔒 Security\n');
  console.log('═'.repeat(75));
  console.log('');

  const suite = new AvaloIntegrationTestSuite();
  
  try {
    // Run all tests
    const report = await suite.runAll();
    
    // Display summary
    console.log('');
    console.log('═'.repeat(75));
    console.log('');
    console.log('📊 TEST SUMMARY');
    console.log('   ────────────\n');
    console.log(`   Total Tests:    ${report.totalTests}`);
    console.log(`   ✅ Passed:      ${report.passed}`);
    console.log(`   🔥 Failed:      ${report.failed}`);
    console.log(`   ⚠️  Warnings:    ${report.warnings}`);
    console.log(`   ⏭️  Skipped:     ${report.skipped}`);
    console.log(`   ⏱️  Duration:    ${formatDuration(report.duration)}`);
    
    const passRate = report.totalTests > 0 
      ? ((report.passed / report.totalTests) * 100).toFixed(2) 
      : '0.00';
    console.log(`   📈 Pass Rate:   ${passRate}%\n`);
    
    // Save report
    const reportPath = path.join(process.cwd(), 'reports', 'avalo_full_test_report.md');
    saveReport(report, reportPath);
    
    console.log(`   📄 Report saved to: ${reportPath}`);
    console.log(`   📄 JSON saved to: ${reportPath.replace('.md', '.json')}\n`);
    
    console.log('═'.repeat(75));
    console.log('');
    
    // Exit with appropriate code
    if (report.failed > 0) {
      console.log('❌ Tests completed with failures\n');
      process.exit(1);
    } else if (report.warnings > 0) {
      console.log('⚠️  Tests completed with warnings\n');
      process.exit(0);
    } else {
      console.log('✅ All tests passed successfully!\n');
      process.exit(0);
    }
    
  } catch (error: any) {
    console.error('');
    console.error('═'.repeat(75));
    console.error('');
    console.error('💥 FATAL ERROR');
    console.error('   ───────────\n');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('═'.repeat(75));
    console.error('');
    process.exit(1);
  }
}

// Run the test suite
main();