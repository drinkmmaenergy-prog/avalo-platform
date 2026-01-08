/**
 * PACK 135: Scan Tracker
 * Anonymous QR scan tracking and analytics
 */

import { QRScanLog, ScanAnalytics } from './types';
import { db, generateId, serverTimestamp } from '../../init';

export class ScanTracker {
  /**
   * Log QR scan event (anonymously)
   */
  static async logScan(data: {
    profileUserId: string;
    assetId?: string;
    deviceInfo?: {
      type?: 'mobile' | 'desktop' | 'tablet';
      os?: string;
      browser?: string;
    };
    location?: {
      city?: string;
      country?: string;
    };
  }): Promise<void> {
    const scanLog: QRScanLog = {
      id: generateId(),
      profileUserId: data.profileUserId,
      scannedAt: new Date(),
      scanLocation: data.location,
      deviceInfo: data.deviceInfo,
      assetId: data.assetId,
      anonymous: true,
    };

    await db.collection('qr_scan_logs').add({
      ...scanLog,
      scannedAt: serverTimestamp(),
    });

    await this.updateAggregateStats(data.profileUserId);
  }

  /**
   * Update aggregate statistics
   */
  private static async updateAggregateStats(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const dailyRef = db
      .collection('scan_analytics')
      .doc(`${userId}_daily_${today}`);

    const dailyDoc = await dailyRef.get();

    if (dailyDoc.exists) {
      await dailyRef.update({
        totalScans: (dailyDoc.data()!.totalScans || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      const analytics: Partial<ScanAnalytics> = {
        userId,
        period: 'daily',
        date: today,
        totalScans: 1,
        uniqueDevices: 0,
        topCities: [],
        deviceBreakdown: {
          mobile: 0,
          desktop: 0,
          tablet: 0,
        },
      };

      await dailyRef.set({
        ...analytics,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Get scan analytics for user
   */
  static async getScanAnalytics(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly',
    startDate: Date,
    endDate: Date
  ): Promise<ScanAnalytics[]> {
    const snapshot = await db
      .collection('scan_analytics')
      .where('userId', '==', userId)
      .where('period', '==', period)
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<=', endDate.toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as ScanAnalytics);
  }

  /**
   * Get total scans for user
   */
  static async getTotalScans(userId: string): Promise<number> {
    const snapshot = await db
      .collection('scan_analytics')
      .where('userId', '==', userId)
      .where('period', '==', 'daily')
      .get();

    let total = 0;
    snapshot.docs.forEach(doc => {
      total += doc.data().totalScans || 0;
    });

    return total;
  }

  /**
   * Get scan breakdown by city
   */
  static async getScansByCity(
    userId: string,
    limit: number = 10
  ): Promise<Array<{ city: string; count: number }>> {
    const snapshot = await db
      .collection('qr_scan_logs')
      .where('profileUserId', '==', userId)
      .where('scanLocation.city', '!=', null)
      .limit(1000)
      .get();

    const cityCount: Record<string, number> = {};

    snapshot.docs.forEach(doc => {
      const city = doc.data().scanLocation?.city;
      if (city) {
        cityCount[city] = (cityCount[city] || 0) + 1;
      }
    });

    return Object.entries(cityCount)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get scan breakdown by device type
   */
  static async getScansByDevice(userId: string): Promise<{
    mobile: number;
    desktop: number;
    tablet: number;
  }> {
    const snapshot = await db
      .collection('qr_scan_logs')
      .where('profileUserId', '==', userId)
      .limit(1000)
      .get();

    const breakdown = {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    };

    snapshot.docs.forEach(doc => {
      const deviceType = doc.data().deviceInfo?.type;
      if (deviceType && deviceType in breakdown) {
        breakdown[deviceType]++;
      }
    });

    return breakdown;
  }

  /**
   * Get recent scans summary
   */
  static async getRecentScansSummary(userId: string, days: number = 7): Promise<{
    totalScans: number;
    averagePerDay: number;
    topCity?: string;
    topDevice?: string;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshot = await db
      .collection('qr_scan_logs')
      .where('profileUserId', '==', userId)
      .where('scannedAt', '>=', startDate)
      .get();

    const totalScans = snapshot.size;
    const averagePerDay = totalScans / days;

    const cityCount: Record<string, number> = {};
    const deviceCount: Record<string, number> = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      const city = data.scanLocation?.city;
      if (city) {
        cityCount[city] = (cityCount[city] || 0) + 1;
      }

      const device = data.deviceInfo?.type;
      if (device) {
        deviceCount[device] = (deviceCount[device] || 0) + 1;
      }
    });

    const topCity = Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const topDevice = Object.entries(deviceCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      totalScans,
      averagePerDay: Math.round(averagePerDay * 10) / 10,
      topCity,
      topDevice,
    };
  }

  /**
   * Delete old scan logs (privacy retention - keep only aggregates after 90 days)
   */
  static async cleanupOldScans(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const oldScans = await db
      .collection('qr_scan_logs')
      .where('scannedAt', '<', cutoffDate)
      .limit(500)
      .get();

    if (oldScans.empty) {
      return;
    }

    const batch = db.batch();
    oldScans.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Deleted ${oldScans.size} old scan logs`);
  }
}

export const logScan = ScanTracker.logScan.bind(ScanTracker);
export const getScanAnalytics = ScanTracker.getScanAnalytics.bind(ScanTracker);
export const getTotalScans = ScanTracker.getTotalScans.bind(ScanTracker);
export const getScansByCity = ScanTracker.getScansByCity.bind(ScanTracker);
export const getScansByDevice = ScanTracker.getScansByDevice.bind(ScanTracker);
export const getRecentScansSummary = ScanTracker.getRecentScansSummary.bind(ScanTracker);