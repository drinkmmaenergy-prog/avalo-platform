/**
 * Creator Content Store Page
 * 18+ gated premium content with token unlocks
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, db, getCurrentIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { UserProfile, CreatorProfile, CreatorContent } from "@/lib/types";

export default function CreatorStorePage() {
  const router = useRouter();
  const params = useParams();
  const creatorUid = params?.uid as string;

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [content, setContent] = useState<CreatorContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [hasNSFWContent, setHasNSFWContent] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Load user profile
  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        const profile = snapshot.data() as UserProfile;
        setUserProfile(profile);
        
        // Check if user is 18+ for NSFW content
        if (!profile.age18Plus && hasNSFWContent) {
          setShowAgeGate(true);
        }
      }
    });

    return () => unsubscribe();
  }, [user, hasNSFWContent]);

  // Load creator profile
  useEffect(() => {
    if (!creatorUid) return;

    const loadCreator = async () => {
      const creatorRef = doc(db, "users", creatorUid);
      const snapshot = await getDocs(query(collection(db, "users"), where("__name__", "==", creatorUid)));
      
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setCreatorProfile({
          uid: creatorUid,
          displayName: data.displayName || "Creator",
          photoURL: data.photoURL,
          bio: data.bio,
          isCreator: data.isCreator || false,
          isVerified: data.verification?.status === "approved",
        });
      }
    };

    loadCreator();
  }, [creatorUid]);

  // Load creator content
  useEffect(() => {
    if (!creatorUid || !user) return;

    const contentRef = collection(db, "creatorContent");
    const q = query(contentRef, where("creatorUid", "==", creatorUid));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const contentList: CreatorContent[] = [];
      let foundNSFW = false;

      for (const doc of snapshot.docs) {
        const data = doc.data() as CreatorContent;
        
        // Check if user purchased this content
        const purchasesRef = collection(db, "contentPurchases");
        const purchaseQuery = query(
          purchasesRef,
          where("userId", "==", user.uid),
          where("contentId", "==", doc.id)
        );
        const purchaseSnapshot = await getDocs(purchaseQuery);
        
        contentList.push({
          ...data,
          id: doc.id,
          isPurchased: !purchaseSnapshot.empty,
        });

        if (data.isNSFW) {
          foundNSFW = true;
        }
      }

      setContent(contentList);
      setHasNSFWContent(foundNSFW);
    });

    return () => unsubscribe();
  }, [creatorUid, user]);

  // Handle content purchase
  const handlePurchase = async (contentId: string, priceTokens: number) => {
    if (!user) return;

    setPurchasing(contentId);
    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        throw new Error("Not authenticated");
      }

      // Call Cloud Function to purchase content
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/purchaseContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ contentId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Purchase failed");
      }

      alert("Content unlocked successfully!");
    } catch (error: any) {
      console.error("Purchase error:", error);
      alert(error.message || "Failed to purchase content");
    } finally {
      setPurchasing(null);
    }
  };

  // Handle age gate confirmation
  const handleAgeConfirmation = async (confirmed: boolean) => {
    if (!user) return;

    if (confirmed) {
      // Update user profile with age18Plus flag
      try {
        const idToken = await getCurrentIdToken();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/updateAge18Plus`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ age18Plus: true }),
          }
        );

        if (response.ok) {
          setShowAgeGate(false);
        }
      } catch (error) {
        console.error("Failed to update age:", error);
      }
    } else {
      router.push("/dashboard");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Age gate modal
  if (showAgeGate && hasNSFWContent) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🔞 Age Verification Required
          </h2>
          <p className="text-gray-700 mb-6">
            This creator's store contains 18+ adult content. You must be 18 years or older to view this content. By clicking "I am 18+", you confirm that you are of legal age.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleAgeConfirmation(true)}
              className="flex-1 btn-primary"
            >
              I am 18+
            </button>
            <button
              onClick={() => handleAgeConfirmation(false)}
              className="flex-1 btn-secondary"
            >
              Exit
            </button>
          </div>
        </div>
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
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-secondary"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Creator Profile */}
        {creatorProfile && (
          <div className="card mb-8 bg-gradient-to-r from-pink-50 to-purple-50">
            <div className="flex items-center gap-6">
              {creatorProfile.photoURL ? (
                <img
                  src={creatorProfile.photoURL}
                  alt={creatorProfile.displayName}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-3xl font-bold">
                  {creatorProfile.displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  {creatorProfile.displayName}
                  {creatorProfile.isVerified && (
                    <span className="text-blue-500" title="Verified Creator">✓</span>
                  )}
                </h1>
                {creatorProfile.bio && (
                  <p className="text-gray-600 mt-2">{creatorProfile.bio}</p>
                )}
                <div className="flex gap-4 mt-3 text-sm text-gray-500">
                  <span>{content.length} items</span>
                  {hasNSFWContent && (
                    <span className="text-red-600 font-semibold">🔞 18+ Content</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Token Balance */}
        {userProfile && (
          <div className="card mb-8 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Your Token Balance</p>
                <p className="text-2xl font-bold text-blue-600">
                  {userProfile.tokenBalance || 0} 🪙
                </p>
              </div>
              <button
                onClick={() => router.push("/wallet")}
                className="btn-primary"
              >
                Buy Tokens
              </button>
            </div>
          </div>
        )}

        {/* Content Grid */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Premium Content
          </h2>
          
          {content.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 text-lg">
                This creator hasn't posted any content yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.map((item) => {
                // Filter NSFW content if user is not 18+
                if (item.isNSFW && !userProfile?.age18Plus) {
                  return null;
                }

                return (
                  <div key={item.id} className="card group relative overflow-hidden">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden mb-4">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className={`w-full h-full object-cover ${
                            !item.isPurchased ? "blur-sm" : ""
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-400">
                          <span className="text-white text-4xl">
                            {item.contentType === "video" ? "🎥" : "📷"}
                          </span>
                        </div>
                      )}
                      
                      {/* NSFW Badge */}
                      {item.isNSFW && (
                        <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                          18+
                        </div>
                      )}

                      {/* Lock overlay */}
                      {!item.isPurchased && (
                        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                          <div className="text-white text-4xl">🔒</div>
                        </div>
                      )}
                    </div>

                    {/* Content Info */}
                    <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {item.description}
                    </p>

                    {/* Action Button */}
                    {item.isPurchased ? (
                      <button
                        onClick={() => {
                          // View full content
                          alert("View full content feature coming soon!");
                        }}
                        className="w-full btn-primary"
                      >
                        View Content
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePurchase(item.id!, item.priceTokens)}
                        disabled={purchasing === item.id}
                        className={`w-full btn-secondary ${
                          purchasing === item.id ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {purchasing === item.id ? (
                          <span className="flex items-center justify-center">
                            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Unlocking...
                          </span>
                        ) : (
                          `Unlock for ${item.priceTokens} 🪙`
                        )}
                      </button>
                    )}

                    {/* Purchase count */}
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {item.purchaseCount} {item.purchaseCount === 1 ? "purchase" : "purchases"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}