/**
 * Moderation Realtime — Hooks for real-time incident/appeal monitoring.
 */

'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

export interface RealtimeIncident {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  status: string;
  reportedUserId: string;
  reporterUserId: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  /** Optional fields populated from Firestore when available */
  userId?: string;
  username?: string;
  category?: string;
  contentSnippet?: string;
  snippet?: string;
  reportedDate?: string;
  timestamp?: string | { toMillis: () => number };
}

export interface RealtimeAppeal {
  id: string;
  incidentId: string;
  userId: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
}

export function sortByPriority(incidents: RealtimeIncident[]): RealtimeIncident[] {
  const priorityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...incidents].sort(
    (a, b) => (priorityOrder[a.severity] ?? 4) - (priorityOrder[b.severity] ?? 4),
  );
}

export function useRealtimeIncidents(limitCount: number = 50) {
  const [incidents, setIncidents] = useState<RealtimeIncident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(requireDb(), 'moderationIncidents'),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        const createdAtDate = data.createdAt?.toDate?.() ?? new Date();
        return {
          id: d.id,
          type: data.type ?? 'UNKNOWN',
          severity: data.severity ?? 'LOW',
          status: data.status ?? 'OPEN',
          reportedUserId: data.reportedUserId ?? '',
          reporterUserId: data.reporterUserId ?? '',
          description: data.description ?? '',
          createdAt: createdAtDate,
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
          userId: data.userId ?? data.reportedUserId ?? undefined,
          username: data.username ?? undefined,
          category: data.category ?? undefined,
          contentSnippet: data.contentSnippet ?? undefined,
          snippet: data.snippet ?? undefined,
          reportedDate: data.reportedDate ?? undefined,
          timestamp: data.timestamp ?? createdAtDate.toISOString(),
        } as RealtimeIncident;
      });
      setIncidents(items);
      setLoading(false);
    });

    return () => unsub();
  }, [limitCount]);

  return { incidents, loading };
}

export function useRealtimeAppeals(limitCount: number = 50) {
  const [appeals, setAppeals] = useState<RealtimeAppeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(requireDb(), 'moderationAppeals'),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          incidentId: data.incidentId ?? '',
          userId: data.userId ?? '',
          reason: data.reason ?? '',
          status: data.status ?? 'PENDING',
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        } as RealtimeAppeal;
      });
      setAppeals(items);
      setLoading(false);
    });

    return () => unsub();
  }, [limitCount]);

  return { appeals, loading };
}

export function useOnlineModerators() {
  const [moderators, setModerators] = useState<Array<{
    id: string;
    uid: string;
    displayName: string;
    email?: string;
    currentIncidentId?: string;
    timeOnCase?: number;
    lastSeen: { toMillis: () => number };
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(requireDb(), 'moderatorPresence'),
      where('online', '==', true),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        const lastSeenDate = data.lastSeen?.toDate?.() ?? new Date();
        return {
          id: d.id,
          uid: d.id,
          displayName: data.displayName ?? 'Moderator',
          email: data.email ?? undefined,
          currentIncidentId: data.currentIncidentId ?? undefined,
          timeOnCase: data.timeOnCase ?? undefined,
          lastSeen: { toMillis: () => lastSeenDate.getTime() },
        };
      });
      setModerators(items);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { moderators, loading };
}

export function useAlertCounts() {
  const { incidents } = useRealtimeIncidents(100);
  const { appeals } = useRealtimeAppeals(100);

  const openIncidents = incidents.filter((i) => i.status === 'OPEN').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING').length;
  const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL' && i.status === 'OPEN').length;

  return {
    openIncidents,
    pendingAppeals,
    criticalCount,
    /** Alias for criticalCount — used by TopbarClient */
    criticalIncidents: criticalCount,
    /** Sum of all alert-worthy counts */
    totalAlerts: openIncidents + pendingAppeals,
  };
}
