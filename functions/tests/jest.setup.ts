import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

function ensureAdmin() {
  if (admin.apps.length === 0) {
    admin.initializeApp()
  }
  // Enable emulator if user runs it (doesn't start emulator here)
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
  }
}

function getDb() {
  ensureAdmin()
  return admin.firestore()
}

async function setupTestEnvironment() {
  ensureAdmin()
}

const testData = {
  generateUserId() {
    return 'test_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
  }
}

async function createTestUser(id: string, data: any = {}) {
  const db = getDb()
  await db.collection('users').doc(id).set({
    tokens: 0,
    createdAt: now(),
    ...data
  })
  return { id, ...data }
}

async function createTestTransaction(userId: string, amount: number, type: string) {
  const db = getDb()
  await db.collection('transactions').add({
    userId,
    amount,
    type,
    createdAt: now()
  })
}

function now() {
  return Timestamp.now()
}
function minutesAgo(m: number) {
  return Timestamp.fromMillis(Date.now() - m * 60_000)
}
function hoursAgo(h: number) {
  return Timestamp.fromMillis(Date.now() - h * 3_600_000)
}
function daysAgo(d: number) {
  return Timestamp.fromMillis(Date.now() - d * 86_400_000)
}

// Attach to global for legacy tests that assume globals
;(globalThis as any).getDb = getDb
;(globalThis as any).setupTestEnvironment = setupTestEnvironment
;(globalThis as any).testData = testData
;(globalThis as any).createTestUser = createTestUser
;(globalThis as any).createTestTransaction = createTestTransaction
;(globalThis as any).now = now
;(globalThis as any).minutesAgo = minutesAgo
;(globalThis as any).hoursAgo = hoursAgo
;(globalThis as any).daysAgo = daysAgo
