'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Appeal Page - Allow users to submit appeals for restrictions
 * UI-only implementation - no automated unbans
 */
export default function AppealPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      alert('You must be logged in to submit an appeal.');
      return;
    }

    if (message.trim().length < 20) {
      alert('Please provide at least 20 characters explaining your appeal.');
      return;
    }

    try {
      setSubmitting(true);
      const db = getFirestore();

      // Save appeal to Firestore
      await addDoc(collection(db, 'appeals'), {
        userId: user.uid,
        message: message.trim(),
        createdAt: serverTimestamp(),
        platform: 'web',
        status: 'PENDING',
      });

      alert('Your appeal has been submitted and will be reviewed by our team.');
      router.back();
    } catch (error) {
      console.error('Error submitting appeal:', error);
      alert('Failed to submit appeal. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-3xl text-teal-500 hover:text-teal-600 transition-colors mb-4"
          >
            ←
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center">
            Appeal Restriction
          </h1>
        </div>

        {/* Icon */}
        <div className="text-center mb-6">
          <span className="text-7xl">📝</span>
        </div>

        {/* Description */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Appeal Restriction
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Explain why you believe this restriction is incorrect
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          {/* Message Input */}
          <div className="mb-6">
            <label
              htmlFor="appeal-message"
              className="block text-sm font-semibold text-gray-900 dark:text-white mb-2"
            >
              Explain why you believe this restriction is incorrect
            </label>
            <textarea
              id="appeal-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please provide details about why you think this decision should be reviewed..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              rows={8}
              maxLength={2000}
              required
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-right mt-2">
              {message.length} / 2000
            </p>
          </div>

          {/* Optional Screenshot Note */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-teal-500 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
              💡 Optional: Upload screenshot
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 italic">
              (Feature coming soon)
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || message.trim().length < 20}
            className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-colors shadow-lg disabled:shadow-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit Appeal'
            )}
          </button>

          {/* Important Notice */}
          <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded-lg">
            <div className="flex items-start">
              <span className="text-2xl mr-3">⚠️</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                Appeals are reviewed manually by our team. Response time may vary.
                Submitting multiple appeals will not speed up the process.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}