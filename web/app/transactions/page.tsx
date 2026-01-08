/**
 * Transaction History Page
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { Transaction } from "@/lib/types";
import { ArrowLeft, Download, Filter } from "lucide-react";

export default function TransactionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<string>("all");

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

  // Fetch transactions
  useEffect(() => {
    if (!user) return;

    const fetchTransactions = async () => {
      try {
        const txnRef = collection(db, "transactions");
        let q = query(
          txnRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(50)
        );

        // Apply filter
        if (filter !== "all") {
          q = query(
            txnRef,
            where("userId", "==", user.uid),
            where("type", "==", filter),
            orderBy("createdAt", "desc"),
            limit(50)
          );
        }

        const snapshot = await getDocs(q);
        const txns = snapshot.docs.map((doc) => ({
          ...doc.data(),
          txnId: doc.id,
        })) as Transaction[];

        setTransactions(txns);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === 50);
      } catch (error) {
        console.error("Error fetching transactions:", error);
      }
    };

    fetchTransactions();
  }, [user, filter]);

  // Load more transactions
  const loadMore = async () => {
    if (!user || !lastDoc || !hasMore) return;

    setLoadingMore(true);
    try {
      const txnRef = collection(db, "transactions");
      let q = query(
        txnRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(50)
      );

      if (filter !== "all") {
        q = query(
          txnRef,
          where("userId", "==", user.uid),
          where("type", "==", filter),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(50)
        );
      }

      const snapshot = await getDocs(q);
      const txns = snapshot.docs.map((doc) => ({
        ...doc.data(),
        txnId: doc.id,
      })) as Transaction[];

      setTransactions((prev) => [...prev, ...txns]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more transactions:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Date", "Type", "Description", "Amount", "Source"];
    const rows = transactions.map((txn) => [
      txn.createdAt?.toDate?.().toLocaleDateString() || "N/A",
      txn.type,
      txn.description,
      txn.amount.toString(),
      txn.source,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `avalo-transactions-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-6 h-6 text-gray-600" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Transaction History
                </h1>
                <p className="text-gray-600 mt-1">
                  View all your token transactions
                </p>
              </div>
            </div>
            <button onClick={exportToCSV} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="card mb-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <div className="flex gap-2 flex-wrap">
              {["all", "credit", "debit", "earning", "payout", "refund"].map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filter === type
                        ? "bg-primary-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="card">
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No transactions found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Description
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Source
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => (
                      <tr key={txn.txnId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {txn.createdAt?.toDate?.().toLocaleString() || "N/A"}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`badge ${
                              txn.type === "credit"
                                ? "badge-success"
                                : txn.type === "earning"
                                ? "badge-info"
                                : txn.type === "payout"
                                ? "badge-warning"
                                : txn.type === "refund"
                                ? "badge-info"
                                : "badge-danger"
                            }`}
                          >
                            {txn.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {txn.description}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {txn.source}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            txn.type === "credit" ||
                            txn.type === "earning" ||
                            txn.type === "refund"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {txn.type === "credit" ||
                          txn.type === "earning" ||
                          txn.type === "refund"
                            ? "+"
                            : "-"}
                          {txn.amount} 🪙
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="btn-secondary"
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                        Loading...
                      </span>
                    ) : (
                      "Load More"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
