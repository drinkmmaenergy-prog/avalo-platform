/**
 * Virtual Event Room Component
 * Placeholder for multi-peer WebRTC interface
 */

'use client';

export default function VirtualEventRoom() {
  return (
    <div className="h-full bg-gray-900 text-white rounded-lg flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Virtual Event Room</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎥</div>
          <p className="text-gray-400">Virtual events coming soon</p>
        </div>
      </div>
    </div>
  );
}

