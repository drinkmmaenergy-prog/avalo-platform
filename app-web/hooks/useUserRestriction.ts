"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";

export type TrustStatus =
  | "ACTIVE"
  | "WARNING"
  | "SOFT_RESTRICTED"
  | "SHADOWBAN"
  | "HARD_BANNED";

export type AppealStatus = "NONE" | "PENDING" | "RESOLVED";

export interface TrustData {
  status: TrustStatus;
  message?: string;
  until?: Date | null;
  canAppeal: boolean;
  appealStatus: AppealStatus;
}

export interface UserRestrictionState {
  trust: TrustData | null;
  loading: boolean;
  error: Error | null;

  isActive: boolean;
  isWarning: boolean;
  isSoftRestricted: boolean;
  isShadowBanned: boolean;
  isHardBanned: boolean;
  canAppeal: boolean;

  restrictionMessage: string | null;
  restrictionEndsAt: Date | null;

  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL = 45_000; // 45 seconds

export const useUserRestriction = (
  userId: string | undefined
): UserRestrictionState => {
  const [trust, setTrust] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrustData = useCallback(async () => {
    if (!userId) {
      setTrust(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    try {
      const db = requireDb();
      const userDoc = await getDoc(doc(db, "users", userId));

      if (!userDoc.exists()) {
        // No user doc yet -> treat as ACTIVE (do not block UX)
        setTrust({
          status: "ACTIVE",
          message: undefined,
          until: null,
          canAppeal: false,
          appealStatus: "NONE",
        });
        setError(null);
        setLoading(false);
        return;
      }

      const userData = userDoc.data() as any;
      const trustData = userData?.trust ?? {};

      const status: TrustStatus = trustData.status ?? "ACTIVE";
      const message: string | undefined = trustData.message ?? undefined;
      const until: Date | null = trustData.until?.toDate?.() ?? null;
      const canAppeal: boolean = trustData.canAppeal === true;
      const appealStatus: AppealStatus = trustData.appealStatus ?? "NONE";

      setTrust({ status, message, until, canAppeal, appealStatus });
      setError(null);
    } catch (err: any) {
      console.error("Error fetching trust data:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));

      // Fail-open (product decision): do not block users due to transient errors.
      setTrust({
        status: "ACTIVE",
        message: undefined,
        until: null,
        canAppeal: false,
        appealStatus: "NONE",
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTrustData();
  }, [fetchTrustData]);

  useEffect(() => {
    if (!userId) return;
    const intervalId = setInterval(fetchTrustData, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [userId, fetchTrustData]);

  useEffect(() => {
    if (!trust?.until) return;

    const now = new Date();
    if (trust.until < now && trust.status !== "ACTIVE") {
      fetchTrustData();
      return;
    }

    const timeUntilExpiry = trust.until.getTime() - now.getTime();
    if (timeUntilExpiry > 0) {
      const timeoutId = setTimeout(fetchTrustData, timeUntilExpiry + 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [trust?.until, trust?.status, fetchTrustData]);

  const isActive = trust?.status === "ACTIVE";
  const isWarning = trust?.status === "WARNING";
  const isSoftRestricted = trust?.status === "SOFT_RESTRICTED";
  const isShadowBanned = trust?.status === "SHADOWBAN";
  const isHardBanned = trust?.status === "HARD_BANNED";
  const canAppeal = trust?.canAppeal === true;

  const restrictionMessage = trust?.message ?? null;
  const restrictionEndsAt = trust?.until ?? null;

  return {
    trust,
    loading,
    error,
    isActive,
    isWarning,
    isSoftRestricted,
    isShadowBanned,
    isHardBanned,
    canAppeal,
    restrictionMessage,
    restrictionEndsAt,
    refresh: fetchTrustData,
  };
};
