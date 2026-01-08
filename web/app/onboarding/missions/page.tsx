'use client';

/**
 * PACK 206C — Web Onboarding Missions Welcome
 * Initial welcome page before starting missions
 */

import React from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingWelcomePage() {
  const router = useRouter();

  const handleStart = () => {
    router.push('/onboarding/missions/day1');
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Welcome to Avalo</h1>
          <p className="text-gray-400 text-lg">
            Let's set up your profile to attract the right connections
          </p>
        </div>

        <div className="space-y-4 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="text-4xl mb-3">✨</div>
            <h3 className="text-xl font-semibold mb-2">Day 1: Magnetic Profile</h3>
            <p className="text-gray-400">
              Create an attractive profile that stands out
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="text-4xl mb-3">💫</div>
            <h3 className="text-xl font-semibold mb-2">Day 2: Start the Spark</h3>
            <p className="text-gray-400">
              Begin meaningful interactions with others
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="text-4xl mb-3">🔥</div>
            <h3 className="text-xl font-semibold mb-2">Day 3: Heat Up the Connection</h3>
            <p className="text-gray-400">
              Take your connections to the next level
            </p>
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}