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

import { auth, requireDb } from '@/lib/firebase';
import { User } from '@/types';
import sdk from '@/lib/sdk';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  needsOnboarding: false,
  signOut: async () => {},
  refreshUser: async () => {},
  completeOnboarding: async () => {},
});

async function ensureUserDocument(firebaseUser: FirebaseUser): Promise<void> {
  const ref = doc(requireDb(), 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? '',
      role: 'user',
      profileComplete: false,
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

      const profileComplete =
        (profile as User & { profileComplete?: boolean }).profileComplete;

      setNeedsOnboarding(!profileComplete);
    } catch (error) {
      console.error('[Auth] Failed to refresh user profile:', error);
    }
  };

  const completeOnboarding = async () => {
    if (!firebaseUser) return;

    const ref = doc(requireDb(), 'users', firebaseUser.uid);

    await setDoc(
      ref,
      {
        profileComplete: true,
        onboardingCompletedAt: serverTimestamp(),
      },
      { merge: true },
    );

    setNeedsOnboarding(false);
    await refreshUser();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const effectiveUser: FirebaseUser | null = fbUser ?? auth.currentUser;
      setFirebaseUser(effectiveUser);

      if (!effectiveUser) {
        setUser(null);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }

      try {
        await ensureUserDocument(effectiveUser);

        const ref = doc(requireDb(), 'users', effectiveUser.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setNeedsOnboarding(true);
          setUser(null);
          setLoading(false);
          return;
        }

        const profile = await sdk.getUserProfile(effectiveUser.uid);
        setUser(profile);

        const profileComplete =
          (profile as User & { profileComplete?: boolean }).profileComplete;

        setNeedsOnboarding(!profileComplete);
      } catch (error) {
        console.error('[Auth] Bootstrap error:', error);
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