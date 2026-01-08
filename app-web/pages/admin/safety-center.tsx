/**
 * PACK 280 - Admin Safety Center Dashboard
 * Monitor active safety sessions, panic events, and escalated incidents
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type {
  LiveSession,
  PanicEvent,
  SafetyCenterDashboard,
} from '../../../shared/src/types/safety';

export default function SafetyCenterPage() {
  const [dashboard, setDashboard] = useState<SafetyCenterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadDashboard();

    if (autoRefresh) {
      const interval = setInterval(loadDashboard, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadDashboard = async () => {
    try {
      // Load active sessions
      const activeSessionsQuery = query(
        collection(db, 'liveSessions'),
        where('endedAt', '==', null),
        orderBy('startedAt', 'desc'),
        limit(50)
      );
      const activeSessionsSnap = await getDocs(activeSessionsQuery);
      const activeSessions = activeSessionsSnap.docs.map((doc) => doc.data() as LiveSession);

      // Load escalated sessions
      const escalatedQuery = query(
        collection(db, 'liveSessions'),
        where('trustCenterStatus', '==', 'escalated'),
        orderBy('startedAt', 'desc'),
        limit(20)
      );
      const escalatedSnap = await getDocs(escalatedQuery);
      const escalatedSessions = escalatedSnap.docs.map((doc) => doc.data() as LiveSession);

      // Load recent panic events
      const panicQuery = query(
        collection(db, 'panicEvents'),
        orderBy('triggeredAt', 'desc'),
        limit(20)
      );
      const panicSnap = await getDocs(panicQuery);
      const recentPanicEvents = panicSnap.docs.map((doc) => doc.data() as PanicEvent);

      // Calculate stats
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const panicEventsToday = recentPanicEvents.filter(
        (e) => new Date(e.triggeredAt) >= today
      ).length;

      const panicEventsThisWeek = recentPanicEvents.filter(
        (e) => new Date(e.triggeredAt) >= weekAgo
      ).length;

      setDashboard({
        activeSessions,
        escalatedSessions,
        recentPanicEvents,
        stats: {
          totalActiveSessions: activeSessions.length,
          totalEscalatedSessions: escalatedSessions.length,
          panicEventsToday,
          panicEventsThisWeek,
        },
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  const handleCloseIncident = async (sessionId: string) => {
    if (!confirm('Are you sure you want to close this incident?')) {
      return;
    }

    try {
      // Call cloud function to close incident
      const response = await fetch('/api/safety/close-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        alert('Incident closed successfully');
        loadDashboard();
      } else {
        alert('Failed to close incident');
      }
    } catch (error) {
      console.error('Error closing incident:', error);
      alert('Failed to close incident');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Safety Center...</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Failed to load dashboard</p>
          <button
            onClick={loadDashboard}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🚨 Safety Center</h1>
              <p className="mt-1 text-sm text-gray-500">
                Real-time monitoring of safety sessions and panic events
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Auto-refresh</span>
              </label>
              <button
                onClick={loadDashboard}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              >
                Refresh Now
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Active Sessions"
            value={dashboard.stats.totalActiveSessions}
            icon="📍"
            color="blue"
          />
          <StatCard
            title="Escalated"
            value={dashboard.stats.totalEscalatedSessions}
            icon="🚨"
            color="red"
          />
          <StatCard
            title="Panic Today"
            value={dashboard.stats.panicEventsToday}
            icon="⚠️"
            color="orange"
          />
          <StatCard
            title="Panic This Week"
            value={dashboard.stats.panicEventsThisWeek}
            icon="📊"
            color="purple"
          />
        </div>

        {/* Escalated Sessions - Priority */}
        {dashboard.escalatedSessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              🚨 Escalated Incidents (Requires Attention)
            </h2>
            <div className="space-y-4">
              {dashboard.escalatedSessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isEscalated={true}
                  onClose={() => handleCloseIncident(session.sessionId)}
                  onViewDetails={() => setSelectedSession(session)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Sessions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Active Safety Sessions</h2>
          {dashboard.activeSessions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No active sessions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dashboard.activeSessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isEscalated={false}
                  onViewDetails={() => setSelectedSession(session)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Panic Events */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Panic Events</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Context
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notifications
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dashboard.recentPanicEvents.map((event) => (
                  <tr key={event.eventId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(event.triggeredAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        {event.context}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.location ? (
                        <a
                          href={`https://maps.google.com/?q=${event.location.lat},${event.location.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Map
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.notificationsSent} sent
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Session Details Modal */}
      {selectedSession && (
        <SessionDetailsModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-lg shadow p-6 border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

// Session Card Component
function SessionCard({
  session,
  isEscalated,
  onClose,
  onViewDetails,
}: {
  session: LiveSession;
  isEscalated: boolean;
  onClose?: () => void;
  onViewDetails: () => void;
}) {
  const duration = Math.floor(
    (new Date().getTime() - new Date(session.startedAt).getTime()) / 1000 / 60
  );

  return (
    <div
      className={`bg-white rounded-lg shadow p-6 ${
        isEscalated ? 'border-2 border-red-500' : ''
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isEscalated ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}>
              {session.type.toUpperCase()}
            </span>
            {session.panicTriggeredBy && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-600 text-white">
                🚨 PANIC ACTIVE
              </span>
            )}
            <span className="text-sm text-gray-500">{duration} min ago</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-gray-500">Session ID</p>
              <p className="font-mono text-xs">{session.sessionId.slice(0, 12)}...</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Participants</p>
              <p className="text-sm font-medium">{session.participants.length} users</p>
            </div>
            {session.lastLocation && (
              <div>
                <p className="text-sm text-gray-500">Last Location</p>
                <a
                  href={`https://maps.google.com/?q=${session.lastLocation.lat},${session.lastLocation.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View on Map
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col space-y-2">
          <button
            onClick={onViewDetails}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Details
          </button>
          {isEscalated && onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
            >
              Close Incident
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Session Details Modal
function SessionDetailsModal({
  session,
  onClose,
}: {
  session: LiveSession;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold">Session Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500">Session ID</p>
            <p className="font-mono text-sm">{session.sessionId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Type</p>
            <p>{session.type}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Started At</p>
            <p>{new Date(session.startedAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-semibold">{session.trustCenterStatus}</p>
          </div>
          {session.panicTriggeredBy && (
            <div>
              <p className="text-sm text-gray-500">Panic Triggered By</p>
              <p className="text-red-600 font-semibold">{session.panicTriggeredBy}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Participants</p>
            <ul className="list-disc list-inside">
              {session.participants.map((p) => (
                <li key={p} className="font-mono text-sm">{p}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}