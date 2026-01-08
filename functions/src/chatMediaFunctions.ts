/**
 * PACK 287: Chat Media Cloud Functions
 * 
 * Handles the complete media upload and processing pipeline:
 * 1. Client uploads to temp storage
 * 2. Cloud Function processes (NSFW check, thumbnail generation)
 * 3. Billing is executed
 * 4. Media moved to final location
 * 5. Message created
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { db, storage, serverTimestamp, generateId } from './init.js';
import {
  calculateMediaBilling,
  processMediaBilling,
  createMediaMessage,
  validateContentPolicy,
  updateMediaNSFWFlag,
  getMediaTypeFromExtension,
  validateMediaLimits,
  reportMediaMessage,
  type MediaMessageType,
  type MediaMetadata,
  type MediaBilling,
  type ReportReason
} from './chatMediaMonetization.js';

// ============================================================================
// CALLABLE FUNCTIONS (Client → Cloud)
// ============================================================================

/**
 * Step 1: Initiate media upload
 * Client calls this to get upload URL and register the upload
 */
export const initiateMediaUpload = onCall(
  { maxInstances: 100 },
  async (request) => {
    
    // Authentication required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const { chatId, fileName, fileSize, mediaType } = request.data;
    
    // Validate inputs
    if (!chatId || !fileName || !fileSize || !mediaType) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    // Validate user is chat participant
    const chatSnap = await db.collection('chats').doc(chatId).get();
    if (!chatSnap.exists) {
      throw new HttpsError('not-found', 'Chat not found');
    }
    
    const chat = chatSnap.data() as any;
    if (!chat.participants.includes(userId)) {
      throw new HttpsError('permission-denied', 'Not a chat participant');
    }
    
    // Determine media type from file extension
    let mediaTypeEnum: MediaMessageType;
    try {
      mediaTypeEnum = getMediaTypeFromExtension(fileName);
    } catch (error: any) {
      throw new HttpsError('invalid-argument', error.message);
    }
    
    // Validate media limits
    const validation = validateMediaLimits(mediaTypeEnum, fileSize);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.error || 'Media validation failed');
    }
    
    // Calculate billing BEFORE upload
    const billing = await calculateMediaBilling(chatId, mediaTypeEnum, userId);
    
    // Check if payer has sufficient tokens
    const payerId = billing.paidByUserId!;
    const walletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
    const walletSnap = await walletRef.get();
    const wallet = walletSnap.data();
    
    if (!wallet || wallet.balance < billing.priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Need ${billing.priceTokens} tokens to send this media.`
      );
    }
    
    // Create upload metadata record
    const uploadId = generateId();
    const timestamp = Date.now();
    const tempStoragePath = `uploads/temp/${userId}/${timestamp}`;
    
    await db.collection('mediaUploads').doc(uploadId).set({
      uploadId,
      userId,
      chatId,
      type: mediaTypeEnum,
      status: 'uploading',
      tempStoragePath,
      uploadedAt: serverTimestamp(),
      billing
    });
    
    // Generate signed upload URL
    const bucket = storage.bucket();
    const file = bucket.file(tempStoragePath);
    
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: mediaType
    });
    
    return {
      uploadId,
      uploadUrl,
      tempStoragePath,
      priceTokens: billing.priceTokens,
      expiresAt: Date.now() + 15 * 60 * 1000
    };
  }
);

/**
 * Step 5: Finalize media message
 * Called after upload completes and processing is done
 */
export const finalizeMediaMessage = onCall(
  { maxInstances: 100 },
  async (request) => {
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const { uploadId, text } = request.data;
    
    if (!uploadId) {
      throw new HttpsError('invalid-argument', 'Upload ID required');
    }
    
    // Get upload metadata
    const uploadSnap = await db.collection('mediaUploads').doc(uploadId).get();
    if (!uploadSnap.exists) {
      throw new HttpsError('not-found', 'Upload not found');
    }
    
    const upload = uploadSnap.data() as any;
    
    // Verify ownership
    if (upload.userId !== userId) {
      throw new HttpsError('permission-denied', 'Not your upload');
    }
    
    // Check status
    if (upload.status !== 'completed') {
      throw new HttpsError(
        'failed-precondition',
        `Upload not ready. Status: ${upload.status}`
      );
    }
    
    // Check if media passed NSFW validation
    if (upload.media?.nsfwFlag === 'blocked') {
      throw new HttpsError(
        'failed-precondition',
        'This media violates Avalo content rules and cannot be sent.'
      );
    }
    
    // Get chat to determine receiver
    const chatSnap = await db.collection('chats').doc(upload.chatId).get();
    const chat = chatSnap.data() as any;
    const receiverId = chat.participants.find((p: string) => p !== userId);
    
    // Execute billing
    const billingResult = await processMediaBilling(
      upload.chatId,
      'pending', // messageId will be generated
      upload.billing
    );
    
    if (!billingResult.success) {
      throw new HttpsError('failed-precondition', billingResult.error || 'Billing failed');
    }
    
    // Create message
    const messageId = await createMediaMessage(
      upload.chatId,
      userId,
      receiverId,
      upload.type,
      upload.media,
      upload.billing
    );
    
    // Update upload record with messageId
    await db.collection('mediaUploads').doc(uploadId).update({
      messageId,
      status: 'completed',
      completedAt: serverTimestamp()
    });
    
    // Clean up temp storage (async, non-blocking)
    const bucket = storage.bucket();
    bucket.file(upload.tempStoragePath).delete().catch(() => {});
    
    return {
      messageId,
      success: true
    };
  }
);

/**
 * Report a media message
 */
export const reportMessage = onCall(
  { maxInstances: 100 },
  async (request) => {
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const { messageId, reason, details } = request.data;
    
    if (!messageId || !reason) {
      throw new HttpsError('invalid-argument', 'Message ID and reason required');
    }
    
    const reportId = await reportMediaMessage(
      messageId,
      userId,
      reason as ReportReason,
      details
    );
    
    return {
      reportId,
      success: true
    };
  }
);

// ============================================================================
// BACKGROUND FUNCTIONS (Storage Triggers)
// ============================================================================

/**
 * Step 2-4: Process uploaded media
 * Triggered when file is uploaded to temp storage
 */
export const processMediaUpload = onObjectFinalized(
  { 
    maxInstances: 50,
    bucket: storage.bucket().name
  },
  async (event) => {
    
    const filePath = event.data.name;
    
    // Only process temp uploads
    if (!filePath.startsWith('uploads/temp/')) {
      return;
    }
    
    // Extract userId and timestamp from path
    const pathParts = filePath.split('/');
    const userId = pathParts[2];
    const timestamp = pathParts[3];
    
    if (!userId || !timestamp) {
      console.error('Invalid temp upload path:', filePath);
      return;
    }
    
    // Find upload metadata
    const uploadsSnap = await db.collection('mediaUploads')
      .where('userId', '==', userId)
      .where('tempStoragePath', '==', filePath)
      .where('status', '==', 'uploading')
      .limit(1)
      .get();
    
    if (uploadsSnap.empty) {
      console.error('No upload metadata found for:', filePath);
      return;
    }
    
    const uploadDoc = uploadsSnap.docs[0];
    const uploadId = uploadDoc.id;
    const upload = uploadDoc.data() as any;
    
    try {
      // Update status to processing
      await db.collection('mediaUploads').doc(uploadId).update({
        status: 'processing'
      });
      
      // Get file metadata
      const bucket = storage.bucket();
      const file = bucket.file(filePath);
      const [metadata] = await file.getMetadata();
      
      const sizeBytes = parseInt(metadata.size || '0');
      const contentType = metadata.contentType || 'application/octet-stream';
      
      // Validate content policy (NSFW check)
      const policyResult = await validateContentPolicy(upload.type, filePath);
      
      if (!policyResult.passed) {
        // Content blocked
        await db.collection('mediaUploads').doc(uploadId).update({
          status: 'failed',
          error: 'Content policy violation',
          processedAt: serverTimestamp(),
          media: {
            nsfwFlag: policyResult.nsfwFlag,
            blockedReason: policyResult.blockedReason,
            sizeBytes
          }
        });
        
        // Delete temp file
        await file.delete();
        return;
      }
      
      // Move to final location
      const finalPath = `chats/${upload.chatId}/${uploadId}`;
      const finalFile = bucket.file(finalPath);
      await file.move(finalFile);
      
      // Generate thumbnail for photos/videos
      let thumbUrl: string | undefined;
      if (upload.type === 'media_photo' || upload.type === 'media_video') {
        // TODO: Implement thumbnail generation
        // For now, use original URL
        const [url] = await finalFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
        });
        thumbUrl = url;
      }
      
      // Get final URL
      const [finalUrl] = await finalFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
      });
      
      // Extract duration for video/voice (TODO: implement actual duration extraction)
      let durationSeconds: number | undefined;
      if (upload.type === 'media_video' || upload.type === 'media_voice') {
        // Placeholder: actual implementation would use ffprobe or similar
        durationSeconds = 0;
      }
      
      // Create media metadata
      const media: MediaMetadata = {
        storagePath: finalPath,
        url: finalUrl,
        thumbUrl,
        durationSeconds,
        sizeBytes,
        nsfwFlag: policyResult.nsfwFlag,
        blockedReason: policyResult.blockedReason as 'NONE' | 'POLICY_VIOLATION'
      };
      
      // Update upload record with final media data
      await db.collection('mediaUploads').doc(uploadId).update({
        status: 'completed',
        finalStoragePath: finalPath,
        processedAt: serverTimestamp(),
        media
      });
      
      console.log(`Media processed successfully: ${uploadId}`);
      
    } catch (error) {
      console.error('Error processing media upload:', error);
      
      await db.collection('mediaUploads').doc(uploadId).update({
        status: 'failed',
        error: String(error),
        processedAt: serverTimestamp()
      });
    }
  }
);

/**
 * Cleanup old temp uploads (scheduled function)
 * Run daily to remove abandoned temp files
 */
export const cleanupOldTempUploads = onCall(
  { maxInstances: 1 },
  async () => {
    
    const bucket = storage.bucket();
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // List temp files
    const [files] = await bucket.getFiles({
      prefix: 'uploads/temp/'
    });
    
    let deletedCount = 0;
    
    for (const file of files) {
      try {
        const [metadata] = await file.getMetadata();
        const createdTime = new Date(metadata.timeCreated).getTime();
        
        if (createdTime < cutoffTime) {
          await file.delete();
          deletedCount++;
        }
      } catch (error) {
        console.error(`Failed to delete temp file ${file.name}:`, error);
      }
    }
    
    // Also cleanup old upload metadata
    const oldUploadsSnap = await db.collection('mediaUploads')
      .where('uploadedAt', '<', new Date(cutoffTime))
      .where('status', 'in', ['uploading', 'failed'])
      .limit(100)
      .get();
    
    for (const doc of oldUploadsSnap.docs) {
      await doc.ref.delete();
    }
    
    console.log(`Cleaned up ${deletedCount} temp files and ${oldUploadsSnap.size} metadata records`);
    
    return {
      filesDeleted: deletedCount,
      metadataDeleted: oldUploadsSnap.size
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate thumbnail from image or video
 * TODO: Implement using Sharp for images and ffmpeg for videos
 */
async function generateThumbnail(
  sourcePath: string,
  destPath: string,
  mediaType: MediaMessageType
): Promise<void> {
  
  // Placeholder implementation
  // In production, this would:
  // 1. Download source file
  // 2. Use Sharp (images) or ffmpeg (videos) to create thumbnail
  // 3. Upload thumbnail to destPath
  // 4. Return thumbnail URL
  
  console.log(`TODO: Generate thumbnail for ${sourcePath} to ${destPath}`);
}

/**
 * Extract video/audio duration
 * TODO: Implement using ffprobe
 */
async function extractMediaDuration(
  storagePath: string,
  mediaType: MediaMessageType
): Promise<number> {
  
  // Placeholder implementation
  // In production, this would use ffprobe to get actual duration
  
  return 0;
}