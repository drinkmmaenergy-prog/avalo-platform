/**
 * Moderation Realtime — Hooks for real-time moderation data.
 *
 * Provides React hooks that subscribe to Firestore snapshots
 * for incidents, appeals, online moderators, and alert counts.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ──────────────────────────────────────────────

export interface RealtimeIncident {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
  reportedUserId: string;
  reporterUserId: string;
  description: string;
  category: string;
  createdAt: Date;
  assignedTo?: string;
}

export interface RealtimeAppeal {
  id: string;
  userId: string;
  incidentId: string;
  reason: string;
  status: 'PENDING' | 'REVIEWING' | 'APPROVED' | 'DENIED';
  createdAt: Date;
  reviewedAt?: Date;
  reviewerUid?: string;
}

export interface OnlineModerator {
  uid: string;
  displayName: string;
  role: string;
  currentAction?: string;
  lastActiveAt: Date;
}

// ── Sort helper ────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function sortByPriority(incidents: RealtimeIncident[]): RealtimeIncident[] {
  return [...incidents].sort((a, b) => {
    const aSev = SEVERITY_ORDER[a.severity] ?? 99;
    const bSev = SEVERITY_ORDER[b.severity] ?? 99;
    if (aSev !== bSev) return aSev - bSev;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// ── Hooks ──────────────────────────────────────────────

export function useRealtimeIncidents(limitCount = 100): {
  incidents: RealtimeIncident[];
  loading: boolean;
} {
  const [incidents, setIncidents] = useState<RealtimeIncident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'moderation_incidents'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: RealtimeIncident[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type ?? 'UNKNOWN',
          severity: data.severity ?? 'LOW',
          status: data.status ?? 'OPEN',
          reportedUserId: data.reportedUserId ?? '',
          reporterUserId: data.reporterUserId ?? '',
          description: data.description ?? '',
          category: data.category ?? '',
          createdAt: data.createdAt?.toDate() ?? new Date(),
          assignedTo: data.assignedTo,
        };
      });
      setIncidents(items);
      setLoading(false);
    });

    return () => unsub();
  }, [limitCount]);

  return { incidents, loading };
}

export function useRealtimeAppeals(limitCount = 50): {
  appeals: RealtimeAppeal[];
  loading: boolean;
} {
  const [appeals, setAppeals] = useState<RealtimeAppeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'moderation_appeals'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: RealtimeAppeal[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId ?? '',
          incidentId: data.incidentId ?? '',
          reason: data.reason ?? '',
          status: data.status ?? 'PENDING',
          createdAt: data.createdAt?.toDate() ?? new Date(),
          reviewedAt: data.reviewedAt?.toDate(),
          reviewerUid: data.reviewerUid,
        };
      });
      setAppeals(items);
      setLoading(false);
    });

    return () => unsub();
  }, [limitCount]);

  return { appeals, loading };
}

export function useOnlineModerators(): {
  moderators: OnlineModerator[];
  loading: boolean;
} {
  const [moderators, setModerators] = useState<OnlineModerator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const fiveMinutesAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
    const q = query(
      collection(db, 'moderator_presence'),
      where('lastActiveAt', '>', fiveMinutesAgo)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: OnlineModerator[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: data.displayName ?? 'Moderator',
          role: data.role ?? 'moderator',
          currentAction: data.currentAction,
          lastActiveAt: data.lastActiveAt?.toDate() ?? new Date(),
        };
      });
      setModerators(items);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { moderators, loading };
}

export function useAlertCounts(): { incidents: number; appeals: number } {
  const { incidents } = useRealtimeIncidents(500);
  const { appeals } = useRealtimeAppeals(200);

  const openIncidents = incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING').length;

  return { incidents: openIncidents, appeals: pendingAppeals };
}
