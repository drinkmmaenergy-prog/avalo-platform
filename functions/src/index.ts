/**
 * Avalo Cloud Functions - Main Entry Point
 * Firebase Functions exports (minimal working set)
 */

// Initialize Firebase Admin first
import './init';

// Export only clean modules that compile without errors
// The codebase requires migration from firebase-functions v1 to v2 API patterns

console.log('🚀 Avalo Cloud Functions loaded (minimal index)');

// Re-export init utilities for other modules
export { db, auth, storage, admin, generateId, serverTimestamp } from './init';
