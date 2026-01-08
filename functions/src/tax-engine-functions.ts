/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Cloud Functions HTTP Endpoints
 */

import * as functions from 'firebase-functions';
import {
  registerTaxProfile,
  getTaxProfile,
  updateTaxProfile,
  lockTaxProfileIfFraudSuspected,
  unlockTaxProfile,
  submitKYCDocuments,
  verifyTaxProfile,
  checkPayoutEligibility,
  calculateTaxLiability,
  generateTaxReport,
  exportTaxReport,
  getTaxReportsForUser,
  getComplianceRequirements,
  recalculateTaxLiabilityForPeriod
} from './tax-engine';

export const taxProfileRegister = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const result = await registerTaxProfile({
    userId,
    legalFullName: data.legalFullName,
    taxResidencyCountry: data.taxResidencyCountry,
    accountType: data.accountType,
    businessRegistrationNumber: data.businessRegistrationNumber,
    vatNumber: data.vatNumber,
    eoriNumber: data.eoriNumber,
    taxId: data.taxId,
    payoutAccountName: data.payoutAccountName,
    payoutAccountCountry: data.payoutAccountCountry
  });

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to register tax profile', {
      missingFields: result.missingFields
    });
  }

  return result;
});

export const taxProfileGet = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const profile = await getTaxProfile(userId);

  if (!profile) {
    throw new functions.https.HttpsError('not-found', 'Tax profile not found');
  }

  return profile;
});

export const taxProfileUpdate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const result = await updateTaxProfile(userId, data.updates);

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to update tax profile');
  }

  return result;
});

export const taxProfileSubmitKYC = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const result = await submitKYCDocuments(userId);

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to submit KYC documents');
  }

  return result;
});

export const taxProfileCheckEligibility = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const eligibility = await checkPayoutEligibility(userId);

  return eligibility;
});

export const taxProfileGetRequirements = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const requirements = getComplianceRequirements(
    data.country,
    data.accountType
  );

  return requirements;
});

export const taxReportGenerate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const result = await generateTaxReport({
    userId,
    reportType: data.reportType,
    taxYear: data.taxYear,
    taxQuarter: data.taxQuarter
  });

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to generate tax report');
  }

  return result;
});

export const taxReportExport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const result = await exportTaxReport(
    data.reportId,
    userId,
    data.exportType,
    context.rawRequest?.ip || 'unknown',
    context.rawRequest?.headers['user-agent'] || 'unknown'
  );

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to export tax report');
  }

  return result;
});

export const taxReportsList = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const reports = await getTaxReportsForUser(userId, data.taxYear);

  return reports;
});

export const taxLiabilityRecalculate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const result = await recalculateTaxLiabilityForPeriod(
    userId,
    new Date(data.periodStart),
    new Date(data.periodEnd)
  );

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to recalculate tax liability');
  }

  return result;
});

export const taxProfileLock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const customClaims = context.auth.token;
  if (!customClaims.admin && !customClaims.moderator) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can lock tax profiles');
  }

  const result = await lockTaxProfileIfFraudSuspected(
    data.userId,
    data.reason
  );

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to lock tax profile');
  }

  return result;
});

export const taxProfileUnlock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const customClaims = context.auth.token;
  if (!customClaims.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can unlock tax profiles');
  }

  const result = await unlockTaxProfile(
    data.userId,
    context.auth.uid
  );

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to unlock tax profile');
  }

  return result;
});

export const taxProfileVerify = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const customClaims = context.auth.token;
  if (!customClaims.admin && !customClaims.moderator) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins and moderators can verify tax profiles');
  }

  const result = await verifyTaxProfile(
    data.userId,
    data.approved,
    context.auth.uid
  );

  if (!result.success) {
    throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to verify tax profile');
  }

  return result;
});