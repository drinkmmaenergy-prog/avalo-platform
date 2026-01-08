/**
 * Creator Goals Page (Web Read-Only)
 * Displays creator's active goals with progress
 * Redirects to mobile app for support functionality
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

interface CreatorGoal {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  category: string;
  targetTokens: number;
  currentTokens: number;
  status: 'active' | 'completed' | 'closed';
  topSupporters: Array<{
    uid: string;
    name: string;
    amount: number;
  }>;
  createdAt: Date;
}

interface CreatorProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  isVerified: boolean;
}

export default function CreatorGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const creatorUid = params?.uid as string;

  const [user, setUser] = useState<User | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [goals, setGoals] = useState<CreatorGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load creator profile
  useEffect(() => {
    if (!creatorUid) return;

    const loadCreator = async () => {
      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("__name__", "==", creatorUid));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setCreatorProfile({
            uid: creatorUid,
            displayName: data.displayName || "Creator",
            photoURL: data.photoURL,
            bio: data.bio,
            isVerified: data.verification?.status === "approved",
          });
        }
      } catch (error) {
        console.error("Error loading creator profile:", error);
      }
    };

    loadCreator();
  }, [creatorUid]);

  // Load creator goals
  useEffect(() => {
    if (!creatorUid) return;

    const loadGoals = async () => {
      try {
        const goalsRef = collection(db, "creatorGoals");
        const q = query(
          goalsRef,
          where("creatorId", "==", creatorUid),
          where("status", "==", "active"),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);
        const goalsList: CreatorGoal[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          goalsList.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as CreatorGoal);
        });

        setGoals(goalsList);
      } catch (error) {
        console.error("Error loading goals:", error);
      }
    };

    loadGoals();
  }, [creatorUid]);

  const handleSupportGoal = (goalId: string) => {
    // Check if mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Deep link to mobile app
      window.location.href = `avalo://creator/goals/${goalId}`;
      // Fallback to app store after 1 second
      setTimeout(() => {
        window.location.href = "https://avalo.app/download";
      }, 1000);
    } else {
      // Show QR code for desktop
      setSelectedGoalId(goalId);
      setShowQRModal(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
            >
              <span>←</span> Wróć
            </button>
            {user && (
              <button
                onClick={() => router.push("/dashboard")}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
              >
                Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Creator Profile */}
        {creatorProfile && (
          <div className="bg-white rounded-2xl shadow-sm p-8 mb-8 bg-gradient-to-r from-cyan-50 to-blue-50">
            <div className="flex items-center gap-6">
              {creatorProfile.photoURL ? (
                <img
                  src={creatorProfile.photoURL}
                  alt={creatorProfile.displayName}
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-white shadow-lg">
                  {creatorProfile.displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  {creatorProfile.displayName}
                  {creatorProfile.isVerified && (
                    <span className="text-blue-500" title="Zweryfikowany twórca">
                      ✓
                    </span>
                  )}
                </h1>
                {creatorProfile.bio && (
                  <p className="text-gray-600 mt-2">{creatorProfile.bio}</p>
                )}
                <div className="flex gap-4 mt-3 text-sm text-gray-500">
                  <span>🎯 {goals.length} aktywnych celów</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="text-3xl">💡</div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-blue-900 mb-2">
                Chcesz wesprzeć cele twórcy?
              </h3>
              <p className="text-blue-700 mb-4">
                Aby wesprzeć cele twórcy tokenami, musisz użyć aplikacji mobilnej Avalo.
              </p>
              <button
                onClick={() => {
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                  if (isMobile) {
                    window.location.href = `avalo://profile/${creatorUid}`;
                    setTimeout(() => {
                      window.location.href = "https://avalo.app/download";
                    }, 1000);
                  } else {
                    alert("Zeskanuj kod QR w aplikacji mobilnej lub pobierz aplikację Avalo");
                  }
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
              >
                Otwórz w aplikacji Avalo
              </button>
            </div>
          </div>
        </div>

        {/* Goals List */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            🎯 Cele twórcy
          </h2>

          {goals.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">🎯</div>
              <p className="text-gray-500 text-lg">
                Ten twórca nie ma jeszcze aktywnych celów.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {goals.map((goal) => {
                const progress = (goal.currentTokens / goal.targetTokens) * 100;

                return (
                  <div
                    key={goal.id}
                    className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition-shadow"
                  >
                    {/* Category Badge */}
                    <div className="inline-block px-3 py-1 bg-cyan-50 text-cyan-600 text-sm font-semibold rounded-lg mb-4">
                      {goal.category}
                    </div>

                    {/* Goal Title & Description */}
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {goal.title}
                    </h3>
                    <p className="text-gray-600 mb-6 line-clamp-3">
                      {goal.description}
                    </p>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-gray-700">
                          Postęp
                        </span>
                        <span className="text-lg font-bold text-cyan-600">
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                        <span>{goal.currentTokens.toLocaleString()} 💎</span>
                        <span>{goal.targetTokens.toLocaleString()} 💎</span>
                      </div>
                    </div>

                    {/* Top Supporters Preview */}
                    {goal.topSupporters && goal.topSupporters.length > 0 && (
                      <div className="border-t border-gray-100 pt-4 mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          🏆 Najlepsi wspierający:
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {goal.topSupporters.slice(0, 3).map((supporter, idx) => (
                            <div
                              key={`${supporter.uid}-${idx}`}
                              className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-sm"
                            >
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                {supporter.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-700">
                                {supporter.name}
                              </span>
                              <span className="text-gray-500">
                                {supporter.amount} 💎
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Support Button */}
                    <button
                      onClick={() => handleSupportGoal(goal.id)}
                      className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-sm"
                    >
                      💎 Wesprzyj w aplikacji
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* QR Code Modal */}
      {showQRModal && selectedGoalId && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowQRModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">
                Zeskanuj kod QR
              </h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className="aspect-square bg-white rounded-lg flex items-center justify-center">
                {/* QR Code would be generated here */}
                <div className="text-center">
                  <div className="text-6xl mb-4">📱</div>
                  <p className="text-gray-600 text-sm">
                    Użyj aparatu w aplikacji Avalo
                    <br />
                    aby zeskanować ten kod
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Lub otwórz link bezpośrednio w aplikacji:
              </p>
              <code className="block bg-gray-100 text-gray-800 px-4 py-2 rounded-lg text-sm break-all">
                avalo://creator/goals/{selectedGoalId}
              </code>
            </div>

            <div className="mt-6 text-center">
              <a
                href="https://avalo.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:text-cyan-700 font-medium text-sm"
              >
                Nie masz aplikacji? Pobierz teraz →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}