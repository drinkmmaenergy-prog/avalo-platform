"use client";

// src/lib/services/authService.ts
//
// Shared auth logic for Avalo Web — mirrors mobile auth flow.
// All functions use the Firebase JS SDK (client-side).
// Firestore user document is created on registration and first Google sign-in.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, requireDb } from '@/lib/firebase';

/**
 * Register a new user with email + password.
 * Creates Firebase Auth user, sets displayName, and writes Firestore users/{uid} document.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Check your environment variables.');
  }
  if (false /* requireDb handles null */) {
    throw new Error('Firestore is not initialized. Check your environment variables.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await updateProfile(user, { displayName });

  await setDoc(doc(requireDb(), 'users', user.uid), {
    uid: user.uid,
    email: user.email,
    displayName,
    photoURL: user.photoURL ?? null,
    phoneNumber: user.phoneNumber ?? null,
    role: 'user',
    isCreator: false,
    isVerified: false,
    tokenBalance: 0,
    accountStatus: 'ACTIVE',
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  });

  return user;
}

/**
 * Sign in an existing user with email + password.
 */
export async function loginWithEmail(
  email: string,
  password: string,
): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Check your environment variables.');
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign in (or register) with Google via popup.
 * If the user doesn't have a Firestore document yet, one is created automatically.
 */
export async function loginWithGoogle(): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Check your environment variables.');
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  const credential = await signInWithPopup(auth, provider);
  const user = credential.user;

  {
    const userDocRef = doc(requireDb(), 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName ?? user.email?.split('@')[0] ?? 'User',
        photoURL: user.photoURL ?? null,
        phoneNumber: user.phoneNumber ?? null,
        role: 'user',
        isCreator: false,
        isVerified: false,
        tokenBalance: 0,
        accountStatus: 'ACTIVE',
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });
    }
  }

  return user;
}

/**
 * Sign out the current user.
 */
export async function logout(): Promise<void> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Check your environment variables.');
  }

  await firebaseSignOut(auth);
}

/**
 * Returns the currently authenticated Firebase user, or null.
 */
export function getCurrentUser(): FirebaseUser | null {
  return auth?.currentUser ?? null;
}


