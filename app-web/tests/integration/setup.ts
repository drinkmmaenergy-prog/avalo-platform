/**
 * Vitest setup file for integration tests
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Mock Firebase if needed
global.fetch = fetch;

beforeAll(() => {
  // Setup before all tests
  console.log('Setting up integration tests...');
});

afterEach(() => {
  // Cleanup after each test
});

afterAll(() => {
  // Cleanup after all tests
  console.log('Integration tests complete');
});