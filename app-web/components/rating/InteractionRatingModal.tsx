/**
 * PACK 423 — Interaction Rating Modal (Web)
 * Post-interaction rating UI for web
 */

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

interface InteractionRatingModalProps {
  open: boolean;
  onClose: () => void;
  interactionId: string;
  interactionType: string;
  targetUserId?: string;
  targetCompanionId?: string;
}

export const InteractionRatingModal: React.FC<InteractionRatingModalProps> = ({
  open,
  onClose,
  interactionId,
  interactionType,
  targetUserId,
  targetCompanionId,
}) => {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        alert('You must be logged in to rate');
        return;
      }

      const functions = getFunctions();
      const createRating = httpsCallable(functions, 'pack423_createInteractionRating');

      await createRating({
        interactionType,
        interactionId,
        raterUserId: user.uid,
        targetUserId,
        targetCompanionId,
        rating,
        comment: comment.trim() || undefined,
        isAnonymous,
        source: 'POST_FLOW',
        locale: navigator.language,
        platform: 'WEB',
      });

      alert('Thank you! Your rating has been submitted');
      onClose();
    } catch (error: any) {
      console.error('Error submitting rating:', error);
      alert(error.message || 'Failed to submit rating');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Rate Your Experience</h2>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <p style={styles.subtitle}>Help us improve by sharing your feedback</p>

        <div style={styles.ratingSection}>
          <label style={styles.label}>How was your experience?</label>
          <div style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                style={styles.starButton}
                onClick={() => setRating(star as 1 | 2 | 3 | 4 | 5)}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(null)}
              >
                <span
                  style={{
                    ...styles.star,
                    color:
                      star <= (hoveredStar || rating) ? '#FFD700' : '#E0E0E0',
                  }}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.commentSection}>
          <label style={styles.label}>Any additional comments? (Optional)</label>
          <textarea
            style={styles.textarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={500}
            rows={4}
          />
          <div style={styles.charCount}>{comment.length}/500</div>
        </div>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            style={styles.checkbox}
          />
          Submit anonymously
        </label>

        <div style={styles.actions}>
          <button
            style={styles.submitButton}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Rating'}
          </button>
          <button
            style={styles.skipButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    padding: '0',
    lineHeight: '1',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666666',
    marginBottom: '24px',
  },
  ratingSection: {
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  label: {
    display: 'block',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  stars: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  },
  starButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
  },
  star: {
    fontSize: '48px',
    transition: 'color 0.2s',
  },
  commentSection: {
    marginBottom: '24px',
  },
  textarea: {
    width: '100%',
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '16px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
  },
  charCount: {
    textAlign: 'right' as const,
    fontSize: '12px',
    color: '#999999',
    marginTop: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '16px',
    marginBottom: '24px',
    cursor: 'pointer',
  },
  checkbox: {
    marginRight: '8px',
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  skipButton: {
    backgroundColor: 'transparent',
    color: '#999999',
    border: 'none',
    padding: '12px',
    fontSize: '16px',
    cursor: 'pointer',
  },
};
