'use client';

/**
 * Account Service — Client-side account management operations.
 *
 * Provides: profile update, password change, session tracking,
 * and GDPR-compliant account deletion.
 *
 * Uses existing Firebase singletons from @/lib/firebase.
 * Does NOT modify authService.ts — this is an additive service.
 */

import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, requireDb } from '@/lib/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileUpdatePayload {
  displayName?: string;
  bio?: string;
  photoURL?: string;
  /** BUG 7: city → users/{uid}.location.city + public_profiles/{uid}.location.city */
  city?: string;
  /** BUG 7: gender → users/{uid}.profile.gender + public_profiles/{uid}.profile.gender */
  gender?: string;
  /** BUG 7: lookingFor → users/{uid}.preferences.lookingFor */
  lookingFor?: string[];
  /** BUG 7: interests → users/{uid}.profile.interests + public_profiles/{uid}.profile.interests */
  interests?: string[];
}

export interface SessionInfo {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  lastActiveAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

export interface DeletionRequest {
  uid: string;
  email: string | null;
  reason: string;
  requestedAt: ReturnType<typeof serverTimestamp>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
  gdprCompliant: true;
  dataCategories: string[];
}

// ---------------------------------------------------------------------------
// Profile Update
// ---------------------------------------------------------------------------

/**
 * Update the user's profile in both Firebase Auth and Firestore users/{uid}.
 */
export async function updateUserProfile(
  payload: ProfileUpdatePayload,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated. Please sign in.');
  }

  // Update Firebase Auth profile (displayName, photoURL)
  const authUpdate: { displayName?: string; photoURL?: string } = {};
  if (payload.displayName !== undefined) {
    authUpdate.displayName = payload.displayName;
  }
  if (payload.photoURL !== undefined) {
    authUpdate.photoURL = payload.photoURL;
  }

  if (Object.keys(authUpdate).length > 0) {
    await updateProfile(user, authUpdate);
  }

  // Update Firestore — Collection 1: users/{uid}
  const firestoreUpdate: Record<string, any> = {
    lastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.displayName !== undefined) {
    firestoreUpdate.displayName = payload.displayName;
  }
  if (payload.bio !== undefined) {
    firestoreUpdate.bio = payload.bio;
  }
  if (payload.photoURL !== undefined) {
    firestoreUpdate.photoURL = payload.photoURL;
  }
  // BUG 7: location, gender, preferences, interests
  if (payload.city !== undefined) {
    firestoreUpdate['location.city'] = payload.city;
  }
  if (payload.gender !== undefined) {
    firestoreUpdate['profile.gender'] = payload.gender;
  }
  if (payload.lookingFor !== undefined) {
    firestoreUpdate['preferences.lookingFor'] = payload.lookingFor;
  }
  if (payload.interests !== undefined) {
    firestoreUpdate['profile.interests'] = payload.interests;
  }

  const db = requireDb();
  const userRef = doc(db, 'users', user.uid);
  await setDoc(userRef, firestoreUpdate, { merge: true });

  // Also write to Collection 2: public_profiles/{uid}
  // so that displayName, bio, location, gender, interests are visible on the public profile
  const publicUpdate: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  if (payload.displayName !== undefined) {
    publicUpdate.displayName = payload.displayName;
  }
  if (payload.bio !== undefined) {
    publicUpdate.bio = payload.bio;
  }
  // BUG 7: sync to public_profiles
  if (payload.city !== undefined) {
    publicUpdate['location.city'] = payload.city;
  }
  if (payload.gender !== undefined) {
    publicUpdate['profile.gender'] = payload.gender;
  }
  if (payload.interests !== undefined) {
    publicUpdate['profile.interests'] = payload.interests;
  }

  if (Object.keys(publicUpdate).length > 1) {
    const publicRef = doc(db, 'public_profiles', user.uid);
    await setDoc(publicRef, publicUpdate, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Password Change
// ---------------------------------------------------------------------------

/**
 * Change the current user's password.
 * Requires re-authentication with current password first (Firebase security requirement).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated. Please sign in.');
  }

  if (!user.email) {
    throw new Error('No email associated with this account. Password change is only available for email/password accounts.');
  }

  // Check that user has email/password provider
  const hasPasswordProvider = user.providerData.some(
    (p) => p.providerId === 'password',
  );
  if (!hasPasswordProvider) {
    throw new Error('Your account uses social login (Google/Apple). Password change is not available.');
  }

  // Re-authenticate with current password
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  // Update password
  await updatePassword(user, newPassword);
}

// ---------------------------------------------------------------------------
// Session Tracking
// ---------------------------------------------------------------------------

/**
 * Record the current session in Firestore for the sessions list.
 */
export async function recordSession(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const sessionRef = doc(requireDb(), 'users', user.uid, 'sessions', sessionId);

  await setDoc(sessionRef, {
    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    ipAddress: 'client-side', // IP is typically captured server-side
    lastActiveAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // Store current session ID in sessionStorage for identification
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('avalo_session_id', sessionId);
  }

  return sessionId;
}

/**
 * Get list of active sessions for the current user.
 */
export async function getActiveSessions(): Promise<SessionInfo[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const sessionsRef = collection(requireDb(), 'users', user.uid, 'sessions');
  const q = query(sessionsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const currentSessionId =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('avalo_session_id')
      : null;

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      deviceInfo: data.deviceInfo ?? 'Unknown device',
      ipAddress: data.ipAddress ?? 'Unknown',
      lastActiveAt: data.lastActiveAt instanceof Timestamp
        ? data.lastActiveAt.toDate()
        : new Date(),
      createdAt: data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
      isCurrent: d.id === currentSessionId,
    };
  });
}

/**
 * Remove a specific session (sign out that device).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const sessionRef = doc(requireDb(), 'users', user.uid, 'sessions', sessionId);
  await deleteDoc(sessionRef);
}

// ---------------------------------------------------------------------------
// GDPR-Compliant Account Deletion
// ---------------------------------------------------------------------------

/**
 * Full GDPR-compliant account deletion.
 *
 * Steps:
 * 1. Re-authenticate user (required by Firebase for sensitive operations).
 * 2. Write deletion request to Firestore `deletion_requests/{uid}`.
 * 3. Mark user document as DELETED in Firestore.
 * 4. Delete Firebase Auth user via `deleteUser()`.
 *
 * The deletion_requests document persists for audit/GDPR compliance even
 * after the auth user is removed.
 */
export async function deleteAccount(
  password: string,
  reason: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated. Please sign in.');
  }

  // Re-authenticate for sensitive operation
  if (user.email) {
    const hasPasswordProvider = user.providerData.some(
      (p) => p.providerId === 'password',
    );

    if (hasPasswordProvider) {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    }
  }

  const db = requireDb();
  const uid = user.uid;

  // Step 1: Write GDPR deletion request
  const deletionRef = doc(db, 'deletion_requests', uid);
  const deletionRequest: DeletionRequest = {
    uid,
    email: user.email,
    reason: reason || 'User requested account deletion',
    requestedAt: serverTimestamp(),
    status: 'PENDING',
    gdprCompliant: true,
    dataCategories: [
      'profile_data',
      'auth_data',
      'chat_history',
      'media_uploads',
      'transaction_history',
      'session_data',
      'preferences',
    ],
  };
  await setDoc(deletionRef, deletionRequest);

  // Step 2: Mark user document as DELETED
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    accountStatus: 'DELETED',
    deletedAt: serverTimestamp(),
    email: null,
    displayName: '[Deleted User]',
    photoURL: null,
    bio: null,
    phoneNumber: null,
  });

  // Step 3: Clean up sessions
  try {
    const sessionsRef = collection(db, 'users', uid, 'sessions');
    const sessionsSnap = await getDocs(sessionsRef);
    const deletions = sessionsSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletions);
  } catch {
    // Session cleanup failure should not block deletion
    console.warn('[AccountService] Failed to clean up sessions during deletion');
  }

  // Step 4: Delete Firebase Auth user (must be last — irreversible)
  await deleteUser(user);
}

/**
 * Delete account for OAuth users (Google/Apple) who don't have a password.
 * These users need a different re-authentication flow.
 */
export async function deleteAccountOAuth(reason: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated. Please sign in.');
  }

  const db = requireDb();
  const uid = user.uid;

  // Write GDPR deletion request
  const deletionRef = doc(db, 'deletion_requests', uid);
  const deletionRequest: DeletionRequest = {
    uid,
    email: user.email,
    reason: reason || 'User requested account deletion',
    requestedAt: serverTimestamp(),
    status: 'PENDING',
    gdprCompliant: true,
    dataCategories: [
      'profile_data',
      'auth_data',
      'chat_history',
      'media_uploads',
      'transaction_history',
      'session_data',
      'preferences',
    ],
  };
  await setDoc(deletionRef, deletionRequest);

  // Mark user document as DELETED
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    accountStatus: 'DELETED',
    deletedAt: serverTimestamp(),
    email: null,
    displayName: '[Deleted User]',
    photoURL: null,
    bio: null,
    phoneNumber: null,
  });

  // Clean up sessions
  try {
    const sessionsRef = collection(db, 'users', uid, 'sessions');
    const sessionsSnap = await getDocs(sessionsRef);
    const deletions = sessionsSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletions);
  } catch {
    console.warn('[AccountService] Failed to clean up sessions during deletion');
  }

  // Delete Firebase Auth user
  await deleteUser(user);
}

// ---------------------------------------------------------------------------
// Discovery & Privacy Settings
// ---------------------------------------------------------------------------

export type DiscoveryRadius = 'local' | 'regional' | 'international' | '0-50km' | '50-100km' | '100-300km' | 'entire_country';

export interface PassportLocation {
  city: string;
  lat: number;
  lng: number;
}

export interface DiscoverySettings {
  discoveryRadius: DiscoveryRadius;
  incognito: boolean;
  passportMode: boolean;
  discoverable: boolean;
  passportLocation?: PassportLocation | null;
}

const DEFAULT_DISCOVERY_SETTINGS: DiscoverySettings = {
  discoveryRadius: '50-100km',
  incognito: false,
  passportMode: false,
  discoverable: true,
  passportLocation: null,
};

/**
 * Load discovery & privacy settings from Firestore.
 * Reads from users/{uid} for discoveryRadius, incognito, passportMode
 * and from public_profiles/{uid} for discoverable.
 */
export async function getDiscoverySettings(): Promise<DiscoverySettings> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const db = requireDb();
  const userRef = doc(db, 'users', user.uid);
  const publicRef = doc(db, 'public_profiles', user.uid);

  const [userSnap, publicSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(publicRef),
  ]);

  const userData = userSnap.data();
  const publicData = publicSnap.data();

  return {
    discoveryRadius:
      (userData?.discoveryRadius as DiscoveryRadius) ??
      DEFAULT_DISCOVERY_SETTINGS.discoveryRadius,
    incognito: userData?.incognito ?? DEFAULT_DISCOVERY_SETTINGS.incognito,
    passportMode:
      userData?.passportMode ?? DEFAULT_DISCOVERY_SETTINGS.passportMode,
    discoverable:
      publicData?.discoverable ?? DEFAULT_DISCOVERY_SETTINGS.discoverable,
    passportLocation: userData?.passportLocation ?? null,
  };
}

/**
 * Update the discovery radius setting.
 * Writes to: users/{uid}.discoveryRadius
 */
export async function updateDiscoveryRadius(
  radius: DiscoveryRadius,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const userRef = doc(requireDb(), 'users', user.uid);
  await updateDoc(userRef, {
    discoveryRadius: radius,
    lastActiveAt: serverTimestamp(),
  });
}

/**
 * Update incognito mode.
 * Writes to: users/{uid}.incognito
 */
export async function updateIncognitoMode(enabled: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const userRef = doc(requireDb(), 'users', user.uid);
  await updateDoc(userRef, {
    incognito: enabled,
    lastActiveAt: serverTimestamp(),
  });
}

/**
 * Update passport mode.
 * Writes to: users/{uid}.passportMode
 */
export async function updatePassportMode(enabled: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const userRef = doc(requireDb(), 'users', user.uid);
  await updateDoc(userRef, {
    passportMode: enabled,
    lastActiveAt: serverTimestamp(),
  });
}

/**
 * Update "show me in discovery" setting.
 * Writes to: public_profiles/{uid}.discoverable
 */
export async function updateShowMeInDiscovery(
  enabled: boolean,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const publicRef = doc(requireDb(), 'public_profiles', user.uid);
  await setDoc(publicRef, { discoverable: enabled }, { merge: true });
}

/**
 * Update passport location.
 * Writes to: users/{uid}.passportLocation
 */
export async function updatePassportLocation(
  location: { city: string; lat: number; lng: number } | null,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated.');
  }

  const userRef = doc(requireDb(), 'users', user.uid);
  await updateDoc(userRef, {
    passportLocation: location,
    lastActiveAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if the current user has an email/password provider.
 */
export function hasPasswordProvider(): boolean {
  const user = auth.currentUser;
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * Get the current user's auth provider IDs.
 */
export function getAuthProviders(): string[] {
  const user = auth.currentUser;
  if (!user) return [];
  return user.providerData.map((p) => p.providerId);
}

