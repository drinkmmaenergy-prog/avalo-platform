'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Clock, User, Shield } from 'lucide-react';
import { useRealtimeIncidents, sortByPriority, RealtimeIncident } from '@/lib/moderation/realtime';
import { Badge } from '../components/Badge';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslations } from '@/lib/moderation/i18n';

export default function QueuePage() {
  const router = useRouter();
  const t = useTranslations('en'); // Can be made dynamic based on user preference
  const { incidents, loading, error } = useRealtimeIncidents(100);
  const [sortedIncidents, setSortedIncidents] = useState<RealtimeIncident[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // Filter only pending/under_review incidents and sort by priority
    const activeIncidents = incidents.filter(
      (inc) => inc.status === 'pending' || inc.status === 'under_review'
    );
    setSortedIncidents(sortByPriority(activeIncidents));
  }, [incidents]);

  const startReviewing = async () => {
    if (sortedIncidents.length === 0) return;

    setIsStarting(true);
    const highestPriorityIncident = sortedIncidents[0];

    try {
      // Create lock for this incident
      const lockRef = doc(db, 'locks', highestPriorityIncident.id);
      await setDoc(lockRef, {
        moderatorId: 'current-moderator', // Replace with actual moderator ID
        timestamp: serverTimestamp(),
        incidentId: highestPriorityIncident.id,
      });

      // Navigate to incident detail page
      router.push(`/admin/moderation/incidents/${highestPriorityIncident.id}`);
    } catch (err) {
      console.error('Error starting review:', err);
      setIsStarting(false);
    }
  };

  const getSeverityVariant = (severity: string): 'success' | 'warning' | 'danger' => {
    switch (severity?.toUpperCase()) {
      case 'LOW':
        return 'success';
      case 'MEDIUM':
        return 'warning';
      case 'HIGH':
      case 'CRITICAL':
        return 'danger';
      default:
        return 'warning';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return 'text-red-500';
      case 'HIGH':
        return 'text-amber-500';
      case 'MEDIUM':
        return 'text-yellow-500';
      case 'LOW':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
        <p className="text-red-500">Error loading queue: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-10 h-10 text-[#D4AF37]" />
          Priority Queue
        </h1>
        <p className="text-gray-400 text-lg">
          Review cases in order of priority - system auto-assigns highest priority case
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#1A1A1A] rounded-xl border border-red-500/30 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-400 text-sm font-semibold">CRITICAL</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-white">
            {sortedIncidents.filter((i) => i.severity === 'CRITICAL').length}
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-xl border border-amber-500/30 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-400 text-sm font-semibold">HIGH</span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-white">
            {sortedIncidents.filter((i) => i.severity === 'HIGH').length}
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-xl border border-yellow-500/30 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-yellow-400 text-sm font-semibold">MEDIUM</span>
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-white">
            {sortedIncidents.filter((i) => i.severity === 'MEDIUM').length}
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#40E0D0] text-sm font-semibold">TOTAL IN QUEUE</span>
            <Clock className="w-5 h-5 text-[#40E0D0]" />
          </div>
          <div className="text-3xl font-bold text-white">{sortedIncidents.length}</div>
        </div>
      </div>

      {/* Start Reviewing Button */}
      {sortedIncidents.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#D4AF37]/30 p-8 text-center">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Ready to review?</h2>
            <p className="text-gray-400">
              Click below to be assigned the highest priority case
            </p>
          </div>
          <button
            onClick={startReviewing}
            disabled={isStarting}
            className="inline-flex items-center gap-3 px-8 py-4 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0F0F] font-bold text-lg rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-[#D4AF37]/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStarting ? (
              <>
                <div className="w-5 h-5 border-2 border-[#0F0F0F] border-t-transparent rounded-full animate-spin"></div>
                Starting Review...
              </>
            ) : (
              <>
                Start Reviewing
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Queue List */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 overflow-hidden">
        <div className="p-6 border-b border-[#40E0D0]/20">
          <h2 className="text-xl font-bold text-white">Priority Queue</h2>
          <p className="text-sm text-gray-400 mt-1">
            Sorted by severity, age, and user history
          </p>
        </div>

        {sortedIncidents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#40E0D0]/10 mb-4">
              <Shield className="w-8 h-8 text-[#40E0D0]" />
            </div>
            <p className="text-gray-400 text-lg">No cases in queue</p>
            <p className="text-sm text-gray-600 mt-2">
              Great job! All incidents have been reviewed.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#40E0D0]/10">
            {sortedIncidents.slice(0, 20).map((incident, index) => (
              <div
                key={incident.id}
                className="p-6 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => router.push(`/admin/moderation/incidents/${incident.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Priority Number */}
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30">
                        <span className="text-[#D4AF37] font-bold text-sm">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Severity Badge */}
                      <Badge variant={getSeverityVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>

                      {/* Incident ID */}
                      <span className="text-gray-500 text-sm font-mono">
                        {incident.id}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-white mb-2">
                      {incident.description || incident.contentSnippet || 'No description'}
                    </p>

                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>{incident.userId}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {incident.timestamp
                            ? new Date(incident.timestamp.toMillis()).toLocaleString()
                            : 'Unknown'}
                        </span>
                      </div>
                      {incident.category && (
                        <span className="px-2 py-1 bg-[#40E0D0]/10 text-[#40E0D0] rounded text-xs">
                          {incident.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-[#40E0D0] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg p-4">
        <p className="text-sm text-[#40E0D0]">
          <strong>How it works:</strong> The queue automatically sorts cases by priority.
          Critical violations, high severity, and older cases appear first. When you start
          reviewing, the case is temporarily locked to prevent duplicate work.
        </p>
      </div>
    </div>
  );
}