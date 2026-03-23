'use client';

/**
 * Create Event Page — Calendar > Events > + Create Event
 *
 * Allows users to create a new event (offline or virtual) with:
 *   - Title, description, category
 *   - Date/time
 *   - Type (virtual / in-person) with corresponding URL or location
 *   - Ticket price (tokens) & max attendees
 *
 * Submission calls the createEvent Cloud Function via eventService.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { requireFunctions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_CATEGORIES = [
  'One-on-one',
  'Group session',
  'Workshop',
  'Webinar',
  'Consultation',
  'Coaching',
  'Other',
] as const;

const EVENT_TYPES = [
  { value: 'virtual', label: 'Virtual (online)' },
  { value: 'offline', label: 'In-person' },
] as const;

// ============================================================================
// PAGE
// ============================================================================

export default function CreateEventPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(EVENT_CATEGORIES[0]);
  const [eventType, setEventType] = useState<'virtual' | 'offline'>('virtual');
  const [virtualLink, setVirtualLink] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState(100);
  const [maxAttendees, setMaxAttendees] = useState<number | ''>('');

  // ── Submission state ──
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Submit
  // ──────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!date || !time) {
      setError('Date and time are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createEvent = httpsCallable<
        {
          title: string;
          description: string;
          category: string;
          type: 'virtual' | 'offline';
          virtualLink?: string;
          location?: string;
          date: string;
          price: number;
          maxAttendees?: number;
        },
        { success: boolean; eventId?: string; error?: string }
      >(requireFunctions(), 'createCalendarEvent');

      const dateISO = new Date(`${date}T${time}`).toISOString();

      const result = await createEvent({
        title: title.trim(),
        description: description.trim(),
        category,
        type: eventType,
        virtualLink: eventType === 'virtual' ? virtualLink.trim() : undefined,
        location: eventType === 'offline' ? location.trim() : undefined,
        date: dateISO,
        price: Math.max(1, Math.round(price)),
        maxAttendees: maxAttendees ? Number(maxAttendees) : undefined,
      });

      if (result.data.success) {
        router.push('/calendar');
      } else {
        setError(result.data.error || 'Failed to create event');
      }
    } catch (err: any) {
      console.error('Error creating event:', err);
      setError(err.message || 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Auth guard
  // ──────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Please sign in to create events.</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto p-4">
      <button
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        ← Back to Calendar
      </button>

      <h1 className="text-2xl font-bold mb-6">Create Event</h1>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Coffee & Code Workshop"
            className="w-full p-2 border rounded-lg"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will this event be about?"
            rows={3}
            className="w-full p-2 border rounded-lg resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-2 border rounded-lg"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
          <div className="flex gap-3">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setEventType(t.value as 'virtual' | 'offline')}
                className={`flex-1 p-2 border rounded-lg text-sm text-center ${
                  eventType === t.value
                    ? 'border-[#E4458F] bg-pink-50 text-[#E4458F]'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Virtual link or Location */}
        {eventType === 'virtual' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meeting URL</label>
            <input
              type="url"
              value={virtualLink}
              onChange={(e) => setVirtualLink(e.target.value)}
              placeholder="https://meet.google.com/..."
              className="w-full p-2 border rounded-lg"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Café Noir, 123 Main St"
              className="w-full p-2 border rounded-lg"
            />
          </div>
        )}

        {/* Date & Time */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 border rounded-lg"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full p-2 border rounded-lg"
              required
            />
          </div>
        </div>

        {/* Price & Max Attendees */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ticket Price (tokens)
            </label>
            <input
              type="number"
              value={price}
              min={1}
              max={100000}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full p-2 border rounded-lg"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Attendees
            </label>
            <input
              type="number"
              value={maxAttendees}
              min={1}
              onChange={(e) =>
                setMaxAttendees(e.target.value ? Number(e.target.value) : '')
              }
              placeholder="Unlimited"
              className="w-full p-2 border rounded-lg"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          80% of ticket revenue goes to you. 20% Avalo platform fee. Automatic refund if you
          cancel the event.
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-lg font-medium disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
