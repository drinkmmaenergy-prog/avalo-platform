/**
 * Jest configuration with project-level tsconfig separation (V5).
 *
 * The rules suite uses tsconfig.rules.json (moduleResolution:bundler) so that
 * `import { doc, setDoc } from 'firebase/firestore'` resolves the package.json
 * exports field correctly. All other tests use tsconfig.test.json.
 */
/**
 * ARCHIVE — A3 complete. 11 ARCHIVE_TEST_ONLY files replaced with test.skip stubs.
 * 2 CANONICAL_REWRITE files fixed and restored to active discovery.
 * Full classification: tests-archived/legacy-v8/AUDIT_TABLE.md
 *
 * ARCHIVED_TESTS array is now empty — all 11 stubs contain a single test.skip
 * so Jest discovers them without error and reports them as skipped.
 *
 * DO NOT add files back here. Fix them or stub them instead.
 */
const ARCHIVED_TESTS = [];

module.exports = {
  // Global timeout: 2 min for emulator-backed tests (testTimeout is top-level only in Jest 29)
  testTimeout: 120000,

  projects: [
    // ── Main: integration + unit tests ───────────────────────────────────────
    {
      displayName:     'main',
      preset:          'ts-jest',
      testEnvironment: 'node',
      maxWorkers:      1,
      setupFiles:      ['<rootDir>/tests/setupFirestore.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.ts',
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/schedulers/**/*.test.ts',
        '<rootDir>/tests/callable/**/*.test.ts',
        // Fixed (Economy v10 validation): was '<rootDir>/__tests__/**' which
        // matched a non-existent directory, making every suite in
        // src/__tests__ (economy, chat engine, wallet security, …) invisible
        // to Jest — `npx jest src/__tests__/...` reported "No tests found".
        '<rootDir>/src/__tests__/**/*.test.ts',
      ],
      testPathIgnorePatterns: ARCHIVED_TESTS,
    },
    // ── Rules: Firestore Security Rules tests ─────────────────────────────────
    // Uses tsconfig.rules.json (moduleResolution:bundler) so that
    // `import { doc, setDoc } from 'firebase/firestore'` resolves correctly via
    // the package.json exports field. Normal TypeScript imports (no require hacks).
    {
      displayName:     'rules',
      preset:          'ts-jest',
      testEnvironment: 'node',
      maxWorkers:      1,
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.rules.json' }],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: [
        '<rootDir>/tests/rules/**/*.test.ts',
        '<rootDir>/tests/storage/**/*.test.ts',
      ],
    },
  ],
};
