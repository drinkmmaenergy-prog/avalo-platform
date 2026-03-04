/**
 * Event Details Component
 * Placeholder for event information and tickets
 */

'use client';

export default function EventDetails() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-2xl font-bold mb-4">Event Details</h1>
      <div className="space-y-4">
        <div className="h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
          Event cover image
        </div>
        <p className="text-gray-600">Event details and ticket purchase coming soon</p>
      </div>
    </div>
  );
}

