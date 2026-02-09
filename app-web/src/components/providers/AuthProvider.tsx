'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

import {
  User as FirebaseUser,
  onAuthStateChanged,
} from 'firebase/auth';

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import { User } from '@/types';
import sdk from '@/lib/sdk';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  needsOnboarding: false,
  signOut: async () => {},
  refreshUser: async () => {},
  completeOnboarding: () => {},
});

/**
 * Check if users/{uid} exists without creating it.
 * Returns true if the document exists, false otherwise.
 */
async function checkUserDocExists(uid: string): Promise<boolean> {
  if (!db) return false;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * 🔒 KANONICZNY BOOTSTRAP USERA
 * Tworzy users/{uid} ZAWSZE przy pierwszym logowaniu
 */
async function ensureUserDocument(firebaseUser: FirebaseUser): Promise<void> {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? '',
      role: 'user',
      createdAt: serverTimestamp(),
    });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);

  const refreshUser = async () => {
    if (!firebaseUser) return;

    try {
      const profile = await sdk.getUserProfile(firebaseUser.uid);
      setUser(profile);

      // Check if onboarding is complete
      const profileComplete = (profile as User & { profileComplete?: boolean }).profileComplete;
      setNeedsOnboarding(!profileComplete);
    } catch (error) {
      console.error('[Auth] Failed to refresh user profile:', error);
    }
  };

  const completeOnboarding = () => {
    setNeedsOnboarding(false);
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setUser(null);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }

      try {
        // Check if user doc exists
        const exists = await checkUserDocExists(fbUser.uid);

        if (!exists) {
          // New user — needs onboarding
          setNeedsOnboarding(true);
          setUser(null);
          setLoading(false);
          return;
        }

        // Existing user — load profile
        const profile = await sdk.getUserProfile(fbUser.uid);
        setUser(profile);

        // Check profileComplete flag
        const profileComplete = (profile as User & { profileComplete?: boolean }).profileComplete;
        setNeedsOnboarding(!profileComplete);
      } catch (error) {
        console.error('[Auth] Failed to bootstrap/load user:', error);
        // If user doc missing or error, treat as needs onboarding
        setNeedsOnboarding(true);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await sdk.signOut();
    setUser(null);
    setFirebaseUser(null);
    setNeedsOnboarding(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        needsOnboarding,
        signOut: handleSignOut,
        refreshUser,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
