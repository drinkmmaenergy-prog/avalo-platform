/**
 * Checkout Success Page
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/wallet");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full">
            <svg
              className="w-12 h-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Purchase Successful!
        </h1>

        <p className="text-lg text-gray-600 mb-2">
          Your tokens have been added to your wallet.
        </p>

        <p className="text-sm text-gray-500 mb-8">
          Transaction ID: {sessionId?.slice(0, 20)}...
        </p>

        <div className="space-y-4">
          <Link
            href="/wallet"
            className="block w-full btn-primary"
          >
            Go to Wallet
          </Link>

          <p className="text-sm text-gray-500">
            Redirecting in {countdown} seconds...
          </p>
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            💡 You can now use your tokens in the mobile app to chat and book
            meetings!
          </p>
        </div>
      </div>
    </div>
  );
}
