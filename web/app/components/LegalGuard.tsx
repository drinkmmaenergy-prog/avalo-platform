/**
 * Legal Guard Component
 * PHASE 30B-3: Legal Acceptance System
 * 
 * Checks legal acceptance status and redirects to /legal/accept if needed
 */

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const LEGAL_VERSIONS = {
  terms: 1,
  privacy: 1,
  community: 1,
  safety: 1,
};

export default function LegalGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Skip check if already on legal accept page
        if (pathname === "/legal/accept") {
          setChecking(false);
          return;
        }

        try {
          // Fetch user's legal acceptance
          const legalAcceptanceRef = doc(db, "legalAcceptance", user.uid);
          const legalAcceptanceDoc = await getDoc(legalAcceptanceRef);

          if (!legalAcceptanceDoc.exists()) {
            // No legal acceptance record, redirect
            router.push("/legal/accept");
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
            // Versions don't match, redirect
            router.push("/legal/accept");
            return;
          }
        } catch (error) {
          console.error("Error checking legal acceptance:", error);
        }
      }

      setChecking(false);
    });

    return () => unsubscribe();
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}