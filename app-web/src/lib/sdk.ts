/**
 * Avalo SDK — Client-side wrapper for Firebase Auth & Firestore operations.
 *
 * Provides typed, safe wrappers for:
 * - Authentication (email/password, Google, Apple)
 * - User profile loading
 * - Sign-out
 *
 * All auth state changes propagate through onAuthStateChanged in AuthProvider.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { User } from '@/types';

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

/**
 * Convert Firestore document data to User type.
 * Handles Timestamp → Date conversion safely.
 */
function toUser(data: Record<string, unknown>): User {
  return {
    uid: (data.uid as string) ?? '',
    email: (data.email as string) ?? null,
    phoneNumber: (data.phoneNumber as string) ?? null,
    displayName: (data.displayName as string) ?? null,
    photoURL: (data.photoURL as string) ?? null,
    handle: data.handle as string | undefined,
    bio: data.bio as string | undefined,
    isCreator: (data.isCreator as boolean) ?? false,
    isVerified: (data.isVerified as boolean) ?? false,
    tokenBalance: (data.tokenBalance as number) ?? 0,
    createdAt: data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
      ? (data.createdAt as { toDate: () => Date }).toDate()
      : new Date(),
    lastActiveAt: data.lastActiveAt && typeof (data.lastActiveAt as { toDate?: () => Date }).toDate === 'function'
      ? (data.lastActiveAt as { toDate: () => Date }).toDate()
      : new Date(),
    region: data.region as string | undefined,
    locale: data.locale as string | undefined,
    nsfwPref: data.nsfwPref as 'SAFE' | 'NSFW' | 'BOTH' | undefined,
    accountStatus: (data.accountStatus as 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED') ?? 'ACTIVE',
    twoFactorEnabled: data.twoFactorEnabled as boolean | undefined,
  };
}

const sdk = {
  /**
   * Sign in with email and password.
   */
  async signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  },

  /**
   * Sign up with email, password, and optional display name.
   * Creates Firebase Auth user only — user doc is created in onboarding.
   */
  async signUpWithEmail(email: string, password: string, displayName?: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && credential.user) {
      await updateProfile(credential.user, { displayName });
    }
    return credential;
  },

  /**
   * Sign in with Google popup.
   * Works for both login and registration — AuthProvider detects new vs existing.
   */
  async signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  },

  /**
   * Sign in with Apple popup.
   */
  async signInWithApple() {
    return signInWithPopup(auth, appleProvider);
  },

  /**
   * Sign out the current user.
   */
  async signOut() {
    return firebaseSignOut(auth);
  },

  /**
   * Load user profile from Firestore users/{uid}.
   * Returns null if the document doesn't exist.
   */
  async getUserProfile(uid: string): Promise<User | null> {
    if (!db) return null;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return toUser(snap.data());
  },

  /**
   * Update user profile fields in Firestore.
   */
  async updateUserProfile(uid: string, updates: Partial<Record<string, unknown>>) {
    if (!db) throw new Error('Firestore not initialized');
    const ref = doc(db, 'users', uid);
    await setDoc(ref, { ...updates, lastActiveAt: serverTimestamp() }, { merge: true });
  },
};

export default sdk;
