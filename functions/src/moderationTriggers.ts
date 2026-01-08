/**
 * PACK 54 - Moderation Triggers
 * Firestore triggers for automatic case creation from reports
 */

import * as functions from 'firebase-functions';
import { createOrUpdateCaseFromReport } from './moderationEngine';

/**
 * Firestore onCreate trigger for reports collection
 * Automatically creates or updates moderation cases when new reports are submitted
 */
export const onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snapshot, context) => {
    const reportId = context.params.reportId;
    const reportData = snapshot.data();

    if (!reportData) {
      console.warn(`[Moderation] Report ${reportId} has no data, skipping case creation`);
      return;
    }

    const { targetId, reason } = reportData;

    if (!targetId || !reason) {
      console.warn(`[Moderation] Report ${reportId} missing targetId or reason, skipping`);
      return;
    }

    try {
      const result = await createOrUpdateCaseFromReport(reportId, targetId, reason);

      if (result.created) {
        console.log(
          `[Moderation] Created new case ${result.caseId} for user ${targetId} from report ${reportId}`
        );
      } else {
        console.log(
          `[Moderation] Updated existing case ${result.caseId} for user ${targetId} with report ${reportId}`
        );
      }
    } catch (error: any) {
      console.error(`[Moderation] Error creating/updating case from report ${reportId}:`, error);
      // Don't throw - let the report exist even if case creation fails
    }
  });