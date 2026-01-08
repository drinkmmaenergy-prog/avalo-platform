/**
 * MVP STUB — Feedback Service
 * Used by FeatureSurveyModal
 * Safe for production build (no-op)
 */

export interface FeatureFeedbackPayload {
  featureId?: string;
  rating?: number;
  comment?: string;
}

export async function submitFeatureFeedback(
  payload: FeatureFeedbackPayload
): Promise<void> {
  try {
    console.log('[feedbackService] submitFeatureFeedback (stub)', payload);
    return;
  } catch (error) {
    console.error('[feedbackService] submitFeatureFeedback error', error);
    return;
  }
}

export async function declineFeedback(): Promise<void> {
  try {
    console.log('[feedbackService] declineFeedback (stub)');
    return;
  } catch (error) {
    console.error('[feedbackService] declineFeedback error', error);
    return;
  }
}
