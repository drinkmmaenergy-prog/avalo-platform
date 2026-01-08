/**
 * ✅ PACK 366 — Ad Campaign Synchronization
 * Manages advertising campaigns and auto-syncs with country launch stages
 */

import * as admin from "firebase-admin";
import { AdLaunchWindow } from "./pack366-country-launch.types";
import { CountryLaunchService } from "./pack366-country-launch.service";
import { TrafficProtectionService } from "./pack366-traffic-protection";

const db = admin.firestore();

export class AdSyncService {
  /**
   * Create ad campaign launch window
   */
  static async createAdCampaign(
    platform: "meta" | "google" | "tiktok" | "snap",
    country: string,
    startAt: number,
    endAt: number,
    expectedCPI: number,
    dailyBudget: number,
    totalBudget: number,
    autoSync: boolean = true
  ): Promise<AdLaunchWindow> {
    const campaign: AdLaunchWindow = {
      id: `${platform}_${country}_${Date.now()}`,
      platform,
      country,
      startAt,
      endAt,
      expectedCPI,
      dailyBudget,
      totalBudget,
      spentToDate: 0,
      installsToDate: 0,
      active: false,
      autoSync,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaign.id)
      .set(campaign);

    console.log(`[PACK 366] Ad campaign created: ${campaign.id}`);
    return campaign;
  }

  /**
   * Get ad campaign by ID
   */
  static async getAdCampaign(
    campaignId: string
  ): Promise<AdLaunchWindow | null> {
    const doc = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as AdLaunchWindow;
  }

  /**
   * Get all campaigns for a country
   */
  static async getCountryCampaigns(
    country: string
  ): Promise<AdLaunchWindow[]> {
    const snapshot = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .where("country", "==", country)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AdLaunchWindow);
  }

  /**
   * Get active campaigns
   */
  static async getActiveCampaigns(): Promise<AdLaunchWindow[]> {
    const snapshot = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .where("active", "==", true)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AdLaunchWindow);
  }

  /**
   * Start ad campaign
   */
  static async startCampaign(campaignId: string): Promise<void> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Update campaign status
    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .update({
        active: true,
        updatedAt: Date.now(),
      });

    // Auto-sync with country launch stage
    if (campaign.autoSync) {
      const countryConfig = await CountryLaunchService.getCountryConfig(
        campaign.country
      );

      if (countryConfig && countryConfig.launchStage !== "public") {
        await CountryLaunchService.transitionCountryStage(
          campaign.country,
          "public",
          "ad_campaign",
          undefined,
          `Ad campaign ${campaignId} started`
        );
        console.log(
          `[PACK 366] Country ${campaign.country} auto-transitioned to PUBLIC (ad campaign started)`
        );
      }
    }

    console.log(`[PACK 366] Ad campaign started: ${campaignId}`);
  }

  /**
   * Stop ad campaign
   */
  static async stopCampaign(campaignId: string): Promise<void> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Update campaign status
    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .update({
        active: false,
        updatedAt: Date.now(),
      });

    // Auto-sync: tighten rate limits when ads stop
    if (campaign.autoSync) {
      const activeCampaignsForCountry = await this.getActiveCampaigns();
      const hasOtherActiveCampaigns = activeCampaignsForCountry.some(
        (c) => c.country === campaign.country && c.id !== campaignId
      );

      // If no other active campaigns, reduce registration rate limits
      if (!hasOtherActiveCampaigns) {
        await TrafficProtectionService.setCountryRateLimit(
          campaign.country,
          500, // Reduced from default 1000
          true
        );
        console.log(
          `[PACK 366] Rate limits tightened for ${campaign.country} (no active campaigns)`
        );
      }
    }

    console.log(`[PACK 366] Ad campaign stopped: ${campaignId}`);
  }

  /**
   * Update campaign metrics
   */
  static async updateCampaignMetrics(
    campaignId: string,
    installs: number,
    spent: number
  ): Promise<void> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const newSpentToDate = campaign.spentToDate + spent;
    const newInstallsToDate = campaign.installsToDate + installs;

    // Check budget exhaustion
    const budgetExhausted = newSpentToDate >= campaign.totalBudget;

    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .update({
        spentToDate: newSpentToDate,
        installsToDate: newInstallsToDate,
        updatedAt: Date.now(),
      });

    // Handle budget exhaustion
    if (budgetExhausted && campaign.active) {
      console.log(
        `[PACK 366] Campaign ${campaignId} budget exhausted, slowing registrations`
      );
      
      // Slow down registrations
      await TrafficProtectionService.setCountryRateLimit(
        campaign.country,
        300, // Significantly reduced
        true
      );

      // Stop the campaign
      await this.stopCampaign(campaignId);
    }

    // Log metrics
    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("metrics")
      .add({
        campaignId,
        installs,
        spent,
        timestamp: Date.now(),
        cpi: installs > 0 ? spent / installs : 0,
      });
  }

  /**
   * Get campaign performance summary
   */
  static async getCampaignSummary(campaignId: string): Promise<{
    campaign: AdLaunchWindow;
    actualCPI: number;
    budgetUsedPercentage: number;
    daysRemaining: number;
    projectedTotalSpend: number;
    performance: "good" | "warning" | "poor";
  }> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const actualCPI =
      campaign.installsToDate > 0
        ? campaign.spentToDate / campaign.installsToDate
        : 0;
    const budgetUsedPercentage =
      (campaign.spentToDate / campaign.totalBudget) * 100;

    const now = Date.now();
    const daysRemaining = Math.max(
      0,
      Math.ceil((campaign.endAt - now) / (1000 * 60 * 60 * 24))
    );

    // Project total spend based on daily rate
    const daysElapsed = Math.max(
      1,
      Math.ceil((now - campaign.startAt) / (1000 * 60 * 60 * 24))
    );
    const dailySpendRate = campaign.spentToDate / daysElapsed;
    const projectedTotalSpend =
      campaign.spentToDate + dailySpendRate * daysRemaining;

    // Determine performance
    let performance: "good" | "warning" | "poor" = "good";
    if (actualCPI > campaign.expectedCPI * 1.5) {
      performance = "poor";
    } else if (actualCPI > campaign.expectedCPI * 1.2) {
      performance = "warning";
    }

    return {
      campaign,
      actualCPI,
      budgetUsedPercentage,
      daysRemaining,
      projectedTotalSpend,
      performance,
    };
  }

  /**
   * Sync all campaigns (check for auto-start/stop based on time)
   */
  static async syncAllCampaigns(): Promise<void> {
    const now = Date.now();
    const snapshot = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .get();

    const batch = db.batch();
    let changedCount = 0;

    for (const doc of snapshot.docs) {
      const campaign = doc.data() as AdLaunchWindow;

      // Auto-start campaigns
      if (!campaign.active && now >= campaign.startAt && now < campaign.endAt) {
        await this.startCampaign(campaign.id);
        changedCount++;
      }

      // Auto-stop campaigns
      if (campaign.active && now >= campaign.endAt) {
        await this.stopCampaign(campaign.id);
        changedCount++;
      }
    }

    if (changedCount > 0) {
      console.log(`[PACK 366] Synced ${changedCount} campaigns`);
    }
  }

  /**
   * Get all campaigns by platform
   */
  static async getCampaignsByPlatform(
    platform: "meta" | "google" | "tiktok" | "snap"
  ): Promise<AdLaunchWindow[]> {
    const snapshot = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .where("platform", "==", platform)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AdLaunchWindow);
  }

  /**
   * Get campaign performance analytics
   */
  static async getCampaignAnalytics(
    campaignId: string
  ): Promise<{
    totalSpent: number;
    totalInstalls: number;
    averageCPI: number;
    dailyMetrics: Array<{
      date: string;
      installs: number;
      spent: number;
      cpi: number;
    }>;
  }> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const metricsSnapshot = await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("metrics")
      .where("campaignId", "==", campaignId)
      .orderBy("timestamp", "asc")
      .get();

    const dailyMetricsMap = new Map<
      string,
      { installs: number; spent: number }
    >();

    metricsSnapshot.docs.forEach((doc) => {
      const metric = doc.data();
      const date = new Date(metric.timestamp).toISOString().split("T")[0];

      if (!dailyMetricsMap.has(date)) {
        dailyMetricsMap.set(date, { installs: 0, spent: 0 });
      }

      const daily = dailyMetricsMap.get(date)!;
      daily.installs += metric.installs;
      daily.spent += metric.spent;
    });

    const dailyMetrics = Array.from(dailyMetricsMap.entries()).map(
      ([date, data]) => ({
        date,
        installs: data.installs,
        spent: data.spent,
        cpi: data.installs > 0 ? data.spent / data.installs : 0,
      })
    );

    return {
      totalSpent: campaign.spentToDate,
      totalInstalls: campaign.installsToDate,
      averageCPI:
        campaign.installsToDate > 0
          ? campaign.spentToDate / campaign.installsToDate
          : 0,
      dailyMetrics,
    };
  }

  /**
   * Pause campaign (temporary stop)
   */
  static async pauseCampaign(campaignId: string): Promise<void> {
    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .update({
        active: false,
        updatedAt: Date.now(),
      });

    console.log(`[PACK 366] Campaign paused: ${campaignId}`);
  }

  /**
   * Resume campaign
   */
  static async resumeCampaign(campaignId: string): Promise<void> {
    const campaign = await this.getAdCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const now = Date.now();
    if (now >= campaign.endAt) {
      throw new Error("Cannot resume expired campaign");
    }

    await db
      .collection("ops")
      .doc("adCampaigns")
      .collection("campaigns")
      .doc(campaignId)
      .update({
        active: true,
        updatedAt: now,
      });

    console.log(`[PACK 366] Campaign resumed: ${campaignId}`);
  }
}
