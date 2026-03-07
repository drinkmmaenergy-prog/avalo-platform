/**
 * Jest test setup — runs before each test file.
 *
 * Sets environment variables to simulate emulator/dev mode
 * so startupValidator does NOT throw during tests.
 */

process.env.FUNCTIONS_EMULATOR = 'true';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'test';

import { getDb, setupTestEnvironment, testData, createTestUser, createTestTransaction, now, minutesAgo, hoursAgo, daysAgo } from '../src/testUtils'
