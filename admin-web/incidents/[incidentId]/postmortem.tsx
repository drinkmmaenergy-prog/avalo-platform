/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Admin postmortem creation and editing page
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../src/firebase';
import Link from 'next/link';

interface Postmortem {
  id: string;
  incidentId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  summary: string;
  impact: string;
  rootCause: string;
  timeline: string;
  whatWentWell: string;
  whatWentWrong: string;
  actionItems: string;
  followUpIncidents?: string[];
}

export default function PostmortemPage() {
  const router = useRouter();
  const { incidentId } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postmortem, setPostmortem] = useState<Partial<Postmortem>>({
    summary: '',
    impact: '',
    rootCause: '',
    timeline: '',
    whatWentWell: '',
    whatWentWrong: '',
    actionItems: '',
  });

  useEffect(() => {
    if (incidentId && typeof incidentId === 'string') {
      loadPostmortem();
    }
  }, [incidentId]);

  async function loadPostmortem() {
    if (!incidentId || typeof incidentId !== 'string') return;

    try {
      setLoading(true);
      const postmortemDoc = await getDoc(doc(db, 'incidentPostmortems', incidentId));

      if (postmortemDoc.exists()) {
        setPostmortem(postmortemDoc.data() as Postmortem);
      }
    } catch (error) {
      console.error('Error loading postmortem:', error);
    } finally {
      setLoading(false);
    }
  }

  async function savePostmortem() {
    if (!incidentId || typeof incidentId !== 'string') return;

    try {
      setSaving(true);

      const savePostmortemFn = httpsCallable(functions, 'pack417_savePostmortem');
      await savePostmortemFn({
        incidentId,
        ...postmortem,
      });

      alert('Postmortem saved successfully');
      await loadPostmortem();
    } catch (error) {
      console.error('Error saving postmortem:', error);
      alert('Failed to save postmortem');
    } finally {
      setSaving(false);
    }
  }

  async function markComplete() {
    if (!incidentId || typeof incidentId !== 'string') return;

    if (!confirm('Mark postmortem as complete? This will update the incident status.')) {
      return;
    }

    try {
      setSaving(true);

      const markCompleteFn = httpsCallable(functions, 'pack417_markPostmortemComplete');
      await markCompleteFn({ incidentId });

      alert('Postmortem marked as complete');
      router.push(`/incidents/${incidentId}`);
    } catch (error) {
      console.error('Error marking postmortem complete:', error);
      alert('Failed to mark postmortem complete');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center text-gray-500">Loading postmortem...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/incidents/${incidentId}`}
            className="text-blue-600 hover:underline mb-2 inline-block"
          >
            ← Back to Incident
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Incident Postmortem: {incidentId}
          </h1>
          <p className="mt-2 text-gray-600">
            A postmortem is a structured way to learn from incidents and improve future response.
          </p>
        </div>

        {/* Postmortem Form */}
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Executive Summary
            </label>
            <textarea
              value={postmortem.summary || ''}
              onChange={e => setPostmortem({ ...postmortem, summary: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Brief overview of what happened and the outcome..."
            />
          </div>

          {/* Impact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Impact
            </label>
            <textarea
              value={postmortem.impact || ''}
              onChange={e => setPostmortem({ ...postmortem, impact: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Who was affected? What was the business impact? Metrics?"
            />
          </div>

          {/* Root Cause */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Root Cause Analysis
            </label>
            <textarea
              value={postmortem.rootCause || ''}
              onChange={e => setPostmortem({ ...postmortem, rootCause: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              placeholder="What was the underlying cause? Why did it happen?"
            />
          </div>

          {/* Timeline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detailed Timeline
            </label>
            <textarea
              value={postmortem.timeline || ''}
              onChange={e => setPostmortem({ ...postmortem, timeline: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={8}
              placeholder="Chronological sequence of events..."
            />
          </div>

          {/* What Went Well */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What Went Well
            </label>
            <textarea
              value={postmortem.whatWentWell || ''}
              onChange={e => setPostmortem({ ...postmortem, whatWentWell: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Positive aspects of the response..."
            />
          </div>

          {/* What Went Wrong */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What Went Wrong / Could Be Improved
            </label>
            <textarea
              value={postmortem.whatWentWrong || ''}
              onChange={e => setPostmortem({ ...postmortem, whatWentWrong: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Areas for improvement..."
            />
          </div>

          {/* Action Items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Follow-Up Action Items
            </label>
            <textarea
              value={postmortem.actionItems || ''}
              onChange={e => setPostmortem({ ...postmortem, actionItems: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              placeholder="List of action items with owners and due dates..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Tip: Use markdown format with checkboxes: - [ ] Action item (Owner: @username, Due: date)
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t">
            <button
              onClick={savePostmortem}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            <button
              onClick={markComplete}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              Save & Mark Complete
            </button>

            <Link
              href={`/incidents/${incidentId}`}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Postmortem Best Practices</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
            <li>Focus on learning, not blaming</li>
            <li>Be specific with timelines and metrics</li>
            <li>Identify actionable improvements</li>
            <li>Share widely to prevent future occurrences</li>
            <li>Follow up on action items</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
