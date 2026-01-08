/**
 * PACK 53 - Email Notification Delivery
 * Handles sending email notifications via SendGrid
 */

import { getFirestore } from "firebase-admin/firestore";
import { NotificationDocument } from "./types/notification.types";
import sgMail from "@sendgrid/mail";

const db = getFirestore();

// Initialize SendGrid with API key from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Send email notification to user
 */
export async function sendEmailNotification(notification: NotificationDocument): Promise<void> {
  try {
    if (!SENDGRID_API_KEY) {
      console.warn("SendGrid API key not configured, skipping email notification");
      return;
    }

    // Get user email
    const userDoc = await db.collection("users").doc(notification.userId).get();
    
    if (!userDoc.exists) {
      console.error(`User not found: ${notification.userId}`);
      return;
    }

    const userData = userDoc.data();
    const userEmail = userData?.email;

    if (!userEmail) {
      console.error(`No email found for user: ${notification.userId}`);
      return;
    }

    // Build email content
    const emailContent = buildEmailContent(notification);

    // Send email via SendGrid
    await sgMail.send({
      to: userEmail,
      from: process.env.SENDGRID_FROM_EMAIL || "notifications@avalo.app",
      subject: notification.title,
      text: emailContent.text,
      html: emailContent.html,
    });

    console.log(`Email sent to ${userEmail} for notification ${notification.notificationId}`);
  } catch (error) {
    console.error("Error sending email notification:", error);
    throw error;
  }
}

/**
 * Build email content based on notification type
 */
function buildEmailContent(notification: NotificationDocument): { text: string; html: string } {
  const { title, body, type, context } = notification;

  // Build deep link URL if available
  let actionUrl = "https://avalo.app";
  if (context?.deepLink) {
    actionUrl = `https://avalo.app/${context.deepLink}`;
  }

  // Text version
  const text = `
${title}

${body}

Open Avalo: ${actionUrl}

---
To manage your notification preferences, visit: https://avalo.app/settings/notifications
  `.trim();

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Avalo</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">${title}</h2>
    <p style="color: #666; font-size: 16px;">${body}</p>
    
    <div style="margin: 30px 0;">
      <a href="${actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Open Avalo</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="color: #999; font-size: 12px; text-align: center;">
      <a href="https://avalo.app/settings/notifications" style="color: #667eea; text-decoration: none;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  return { text, html };
}