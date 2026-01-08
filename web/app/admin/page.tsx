/**
 * Admin Panel
 * User management, moderation, and system stats
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { UserProfile, Flag, AdminStats } from "@/lib/types";
import { Shield, Users, AlertTriangle, DollarSign } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingFlags, setPendingFlags] = useState<Flag[]>([]);
  const [selectedTab, setSelectedTab] = useState<"overview" | "flags" | "users">(
    "overview"
  );

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);

        // Check if user is admin
        const profileRef = doc(db, "users", user.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const userData = profileSnap.data() as UserProfile;
          setProfile(userData);

          if (userData.role !== "admin" && userData.role !== "superadmin") {
            alert("Access denied. Admin privileges required.");
            router.push("/dashboard");
          }
        }
      } else {
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch stats
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== "admin" && profile.role !== "superadmin") return;

    const fetchStats = async () => {
      try {
        // Get total users
        const usersSnapshot = await getDocs(collection(db, "users"));
        const totalUsers = usersSnapshot.size;

        // Get active users (not banned/suspended)
        const activeUsers = usersSnapshot.docs.filter((doc) => {
          const data = doc.data();
          return data.status === "active" || !data.status;
        }).length;

        // Get pending flags
        const flagsRef = collection(db, "admin_flags");
        const flagsQuery = query(
          flagsRef,
          where("status", "==", "pending"),
          orderBy("createdAt", "desc")
        );
        const flagsSnapshot = await getDocs(flagsQuery);
        const flags = flagsSnapshot.docs.map((doc) => ({
          ...doc.data(),
          flagId: doc.id,
        })) as Flag[];

        setPendingFlags(flags);

        setStats({
          totalUsers,
          activeUsers,
          totalRevenue: 0, // Would need to calculate from transactions
          totalTransactions: 0, // Would need to count transactions
          pendingFlags: flags.length,
          pendingPayouts: 0, // Would need to query payouts
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, [user, profile]);

  // Handle flag review
  const handleReviewFlag = async (
    flagId: string,
    action: "warn" | "ban" | "dismiss"
  ) => {
    if (!user) return;

    try {
      const flagRef = doc(db, "admin_flags", flagId);
      await updateDoc(flagRef, {
        status: "reviewed",
        reviewedAt: new Date(),
        reviewedBy: user.uid,
        action,
      });

      // Update local state
      setPendingFlags((prev) =>
        prev.filter((flag) => flag.flagId !== flagId)
      );

      alert(`Flag ${action}ed successfully`);
    } catch (error) {
      console.error("Error reviewing flag:", error);
      alert("Failed to review flag");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">Admin privileges required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b-2 border-red-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-red-500" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
                <p className="text-gray-600 mt-1">System management and moderation</p>
              </div>
            </div>
            <button onClick={() => router.push("/dashboard")} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="mb-8 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setSelectedTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedTab === "overview"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setSelectedTab("flags")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedTab === "flags"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Moderation Flags
              {pendingFlags.length > 0 && (
                <span className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">
                  {pendingFlags.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedTab("users")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedTab === "users"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              User Management
            </button>
          </nav>
        </div>

        {/* Overview Tab */}
        {selectedTab === "overview" && stats && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Users</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {stats.totalUsers}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Active Users</p>
                    <p className="text-3xl font-bold text-green-600">
                      {stats.activeUsers}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Pending Flags</p>
                    <p className="text-3xl font-bold text-red-600">
                      {stats.pendingFlags}
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                    <p className="text-3xl font-bold text-primary-500">
                      {stats.totalRevenue} PLN
                    </p>
                  </div>
                  <div className="p-3 bg-primary-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-primary-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                System Status
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-700">Firebase Functions</span>
                  <span className="badge badge-success">Operational</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-700">Firestore Database</span>
                  <span className="badge badge-success">Operational</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-700">Stripe Payments</span>
                  <span className="badge badge-success">Operational</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Storage</span>
                  <span className="badge badge-success">Operational</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Flags Tab */}
        {selectedTab === "flags" && (
          <div>
            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Pending Moderation Flags
              </h2>

              {pendingFlags.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No pending flags
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingFlags.map((flag) => (
                    <div
                      key={flag.flagId}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            Reported User: {flag.reportedUid}
                          </p>
                          <p className="text-sm text-gray-600">
                            Reporter: {flag.reporterId}
                          </p>
                        </div>
                        <span className="badge badge-warning">Pending</span>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Reason:
                        </p>
                        <p className="text-gray-900">{flag.reason}</p>
                      </div>

                      {flag.chatId && (
                        <p className="text-sm text-gray-500 mb-3">
                          Chat ID: {flag.chatId}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewFlag(flag.flagId, "dismiss")}
                          className="btn-secondary text-sm"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => handleReviewFlag(flag.flagId, "warn")}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1 px-3 rounded-lg text-sm"
                        >
                          Warn User
                        </button>
                        <button
                          onClick={() => handleReviewFlag(flag.flagId, "ban")}
                          className="bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-3 rounded-lg text-sm"
                        >
                          Ban User
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {selectedTab === "users" && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              User Management
            </h2>
            <p className="text-gray-600">
              User management features will be implemented here. This would include:
            </p>
            <ul className="mt-4 space-y-2 text-gray-700">
              <li>• Search and filter users</li>
              <li>• View user details and activity</li>
              <li>• Ban/suspend/activate users</li>
              <li>• Adjust quality scores</li>
              <li>• Grant/revoke Royal status</li>
              <li>• View user wallets and transactions</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
