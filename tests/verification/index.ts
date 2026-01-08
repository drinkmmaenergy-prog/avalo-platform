/**
 * ========================================================================
 * AVALO POST-DEPLOYMENT VERIFICATION - MAIN ENTRY POINT
 * ========================================================================
 * Executes the complete post-deployment verification suite
 * ========================================================================
 */

import { AvaloPostDeploymentVerificationSuite } from './postDeploymentSuite';
import { saveReports, printSummary } from './reportGenerator';

/**
 * Main execution function
 */
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🔥 AVALO POST-DEPLOYMENT VERIFICATION SUITE             ║');
  console.log('║                                                            ║');
  console.log('║   Comprehensive verification of backend and Firebase       ║');
  console.log('║   environment after automatic fixes                        ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const suite = new AvaloPostDeploymentVerificationSuite();

  try {
    // Run all verification stages
    const report = await suite.runAll();

    // Print summary to console
    printSummary(report);

    // Save reports
    saveReports(report);

    // Exit with appropriate code
    if (report.summary.failed > 0) {
      console.log('\n❌ Verification FAILED - exit code 1\n');
      process.exit(1);
    } else if (report.summary.warnings > 0) {
      console.log('\n⚠️  Verification completed with WARNINGS - exit code 0\n');
      process.exit(0);
    } else {
      console.log('\n✅ Verification PASSED - exit code 0\n');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR during verification:\n');
    console.error(error);
    console.log('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { AvaloPostDeploymentVerificationSuite } from './postDeploymentSuite';
export { saveReports, printSummary, generateMarkdownReport } from './reportGenerator';