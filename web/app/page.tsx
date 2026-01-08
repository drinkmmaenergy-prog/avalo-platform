/**
 * Home Page - SSO Entry Point
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithIdToken, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Check if there's an ID token in URL (SSO from mobile)
        const idToken = searchParams.get("token");

        if (idToken) {
          // Sign in with the ID token
          await signInWithIdToken(idToken);
          // Redirect to wallet after successful sign-in
          router.push("/wallet");
        } else {
          // Check if user is already authenticated
          onAuthStateChanged(auth, (user) => {
            if (user) {
              router.push("/wallet");
            } else {
              setLoading(false);
            }
          });
        }
      } catch (err: any) {
        console.error("Auth error:", err);
        setError(err.message || "Authentication failed");
        setLoading(false);
      }
    };

    handleAuth();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p className="mt-4 text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Authentication Error
          </h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500">
      <div className="text-center text-white px-6">
        <h1 className="text-6xl font-bold mb-4">Avalo</h1>
        <p className="text-2xl mb-8">Token Wallet & Dashboard</p>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 max-w-md mx-auto">
          <p className="text-lg mb-6">
            This web app is accessed from the mobile app. Please use the Avalo
            mobile app to continue.
          </p>
          <div className="text-sm opacity-80">
            <p>To access your wallet:</p>
            <ol className="mt-2 space-y-1 text-left">
              <li>1. Open the Avalo mobile app</li>
              <li>2. Navigate to Wallet tab</li>
              <li>3. Tap "Buy Tokens"</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
