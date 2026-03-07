import admin from "firebase-admin"

export const getDb = () => admin.firestore()

export async function setupTestEnvironment() {
  if (admin.apps.length === 0) {
    admin.initializeApp()
  }
}

export const now = () => admin.firestore.Timestamp.now()

export const minutesAgo = (m:number) =>
  admin.firestore.Timestamp.fromMillis(Date.now() - m * 60000)

export const hoursAgo = (h:number) =>
  admin.firestore.Timestamp.fromMillis(Date.now() - h * 3600000)

export const daysAgo = (d:number) =>
  admin.firestore.Timestamp.fromMillis(Date.now() - d * 86400000)

export const testData = {
  generateUserId() {
    return "test_user_" + Date.now() + "_" + Math.random().toString(36).slice(2)
  }
}

export async function createTestUser(userId:string,data:any={}) {
  const db = getDb()
  await db.collection("users").doc(userId).set({
    tokens:0,
    createdAt:now(),
    ...data
  })
}

export async function createTestTransaction(userId:string,amount:number,type:string){
  const db = getDb()
  await db.collection("wallet_ledger").add({
    userId,
    amount,
    type,
    createdAt:now()
  })
}

import { getDb, setupTestEnvironment, testData, createTestUser, createTestTransaction, now, minutesAgo, hoursAgo, daysAgo } from '../src/testUtils'
