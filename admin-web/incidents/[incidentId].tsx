/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Admin incident detail page with timeline and actions
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../src/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/firebase';
import Link from 'next/link';

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3';
  status: string;
  source: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  ownerId?: string;
  affectedFeatures: string[];
  relatedPacks?: number[];
  relatedTicketIds?: string[];
  relatedUserIds?: string[];
  relatedFunctionNames?: string[];
  fraudRelated?: boolean;
  safetyRelated?: boolean;
  timelineSummary?: string;
}

interface TimelineEntry {
  id: string;
  at: Timestamp;
  type: string;
  authorId: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
}

interface ActionItem {
  id: string;
  title: string;
  ownerId: string;
  dueAt?: Timestamp;
  completed: boolean;
  completedAt?: Timestamp;
}

export default function IncidentDetailPage() {
  const router = useRouter();
  const { incidentId } = router.query;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [newNote, setNewNote] = useState('');
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionOwner, setNewActionOwner] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    if (incidentId && typeof incidentId === 'string') {
      loadIncidentData();
    }
  }, [incidentId]);

  async function loadIncidentData() {
    if (!incidentId || typeof incidentId !== 'string') return;

    try {
      setLoading(true);

      // Load incident
      const incidentDoc = await getDoc(doc(db, 'incidents', incidentId));
      if (incidentDoc.exists()) {
        const data = { id: incidentDoc.id, ...incidentDoc.data() } as Incident;
        setIncident(data);
        setSelectedStatus(data.status);
      }

      // Load timeline
      const timelineQuery = query(
        collection(db, `incidents/${incidentId}/timeline`),
        orderBy('at', 'desc')
      );
      const timelineSnapshot = await getDocs(timelineQuery);
      setTimeline(timelineSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimelineEntry)));

      // Load actions
      const actionsSnapshot = await getDocs(
        collection(db, `incidents/${incidentId}/actions`)
      );
      setActions(actionsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActionItem)));
    } catch (error) {
      console.error('Error loading incident:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus() {
    if (!incident || selectedStatus === incident.status) return;

    try {
      const updateIncidentStatusFn = httpsCallable(functions, 'pack417_updateIncidentStatus');
      await updateIncidentStatusFn({
        incidentId: incident.id,
        newStatus: selectedStatus,
      });
      await loadIncidentData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  }

  async function addNote() {
    if (!newNote.trim() || !incident) return;

    try {
      const addTimelineEntryFn = httpsCallable(functions, 'pack417_addTimelineEntry');
      await addTimelineEntryFn({
        incidentId: incident.id,
        type: 'NOTE',
        message: newNote,
      });
      setNewNote('');
      await loadIncidentData();
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note');
    }
  }

  async function addAction() {
    if (!newActionTitle.trim() || !newActionOwner.trim() || !incident) return;

    try {
      const createActionFn = httpsCallable(functions, 'pack417_createActionItem');
      await createActionFn({
        incidentId: incident.id,
        title: newActionTitle,
        ownerId: newActionOwner,
      });
      setNewActionTitle('');
      setNewActionOwner('');
      await loadIncidentData();
    } catch (error) {
      console.error('Error adding action:', error);
      alert('Failed to add action');
    }
  }

  async function completeAction(actionId: string) {
    if (!incident) return;

    try {
      const completeActionFn = httpsCallable(functions, 'pack417_completeActionItem');
      await completeActionFn({
        incidentId: incident.id,
        actionId,
      });
      await loadIncidentData();
    } catch (error) {
      console.error('Error completing action:', error);
      alert('Failed to complete action');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-gray-500">Loading incident...</div>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-gray-500">Incident not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/incidents" className="text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Incidents
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {incident.id}: {incident.title}
          </h1>
          <div className="mt-2 flex gap-2">
            <span className="px-3 py-1 text-sm font-semibold rounded bg-red-100 text-red-800">
              {incident.severity}
            </span>
            <span className="px-3 py-1 text-sm font-semibold rounded bg-yellow-100 text-yellow-800">
              {incident.status.replace(/_/g, ' ')}
            </span>
            <span className="px-3 py-1 text-sm rounded bg-blue-100 text-blue-800">
              {incident.source.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Details</h2>
              <p className="text-gray-700 mb-4">{incident.description}</p>

              {incident.affectedFeatures && incident.affectedFeatures.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-sm text-gray-700 mb-2">Affected Features:</h3>
                  <div className="flex flex-wrap gap-2">
                    {incident.affectedFeatures.map(f => (
                      <span key={f} className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Timeline</h2>

              {/* Add note */}
              <div className="mb-6 p-4 bg-gray-50 rounded">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                  rows={3}
                />
                <button
                  onClick={addNote}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add Note
                </button>
              </div>

              {/* Timeline entries */}
              <div className="space-y-4">
                {timeline.map(entry => (
                  <div key={entry.id} className="border-l-2 border-gray-200 pl-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100">
                            {entry.type}
                          </span>
                          <span className="text-sm text-gray-500">
                            {entry.at.toDate().toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-gray-700">{entry.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Control */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Change Status</h2>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
              >
                <option value="OPEN">Open</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="MITIGATED">Mitigated</option>
                <option value="MONITORING">Monitoring</option>
                <option value="RESOLVED">Resolved</option>
                <option value="POSTMORTEM_REQUIRED">Postmortem Required</option>
                <option value="POSTMORTEM_COMPLETE">Postmortem Complete</option>
              </select>
              <button
                onClick={updateStatus}
                disabled={selectedStatus === incident.status}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Update Status
              </button>
            </div>

            {/* Action Items */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Action Items</h2>

              {/* Add action */}
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <input
                  type="text"
                  value={newActionTitle}
                  onChange={e => setNewActionTitle(e.target.value)}
                  placeholder="Action title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                />
                <input
                  type="text"
                  value={newActionOwner}
                  onChange={e => setNewActionOwner(e.target.value)}
                  placeholder="Owner user ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                />
                <button
                  onClick={addAction}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Add Action
                </button>
              </div>

              {/* Action list */}
              <div className="space-y-2">
                {actions.map(action => (
                  <div
                    key={action.id}
                    className={`p-3 border rounded ${action.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`text-sm ${action.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                          {action.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Owner: {action.ownerId}</p>
                      </div>
                      {!action.completed && (
                        <button
                          onClick={() => completeAction(action.id)}
                          className="ml-2 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {actions.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No action items</p>
                )}
              </div>
            </div>

            {/* Postmortem Link */}
            {(incident.status === 'POSTMORTEM_REQUIRED' || incident.status === 'POSTMORTEM_COMPLETE') && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Postmortem</h2>
                <Link
                  href={`/incidents/${incident.id}/postmortem`}
                  className="block w-full text-center px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  {incident.status === 'POSTMORTEM_COMPLETE' ? 'View Postmortem' : 'Create Postmortem'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
