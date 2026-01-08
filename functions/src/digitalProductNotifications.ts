/**
 * PACK 116: Digital Product Purchase Notifications
 * Send notifications when products are purchased
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './init';
import * as logger from 'firebase-functions/logger';

/**
 * Notify creator when their product is purchased
 */
export const notifyCreatorOnPurchase = onDocumentCreated(
  {
    document: 'digital_product_purchases/{purchaseId}',
    region: 'europe-west3',
  },
  async (event) => {
    const purchase = event.data?.data();
    if (!purchase) return;

    const {
      purchaseId,
      productTitle,
      buyerName,
      creatorUserId,
      tokensAmount,
      creatorEarnings,
    } = purchase;

    try {
      // Create notification for creator
      await db.collection('notifications').add({
        userId: creatorUserId,
        type: 'digital_product_sale',
        title: '🎉 Product Sold!',
        body: `${buyerName} purchased "${productTitle}" for ${tokensAmount} tokens. You earned ${creatorEarnings} tokens.`,
        data: {
          purchaseId,
          productTitle,
          buyerName,
          tokensAmount,
          creatorEarnings,
        },
        read: false,
        createdAt: new Date(),
      });

      logger.info(`Notification sent to creator ${creatorUserId} for purchase ${purchaseId}`);
    } catch (error) {
      logger.error('Error sending creator notification:', error);
    }
  }
);

/**
 * Notify buyer when purchase is complete
 */
export const notifyBuyerOnPurchase = onDocumentCreated(
  {
    document: 'digital_product_purchases/{purchaseId}',
    region: 'europe-west3',
  },
  async (event) => {
    const purchase = event.data?.data();
    if (!purchase) return;

    const {
      purchaseId,
      productTitle,
      buyerUserId,
      maxDownloads,
    } = purchase;

    try {
      // Create notification for buyer
      await db.collection('notifications').add({
        userId: buyerUserId,
        type: 'digital_product_purchase',
        title: '✅ Purchase Successful!',
        body: `You now have access to "${productTitle}". Download it up to ${maxDownloads} times.`,
        data: {
          purchaseId,
          productTitle,
          action: 'view_my_products',
        },
        read: false,
        createdAt: new Date(),
      });

      logger.info(`Notification sent to buyer ${buyerUserId} for purchase ${purchaseId}`);
    } catch (error) {
      logger.error('Error sending buyer notification:', error);
    }
  }
);

logger.info('✅ Digital Product Notifications module loaded');