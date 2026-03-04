/**
 * Profile Editor Component
 * Placeholder for profile customization
 */

'use client';

export default function ProfileEditor() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">
            Photo
          </div>
          <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Change Photo
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
            rows={4}
            placeholder="Tell us about yourself"
          />
        </div>
        <button className="w-full py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition">
          Save Changes
        </button>
      </div>
    </div>
  );
}

