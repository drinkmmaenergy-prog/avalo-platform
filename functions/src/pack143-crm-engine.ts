/**
 * PACK 143 - CRM Engine
 * Core business logic for CRM operations
 */

import { db, serverTimestamp, increment, arrayUnion, arrayRemove, timestamp } from './init';
import {
  CRMContact,
  CRMSegment,
  CRMFunnel,
  CRMBroadcast,
  CRMAnalytics,
  ContactLabel,
  SegmentFilters,
  MAX_BROADCAST_SIZE,
  MAX_FUNNEL_STEPS,
  MAX_LABELS_PER_CONTACT,
} from './pack143-types';
import { CRMSafetyValidator } from './pack143-safety-validator';

export class CRMEngine {
  static async createOrUpdateContact(
    creatorId: string,
    userId: string,
    userData: { displayName: string; avatar: string }
  ): Promise<CRMContact> {
    const contactRef = db
      .collection('crm_contacts')
      .doc(`${creatorId}_${userId}`);

    const existingContact = await contactRef.get();

    if (existingContact.exists) {
      await contactRef.update({
        lastInteractionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return existingContact.data() as CRMContact;
    }

    const newContact: Omit<CRMContact, 'id'> = {
      creatorId,
      userId,
      displayName: userData.displayName,
      avatar: userData.avatar,
      labels: [],
      firstInteractionAt: serverTimestamp() as any,
      lastInteractionAt: serverTimestamp() as any,
      totalSpent: 0,
      purchaseCount: 0,
      purchaseHistory: [],
      engagementScore: 0,
      optedOutBroadcasts: false,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await contactRef.set(newContact);
    return { ...newContact, id: contactRef.id } as CRMContact;
  }

  static async assignLabel(
    creatorId: string,
    userId: string,
    labelName: string
  ): Promise<void> {
    const validation = CRMSafetyValidator.validateLabel(labelName);
    if (!validation.isValid) {
      throw new Error(`Invalid label: ${validation.violations.join(', ')}`);
    }

    const contactRef = db
      .collection('crm_contacts')
      .doc(`${creatorId}_${userId}`);

    const contact = await contactRef.get();
    if (!contact.exists) {
      throw new Error('Contact not found');
    }

    const labels = contact.data()?.labels || [];
    if (labels.length >= MAX_LABELS_PER_CONTACT) {
      throw new Error(`Maximum ${MAX_LABELS_PER_CONTACT} labels per contact`);
    }

    if (labels.includes(labelName)) {
      return;
    }

    await contactRef.update({
      labels: arrayUnion(labelName),
      updatedAt: serverTimestamp(),
    });

    await this.updateLabelCount(creatorId, labelName, 1);
  }

  static async removeLabel(
    creatorId: string,
    userId: string,
    labelName: string
  ): Promise<void> {
    const contactRef = db
      .collection('crm_contacts')
      .doc(`${creatorId}_${userId}`);

    await contactRef.update({
      labels: arrayRemove(labelName),
      updatedAt: serverTimestamp(),
    });

    await this.updateLabelCount(creatorId, labelName, -1);
  }

  private static async updateLabelCount(
    creatorId: string,
    labelName: string,
    delta: number
  ): Promise<void> {
    const labelRef = db
      .collection('contact_labels')
      .doc(`${creatorId}_${labelName}`);

    await labelRef.set(
      {
        creatorId,
        name: labelName,
        contactCount: increment(delta),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  static async recordPurchase(
    creatorId: string,
    userId: string,
    purchase: {
      productId: string;
      productType: string;
      productName: string;
      amount: number;
      currency: string;
    }
  ): Promise<void> {
    const validation = CRMSafetyValidator.validateProductType(purchase.productType);
    if (!validation.isValid) {
      throw new Error(`Invalid product type: ${validation.violations.join(', ')}`);
    }

    const contactRef = db
      .collection('crm_contacts')
      .doc(`${creatorId}_${userId}`);

    await contactRef.update({
      totalSpent: increment(purchase.amount),
      purchaseCount: increment(1),
      lastPurchaseAt: serverTimestamp(),
      purchaseHistory: arrayUnion({
        productId: purchase.productId,
        productType: purchase.productType,
        productName: purchase.productName,
        amount: purchase.amount,
        currency: purchase.currency,
        purchasedAt: serverTimestamp(),
      }),
      engagementScore: increment(10),
      updatedAt: serverTimestamp(),
    });
  }

  static async createSegment(
    creatorId: string,
    name: string,
    description: string,
    filters: SegmentFilters
  ): Promise<CRMSegment> {
    const validation = CRMSafetyValidator.validateSegmentFilters(filters);
    if (!validation.isValid) {
      throw new Error(`Invalid segment filters: ${validation.violations.join(', ')}`);
    }

    const segmentRef = db.collection('crm_segments').doc();

    const segment: Omit<CRMSegment, 'id'> = {
      creatorId,
      name,
      description,
      filters,
      contactCount: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await segmentRef.set(segment);

    const contactCount = await this.calculateSegmentSize(creatorId, filters);
    await segmentRef.update({ contactCount });

    return { ...segment, id: segmentRef.id, contactCount } as CRMSegment;
  }

  static async calculateSegmentSize(
    creatorId: string,
    filters: SegmentFilters
  ): Promise<number> {
    let query: any = db
      .collection('crm_contacts')
      .where('creatorId', '==', creatorId);

    if (filters.labels && filters.labels.length > 0) {
      query = query.where('labels', 'array-contains-any', filters.labels);
    }

    if (filters.minSpent !== undefined) {
      query = query.where('totalSpent', '>=', filters.minSpent);
    }

    if (filters.maxSpent !== undefined) {
      query = query.where('totalSpent', '<=', filters.maxSpent);
    }

    if (filters.engagementScoreMin !== undefined) {
      query = query.where('engagementScore', '>=', filters.engagementScoreMin);
    }

    const snapshot = await query.get();
    return snapshot.size;
  }

  static async createFunnel(
    creatorId: string,
    funnelData: {
      name: string;
      description: string;
      trigger: any;
      steps: any[];
    }
  ): Promise<CRMFunnel> {
    if (funnelData.steps.length > MAX_FUNNEL_STEPS) {
      throw new Error(`Maximum ${MAX_FUNNEL_STEPS} steps per funnel`);
    }

    const validation = CRMSafetyValidator.validateFunnel(funnelData);
    if (!validation.isValid) {
      throw new Error(`Invalid funnel: ${validation.violations.join(', ')}`);
    }

    const funnelRef = db.collection('crm_funnels').doc();

    const funnel: Omit<CRMFunnel, 'id'> = {
      creatorId,
      name: funnelData.name,
      description: funnelData.description,
      status: 'active',
      trigger: funnelData.trigger,
      steps: funnelData.steps.map((step, index) => ({
        id: `step_${index}`,
        order: index,
        delayHours: step.delayHours || 0,
        action: step.action,
        completedCount: 0,
      })),
      analytics: {
        totalEntered: 0,
        currentActive: 0,
        completedCount: 0,
        conversionRate: 0,
        revenueGenerated: 0,
        lastUpdated: serverTimestamp() as any,
      },
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await funnelRef.set(funnel);
    return { ...funnel, id: funnelRef.id } as CRMFunnel;
  }

  static async triggerFunnel(
    funnelId: string,
    userId: string
  ): Promise<void> {
    const funnelRef = db.collection('crm_funnels').doc(funnelId);
    const funnel = await funnelRef.get();

    if (!funnel.exists || funnel.data()?.status !== 'active') {
      throw new Error('Funnel not found or inactive');
    }

    const enrollmentRef = db.collection('funnel_enrollments').doc();

    await enrollmentRef.set({
      funnelId,
      userId,
      creatorId: funnel.data()?.creatorId,
      currentStep: 0,
      status: 'active',
      enrolledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await funnelRef.update({
      'analytics.totalEntered': increment(1),
      'analytics.currentActive': increment(1),
      'analytics.lastUpdated': serverTimestamp(),
    });
  }

  static async createBroadcast(
    creatorId: string,
    broadcastData: {
      segmentId: string;
      subject: string;
      content: string;
      contentType: string;
      scheduledAt?: Date;
    }
  ): Promise<CRMBroadcast> {
    const validation = CRMSafetyValidator.validateBroadcast({
      content: broadcastData.content,
      subject: broadcastData.subject,
      targetCount: 0,
    });

    if (!validation.isValid) {
      throw new Error(`Invalid broadcast: ${validation.violations.join(', ')}`);
    }

    const segment = await db
      .collection('crm_segments')
      .doc(broadcastData.segmentId)
      .get();

    if (!segment.exists || segment.data()?.creatorId !== creatorId) {
      throw new Error('Segment not found or access denied');
    }

    const targetCount = segment.data()?.contactCount || 0;
    if (targetCount > MAX_BROADCAST_SIZE) {
      throw new Error(`Broadcast cannot target more than ${MAX_BROADCAST_SIZE} contacts`);
    }

    const broadcastRef = db.collection('crm_broadcasts').doc();

    const broadcast: Omit<CRMBroadcast, 'id'> = {
      creatorId,
      segmentId: broadcastData.segmentId,
      subject: broadcastData.subject,
      content: broadcastData.content,
      contentType: broadcastData.contentType as any,
      status: broadcastData.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: broadcastData.scheduledAt ? timestamp.fromDate(broadcastData.scheduledAt) as any : undefined,
      targetCount,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      optOutCount: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await broadcastRef.set(broadcast);
    return { ...broadcast, id: broadcastRef.id } as CRMBroadcast;
  }

  static async sendBroadcast(broadcastId: string): Promise<void> {
    const broadcastRef = db.collection('crm_broadcasts').doc(broadcastId);
    const broadcast = await broadcastRef.get();

    if (!broadcast.exists) {
      throw new Error('Broadcast not found');
    }

    const data = broadcast.data();
    if (data?.status !== 'draft' && data?.status !== 'scheduled') {
      throw new Error('Broadcast already sent or in progress');
    }

    await broadcastRef.update({
      status: 'sending',
      updatedAt: serverTimestamp(),
    });

    const segment = await db.collection('crm_segments').doc(data.segmentId).get();
    const filters = segment.data()?.filters || {};

    const contacts = await this.getSegmentContacts(data.creatorId, filters);

    let deliveredCount = 0;
    const batch = db.batch();

    for (const contact of contacts) {
      if (contact.optedOutBroadcasts) {
        continue;
      }

      const messageRef = db.collection('broadcast_messages').doc();
      batch.set(messageRef, {
        broadcastId,
        userId: contact.userId,
        creatorId: data.creatorId,
        subject: data.subject,
        content: data.content,
        status: 'delivered',
        deliveredAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      deliveredCount++;
    }

    await batch.commit();

    await broadcastRef.update({
      status: 'sent',
      sentAt: serverTimestamp(),
      deliveredCount,
      updatedAt: serverTimestamp(),
    });
  }

  private static async getSegmentContacts(
    creatorId: string,
    filters: SegmentFilters
  ): Promise<CRMContact[]> {
    let query: any = db
      .collection('crm_contacts')
      .where('creatorId', '==', creatorId)
      .limit(MAX_BROADCAST_SIZE);

    if (filters.labels && filters.labels.length > 0) {
      query = query.where('labels', 'array-contains-any', filters.labels);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CRMContact));
  }

  static async optOutBroadcasts(
    creatorId: string,
    userId: string
  ): Promise<void> {
    const contactRef = db
      .collection('crm_contacts')
      .doc(`${creatorId}_${userId}`);

    await contactRef.update({
      optedOutBroadcasts: true,
      updatedAt: serverTimestamp(),
    });
  }

  static async getAnalytics(
    creatorId: string,
    period: 'day' | 'week' | 'month' | 'year'
  ): Promise<CRMAnalytics> {
    const now = new Date();
    let periodStart: Date;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const contacts = await db
      .collection('crm_contacts')
      .where('creatorId', '==', creatorId)
      .get();

    const totalContacts = contacts.size;
    const newContacts = contacts.docs.filter(
      doc => doc.data().createdAt.toDate() >= periodStart
    ).length;

    let totalRevenue = 0;
    let totalPurchases = 0;

    contacts.forEach(doc => {
      const data = doc.data();
      totalRevenue += data.totalSpent || 0;
      totalPurchases += data.purchaseCount || 0;
    });

    const analytics: CRMAnalytics = {
      creatorId,
      period,
      periodStart: timestamp.fromDate(periodStart) as any,
      periodEnd: serverTimestamp() as any,
      metrics: {
        totalContacts,
        newContacts,
        totalRevenue,
        averageOrderValue: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
        conversionRate: totalContacts > 0 ? (totalPurchases / totalContacts) * 100 : 0,
        topPerformingProducts: [],
        topPerformingFunnels: [],
        segmentGrowth: [],
      },
      createdAt: serverTimestamp() as any,
    };

    return analytics;
  }
}