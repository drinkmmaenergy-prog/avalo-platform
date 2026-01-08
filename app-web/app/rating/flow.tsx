/**
 * PACK 411 — In-App Rating Flow (Web)
 * UI component for rating prompts and feedback collection
 */

'use client';

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RatingPromptDecision } from '../../../shared/types/pack411-reviews';

interface RatingFlowProps {
  decision: RatingPromptDecision;
  onClose: () => void;
  appVersion: string;
}

export function RatingFlow({ decision, onClose, appVersion }: RatingFlowProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const functions = getFunctions();

  const logRatingPrompt = async (
    userAction?: string,
    redirectedToStore: boolean = false,
    linkedSupportTicketId?: string
  ) => {
    try {
      const logPrompt = httpsCallable(functions, 'pack411_logRatingPrompt');
      await logPrompt({
        appVersion,
        decision,
        userAction,
        redirectedToStore,
        linkedSupportTicketId,
      });
    } catch (error) {
      console.error('Error logging rating prompt:', error);
    }
  };

  const handleRatingSelect = async (rating: number) => {
    setSelectedRating(rating);
    await logRatingPrompt(`RATED_${rating}`);

    // High ratings (4-5) -> show confirmation and close
    if (rating >= 4) {
      setTimeout(() => {
        alert('Thank you for your positive feedback! 🎉');
        onClose();
      }, 500);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!selectedRating || selectedRating >= 4 || !feedback.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      const createTicket = httpsCallable(functions, 'pack411_createFeedbackTicket');
      const result = await createTicket({
        rating: selectedRating,
        feedback,
        appVersion,
      });

      const data = result.data as { success: boolean; ticketId: string };

      if (data.success) {
        await logRatingPrompt('FEEDBACK', false, data.ticketId);
        alert('Thank you for your feedback! We\'ll work on improving your experience.');
        onClose();
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Could not submit feedback. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    await logRatingPrompt('DISMISSED');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Enjoying Avalo?
        </h2>
        <p className="text-sm text-gray-600 text-center mb-6">
          {selectedRating && selectedRating < 4
            ? "We're sorry to hear that. Please tell us what we can improve."
            : 'Rate your experience with us!'}
        </p>

        {/* Star Rating */}
        {!selectedRating && (
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className="transition-transform hover:scale-110"
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(null)}
                onClick={() => handleRatingSelect(star)}
              >
                <span
                  className={`text-5xl ${
                    (hoveredRating !== null && star <= hoveredRating) ||
                    (selectedRating !== null && star <= selectedRating)
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Feedback form for low ratings */}
        {selectedRating && selectedRating < 4 && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What can we do better?
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={4}
              placeholder="Tell us what went wrong..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={submitting}
            />
            <button
              className={`w-full mt-4 py-3 rounded-lg font-semibold text-white transition ${
                submitting || !feedback.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              onClick={handleSubmitFeedback}
              disabled={submitting || !feedback.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        )}

        {/* Dismiss button */}
        <button
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition"
          onClick={handleDismiss}
        >
          {selectedRating && selectedRating < 4 ? 'Skip' : 'Not Now'}
        </button>
      </div>
    </div>
  );
}

/**
 * Hook to manage rating prompt display
 */
export function useRatingPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [decision, setDecision] = useState<RatingPromptDecision | null>(null);

  const checkAndShowPrompt = async () => {
    try {
      const functions = getFunctions();
      const checkDecision = httpsCallable<
        { appVersion: string },
        RatingPromptDecision
      >(functions, 'pack411_ratingPromptDecision');

      const appVersion = '1.0.0'; // Get from config or Constants
      const result = await checkDecision({ appVersion });

      if (result.data.shouldPrompt) {
        setDecision(result.data);
        setShowPrompt(true);
      }
    } catch (error) {
      console.error('Error checking rating prompt:', error);
    }
  };

  const closePrompt = () => {
    setShowPrompt(false);
    setDecision(null);
  };

  return {
    showPrompt,
    decision,
    checkAndShowPrompt,
    closePrompt,
  };
}
