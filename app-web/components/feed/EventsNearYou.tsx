/**
 * PACK 270 - Events Near You Component (Web)
 */

'use client';

import React from 'react';
import type { Event } from '../../../shared/types/feed';

interface EventsNearYouProps {
  events: Event[];
}

export function EventsNearYou({ events }: EventsNearYouProps) {
  if (!events || events.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4">🎉 Events Near You</h2>
      <div className="flex overflow-x-auto space-x-4 pb-2">
        {events.map((event) => (
          <a
            key={event.id}
            href={`/events/${event.id}`}
            className="flex-shrink-0 w-64 border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition"
          >
            <img
              src={event.coverImage}
              alt={event.title}
              className="w-full h-40 object-cover"
            />
            <div className="p-4">
              <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">
                {event.title}
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                {new Date(event.startDate).toLocaleDateString()}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  👥 {event.going} going
                </span>
                {event.isFree ? (
                  <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    FREE
                  </span>
                ) : (
                  <span className="text-xs font-bold text-gray-700 bg-gray-200 px-2 py-1 rounded">
                    {event.ticketPrice} {event.currency}
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}