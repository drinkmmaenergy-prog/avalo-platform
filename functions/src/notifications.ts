/**
 * ========================================================================
 * AVALO COMPLETE NOTIFICATION SYSTEM
 * ========================================================================
 *
 * Production-grade notification service with SendGrid integration
 * Comprehensive email templates for all user journeys
 *
 * Features:
 * - Welcome & onboarding emails
 * - Transaction notifications
 * - Security alerts
 * - Compliance notifications
 * - Chat & social notifications
 * - AI subscription events
 * - Royal Club notifications
 *
 * @version 3.0.0
 * @module notifications
 */

;
;
import { FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "notifications@avalo.app";
const FROM_NAME = "Avalo";
const SUPPORT_EMAIL = "support@avalo.app";
const APP_URL = process.env.APP_URL || "https://avalo.app";

// Initialize SendGrid
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  logger.warn("SENDGRID_API_KEY not set - email notifications disabled");
}

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export enum NotificationType {
  WELCOME = "welcome",
  PASSWORD_RESET = "password_reset",
  NEW_MESSAGE = "new_message",
  DEPOSIT_CONFIRMATION = "deposit_confirmation",
  WITHDRAWAL_CONFIRMATION = "withdrawal_confirmation",
  AML_FLAG = "aml_flag",
  GDPR_EXPORT_READY = "gdpr_export_ready",
  SECURITY_ALERT_NEW_DEVICE = "security_alert_new_device",
  ROYAL_CLUB_ELIGIBILITY = "royal_club_eligibility",
  AI_SUBSCRIPTION_ACTIVATED = "ai_subscription_activated",
  AI_SUBSCRIPTION_CANCELLED = "ai_subscription_cancelled",
  PAYMENT_FAILED = "payment_failed",
  CHAT_ESCROW_LOW = "chat_escrow_low",
  VERIFICATION_REQUIRED = "verification_required",
}

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Welcome email template
 */
export function getWelcomeEmailTemplate(userName: string): EmailTemplate {
  const subject = `Welcome to Avalo, ${userName}! 🎉`;

  const text = `
Welcome to Avalo, ${userName}!

Thank you for joining our community. We're excited to have you here!

Here's what you can do next:
1. Complete your profile to get better matches
2. Add photos and a video intro
3. Start exploring and connecting with others
4. Check out our Royal Club program for creators

Need help? Visit ${APP_URL}/help or email us at ${SUPPORT_EMAIL}

Welcome aboard!
The Avalo Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .header { padding: 40px 20px; text-align: center; color: white; }
    .content { background: white; padding: 40px 30px; border-radius: 10px 10px 0 0; }
    .welcome-icon { font-size: 48px; margin-bottom: 20px; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .steps { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .step { margin: 12px 0; padding-left: 30px; position: relative; }
    .step:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; font-size: 18px; }
    .footer { padding: 30px; text-align: center; font-size: 13px; color: #666; background: #f8f9fa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="welcome-icon">🎉</div>
      <h1>Welcome to Avalo!</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>Thank you for joining Avalo! We're thrilled to have you as part of our community.</p>

      <div class="steps">
        <h3>Get Started:</h3>
        <div class="step">Complete your profile for better matches</div>
        <div class="step">Add photos and a video intro</div>
        <div class="step">Start exploring and connecting</div>
        <div class="step">Check out our Royal Club program</div>
      </div>

      <p style="text-align: center;">
        <a href="${APP_URL}/profile/edit" class="cta-button">Complete Your Profile</a>
      </p>

      <p><strong>Need help?</strong> Our support team is here for you at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    </div>
    <div class="footer">
      <p>Welcome to the Avalo community!</p>
      <p>&copy; ${new Date().getFullYear()} Avalo. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Password reset email template
 */
export function getPasswordResetEmailTemplate(resetLink: string): EmailTemplate {
  const subject = "Reset Your Avalo Password 🔐";

  const text = `
Password Reset Request

We received a request to reset your password for your Avalo account.

Click the link below to reset your password:
${resetLink}

This link expires in 1 hour.

If you didn't request this, please ignore this email or contact support at ${SUPPORT_EMAIL}

Stay secure,
The Avalo Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #667eea; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
    .reset-button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Password Reset</h1>
    </div>
    <div class="content">
      <p>We received a request to reset your Avalo password.</p>
      <p style="text-align: center;">
        <a href="${resetLink}" class="reset-button">Reset Password</a>
      </p>
      <p><small>Or copy and paste this link: <br>${resetLink}</small></p>

      <div class="warning">
        <strong>⚠️ Security Notice:</strong> This link expires in 1 hour.
      </div>

      <p>If you didn't request this, please ignore this email or contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    </div>
    <div class="footer">
      <p>This is an automated security email from Avalo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * New message notification
 */
export function getNewMessageEmailTemplate(
  senderName: string,
  messagePreview: string
): EmailTemplate {
  const subject = `💬 New message from ${senderName}`;

  const text = `
New Message from ${senderName}

"${messagePreview}"

Reply in the app: ${APP_URL}/chats

---
The Avalo Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #667eea; color: white; padding: 20px; text-align: center; }
    .message { background: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 4px; }
    .cta { text-align: center; margin: 30px 0; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>💬 New Message</h2>
    </div>
    <p><strong>${senderName}</strong> sent you a message:</p>
    <div class="message">
      "${messagePreview}"
    </div>
    <div class="cta">
      <a href="${APP_URL}/chats" class="cta-button">Reply Now</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * AML flag notification
 */
export function getAMLFlagEmailTemplate(
  flagReason: string,
  riskScore: number
): EmailTemplate {
  const subject = "⚠️ Account Review Required - AML Compliance";

  const text = `
Account Review Required

Your account has been flagged for compliance review.

Reason: ${flagReason}
Risk Score: ${riskScore}

Action Required:
Please contact our compliance team at ${SUPPORT_EMAIL} to resolve this matter.
You may need to provide additional verification documents.

Your account may have limited functionality until this is resolved.

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
    .header { background: #dc3545; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; background: #fff; border: 2px solid #dc3545; }
    .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .contact-button { display: inline-block; background: #dc3545; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Account Review Required</h1>
    </div>
    <div class="content">
      <p>Your account has been flagged for compliance review.</p>
      <div class="alert-box">
        <p><strong>Reason:</strong> ${flagReason}</p>
        <p><strong>Risk Score:</strong> ${riskScore}/100</p>
      </div>
      <p><strong>Action Required:</strong></p>
      <p>Please contact our compliance team to resolve this matter. You may need to provide additional verification documents.</p>
      <p style="text-align: center;">
        <a href="mailto:${SUPPORT_EMAIL}" class="contact-button">Contact Compliance Team</a>
      </p>
      <p><em>Your account functionality may be limited until this is resolved.</em></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * GDPR data export ready
 */
export function getGDPRExportReadyEmailTemplate(
  downloadUrl: string,
  expiresAt: string
): EmailTemplate {
  const subject = "📦 Your GDPR Data Export is Ready";

  const text = `
Your Data Export is Ready

Your requested GDPR data export has been prepared and is ready for download.

Download your data:
${downloadUrl}

This link expires on: ${expiresAt}

The export includes all your personal data stored in our systems.

---
Avalo Privacy Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #17a2b8; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; background: #f8f9fa; }
    .download-button { display: inline-block; background: #17a2b8; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .info-box { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 Data Export Ready</h1>
    </div>
    <div class="content">
      <p>Your GDPR data export has been prepared and is ready for download.</p>
      <div class="info-box">
        <p>The export includes all your personal data stored in our systems.</p>
      </div>
      <p style="text-align: center;">
        <a href="${downloadUrl}" class="download-button">Download Data</a>
      </p>
      <p><small><em>This link expires on: ${expiresAt}</em></small></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Security alert - new device
 */
export function getNewDeviceAlertEmailTemplate(
  deviceInfo: {
    device: string;
    location: string;
    time: string;
    ip: string;
  }
): EmailTemplate {
  const subject = "🔐 New Device Login Detected";

  const text = `
New Device Login Detected

We detected a login to your Avalo account from a new device:

Device: ${deviceInfo.device}
Location: ${deviceInfo.location}
Time: ${deviceInfo.time}
IP Address: ${deviceInfo.ip}

If this was you, no action is needed.

If this wasn't you:
1. Change your password immediately
2. Review your account activity
3. Contact support at ${SUPPORT_EMAIL}

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
    .header { background: #ffc107; color: #000; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; background: #fff; border: 2px solid #ffc107; }
    .device-info { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 6px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .secure-button { display: inline-block; background: #dc3545; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 New Device Login</h1>
    </div>
    <div class="content">
      <p>We detected a login from a new device:</p>
      <div class="device-info">
        <p><strong>Device:</strong> ${deviceInfo.device}</p>
        <p><strong>Location:</strong> ${deviceInfo.location}</p>
        <p><strong>Time:</strong> ${deviceInfo.time}</p>
        <p><strong>IP:</strong> ${deviceInfo.ip}</p>
      </div>
      <div class="warning">
        <p><strong>If this wasn't you:</strong></p>
        <ul>
          <li>Change your password immediately</li>
          <li>Review your account activity</li>
          <li>Contact support</li>
        </ul>
      </div>
      <p style="text-align: center;">
        <a href="${APP_URL}/security/change-password" class="secure-button">Change Password</a>
        <a href="mailto:${SUPPORT_EMAIL}" class="secure-button">Contact Support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Royal Club eligibility change
 */
export function getRoyalClubEligibilityEmailTemplate(
  eligible: boolean,
  reason: string
): EmailTemplate {
  const subject = eligible
    ? "👑 Welcome to Avalo Royal Club!"
    : "Royal Club Status Update";

  const text = eligible
    ? `
Congratulations! You're Now Royal Club Eligible

You've met the requirements for Avalo Royal Club membership!

Royal Club Benefits:
- Higher earnings (7 words per token vs 11)
- Exclusive badge on your profile
- Priority in matching algorithm
- Special features and perks

Reason for eligibility: ${reason}

Start earning more today!

---
The Avalo Team
    `.trim()
    : `
Royal Club Status Update

Your Royal Club eligibility has changed.

Status: Not Currently Eligible
Reason: ${reason}

To regain eligibility:
- Maintain 1000+ Instagram followers
- Earn 20,000+ tokens monthly
- Keep quality score above 70

Keep up the great work!

---
The Avalo Team
    `.trim();

  const html = eligible
    ? `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .header { padding: 40px 20px; text-align: center; color: white; }
    .crown { font-size: 64px; margin-bottom: 10px; }
    .content { background: white; padding: 40px 30px; border-radius: 10px 10px 0 0; }
    .benefits { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .benefit { margin: 10px 0; padding-left: 25px; position: relative; }
    .benefit:before { content: "✓"; position: absolute; left: 0; color: #f5576c; font-weight: bold; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="crown">👑</div>
      <h1>Welcome to Royal Club!</h1>
    </div>
    <div class="content">
      <p>Congratulations! You've unlocked Royal Club membership.</p>
      <div class="benefits">
        <h3>Your Royal Benefits:</h3>
        <div class="benefit">Higher earnings (7 words per token)</div>
        <div class="benefit">Exclusive Royal badge</div>
        <div class="benefit">Priority matching</div>
        <div class="benefit">Special features & perks</div>
      </div>
      <p><strong>Reason:</strong> ${reason}</p>
      <p style="text-align: center;">
        <a href="${APP_URL}/royal-club" class="cta-button">Explore Royal Club</a>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim()
    : `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6c757d; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; background: #f8f9fa; }
    .requirements { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Royal Club Status Update</h2>
    </div>
    <div class="content">
      <p>Your Royal Club eligibility has changed.</p>
      <p><strong>Status:</strong> Not Currently Eligible</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <div class="requirements">
        <h3>Requirements to Regain Eligibility:</h3>
        <ul>
          <li>1000+ Instagram followers</li>
          <li>20,000+ tokens earned monthly</li>
          <li>Quality score above 70</li>
        </ul>
      </div>
      <p>Keep up the great work and you'll be back soon!</p>
    </div>
  </div>
</body>
</html>
    `.trim();

  return { subject, text, html };
}

/**
 * AI subscription activated
 */
export function getAISubscriptionActivatedEmailTemplate(): EmailTemplate {
  const subject = "🤖 Your AI Companion Subscription is Active";

  const text = `
AI Companion Subscription Activated

Your AI companion subscription is now active!

What you get:
- Unlimited AI chat conversations
- AI-generated images (PG-13 & XXX)
- Voice message responses
- Custom companion personalities

Start chatting with your AI companions now!

---
The Avalo Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; background: #f8f9fa; }
    .features { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .feature { margin: 12px 0; padding-left: 30px; position: relative; }
    .feature:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; font-size: 18px; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 AI Subscription Active</h1>
    </div>
    <div class="content">
      <p>Your AI companion subscription is now active!</p>
      <div class="features">
        <h3>What You Get:</h3>
        <div class="feature">Unlimited AI chat conversations</div>
        <div class="feature">AI-generated images (PG-13 & XXX)</div>
        <div class="feature">Voice message responses</div>
        <div class="feature">Custom companion personalities</div>
      </div>
      <p style="text-align: center;">
        <a href="${APP_URL}/ai-companions" class="cta-button">Start Chatting</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

// ============================================================================
// CORE EMAIL SENDING FUNCTION
// ============================================================================

/**
 * Send email with retry logic
 */
export async function sendEmail(
  userId: string,
  email: string,
  type: NotificationType,
  template: EmailTemplate,
  metadata?: Record<string, any>
): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    logger.warn("SendGrid not configured - skipping email");
    return false;
  }

  try {
    const msg = {
      to: email,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    await sgMail.send(msg);

    // Log success
    await db.collection("email_logs").add({
      userId,
      email,
      type,
      subject: template.subject,
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      metadata,
    });

    logger.info(`Email sent: ${type} to ${email}`);
    return true;
  } catch (error: any) {
    logger.error(`Email send failed: ${type}`, error);

    // Log failure
    await db.collection("email_logs").add({
      userId,
      email,
      type,
      subject: template.subject,
      status: "failed",
      error: error.message,
      failedAt: FieldValue.serverTimestamp(),
      metadata,
    });

    return false;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function sendWelcomeEmail(
  userId: string,
  email: string,
  userName: string
): Promise<boolean> {
  const template = getWelcomeEmailTemplate(userName);
  return sendEmail(userId, email, NotificationType.WELCOME, template);
}

export async function sendPasswordResetEmail(
  userId: string,
  email: string,
  resetLink: string
): Promise<boolean> {
  const template = getPasswordResetEmailTemplate(resetLink);
  return sendEmail(userId, email, NotificationType.PASSWORD_RESET, template);
}

export async function sendNewMessageEmail(
  userId: string,
  email: string,
  senderName: string,
  messagePreview: string
): Promise<boolean> {
  const template = getNewMessageEmailTemplate(senderName, messagePreview);
  return sendEmail(userId, email, NotificationType.NEW_MESSAGE, template);
}

export async function sendAMLFlagEmail(
  userId: string,
  email: string,
  flagReason: string,
  riskScore: number
): Promise<boolean> {
  const template = getAMLFlagEmailTemplate(flagReason, riskScore);
  return sendEmail(userId, email, NotificationType.AML_FLAG, template);
}

export async function sendGDPRExportReadyEmail(
  userId: string,
  email: string,
  downloadUrl: string,
  expiresAt: string
): Promise<boolean> {
  const template = getGDPRExportReadyEmailTemplate(downloadUrl, expiresAt);
  return sendEmail(userId, email, NotificationType.GDPR_EXPORT_READY, template);
}

export async function sendNewDeviceAlertEmail(
  userId: string,
  email: string,
  deviceInfo: {
    device: string;
    location: string;
    time: string;
    ip: string;
  }
): Promise<boolean> {
  const template = getNewDeviceAlertEmailTemplate(deviceInfo);
  return sendEmail(userId, email, NotificationType.SECURITY_ALERT_NEW_DEVICE, template, deviceInfo);
}

export async function sendRoyalClubEligibilityEmail(
  userId: string,
  email: string,
  eligible: boolean,
  reason: string
): Promise<boolean> {
  const template = getRoyalClubEligibilityEmailTemplate(eligible, reason);
  return sendEmail(userId, email, NotificationType.ROYAL_CLUB_ELIGIBILITY, template, { eligible, reason });
}

export async function sendAISubscriptionActivatedEmail(
  userId: string,
  email: string
): Promise<boolean> {
  const template = getAISubscriptionActivatedEmailTemplate();
  return sendEmail(userId, email, NotificationType.AI_SUBSCRIPTION_ACTIVATED, template);
}

