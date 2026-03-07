'use client';

/**
 * Media Upload Component
 * Placeholder for file upload with preview
 */
export default function MediaUpload() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Upload Media</h2>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <div className="text-4xl mb-2">📁</div>
        <p className="text-gray-600">Drag and drop files here</p>
        <p className="text-gray-400 text-sm mt-1">or click to browse</p>
        <button className="mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition">
          Select Files
        </button>
      </div>
    </div>
  );
}


