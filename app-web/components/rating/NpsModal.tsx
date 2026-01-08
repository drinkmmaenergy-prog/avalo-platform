/**
 * PACK 423 — NPS Survey Modal (Web)
 * "How likely are you to recommend Avalo?" (0-10 scale)
 */

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface NpsModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export const NpsModal: React.FC<NpsModalProps> = ({
  open,
  onClose,
  onComplete,
}) => {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (score === null) {
      alert('Please select a score');
      return;
    }

    try {
      setIsSubmitting(true);

      const functions = getFunctions();
      const createNps = httpsCallable(functions, 'pack423_createNpsResponse');

      await createNps({
        score,
        comment: comment.trim() || undefined,
        channel: 'IN_APP_MODAL',
        locale: navigator.language,
        platform: 'WEB',
      });

      alert('Thank you! Your feedback helps us improve');
      onComplete?.();
      onClose();
    } catch (error: any) {
      console.error('Error submitting NPS:', error);
      alert(error.message || 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScoreColor = (s: number) => {
    if (s <= 6) return '#F44336'; // Detractor
    if (s <= 8) return '#FF9800'; // Passive
    return '#4CAF50'; // Promoter
  };

  const getScoreLabel = () => {
    if (score === null) return '';
    if (score <= 6) return 'Not likely';
    if (score <= 8) return 'Somewhat likely';
    return 'Very likely';
  };

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            How likely are you to recommend Avalo to a friend?
          </h2>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.scaleContainer}>
          <div style={styles.scaleRow}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                style={{
                  ...styles.scoreButton,
                  ...(score === num && {
                    backgroundColor: getScoreColor(num),
                    borderColor: getScoreColor(num),
                    color: '#FFFFFF',
                  }),
                }}
                onClick={() => setScore(num)}
              >
                {num}
              </button>
            ))}
          </div>

          <div style={styles.scaleLabelRow}>
            <span style={styles.scaleLabel}>Not at all likely</span>
            <span style={styles.scaleLabel}>Extremely likely</span>
          </div>

          {score !== null && (
            <div
              style={{
                ...styles.scoreLabel,
                color: getScoreColor(score),
              }}
            >
              {getScoreLabel()}
            </div>
          )}
        </div>

        <div style={styles.commentSection}>
          <label style={styles.label}>
            What's the main reason for your score? (Optional)
          </label>
          <textarea
            style={styles.textarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more..."
            maxLength={300}
            rows={4}
          />
          <div style={styles.charCount}>{comment.length}/300</div>
        </div>

        <div style={styles.actions}>
          <button
            style={{
              ...styles.submitButton,
              ...(score === null || isSubmitting ? { opacity: 0.6 } : {}),
            }}
            onClick={handleSubmit}
            disabled={score === null || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
          <button
            style={styles.laterButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Maybe later
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
    flex: 1,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    padding: '0',
    lineHeight: '1',
    marginLeft: '16px',
  },
  scaleContainer: {
    marginBottom: '24px',
  },
  scaleRow: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '12px',
  },
  scoreButton: {
    width: '48px',
    height: '48px',
    borderRadius: '24px',
    border: '2px solid #E0E0E0',
    backgroundColor: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  scaleLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
  },
  scaleLabel: {
    fontSize: '12px',
    color: '#666666',
  },
  scoreLabel: {
    textAlign: 'center' as const,
    marginTop: '16px',
    fontSize: '18px',
    fontWeight: '600',
  },
  commentSection: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
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
  laterButton: {
    backgroundColor: 'transparent',
    color: '#999999',
    border: 'none',
    padding: '12px',
    fontSize: '16px',
    cursor: 'pointer',
  },
};
