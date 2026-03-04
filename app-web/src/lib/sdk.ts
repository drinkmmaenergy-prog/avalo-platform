/**
 * Avalo Web SDK — Client-side auth & profile helpers.
 *
 * Uses Firebase client SDK (signInWithPopup for Google).
 * INVARIANTS:
 *   - Google login MUST use signInWithPopup (NOT redirect).
 *   - signOut clears Firebase auth state.
 *   - getUserProfile reads from Firestore users/{uid}.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, requireDb } from '@/lib/firebase';
import type { User } from '@/types';

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

const sdk = {
  /**
   * Sign in with email + password.
   */
  async signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  },

  /**
   * Register with email + password + optional display name.
   */
  async registerWithEmail(email: string, password: string, displayName?: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
    return cred;
  },

  /**
   * Sign in with Google popup.
   * MUST use signInWithPopup — NOT redirect.
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
   * Send password reset email.
   */
  async sendPasswordReset(email: string) {
    return sendPasswordResetEmail(auth, email);
  },

  /**
   * Sign out current user.
   */
  async signOut() {
    return firebaseSignOut(auth);
  },

  /**
   * Get user profile from Firestore users/{uid}.
   * Returns null-safe User object.
   */
  async getUserProfile(uid: string): Promise<User> {
    const ref = doc(requireDb(), 'users', uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // Return minimal user object if document doesn't exist yet
      return {
        uid,
        email: null,
        phoneNumber: null,
        displayName: null,
        photoURL: null,
        isCreator: false,
        isVerified: false,
        tokenBalance: 0,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        accountStatus: 'ACTIVE',
      };
    }

    const data = snap.data();
    return {
      uid: data.uid ?? uid,
      email: data.email ?? null,
      phoneNumber: data.phoneNumber ?? null,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      handle: data.handle,
      bio: data.bio,
      isCreator: data.isCreator ?? false,
      isVerified: data.isVerified ?? false,
      tokenBalance: data.tokenBalance ?? 0,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      lastActiveAt: data.lastActiveAt?.toDate?.() ?? new Date(),
      region: data.region,
      locale: data.locale,
      nsfwPref: data.nsfwPref,
      accountStatus: data.accountStatus ?? 'ACTIVE',
      twoFactorEnabled: data.twoFactorEnabled,
      role: data.role,
      profileComplete: data.profileComplete,
    } as User & { profileComplete?: boolean };
  },
};

export default sdk;
