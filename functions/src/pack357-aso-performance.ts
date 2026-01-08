/**
 * PACK 357 — ASO Performance Tracking
 * 
 * Tracks performance metrics for ASO variants
 * Integrates with PACK 352 (KPI Engine) and PACK 356 (Paid Acquisition)
 * 
 * Metrics tracked:
 * - Store page impressions
 * - Store page views
 * - Installs
 * - Registrations
 * - Verified users
 * - Paying users
 * - Revenue
 */

import { Timestamp, FieldValue, Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";
import { ASOPlatform } from "./pack357-aso-variants";

export interface ASOPerformance {
  variantId: string;
  platform: ASOPlatform;
  
  // Date (YYYY-MM-DD for daily aggregation)
  date: string;
  
  // Geographic and language breakdown
  country: string;
  language: string;
  
  // Traffic source
  trafficSource: "ORGANIC" | "ADS";
  
  // Funnel metrics
  impressions: number;
  pageViews: number;
  installs: number;
  registrations: number;
  verifiedUsers: number;
  payingUsers: number;
  
  // Revenue metrics
  revenue: number; // Total revenue in USD
  
  // Calculated metrics (stored for performance)
  storeCVR: number; // pageViews / impressions
  installToRegisterRate: number; // registrations / installs
  registerToVerifyRate: number; // verifiedUsers / registrations
  verifyToPayRate: number; // payingUsers / verifiedUsers
  revenuePerInstall: number; // revenue / installs
  
  // Timestamps
  updatedAt: Timestamp;
}

export interface ASOEvent {
  eventId: string;
  variantId: string;
  userId?: string;
  platform: ASOPlatform;
  
  eventType:
    | "store_page_impression"
    | "store_page_view"
    | "store_install"
    | "first_launch"
    | "registration_completed"
    | "verification_completed"
    | "first_purchase";
  
  // Context
  country: string;
  language: string;
  trafficSource: "ORGANIC" | "ADS";
  
  // Additional metadata
  metadata?: Record<string, any>;
  
  timestamp: Timestamp;
}

/**
 * Track an ASO event
 */
export async function trackASOEvent(
  event: Omit<ASOEvent, "eventId" | "timestamp">
): Promise<void> {
  const eventId = db.collection("aso_events").doc().id;
  const now = Timestamp.now();
  
  const newEvent: ASOEvent = {
    ...event,
    eventId,
    timestamp: now,
  };
  
  // Store event
  await db.collection("aso_events").doc(eventId).set(newEvent);
  
  // Update aggregated performance (async, don't wait)
  updateASOPerformance(newEvent).catch(error => {
    logger.error("Failed to update ASO performance", error);
  });
}

/**
 * Update aggregated ASO performance metrics
 */
async function updateASOPerformance(event: ASOEvent): Promise<void> {
  const date = event.timestamp.toDate().toISOString().split("T")[0]; // YYYY-MM-DD
  
  // Create performance document ID
  const perfId = `${event.variantId}_${date}_${event.country}_${event.language}_${event.trafficSource}`;
  
  const perfRef = db.collection("aso_performance").doc(perfId);
  
  // Increment the appropriate metric
  const increment = FieldValue.increment(1);
  const updates: any = {
    variantId: event.variantId,
    platform: event.platform,
    date,
    country: event.country,
    language: event.language,
    trafficSource: event.trafficSource,
    updatedAt: Timestamp.now(),
  };
  
  switch (event.eventType) {
    case "store_page_impression":
      updates.impressions = increment;
      break;
    case "store_page_view":
      updates.pageViews = increment;
      break;
    case "store_install":
      updates.installs = increment;
      break;
    case "registration_completed":
      updates.registrations = increment;
      break;
    case "verification_completed":
      updates.verifiedUsers = increment;
      break;
    case "first_purchase":
      updates.payingUsers = increment;
      break;
  }
  
  await perfRef.set(updates, { merge: true });
  
  // Recalculate derived metrics
  await recalculatePerformanceMetrics(perfId);
}

/**
 * Track revenue for an ASO variant
 */
export async function trackASORevenue(
  variantId: string,
  platform: ASOPlatform,
  country: string,
  language: string,
  trafficSource: "ORGANIC" | "ADS",
  revenueUSD: number,
  date?: Date
): Promise<void> {
  const eventDate = date || new Date();
  const dateStr = eventDate.toISOString().split("T")[0];
  
  const perfId = `${variantId}_${dateStr}_${country}_${language}_${trafficSource}`;
  const perfRef = db.collection("aso_performance").doc(perfId);
  
  await perfRef.set(
    {
      variantId,
      platform,
      date: dateStr,
      country,
      language,
      trafficSource,
      revenue: FieldValue.increment(revenueUSD),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  
  // Recalculate derived metrics
  await recalculatePerformanceMetrics(perfId);
  
  logger.info(`Tracked ASO revenue for ${variantId}`, {
    revenue: revenueUSD,
    date: dateStr,
  });
}

/**
 * Recalculate derived performance metrics
 */
async function recalculatePerformanceMetrics(perfId: string): Promise<void> {
  const perfRef = db.collection("aso_performance").doc(perfId);
  const perfDoc = await perfRef.get();
  
  if (!perfDoc.exists) {
    return;
  }
  
  const data = perfDoc.data() as ASOPerformance;
  
  const updates: Partial<ASOPerformance> = {
    updatedAt: Timestamp.now(),
  };
  
  // Store CVR = pageViews / impressions
  if (data.impressions > 0) {
    updates.storeCVR = data.pageViews / data.impressions;
  } else {
    updates.storeCVR = 0;
  }
  
  // Install → Register Rate
  if (data.installs > 0) {
    updates.installToRegisterRate = data.registrations / data.installs;
  } else {
    updates.installToRegisterRate = 0;
  }
  
  // Register → Verify Rate
  if (data.registrations > 0) {
    updates.registerToVerifyRate = data.verifiedUsers / data.registrations;
  } else {
    updates.registerToVerifyRate = 0;
  }
  
  // Verify → Pay Rate
  if (data.verifiedUsers > 0) {
    updates.verifyToPayRate = data.payingUsers / data.verifiedUsers;
  } else {
    updates.verifyToPayRate = 0;
  }
  
  // Revenue per Install
  if (data.installs > 0) {
    updates.revenuePerInstall = data.revenue / data.installs;
  } else {
    updates.revenuePerInstall = 0;
  }
  
  await perfRef.update(updates);
}

/**
 * Get performance data for a variant
 */
export async function getASOPerformance(
  variantId: string,
  startDate: string,
  endDate: string,
  filters?: {
    country?: string;
    language?: string;
    trafficSource?: "ORGANIC" | "ADS";
  }
): Promise<ASOPerformance[]> {
  let query = db
    .collection("aso_performance")
    .where("variantId", "==", variantId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate) as Query;
  
  const snapshot = await query.get();
  
  let results = snapshot.docs.map(doc => doc.data() as ASOPerformance);
  
  // Apply additional filters in memory
  if (filters?.country) {
    results = results.filter(p => p.country === filters.country);
  }
  
  if (filters?.language) {
    results = results.filter(p => p.language === filters.language);
  }
  
  if (filters?.trafficSource) {
    results = results.filter(p => p.trafficSource === filters.trafficSource);
  }
  
  return results;
}

/**
 * Get aggregated performance summary for a variant
 */
export async function getASOPerformanceSummary(
  variantId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalImpressions: number;
  totalPageViews: number;
  totalInstalls: number;
  totalRegistrations: number;
  totalVerifiedUsers: number;
  totalPayingUsers: number;
  totalRevenue: number;
  avgStoreCVR: number;
  avgInstallToRegisterRate: number;
  avgRegisterToVerifyRate: number;
  avgVerifyToPayRate: number;
  avgRevenuePerInstall: number;
}> {
  const performances = await getASOPerformance(variantId, startDate, endDate);
  
  if (performances.length === 0) {
    return {
      totalImpressions: 0,
      totalPageViews: 0,
      totalInstalls: 0,
      totalRegistrations: 0,
      totalVerifiedUsers: 0,
      totalPayingUsers: 0,
      totalRevenue: 0,
      avgStoreCVR: 0,
      avgInstallToRegisterRate: 0,
      avgRegisterToVerifyRate: 0,
      avgVerifyToPayRate: 0,
      avgRevenuePerInstall: 0,
    };
  }
  
  const totals = performances.reduce(
    (acc, p) => {
      acc.impressions += p.impressions || 0;
      acc.pageViews += p.pageViews || 0;
      acc.installs += p.installs || 0;
      acc.registrations += p.registrations || 0;
      acc.verifiedUsers += p.verifiedUsers || 0;
      acc.payingUsers += p.payingUsers || 0;
      acc.revenue += p.revenue || 0;
      return acc;
    },
    {
      impressions: 0,
      pageViews: 0,
      installs: 0,
      registrations: 0,
      verifiedUsers: 0,
      payingUsers: 0,
      revenue: 0,
    }
  );
  
  return {
    totalImpressions: totals.impressions,
    totalPageViews: totals.pageViews,
    totalInstalls: totals.installs,
    totalRegistrations: totals.registrations,
    totalVerifiedUsers: totals.verifiedUsers,
    totalPayingUsers: totals.payingUsers,
    totalRevenue: totals.revenue,
    avgStoreCVR: totals.impressions > 0 ? totals.pageViews / totals.impressions : 0,
    avgInstallToRegisterRate: totals.installs > 0 ? totals.registrations / totals.installs : 0,
    avgRegisterToVerifyRate:
      totals.registrations > 0 ? totals.verifiedUsers / totals.registrations : 0,
    avgVerifyToPayRate:
      totals.verifiedUsers > 0 ? totals.payingUsers / totals.verifiedUsers : 0,
    avgRevenuePerInstall: totals.installs > 0 ? totals.revenue / totals.installs : 0,
  };
}

/**
 * Compare performance between two variants
 */
export async function compareASOVariants(
  variantId1: string,
  variantId2: string,
  startDate: string,
  endDate: string
): Promise<{
  variant1: Awaited<ReturnType<typeof getASOPerformanceSummary>>;
  variant2: Awaited<ReturnType<typeof getASOPerformanceSummary>>;
  improvements: {
    storeCVR: number;
    installToRegisterRate: number;
    registerToVerifyRate: number;
    verifyToPayRate: number;
    revenuePerInstall: number;
  };
}> {
  const [summary1, summary2] = await Promise.all([
    getASOPerformanceSummary(variantId1, startDate, endDate),
    getASOPerformanceSummary(variantId2, startDate, endDate),
  ]);
  
  const calculateImprovement = (baseline: number, test: number): number => {
    if (baseline === 0) return 0;
    return ((test - baseline) / baseline) * 100;
  };
  
  return {
    variant1: summary1,
    variant2: summary2,
    improvements: {
      storeCVR: calculateImprovement(summary1.avgStoreCVR, summary2.avgStoreCVR),
      installToRegisterRate: calculateImprovement(
        summary1.avgInstallToRegisterRate,
        summary2.avgInstallToRegisterRate
      ),
      registerToVerifyRate: calculateImprovement(
        summary1.avgRegisterToVerifyRate,
        summary2.avgRegisterToVerifyRate
      ),
      verifyToPayRate: calculateImprovement(
        summary1.avgVerifyToPayRate,
        summary2.avgVerifyToPayRate
      ),
      revenuePerInstall: calculateImprovement(
        summary1.avgRevenuePerInstall,
        summary2.avgRevenuePerInstall
      ),
    },
  };
}

/**
 * Get performance breakdown by country
 */
export async function getPerformanceByCountry(
  variantId: string,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    country: string;
    summary: Awaited<ReturnType<typeof getASOPerformanceSummary>>;
  }>
> {
  const performances = await getASOPerformance(variantId, startDate, endDate);
  
  // Group by country
  const byCountry = new Map<string, ASOPerformance[]>();
  for (const perf of performances) {
    if (!byCountry.has(perf.country)) {
      byCountry.set(perf.country, []);
    }
    byCountry.get(perf.country)!.push(perf);
  }
  
  // Calculate summary for each country
  const results: Array<{
    country: string;
    summary: Awaited<ReturnType<typeof getASOPerformanceSummary>>;
  }> = [];
  
  // Convert to array for iteration
  const countries = Array.from(byCountry.keys());
  for (const country of countries) {
    const perfs = byCountry.get(country)!;
    const totals = perfs.reduce(
      (acc, p) => {
        acc.impressions += p.impressions || 0;
        acc.pageViews += p.pageViews || 0;
        acc.installs += p.installs || 0;
        acc.registrations += p.registrations || 0;
        acc.verifiedUsers += p.verifiedUsers || 0;
        acc.payingUsers += p.payingUsers || 0;
        acc.revenue += p.revenue || 0;
        return acc;
      },
      {
        impressions: 0,
        pageViews: 0,
        installs: 0,
        registrations: 0,
        verifiedUsers: 0,
        payingUsers: 0,
        revenue: 0,
      }
    );
    
    results.push({
      country,
      summary: {
        totalImpressions: totals.impressions,
        totalPageViews: totals.pageViews,
        totalInstalls: totals.installs,
        totalRegistrations: totals.registrations,
        totalVerifiedUsers: totals.verifiedUsers,
        totalPayingUsers: totals.payingUsers,
        totalRevenue: totals.revenue,
        avgStoreCVR: totals.impressions > 0 ? totals.pageViews / totals.impressions : 0,
        avgInstallToRegisterRate: totals.installs > 0 ? totals.registrations / totals.installs : 0,
        avgRegisterToVerifyRate:
          totals.registrations > 0 ? totals.verifiedUsers / totals.registrations : 0,
        avgVerifyToPayRate:
          totals.verifiedUsers > 0 ? totals.payingUsers / totals.verifiedUsers : 0,
        avgRevenuePerInstall: totals.installs > 0 ? totals.revenue / totals.installs : 0,
      },
    });
  }
  
  // Sort by total installs descending
  results.sort((a, b) => b.summary.totalInstalls - a.summary.totalInstalls);
  
  return results;
}

/**
 * Export performance data for external analysis
 */
export async function exportASOPerformance(
  variantId: string,
  startDate: string,
  endDate: string
): Promise<ASOPerformance[]> {
  return getASOPerformance(variantId, startDate, endDate);
}
