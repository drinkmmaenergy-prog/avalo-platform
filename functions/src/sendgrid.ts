/**
 * ========================================================================
 * AVALO 3.0 — SENDGRID EMAIL NOTIFICATION SYSTEM
 * ========================================================================
 *
 * Complete email notification layer using SendGrid API.
 * Handles compliance alerts, security notifications, and user communications.
 *
 * Key Features:
 * - Compliance alert notifications (GDPR, AML)
 * - Security breach alerts
 * - KYC status notifications
 * - Transaction confirmations (deposits/withdrawals)
 * - Report ready notifications
 * - Retry logic with exponential backoff
 * - Error handling and logging
 * - Rate limiting protection
 * - Template support
 *
 * Dependencies:
 * - @sendgrid/mail (npm install @sendgrid/mail)
 * - SendGrid API Key (environment variable: SENDGRID_API_KEY)
 *
 * @module sendgrid
 * @version 3.0.0
 * @license Proprietary - Avalo Inc.
 */

import sgMail from '@sendgrid/mail';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

// Simple logger
const logger = {
  info: (msg: string, ...args: any[]) => console.log('[SendGrid INFO]', msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn('[SendGrid WARN]', msg, ...args),
  error: (msg: string, ...args: any[]) => console.error('[SendGrid ERROR]', msg, ...args),
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "notifications@avalo.app";
const FROM_NAME = "Avalo Team";

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000; // Initial delay, doubles with each retry

// Rate limiting
const RATE_LIMIT_PER_USER_HOUR = 10;

// Initialize SendGrid
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  logger.warn("SENDGRID_API_KEY not set - email notifications disabled");
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum EmailType {
  COMPLIANCE_ALERT = "compliance_alert",
  SECURITY_BREACH = "security_breach",
  KYC_STATUS = "kyc_status",
  DEPOSIT_CONFIRMATION = "deposit_confirmation",
  WITHDRAWAL_CONFIRMATION = "withdrawal_confirmation",
  REPORT_READY = "report_ready",
  PASSWORD_RESET = "password_reset",
  ACCOUNT_SUSPENDED = "account_suspended",
}

interface EmailLog {
  emailId: string;
  userId: string;
  type: EmailType;
  recipient: string;
  subject: string;
  status: "sent" | "failed" | "queued" | "retrying";
  attempts: number;
  sentAt?: Timestamp;
  failedAt?: Timestamp;
  error?: string;
  metadata?: Record<string, any>;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  type: EmailType;
  userId: string;
  metadata?: Record<string, any>;
  retryCount?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check rate limit for user
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const db = getFirestore();
  const oneHourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);

  const recentEmails = await db
    .collection("email_logs")
    .where("userId", "==", userId)
    .where("sentAt", ">=", oneHourAgo)
    .count()
    .get();

  return recentEmails.data().count < RATE_LIMIT_PER_USER_HOUR;
}

/**
 * Log email attempt
 */
async function logEmail(log: EmailLog): Promise<void> {
  const db = getFirestore();
  await db.collection("email_logs").add({
    ...log,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Retry delay with exponential backoff
 */
function getRetryDelay(attempt: number): number {
  return RETRY_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CORE EMAIL SENDING FUNCTION
// ============================================================================

/**
 * Send email with retry logic
 */
async function sendEmailWithRetry(options: SendEmailOptions): Promise<boolean> {
  const {
    to,
    subject,
    text,
    html,
    type,
    userId,
    metadata,
    retryCount = 0,
  } = options;

  // Check if SendGrid is configured
  if (!SENDGRID_API_KEY) {
    logger.warn("SendGrid not configured - skipping email");
    return false;
  }

  // Check rate limit
  const withinLimit = await checkRateLimit(userId);
  if (!withinLimit) {
    logger.warn(`Rate limit exceeded for user ${userId}`);
    return false;
  }

  const emailId = `email_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    const msg = {
      to,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      subject,
      text,
      html,
    };

    await sgMail.send(msg);

    // Log success
    await logEmail({
      emailId,
      userId,
      type,
      recipient: to,
      subject,
      status: "sent",
      attempts: retryCount + 1,
      sentAt: Timestamp.now(),
      metadata,
    });

    logger.info(`Email sent successfully: ${type} to ${to}`);
    return true;
  } catch (error: any) {
    logger.error(`Email send failed (attempt ${retryCount + 1}):`, error);

    // Retry logic
    if (retryCount < MAX_RETRY_ATTEMPTS) {
      const delay = getRetryDelay(retryCount);
      logger.info(`Retrying email in ${delay}ms...`);

      await logEmail({
        emailId,
        userId,
        type,
        recipient: to,
        subject,
        status: "retrying",
        attempts: retryCount + 1,
        metadata,
        error: error.message,
      });

      await sleep(delay);

      return sendEmailWithRetry({
        ...options,
        retryCount: retryCount + 1,
      });
    } else {
      // Max retries exceeded
      await logEmail({
        emailId,
        userId,
        type,
        recipient: to,
        subject,
        status: "failed",
        attempts: retryCount + 1,
        failedAt: Timestamp.now(),
        error: error.message,
        metadata,
      });

      logger.error(`Email failed after ${MAX_RETRY_ATTEMPTS} attempts: ${type}`);
      return false;
    }
  }
}

// ============================================================================
// EMAIL NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Send compliance alert notification
 */
export async function sendComplianceAlert(
  userId: string,
  email: string,
  alertDetails: {
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    actionRequired?: string;
  }
): Promise<boolean> {
  const subject = `[Compliance Alert] ${alertDetails.severity.toUpperCase()}: ${alertDetails.type}`;

  const text = `
Compliance Alert

Severity: ${alertDetails.severity.toUpperCase()}
Type: ${alertDetails.type}

Description:
${alertDetails.description}

${alertDetails.actionRequired ? `Action Required:\n${alertDetails.actionRequired}` : "No immediate action required."}

---
Avalo Compliance Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
    .content { background: #f8f9fa; padding: 20px; margin-top: 20px; }
    .severity { font-size: 18px; font-weight: bold; color: #dc3545; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Compliance Alert</h1>
    </div>
    <div class="content">
      <p class="severity">Severity: ${alertDetails.severity.toUpperCase()}</p>
      <p><strong>Type:</strong> ${alertDetails.type}</p>
      <p><strong>Description:</strong></p>
      <p>${alertDetails.description}</p>
      ${alertDetails.actionRequired ? `<p><strong>Action Required:</strong></p><p>${alertDetails.actionRequired}</p>` : ""}
    </div>
    <div class="footer">
      <p>This is an automated compliance notification from Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject,
    text,
    html,
    type: EmailType.COMPLIANCE_ALERT,
    userId,
    metadata: alertDetails,
  });
}

/**
 * Send security breach alert
 */
export async function sendSecurityBreachAlert(
  userId: string,
  email: string,
  breachDetails: {
    type: string;
    detectedAt: string;
    ipAddress?: string;
    device?: string;
    actionTaken: string;
  }
): Promise<boolean> {
  const subject = `[URGENT] Security Alert Detected on Your Account`;

  const text = `
SECURITY ALERT

We detected suspicious activity on your Avalo account.

Breach Type: ${breachDetails.type}
Detected At: ${breachDetails.detectedAt}
${breachDetails.ipAddress ? `IP Address: ${breachDetails.ipAddress}` : ""}
${breachDetails.device ? `Device: ${breachDetails.device}` : ""}

Action Taken:
${breachDetails.actionTaken}

If this wasn't you, please:
1. Change your password immediately
2. Review your recent account activity
3. Contact support at support@avalo.app

---
Avalo Security Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .content { padding: 20px; }
    .actions { background: #d1ecf1; padding: 15px; margin: 20px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Security Alert</h1>
    </div>
    <div class="content">
      <div class="alert">
        <p><strong>We detected suspicious activity on your account.</strong></p>
      </div>
      <p><strong>Breach Type:</strong> ${breachDetails.type}</p>
      <p><strong>Detected At:</strong> ${breachDetails.detectedAt}</p>
      ${breachDetails.ipAddress ? `<p><strong>IP Address:</strong> ${breachDetails.ipAddress}</p>` : ""}
      ${breachDetails.device ? `<p><strong>Device:</strong> ${breachDetails.device}</p>` : ""}
      <div class="actions">
        <p><strong>Action Taken:</strong></p>
        <p>${breachDetails.actionTaken}</p>
      </div>
      <p><strong>If this wasn't you:</strong></p>
      <ul>
        <li>Change your password immediately</li>
        <li>Review your recent account activity</li>
        <li>Contact support at support@avalo.app</li>
      </ul>
    </div>
    <div class="footer">
      <p>This is an automated security notification from Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject,
    text,
    html,
    type: EmailType.SECURITY_BREACH,
    userId,
    metadata: breachDetails,
  });
}

/**
 * Send KYC status email
 */
export async function sendKycStatusEmail(
  userId: string,
  email: string,
  status: "approved" | "rejected" | "in_review",
  details?: {
    reason?: string;
    nextSteps?: string;
  }
): Promise<boolean> {
  const statusMessages = {
    approved: {
      subject: "✅ Your Identity Verification is Approved",
      heading: "Verification Approved",
      message: "Congratulations! Your identity verification has been successfully approved.",
      color: "#28a745",
    },
    rejected: {
      subject: "❌ Identity Verification Update",
      heading: "Verification Not Approved",
      message: "Unfortunately, we were unable to approve your identity verification.",
      color: "#dc3545",
    },
    in_review: {
      subject: "⏳ Identity Verification Under Review",
      heading: "Verification In Review",
      message: "Your identity verification is currently being reviewed by our team.",
      color: "#ffc107",
    },
  };

  const config = statusMessages[status];

  const text = `
${config.heading}

${config.message}

${details?.reason ? `Reason: ${details.reason}` : ""}
${details?.nextSteps ? `Next Steps:\n${details.nextSteps}` : ""}

If you have questions, contact support@avalo.app

---
Avalo Verification Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${config.color}; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; margin-top: 20px; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${config.heading}</h1>
    </div>
    <div class="content">
      <p>${config.message}</p>
      ${details?.reason ? `<p><strong>Reason:</strong> ${details.reason}</p>` : ""}
      ${details?.nextSteps ? `<p><strong>Next Steps:</strong></p><p>${details.nextSteps}</p>` : ""}
    </div>
    <div class="footer">
      <p>Questions? Contact us at support@avalo.app</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject: config.subject,
    text,
    html,
    type: EmailType.KYC_STATUS,
    userId,
    metadata: { status, ...details },
  });
}

/**
 * Send deposit confirmation email
 */
export async function sendDepositConfirmationEmail(
  userId: string,
  email: string,
  depositDetails: {
    amount: number;
    currency: string;
    tokens: number;
    transactionId: string;
    timestamp: string;
  }
): Promise<boolean> {
  const subject = `✅ Deposit Confirmed - ${depositDetails.amount} ${depositDetails.currency}`;

  const text = `
Deposit Confirmed

Your deposit has been successfully processed!

Amount: ${depositDetails.amount} ${depositDetails.currency}
Tokens Credited: ${depositDetails.tokens}
Transaction ID: ${depositDetails.transactionId}
Date: ${depositDetails.timestamp}

Your tokens are now available in your wallet.

---
Avalo Payments Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; margin-top: 20px; }
    .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #28a745; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Deposit Confirmed</h1>
    </div>
    <div class="content">
      <p>Your deposit has been successfully processed!</p>
      <div class="details">
        <p><strong>Amount:</strong> ${depositDetails.amount} ${depositDetails.currency}</p>
        <p><strong>Tokens Credited:</strong> ${depositDetails.tokens}</p>
        <p><strong>Transaction ID:</strong> ${depositDetails.transactionId}</p>
        <p><strong>Date:</strong> ${depositDetails.timestamp}</p>
      </div>
      <p>Your tokens are now available in your wallet.</p>
    </div>
    <div class="footer">
      <p>Thank you for using Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject,
    text,
    html,
    type: EmailType.DEPOSIT_CONFIRMATION,
    userId,
    metadata: depositDetails,
  });
}

/**
 * Send withdrawal confirmation email
 */
export async function sendWithdrawalConfirmationEmail(
  userId: string,
  email: string,
  withdrawalDetails: {
    amount: number;
    currency: string;
    tokens: number;
    transactionId: string;
    timestamp: string;
    estimatedArrival?: string;
  }
): Promise<boolean> {
  const subject = `💸 Withdrawal Processed - ${withdrawalDetails.amount} ${withdrawalDetails.currency}`;

  const text = `
Withdrawal Processed

Your withdrawal has been successfully processed!

Amount: ${withdrawalDetails.amount} ${withdrawalDetails.currency}
Tokens Deducted: ${withdrawalDetails.tokens}
Transaction ID: ${withdrawalDetails.transactionId}
Date: ${withdrawalDetails.timestamp}
${withdrawalDetails.estimatedArrival ? `Estimated Arrival: ${withdrawalDetails.estimatedArrival}` : ""}

---
Avalo Payments Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #007bff; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; margin-top: 20px; }
    .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #007bff; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💸 Withdrawal Processed</h1>
    </div>
    <div class="content">
      <p>Your withdrawal has been successfully processed!</p>
      <div class="details">
        <p><strong>Amount:</strong> ${withdrawalDetails.amount} ${withdrawalDetails.currency}</p>
        <p><strong>Tokens Deducted:</strong> ${withdrawalDetails.tokens}</p>
        <p><strong>Transaction ID:</strong> ${withdrawalDetails.transactionId}</p>
        <p><strong>Date:</strong> ${withdrawalDetails.timestamp}</p>
        ${withdrawalDetails.estimatedArrival ? `<p><strong>Estimated Arrival:</strong> ${withdrawalDetails.estimatedArrival}</p>` : ""}
      </div>
    </div>
    <div class="footer">
      <p>Thank you for using Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject,
    text,
    html,
    type: EmailType.WITHDRAWAL_CONFIRMATION,
    userId,
    metadata: withdrawalDetails,
  });
}

/**
 * Send report ready email
 */
export async function sendReportReadyEmail(
  userId: string,
  email: string,
  reportDetails: {
    reportType: string;
    reportName: string;
    downloadUrl: string;
    expiresAt: string;
  }
): Promise<boolean> {
  const subject = `📊 Your ${reportDetails.reportName} is Ready`;

  const text = `
Report Ready for Download

Your requested report is now available for download.

Report Type: ${reportDetails.reportType}
Report Name: ${reportDetails.reportName}

Download Link:
${reportDetails.downloadUrl}

This link expires on: ${reportDetails.expiresAt}

---
Avalo Data Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; margin-top: 20px; }
    .button { display: inline-block; background: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Report Ready</h1>
    </div>
    <div class="content">
      <p>Your requested report is now available for download.</p>
      <p><strong>Report Type:</strong> ${reportDetails.reportType}</p>
      <p><strong>Report Name:</strong> ${reportDetails.reportName}</p>
      <p style="text-align: center;">
        <a href="${reportDetails.downloadUrl}" class="button">Download Report</a>
      </p>
      <p><em>This link expires on: ${reportDetails.expiresAt}</em></p>
    </div>
    <div class="footer">
      <p>This is an automated notification from Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendEmailWithRetry({
    to: email,
    subject,
    text,
    html,
    type: EmailType.REPORT_READY,
    userId,
    metadata: reportDetails,
  });
}

// ============================================================================
// STATISTICS & MONITORING
// ============================================================================

/**
 * Get email sending statistics
 */
export async function getEmailStatistics(
  startDate: Timestamp,
  endDate: Timestamp
): Promise<{
  totalSent: number;
  totalFailed: number;
  byType: Record<string, number>;
  successRate: number;
}> {
  const db = getFirestore();

  const emailLogs = await db
    .collection("email_logs")
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .get();

  let totalSent = 0;
  let totalFailed = 0;
  const byType: Record<string, number> = {};

  emailLogs.docs.forEach((doc) => {
    const log = doc.data();
    if (log.status === "sent") totalSent++;
    if (log.status === "failed") totalFailed++;

    byType[log.type] = (byType[log.type] || 0) + 1;
  });

  const total = totalSent + totalFailed;
  const successRate = total > 0 ? (totalSent / total) * 100 : 0;

  return {
    totalSent,
    totalFailed,
    byType,
    successRate,
  };
}

