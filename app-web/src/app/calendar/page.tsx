'use client';

/**
 * Calendar Page — Bookings, Availability, Events, Policy & Rules
 *
 * Provides:
 *   - Enable/disable calendar toggle
 *   - Meeting fee (token rate) configuration
 *   - Tabs: My Bookings | Availability | Events | Policy & Rules
 *   - Full booking lifecycle: confirm, cancel, check-in, complete, mismatch, goodwill refund
 *
 * FIX 93: Speed Dating Events — quick 5-min matches, 50 tokens entry fee.
 *
 * Data layer: calendarService.ts (Firestore reads + Cloud Function calls).
 * Auth: useAuth() from AuthProvider.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import EmptyState from '@/components/ui/EmptyState';
import {
  getCalendarSettings,
  toggleCalendarEnabled,
  saveMeetingRate as persistMeetingRate,
  getUserBookings,
  confirmBooking as confirmBookingApi,
  cancelBooking as cancelBookingApi,
  checkInBooking,
  completeMeeting as completeMeetingApi,
  reportMismatch as reportMismatchApi,
  goodwillRefund as goodwillRefundApi,
  type CalendarBooking,
} from '@/lib/services/calendarService';

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'bookings' | 'availability' | 'events' | 'policy';

// ============================================================================
// HELPERS
// ============================================================================

function statusColor(status?: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700';
    case 'CONFIRMED':
    case 'confirmed':
      return 'bg-blue-100 text-blue-700';
    case 'COMPLETED':
      return 'bg-green-100 text-green-700';
    case 'CANCELLED':
    case 'cancelled':
    case 'CANCELLED_BY_HOST':
    case 'CANCELLED_BY_GUEST':
      return 'bg-red-100 text-red-700';
    case 'NO_SHOW':
      return 'bg-gray-100 text-gray-700';
    case 'MISMATCH_REPORTED':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function CalendarPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ── Calendar settings ──
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [meetingRate, setMeetingRate] = useState(100);

  // ── Tab state ──
  const [tab, setTab] = useState<TabId>('bookings');

  // ── Bookings ──
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Action feedback ──
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Load initial data
  // ──────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [settings, userBookings] = await Promise.all([
        getCalendarSettings(user.uid),
        getUserBookings(user.uid),
      ]);
      setCalendarEnabled(settings.calendarEnabled);
      setMeetingRate(settings.meetingRate);
      setBookings(userBookings);
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!authLoading && user?.uid) {
      void loadData();
    }
  }, [authLoading, user?.uid, loadData]);

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const toggleCalendar = async (enabled: boolean) => {
    if (!user?.uid) return;
    setCalendarEnabled(enabled);
    try {
      await toggleCalendarEnabled(user.uid, enabled);
      flash(enabled ? 'Calendar enabled' : 'Calendar disabled');
    } catch {
      setCalendarEnabled(!enabled);
      flash('Failed to update calendar setting');
    }
  };

  const saveMeetingRate = async () => {
    if (!user?.uid) return;
    try {
      await persistMeetingRate(user.uid, meetingRate);
      flash('Meeting rate saved');
    } catch {
      flash('Failed to save meeting rate');
    }
  };

  const confirmBooking = async (bookingId: string) => {
    const res = await confirmBookingApi(bookingId);
    flash(res.success ? 'Booking confirmed' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
  };

  const cancelBooking = async (bookingId: string) => {
    const res = await cancelBookingApi(bookingId);
    flash(res.success ? 'Booking cancelled' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
  };

  const checkIn = async (bookingId: string, qrCode?: string) => {
    const res = await checkInBooking(bookingId, qrCode);
    flash(res.success ? 'Checked in' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
  };

  const completeMeeting = async (bookingId: string) => {
    const res = await completeMeetingApi(bookingId);
    flash(res.success ? 'Meeting completed' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
  };

  const reportMismatch = async (bookingId: string) => {
    const res = await reportMismatchApi(bookingId);
    flash(res.success ? 'Mismatch reported' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
  };

  const goodwillRefund = async (bookingId: string) => {
    const res = await goodwillRefundApi(bookingId);
    flash(res.success ? 'Goodwill refund issued' : (res.error ?? 'Failed'));
    if (res.success) void loadData();
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
        <p className="text-gray-500">Please sign in to access your calendar.</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Calendar</h1>

      {/* Action feedback toast */}
      {actionMsg && (
        <div className="mb-4 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg text-center">
          {actionMsg}
        </div>
      )}

      {/* Enable Calendar */}
      <div className="flex items-center justify-between p-4 border rounded-xl mb-4">
        <div>
          <h3 className="font-semibold">Enable Calendar</h3>
          <p className="text-sm text-gray-500">Let others book meetings with you</p>
        </div>
        <input
          type="checkbox"
          checked={calendarEnabled}
          onChange={(e) => toggleCalendar(e.target.checked)}
          className="w-10 h-5 rounded-full appearance-none bg-gray-300 checked:bg-green-500 cursor-pointer"
        />
      </div>

      {/* Meeting Rate — all users, not just earners */}
      {calendarEnabled && (
        <div className="p-4 border rounded-xl mb-6">
          <h3 className="font-semibold mb-1">Meeting Fee</h3>
          <p className="text-xs text-gray-500 mb-3">
            Protect your time from no-shows. Tokens held in escrow (up to the displayed reference portion before applicable deductions).
            Released only after meeting completion.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={meetingRate}
              min={1}
              max={10000}
              onChange={(e) => setMeetingRate(Number(e.target.value))}
              className="w-24 p-2 border rounded-lg text-center"
            />
            <span className="text-sm text-gray-600">tokens</span>
            <button
              onClick={saveMeetingRate}
              className="px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b mb-4">
        {([
          { id: 'bookings' as const, label: 'My Bookings' },
          { id: 'availability' as const, label: 'Availability' },
          { id: 'events' as const, label: 'Events' },
          { id: 'policy' as const, label: 'Policy & Rules' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${
              tab === t.id ? 'border-[#E4458F] text-[#E4458F]' : 'border-transparent text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* === TAB: BOOKINGS === */}
      {tab === 'bookings' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center py-8 text-gray-400">Loading...</p>
          ) : bookings.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No bookings"
              description="Enable meetings in your profile or book a meeting with someone."
              actionLabel="Browse Profiles"
              actionHref="/discover"
            />
          ) : (
            bookings.map((b: CalendarBooking) => (
              <div key={b.id} className="p-4 border rounded-xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">
                      {b.role === 'host'
                        ? `Meeting with ${b.guestName || b.guestId?.slice(0, 8) || 'Guest'}`
                        : `Meeting with ${b.hostName || b.hostId?.slice(0, 8) || 'Host'}`}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {b.category || 'Meeting'}
                      {b.start &&
                        ` · ${new Date(b.start).toLocaleDateString()} at ${new Date(b.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs">
                        {b.priceTokens || b.payment?.totalTokensPaid || '?'} tokens
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(b.status)}`}>
                        {b.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {/* QR code for check-in */}
                    {b.status === 'CONFIRMED' && b.safety?.qrCode && (
                      <p className="text-xs text-gray-400 mt-1">
                        QR: {b.safety.qrCode.slice(-12)}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 ml-2">
                    {b.status === 'PENDING' && b.role === 'host' && (
                      <button
                        onClick={() => confirmBooking(b.id)}
                        className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs"
                      >
                        Confirm
                      </button>
                    )}
                    {['PENDING', 'CONFIRMED', 'confirmed'].includes(b.status) && (
                      <button
                        onClick={() => cancelBooking(b.id)}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs"
                      >
                        Cancel
                      </button>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <button
                        onClick={() => checkIn(b.id, b.safety?.qrCode)}
                        className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs"
                      >
                        Check In
                      </button>
                    )}
                    {b.status === 'CONFIRMED' && b.safety?.checkInAt && (
                      <>
                        <button
                          onClick={() => completeMeeting(b.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => reportMismatch(b.id)}
                          className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-xs"
                        >
                          Mismatch
                        </button>
                      </>
                    )}
                    {b.status === 'COMPLETED' && b.role === 'host' && (
                      <button
                        onClick={() => goodwillRefund(b.id)}
                        className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs"
                      >
                        Goodwill Refund
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* === TAB: AVAILABILITY === */}
      {tab === 'availability' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Set when others can book meetings with you.
          </p>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
            (day, i) => (
              <div key={day} className="flex items-center gap-3 py-2 border-b">
                <input type="checkbox" defaultChecked={i < 5} className="w-4 h-4" />
                <span className="w-24 text-sm font-medium">{day}</span>
                <input
                  type="time"
                  defaultValue="09:00"
                  className="border rounded px-2 py-1 text-sm"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="time"
                  defaultValue="18:00"
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
            ),
          )}
          <button className="mt-4 px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm w-full">
            Save Availability
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Buffer time, minimum notice, and max advance booking are configured in calendar
            settings.
          </p>
        </div>
      )}

      {/* === TAB: EVENTS === */}
      {tab === 'events' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Create events for multiple attendees.</p>
            <button
              onClick={() => router.push('/calendar/create-event')}
              className="px-4 py-2 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-lg text-sm"
            >
              + Create Event
            </button>
          </div>
          <p className="text-gray-400 text-center py-8 text-sm">
            No events yet. Create your first event to sell tickets.
          </p>
          {/* FIX 93: Speed Dating offeral card */}
          <div className="p-4 bg-gradient-to-r from-red-50 to-pink-50 border border-pink-200 rounded-xl mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚡</span>
              <div>
                <h3 className="font-semibold">Speed Dating Night</h3>
                <p className="text-xs text-gray-500">5 min per person · 10 matches</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">Quick conversations, real connections. Meet 10 people in 50 minutes!</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm font-bold text-[#E4458F]">50 tokens to join</span>
              <span className="text-xs text-gray-400">Tonight 8 PM</span>
            </div>
            <button className="mt-2 w-full py-2 bg-gradient-to-r from-[#E8593C] to-[#E4458F] text-white rounded-lg text-sm font-medium">
              Reserve Spot
            </button>
            <p className="text-[10px] text-gray-400 mt-1 text-center">
              Entry fee: 50 tokens · After rounds: match with favorites · Matches get 4 free messages
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl mt-4">
            <h4 className="font-medium text-sm mb-2">Event types you can create:</h4>
            <div className="flex flex-wrap gap-2">
              {[
                'One-on-one',
                'Group session',
                'Workshop',
                'Webinar',
                'Consultation',
                'Coaching',
                'Speed Dating',
                'Other',
              ].map((t) => (
                <span key={t} className="px-3 py-1 bg-white border rounded-full text-xs">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Events support: ticket sales (tokens), max attendees limit, virtual (with meeting
              URL) or in-person (with location), and automatic refund if event is cancelled.
            </p>
          </div>
        </div>
      )}

      {/* === TAB: POLICY & RULES === */}
      {tab === 'policy' && (
        <div className="space-y-4">
          {/* Cancellation by Guest */}
          <div className="p-4 bg-blue-50 rounded-xl">
            <h3 className="font-semibold text-blue-800 mb-2">Guest Cancellation Policy</h3>
            <p className="text-xs text-blue-600 mb-2">Based on time before meeting start:</p>
            <ul className="text-sm text-blue-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded mt-0.5">
                  &gt;72h
                </span>
                <span>100% refund of the host reference portion (up to reference only). Reference platform portion: up to 20% fee.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded mt-0.5">
                  24-72h
                </span>
                <span>
                  50% refund of the host reference portion. The remaining reference host portion may be paid out under platform rules. Reference platform portion: up to 20%. Not guaranteed.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded mt-0.5">
                  &lt;24h
                </span>
                <span>No refund. You may earn up to up to reference rate before applicable deductions. Reference platform portion: up to 20%. Not guaranteed.</span>
              </li>
            </ul>
          </div>

          {/* Cancellation by Host */}
          <div className="p-4 bg-green-50 rounded-xl">
            <h3 className="font-semibold text-green-800 mb-2">Host Cancellation</h3>
            <p className="text-sm text-green-700">
              If the host cancels at any time: <strong>100% full refund</strong> to guest,
              including Avalo&apos;s 20% fee. Guest gets back everything they paid.
            </p>
          </div>

          {/* No-show */}
          <div className="p-4 bg-amber-50 rounded-xl">
            <h3 className="font-semibold text-amber-800 mb-2">No-Show Policy</h3>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>
                • <strong>Guest no-show:</strong> You may earn up to up to reference rate before applicable deductions. No refund. Reference platform portion: up to 20%. Not guaranteed.
              </li>
              <li>
                • <strong>Host no-show:</strong> Full refund to guest including Avalo fee.
              </li>
            </ul>
          </div>

          {/* Escrow */}
          <div className="p-4 bg-purple-50 rounded-xl">
            <h3 className="font-semibold text-purple-800 mb-2">Escrow System</h3>
            <p className="text-sm text-purple-700">
              When booking: tokens are deducted from guest and held in escrow. Split: up to reference rate host
              share + 20% Avalo fee. Tokens released to host ONLY after meeting is completed. If
              cancelled or disputed — refund rules above apply.
            </p>
          </div>

          {/* Safety */}
          <div className="p-4 bg-red-50 rounded-xl">
            <h3 className="font-semibold text-red-800 mb-2">Safety Features</h3>
            <ul className="text-sm text-red-700 space-y-1">
              <li>
                • <strong>QR Check-in:</strong> Unique QR code per booking. Scan to verify meeting
                started.
              </li>
              <li>
                • <strong>Mismatch Report:</strong> Report within <strong>15 minutes</strong> of
                check-in if person doesn&apos;t match photos. Full refund (including Avalo fee).
                Reported user flagged for review.
              </li>
              <li>
                • <strong>Panic Button:</strong> Emergency alert with optional location sharing.
              </li>
              <li>
                • <strong>Goodwill Refund:</strong> Host can voluntarily refund their up to reference rate after
                completion.
              </li>
            </ul>
          </div>

          {/* Meeting Categories */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-800 mb-2">Allowed Meeting Types</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                'Coffee',
                'Lunch',
                'Dinner',
                'Walk',
                'Sport',
                'Concert',
                'Gaming',
                'Study',
                'Cooking',
                'Museum',
                'Cinema',
                'Other',
              ].map((c) => (
                <span key={c} className="px-3 py-1 bg-white border rounded-full text-xs">
                  {c}
                </span>
              ))}
            </div>
            <p className="text-xs text-red-500 mt-3 font-medium">
              ⚠️ Meeting proposals with sexual content are automatically rejected by the AI intent
              classifier and the account is flagged. This is enforced at the backend level.
            </p>
          </div>

          {/* Refund non-eligible reasons */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-800 mb-2">Non-Refundable Reasons</h3>
            <p className="text-sm text-gray-600 mb-2">
              The following reasons are automatically rejected:
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• &quot;Not enough attention&quot; — emotional satisfaction claims</li>
              <li>• &quot;Not nice enough&quot; — emotional satisfaction claims</li>
              <li>• &quot;Expected romance&quot; — romantic service expectations</li>
              <li>• &quot;Already consumed&quot; — content/service already used</li>
              <li>• &quot;Changed my mind&quot; — buyer&apos;s remorse</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}


