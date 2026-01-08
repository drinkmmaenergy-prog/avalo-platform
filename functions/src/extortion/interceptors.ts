import * as admin from 'firebase-admin';
import { extortionDetector } from './detector';
import { safetyVault } from './safetyVault';
import { enforcement } from './enforcement';
import {
  ExtortionType,
  ExtortionSeverity,
  CaseStatus,
  BlackmailMessage
} from './types';

export class MessageInterceptor {
  private db: admin.firestore.Firestore;
  
  constructor() {
    this.db = admin.firestore();
  }

  async interceptMessage(
    messageId: string,
    chatId: string,
    senderId: string,
    recipientId: string,
    content: string,
    metadata: any
  ): Promise<{
    allowed: boolean;
    blocked: boolean;
    caseId?: string;
    reason?: string;
    severity?: ExtortionSeverity;
  }> {
    const chatHistory = await this.getChatHistory(chatId, 10);
    const chatContext = chatHistory.map(msg => msg.content);

    const detectionResult = await extortionDetector.detectExtortion(
      content,
      senderId,
      recipientId,
      chatContext
    );

    if (!detectionResult.isExtortion) {
      return { allowed: true, blocked: false };
    }

    if (detectionResult.requiresImmediateAction) {
      await this.freezeChat(chatId, 'Extortion detected');
    }

    const caseId = await this.createExtortionCase(
      senderId,
      recipientId,
      detectionResult,
      chatId,
      messageId
    );

    await this.storeBlackmailMessage(
      caseId,
      chatId,
      messageId,
      senderId,
      recipientId,
      content,
      detectionResult
    );

    await this.storeToVault(
      recipientId,
      caseId,
      content,
      messageId,
      'message'
    );

    if (detectionResult.severity === ExtortionSeverity.CRITICAL) {
      await enforcement.applyImmediateAction(
        caseId,
        senderId,
        detectionResult.severity,
        detectionResult.type!
      );
    } else {
      await enforcement.queueForReview(caseId, senderId, detectionResult.severity!);
    }

    await this.notifyVictim(recipientId, caseId, detectionResult.type!);

    return {
      allowed: false,
      blocked: true,
      caseId,
      reason: 'Extortion attempt detected and blocked',
      severity: detectionResult.severity
    };
  }

  async interceptPaymentMessage(
    chatId: string,
    senderId: string,
    recipientId: string,
    amount: number,
    currency: string,
    context: string
  ): Promise<{
    allowed: boolean;
    flagged: boolean;
    reason?: string;
  }> {
    const recentMessages = await this.getChatHistory(chatId, 20);
    
    const hasThreats = recentMessages.some(msg => {
      const threatWords = ['leak', 'expose', 'share', 'post', 'tell'];
      return threatWords.some(word => 
        msg.content.toLowerCase().includes(word)
      );
    });

    if (hasThreats) {
      const fullContext = recentMessages
        .map(msg => msg.content)
        .concat([context]);

      const detectionResult = await extortionDetector.detectExtortion(
        context,
        senderId,
        recipientId,
        fullContext
      );

      if (detectionResult.isExtortion) {
        await this.freezeChat(chatId, 'Payment coercion detected');
        
        await this.db.collection('flagged_payments').add({
          chatId,
          senderId,
          recipientId,
          amount,
          currency,
          context,
          reason: 'Potential extortion payment',
          detectionConfidence: detectionResult.confidence,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: 'blocked'
        });

        return {
          allowed: false,
          flagged: true,
          reason: 'Payment blocked due to potential extortion'
        };
      }
    }

    const senderHistory = await this.db
      .collection('extortion_cases')
      .where('accusedId', '==', recipientId)
      .where('status', '==', CaseStatus.CONFIRMED)
      .get();

    if (!senderHistory.empty) {
      return {
        allowed: false,
        flagged: true,
        reason: 'Recipient has confirmed extortion history'
      };
    }

    return { allowed: true, flagged: false };
  }

  async interceptUpload(
    userId: string,
    uploadType: string,
    fileMetadata: any,
    contentHash: string
  ): Promise<{
    allowed: boolean;
    blocked: boolean;
    reason?: string;
    victimId?: string;
  }> {
    const revengeCheck = await extortionDetector.checkRevengeUpload(
      userId,
      contentHash,
      uploadType,
      fileMetadata
    );

    if (revengeCheck.blocked) {
      await this.db.collection('blocked_upload_attempts').add({
        userId,
        uploadType,
        contentType: fileMetadata.mimeType,
        contentHash,
        blockReason: revengeCheck.reason,
        detectionMethod: 'hash_match',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        victimNotified: false
      });

      if (revengeCheck.victimId) {
        await this.notifyVictim(
          revengeCheck.victimId,
          'upload_blocked',
          ExtortionType.REVENGE_LEAK
        );
      }

      await enforcement.applyUploadBlock(userId, revengeCheck.reason!);

      return {
        allowed: false,
        blocked: true,
        reason: revengeCheck.reason,
        victimId: revengeCheck.victimId
      };
    }

    const intentAnalysis = await extortionDetector.analyzeUploadIntent(
      userId,
      uploadType,
      fileMetadata
    );

    if (intentAnalysis.suspicious && intentAnalysis.riskScore > 0.7) {
      await this.db.collection('suspicious_uploads').add({
        userId,
        uploadType,
        fileMetadata,
        riskScore: intentAnalysis.riskScore,
        flags: intentAnalysis.flags,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'flagged_for_review'
      });

      return {
        allowed: false,
        blocked: true,
        reason: 'Upload flagged for manual review due to high risk score'
      };
    }

    return { allowed: true, blocked: false };
  }

  private async getChatHistory(
    chatId: string,
    limit: number
  ): Promise<Array<{ senderId: string; content: string; timestamp: Date }>> {
    const messages = await this.db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return messages.docs.reverse().map(doc => ({
      senderId: doc.data().senderId,
      content: doc.data().content,
      timestamp: doc.data().timestamp.toDate()
    }));
  }

  private async freezeChat(chatId: string, reason: string): Promise<void> {
    await this.db
      .collection('chats')
      .doc(chatId)
      .update({
        frozen: true,
        frozenReason: reason,
        frozenAt: admin.firestore.FieldValue.serverTimestamp()
      });

    await this.db.collection('chat_actions').add({
      chatId,
      action: 'freeze',
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async createExtortionCase(
    accusedId: string,
    victimId: string,
    detectionResult: any,
    chatId: string,
    messageId: string
  ): Promise<string> {
    const caseRef = this.db.collection('extortion_cases').doc();
    
    await caseRef.set({
      victimId,
      accusedId,
      type: detectionResult.type,
      severity: detectionResult.severity,
      status: CaseStatus.PENDING,
      description: 'Auto-detected extortion attempt',
      evidenceIds: [messageId],
      chatId,
      messageIds: [messageId],
      detectionConfidence: detectionResult.confidence,
      autoDetected: true,
      reportedBy: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      escalatedToLegal: detectionResult.severity === ExtortionSeverity.CRITICAL
    });

    return caseRef.id;
  }

  private async storeBlackmailMessage(
    caseId: string,
    chatId: string,
    messageId: string,
    senderId: string,
    recipientId: string,
    content: string,
    detectionResult: any
  ): Promise<void> {
    const blackmailMsg: Partial<BlackmailMessage> = {
      caseId,
      chatId,
      messageId,
      senderId,
      recipientId,
      victimId: recipientId,
      content,
      detectedPatterns: detectionResult.patterns,
      detectionConfidence: detectionResult.confidence,
      detectionMethod: 'ml',
      timestamp: new Date(),
      blocked: true,
      evidencePreserved: true
    };

    await this.db
      .collection('blackmail_messages')
      .doc(messageId)
      .set(blackmailMsg);
  }

  private async storeToVault(
    victimId: string,
    caseId: string,
    content: string,
    messageId: string,
    type: 'message'
  ): Promise<void> {
    await safetyVault.storeEvidence(
      victimId,
      caseId,
      type,
      content,
      {
        source: 'auto_detection',
        originalFilename: `message_${messageId}.txt`,
        mimeType: 'text/plain'
      }
    );
  }

  private async notifyVictim(
    victimId: string,
    caseIdOrType: string,
    type: ExtortionType
  ): Promise<void> {
    await this.db.collection('notifications').add({
      userId: victimId,
      type: 'safety_alert',
      title: 'You Are Protected',
      message: 'We detected and blocked an extortion attempt. Your safety is our priority.',
      data: {
        caseId: caseIdOrType,
        extortionType: type,
        actionTaken: 'Chat frozen and account suspended',
        nextSteps: 'Access your Safety Vault for evidence'
      },
      priority: 'critical',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    });

    await this.db
      .collection('users')
      .doc(victimId)
      .collection('safety_alerts')
      .add({
        type: 'extortion_blocked',
        caseId: caseIdOrType,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  }

  async monitorChatForPatterns(
    chatId: string
  ): Promise<{
    suspicious: boolean;
    riskScore: number;
    patterns: string[];
  }> {
    const messages = await this.getChatHistory(chatId, 50);
    
    let riskScore = 0;
    const detectedPatterns: string[] = [];

    const threatCount = messages.filter(msg =>
      ['leak', 'expose', 'share', 'tell'].some(word =>
        msg.content.toLowerCase().includes(word)
      )
    ).length;

    if (threatCount > 3) {
      riskScore += 0.3;
      detectedPatterns.push('repeated_threats');
    }

    const paymentMentions = messages.filter(msg =>
      ['token', 'pay', 'money', 'buy'].some(word =>
        msg.content.toLowerCase().includes(word)
      )
    ).length;

    if (paymentMentions > 5) {
      riskScore += 0.2;
      detectedPatterns.push('frequent_payment_requests');
    }

    if (threatCount > 0 && paymentMentions > 0) {
      riskScore += 0.4;
      detectedPatterns.push('threats_with_payment_context');
    }

    return {
      suspicious: riskScore > 0.5,
      riskScore: Math.min(riskScore, 1.0),
      patterns: detectedPatterns
    };
  }
}

export const messageInterceptor = new MessageInterceptor();