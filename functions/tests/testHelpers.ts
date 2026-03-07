import admin from "firebase-admin";

export function getDb(){
  if(!admin.apps.length){
    admin.initializeApp();
  }
  return admin.firestore();
}

export async function setupTestEnvironment(){
  process.env.FIRESTORE_EMULATOR_HOST="localhost:8080";
}

export const testData = {
  generateUserId(){
    return "user_" + Math.random().toString(36).substring(2,10);
  }
};

export async function createTestUser(id,data={}){
  const db=getDb();
  await db.collection("users").doc(id).set({
    tokens:0,
    createdAt:new Date(),
    ...data
  });
}

export async function createTestTransaction(userId,amount,type){
  const db=getDb();
  await db.collection("transactions").add({
    userId,
    amount,
    type,
    createdAt:new Date()
  });
}

export function now(){
  return new Date();
}

export function minutesAgo(m){
  return new Date(Date.now()-m*60000);
}

export function hoursAgo(h){
  return new Date(Date.now()-h*3600000);
}

export function daysAgo(d){
  return new Date(Date.now()-d*86400000);
}

import { getDb, setupTestEnvironment, testData, createTestUser, createTestTransaction, now, minutesAgo, hoursAgo, daysAgo } from '../src/testUtils'
