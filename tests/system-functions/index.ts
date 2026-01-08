/**
 * System Functions Test Suite Runner
 */

import { SystemFunctionsTestSuite } from "./systemFunctionsTest";
import { generateMarkdownReport } from "./reportGenerator";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("🚀 Initializing Avalo System Functions Test Suite...\n");

  const suite = new SystemFunctionsTestSuite();
  
  try {
    const report = await suite.runAllTests();

    // Save JSON report
    const jsonPath = join(__dirname, "../../reports/system_functions_test.json");
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 JSON report saved to: ${jsonPath}`);

    // Generate and save Markdown report
    const markdown = generateMarkdownReport(report);
    const mdPath = join(__dirname, "../../reports/system_functions_test.md");
    writeFileSync(mdPath, markdown);
    console.log(`📄 Markdown report saved to: ${mdPath}`);

    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Fatal error running test suite:", error);
    process.exit(1);
  }
}

main();