'use client';

/**
 * Settings Panel Component
 * Placeholder for app configuration
 */
export default function SettingsPanel() {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <div className="divide-y">
        <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
          <span>Account</span>
          <span className="text-gray-400">→</span>
        </button>
        <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
          <span>Privacy</span>
          <span className="text-gray-400">→</span>
        </button>
        <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
          <span>Notifications</span>
          <span className="text-gray-400">→</span>
        </button>
        <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
          <span>Security</span>
          <span className="text-gray-400">→</span>
        </button>
        <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center text-red-600">
          <span>Sign Out</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}


