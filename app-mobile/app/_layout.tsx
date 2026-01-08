import { Slot, useRouter, useSegments } from "expo-router";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/hooks/useToast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { RestrictionGate } from "@/components/RestrictionGate";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const LEGAL_VERSIONS = {
  terms: 1,
  privacy: 1,
  community: 1,
  safety: 1
};

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if we're already on the legal accept page
        const inLegalAccept = segments[0] === 'legal' && segments[1] === 'accept';
        
        if (!inLegalAccept) {
          try {
            // Fetch user's legal acceptance
            const legalAcceptanceRef = doc(db, 'legalAcceptance', user.uid);
            const legalAcceptanceDoc = await getDoc(legalAcceptanceRef);

            if (!legalAcceptanceDoc.exists()) {
              // No legal acceptance record, redirect to accept page
              router.replace('/legal/accept');
              setChecking(false);
              return;
            }

            const data = legalAcceptanceDoc.data();
            
            // Check if versions match
            const needsUpdate =
              data.termsVersion !== LEGAL_VERSIONS.terms ||
              data.privacyVersion !== LEGAL_VERSIONS.privacy ||
              data.communityVersion !== LEGAL_VERSIONS.community ||
              data.safetyVersion !== LEGAL_VERSIONS.safety;

            if (needsUpdate) {
              // Versions don't match, redirect to accept page
              router.replace('/legal/accept');
              setChecking(false);
              return;
            }
          } catch (error) {
            console.error('Error checking legal acceptance:', error);
          }
        }
      }
      
      setChecking(false);
    });

    return () => unsubscribe();
  }, [segments]);

  if (checking) {
    return null; // Or a loading screen
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <ToastProvider>
          <AuthProvider>
            <NavigationGuard>
              <RestrictionGate>
                <Slot />
              </RestrictionGate>
            </NavigationGuard>
          </AuthProvider>
        </ToastProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
