/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        rootDir: '.',
        module: 'commonjs',
        target: 'ES2020',
        lib: ['ES2020'],
        types: ['node', 'jest'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        noImplicitAny: false,
        strictNullChecks: false,
        skipLibCheck: true,
      },
    }],
  },
  // uuid v13 ships ESM — must be transformed by jest
  transformIgnorePatterns: [
    'node_modules/(?!uuid)',
    '\\.pnpm/(?!uuid)',
  ],
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
