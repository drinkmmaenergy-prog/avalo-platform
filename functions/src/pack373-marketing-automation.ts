/**
 * PACK 373 — PUBLIC LAUNCH MARKETING AUTOMATION
 * ASO, Influencers, Paid Traffic, ROI Control
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ========================================
// 1️⃣ ASO AUTOMATION ENGINE
// ========================================

/**
 * Rotate ASO variants for A/B testing
 */
export const pack373_rotateASOVariants = functions.pubsub
  .schedule('every monday 00:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🔄 Starting ASO variant rotation...');
    
    const asoControlDocs = await db.collection('asoControl').get();
    const batch = db.batch();
    const experiments: any[] = [];
    
    for (const doc of asoControlDocs.docs) {
      const data = doc.data();
      const countryCode = doc.id;
      
      // Select random variants for testing
      const titleVariantIndex = Math.floor(Math.random() * data.titleVariants.length);
      const subtitleVariantIndex = Math.floor(Math.random() * data.subtitleVariants.length);
      const keywordSetIndex = Math.floor(Math.random() * data.keywordSets.length);
      
      // Create experiment
      const experimentId = `${countryCode}_${Date.now()}`;
      experiments.push({
        id: experimentId,
        countryCode,
        titleVariant: data.titleVariants[titleVariantIndex],
        subtitleVariant: data.subtitleVariants[subtitleVariantIndex],
        keywordSet: data.keywordSets[keywordSetIndex],
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        impressions: 0,
        conversions: 0,
        conversionRate: 0,
        conversionLift: 0
      });
    }
    
    // Store experiments
    for (const exp of experiments) {
      const expRef = db.collection('asoExperiments').doc(exp.id);
      batch.set(expRef, exp);
    }
    
    await batch.commit();
    console.log(`✅ Created ${experiments.length} ASO experiments`);
    
    return { success: true, experimentsCreated: experiments.length };
  });

/**
 * Track store conversion rates
 */
export const pack373_trackStoreConversion = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userData = snap.data();
    const userId = context.params.userId;
    
    // Check if user came from store listing (has install metadata)
    if (!userData.installMetadata) {
      return null;
    }
    
    const { countryCode, storeExperimentId } = userData.installMetadata;
    
    if (!storeExperimentId) {
      return null;
    }
    
    // Update experiment conversion
    const experimentRef = db.collection('asoExperiments').doc(storeExperimentId);
    await experimentRef.update({
      conversions: admin.firestore.FieldValue.increment(1)
    });
    
    // Recalculate conversion rate
    const experimentDoc = await experimentRef.get();
    if (experimentDoc.exists) {
      const data = experimentDoc.data()!;
      const conversionRate = data.impressions > 0 
        ? data.conversions / data.impressions 
        : 0;
      
      // Get baseline conversion rate
      const asoControlDoc = await db.collection('asoControl').doc(countryCode).get();
      const baselineRate = asoControlDoc.exists ? asoControlDoc.data()!.conversionRate : 0;
      
      const conversionLift = baselineRate > 0 
        ? ((conversionRate - baselineRate) / baselineRate) * 100 
        : 0;
      
      await experimentRef.update({
        conversionRate,
        conversionLift
      });
      
      console.log(`📊 ASO conversion tracked: ${conversionRate.toFixed(2)}% (${conversionLift > 0 ? '+' : ''}${conversionLift.toFixed(1)}% lift)`);
    }
    
    return null;
  });

/**
 * Finalize ASO experiments weekly
 */
export const pack373_finalizeASOExperiments = functions.pubsub
  .schedule('every sunday 23:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🏁 Finalizing ASO experiments...');
    
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const experimentsSnapshot = await db.collection('asoExperiments')
      .where('status', '==', 'active')
      .where('startDate', '<', oneWeekAgo)
      .get();
    
    const batch = db.batch();
    let winnerCount = 0;
    
    for (const doc of experimentsSnapshot.docs) {
      const data = doc.data();
      
      // Mark as completed
      batch.update(doc.ref, {
        status: 'completed',
        endDate: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // If lift is positive and significant (>5%), update baseline
      if (data.conversionLift > 5) {
        const asoControlRef = db.collection('asoControl').doc(data.countryCode);
        batch.update(asoControlRef, {
          conversionRate: data.conversionRate,
          lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
          lastWinningExperiment: {
            experimentId: doc.id,
            lift: data.conversionLift,
            date: admin.firestore.FieldValue.serverTimestamp()
          }
        });
        winnerCount++;
      }
    }
    
    await batch.commit();
    console.log(`✅ Finalized ${experimentsSnapshot.size} experiments, ${winnerCount} winners applied`);
    
    return { success: true, finalized: experimentsSnapshot.size, winners: winnerCount };
  });

// ========================================
// 2️⃣ INFLUENCER & AFFILIATE TRACKING
// ========================================

/**
 * Track partner install
 */
export const pack373_trackPartnerInstall = functions.https.onCall(async (data, context) => {
  const { partnerCode, userId, deviceInfo, installMetadata } = data;
  
  if (!partnerCode || !userId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  console.log(`🤝 Tracking partner install: ${partnerCode} -> ${userId}`);
  
  // Find partner
  const partnersSnapshot = await db.collection('marketingPartners')
    .where('trackingCode', '==', partnerCode)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  
  if (partnersSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'Invalid partner code');
  }
  
  const partnerDoc = partnersSnapshot.docs[0];
  const partnerId = partnerDoc.id;
  const partnerData = partnerDoc.data();
  
  // Validate install with PACK 302 fraud detection
  const fraudScore = await validateInstall(userId, deviceInfo, installMetadata);
  
  const validated = fraudScore < 0.5; // Threshold for valid install
  
  // Record install
  const installRef = db.collection('marketingPartners')
    .doc(partnerId)
    .collection('installs')
    .doc(userId);
  
  await installRef.set({
    userId,
    partnerId,
    partnerCode,
    partnerType: partnerData.type,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    deviceInfo,
    installMetadata,
    fraudScore,
    validated,
    commissionRate: partnerData.commissionRate,
    revenue: 0,
    commissionPaid: false,
    commissionAmount: 0
  });
  
  // Update user metadata
  await db.collection('users').doc(userId).update({
    referralPartner: partnerId,
    referralCode: partnerCode,
    referralTimestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Update partner stats
  await partnerDoc.ref.update({
    totalInstalls: admin.firestore.FieldValue.increment(1),
    validatedInstalls: validated ? admin.firestore.FieldValue.increment(1) : 0,
    lastInstall: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`${validated ? '✅' : '⚠️'} Install tracked: fraud score ${fraudScore.toFixed(2)}`);
  
  return { success: true, validated, fraudScore };
});

/**
 * Calculate partner commissions on revenue
 */
export const pack373_calculatePartnerCommission = functions.firestore
  .document('transactions/{transactionId}')
  .onCreate(async (snap, context) => {
    const transaction = snap.data();
    const userId = transaction.userId;
    
    if (!userId || transaction.amount <= 0) {
      return null;
    }
    
    // Check if user has referral partner
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()!.referralPartner) {
      return null;
    }
    
    const partnerId = userDoc.data()!.referralPartner;
    
    // Get install record
    const installRef = db.collection('marketingPartners')
      .doc(partnerId)
      .collection('installs')
      .doc(userId);
    
    const installDoc = await installRef.get();
    if (!installDoc.exists || !installDoc.data()!.validated) {
      return null;
    }
    
    const installData = installDoc.data()!;
    const commissionAmount = transaction.amount * installData.commissionRate;
    
    // Update install record
    await installRef.update({
      revenue: admin.firestore.FieldValue.increment(transaction.amount),
      commissionAmount: admin.firestore.FieldValue.increment(commissionAmount)
    });
    
    // Update partner totals
    await db.collection('marketingPartners').doc(partnerId).update({
      totalRevenue: admin.firestore.FieldValue.increment(transaction.amount),
      totalCommissionOwed: admin.firestore.FieldValue.increment(commissionAmount)
    });
    
    console.log(`💰 Commission calculated: $${commissionAmount.toFixed(2)} for partner ${partnerId}`);
    
    return null;
  });

// ========================================
// 3️⃣ PAID TRAFFIC ROI CONTROL
// ========================================

/**
 * Auto-pause campaigns with poor performance
 */
export const pack373_autoPauseCampaign = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('🔍 Checking campaign performance...');
    
    const campaignsSnapshot = await db.collection('adCampaigns')
      .where('status', '==', 'active')
      .get();
    
    const batch = db.batch();
    const alerts: any[] = [];
    let pausedCount = 0;
    
    for (const doc of campaignsSnapshot.docs) {
      const campaign = doc.data();
      const campaignId = doc.id;
      
      let shouldPause = false;
      let reason = '';
      
      // Check ROAS
      if (campaign.roas < 0.8) {
        shouldPause = true;
        reason = `Low ROAS: ${campaign.roas.toFixed(2)} < 0.8`;
      }
      
      // Check CPI threshold
      const regionalLimits = await db.collection('regionalMarketingLimits')
        .doc(campaign.country)
        .get();
      
      if (regionalLimits.exists) {
        const limits = regionalLimits.data()!;
        const maxCPI = limits.maxCPI || 5; // Default $5
        
        if (campaign.cpi > maxCPI) {
          shouldPause = true;
          reason = `High CPI: $${campaign.cpi.toFixed(2)} > $${maxCPI}`;
        }
      }
      
      // Check fraud rate
      const fraudRate = campaign.fraudInstalls / (campaign.totalInstalls || 1);
      if (fraudRate > 0.15) { // 15% fraud threshold
        shouldPause = true;
        reason = `High fraud rate: ${(fraudRate * 100).toFixed(1)}%`;
      }
      
      if (shouldPause) {
        batch.update(doc.ref, {
          status: 'paused',
          pausedAt: admin.firestore.FieldValue.serverTimestamp(),
          pauseReason: reason,
          autoPaused: true
        });
        
        // Create alert
        alerts.push({
          type: 'campaign_auto_paused',
          severity: 'high',
          campaignId,
          campaignName: campaign.name,
          reason,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          resolved: false
        });
        
        pausedCount++;
        console.log(`⛔ Paused campaign ${campaignId}: ${reason}`);
      }
    }
    
    // Store alerts
    for (const alert of alerts) {
      batch.set(db.collection('marketingAlerts').doc(), alert);
    }
    
    await batch.commit();
    
    // Send notifications via PACK 293
    if (pausedCount > 0) {
      await sendMarketingAlert({
        type: 'campaigns_auto_paused',
        count: pausedCount,
        alerts
      });
    }
    
    console.log(`✅ Campaign check complete. Paused: ${pausedCount}`);
    
    return { success: true, pausedCount };
  });

/**
 * Update campaign metrics daily
 */
export const pack373_updateCampaignMetrics = functions.pubsub
  .schedule('every day 01:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('📊 Updating campaign metrics...');
    
    const campaignsSnapshot = await db.collection('adCampaigns').get();
    const batch = db.batch();
    
    for (const doc of campaignsSnapshot.docs) {
      const campaignId = doc.id;
      
      // Get installs for this campaign
      const installsSnapshot = await db.collection('installValidation')
        .where('campaignId', '==', campaignId)
        .get();
      
      let totalInstalls = 0;
      let validatedInstalls = 0;
      let fraudInstalls = 0;
      let totalRevenue = 0;
      
      for (const install of installsSnapshot.docs) {
        const installData = install.data();
        totalInstalls++;
        
        if (installData.validated) {
          validatedInstalls++;
          
          // Get user revenue
          const userRevenue = await getUserLifetimeRevenue(installData.userId);
          totalRevenue += userRevenue;
        } else {
          fraudInstalls++;
        }
      }
      
      const campaign = doc.data();
      const totalSpend = campaign.totalSpend || 0;
      const cpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
      const ltv = validatedInstalls > 0 ? totalRevenue / validatedInstalls : 0;
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      
      // Update campaign
      batch.update(doc.ref, {
        totalInstalls,
        validatedInstalls,
        fraudInstalls,
        totalRevenue,
        cpi,
        ltv,
        roas,
        lastMetricsUpdate: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Store daily performance
      const today = new Date().toISOString().split('T')[0];
      const performanceRef = doc.ref.collection('performance').doc(today);
      batch.set(performanceRef, {
        date: today,
        campaignId,
        totalInstalls,
        validatedInstalls,
        fraudInstalls,
        totalRevenue,
        totalSpend,
        cpi,
        ltv,
        roas,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log(`✅ Updated metrics for ${campaignsSnapshot.size} campaigns`);
    
    return { success: true, campaignsUpdated: campaignsSnapshot.size };
  });

// ========================================
// 4️⃣ ANTI-FRAUD INSTALL VALIDATION
// ========================================

/**
 * Validate install on user creation
 */
export const pack373_validateInstall = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();
    
    if (!userData.installMetadata) {
      return null;
    }
    
    const { deviceInfo, campaignId, ip, userAgent } = userData.installMetadata;
    
    console.log(`🔒 Validating install: ${userId}`);
    
    const fraudScore = await validateInstall(userId, deviceInfo, userData.installMetadata);
    
    const checks = {
      deviceDuplication: await checkDeviceDuplication(deviceInfo),
      vpnProxy: await checkVPNProxy(ip),
      botPattern: await checkBotPattern(userAgent, deviceInfo),
      clickFarm: await checkClickFarm(ip, deviceInfo)
    };
    
    const validated = fraudScore < 0.5;
    
    // Store validation
    await db.collection('installValidation').doc(userId).set({
      userId,
      campaignId: campaignId || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      fraudScore,
      validated,
      checks,
      deviceInfo,
      ip,
      userAgent
    });
    
    // Update campaign fraud count if applicable
    if (campaignId) {
      await db.collection('adCampaigns').doc(campaignId).update({
        totalInstalls: admin.firestore.FieldValue.increment(1),
        fraudInstalls: validated ? 0 : admin.firestore.FieldValue.increment(1)
      });
    }
    
    console.log(`${validated ? '✅' : '🚨'} Install validation: ${userId} (score: ${fraudScore.toFixed(2)})`);
    
    // If high fraud, create alert
    if (!validated) {
      await db.collection('marketingAlerts').add({
        type: 'fraud_install_detected',
        severity: 'medium',
        userId,
        campaignId,
        fraudScore,
        checks,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false
      });
    }
    
    return null;
  });

// ========================================
// 5️⃣ REGIONAL MARKETING GOVERNANCE
// ========================================

/**
 * Check regional budget limits
 */
export const pack373_checkRegionalLimits = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('🌍 Checking regional marketing limits...');
    
    const limitsSnapshot = await db.collection('regionalMarketingLimits').get();
    const alerts: any[] = [];
    
    for (const doc of limitsSnapshot.docs) {
      const limits = doc.data();
      const countryCode = doc.id;
      
      // Check daily installs
      const today = new Date().toISOString().split('T')[0];
      const dailyUsageDoc = await db.collection('marketingBudgetUsage')
        .doc(countryCode)
        .collection('daily')
        .doc(today)
        .get();
      
      if (dailyUsageDoc.exists) {
        const dailyData = dailyUsageDoc.data()!;
        
        if (dailyData.installs >= limits.maxDailyInstalls) {
          alerts.push({
            type: 'daily_install_limit_reached',
            severity: 'high',
            countryCode,
            limit: limits.maxDailyInstalls,
            actual: dailyData.installs,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false
          });
          
          // Pause campaigns in this country
          await pauseCountryCampaigns(countryCode, 'Daily install limit reached');
        }
      }
      
      // Check monthly budget
      const currentMonth = new Date().toISOString().substring(0, 7);
      const monthlyUsageDoc = await db.collection('marketingBudgetUsage')
        .doc(countryCode)
        .collection('monthly')
        .doc(currentMonth)
        .get();
      
      if (monthlyUsageDoc.exists) {
        const monthlyData = monthlyUsageDoc.data()!;
        
        if (monthlyData.spend >= limits.maxMonthlyBudget) {
          alerts.push({
            type: 'monthly_budget_limit_reached',
            severity: 'critical',
            countryCode,
            limit: limits.maxMonthlyBudget,
            actual: monthlyData.spend,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false
          });
          
          // Pause all campaigns in this country
          await pauseCountryCampaigns(countryCode, 'Monthly budget limit reached');
        }
      }
    }
    
    // Store alerts
    const batch = db.batch();
    for (const alert of alerts) {
      batch.set(db.collection('marketingAlerts').doc(), alert);
    }
    await batch.commit();
    
    if (alerts.length > 0) {
      await sendMarketingAlert({
        type: 'regional_limits_exceeded',
        count: alerts.length,
        alerts
      });
    }
    
    console.log(`✅ Regional limit check complete. Alerts: ${alerts.length}`);
    
    return { success: true, alertsCreated: alerts.length };
  });

// ========================================
// 7️⃣ AUTOMATED BUDGET PROTECTION
// ========================================

/**
 * Budget firewall - continuous monitoring
 */
export const pack373_budgetFirewall = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    console.log('🛡️ Running budget firewall checks...');
    
    const issues: any[] = [];
    
    // Check for runaway campaigns (spending > 2x daily budget)
    const campaignsSnapshot = await db.collection('adCampaigns')
      .where('status', '==', 'active')
      .get();
    
    const today = new Date().toISOString().split('T')[0];
    
    for (const doc of campaignsSnapshot.docs) {
      const campaign = doc.data();
      const campaignId = doc.id;
      
      // Get today's spend
      const performanceDoc = await doc.ref.collection('performance').doc(today).get();
      
      if (performanceDoc.exists) {
        const todaySpend = performanceDoc.data()!.totalSpend || 0;
        
        if (todaySpend > campaign.dailyBudget * 2) {
          issues.push({
            type: 'runaway_campaign',
            campaignId,
            dailyBudget: campaign.dailyBudget,
            actualSpend: todaySpend
          });
          
          // Emergency pause
          await doc.ref.update({
            status: 'paused',
            pausedAt: admin.firestore.FieldValue.serverTimestamp(),
            pauseReason: 'Emergency: Runaway spending detected',
            autoPaused: true
          });
        }
      }
    }
    
    // Check for suspicious install spikes (potential bot attack)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentInstalls = await db.collection('installValidation')
      .where('timestamp', '>', oneHourAgo)
      .get();
    
    const installsByIP: { [key: string]: number } = {};
    const installsByDevice: { [key: string]: number } = {};
    
    recentInstalls.forEach(doc => {
      const data = doc.data();
      const ip = data.ip || 'unknown';
      const deviceId = data.deviceInfo?.deviceId || 'unknown';
      
      installsByIP[ip] = (installsByIP[ip] || 0) + 1;
      installsByDevice[deviceId] = (installsByDevice[deviceId] || 0) + 1;
    });
    
    // Flag suspicious patterns
    for (const [ip, count] of Object.entries(installsByIP)) {
      if (count > 10) { // 10+ installs from same IP in 1 hour
        issues.push({
          type: 'bot_traffic_spike',
          ip,
          installCount: count,
          timeWindow: '1 hour'
        });
      }
    }
    
    for (const [deviceId, count] of Object.entries(installsByDevice)) {
      if (count > 5) { // 5+ installs from same device in 1 hour
        issues.push({
          type: 'device_farming',
          deviceId,
          installCount: count,
          timeWindow: '1 hour'
        });
      }
    }
    
    // Store issues as alerts
    if (issues.length > 0) {
      const batch = db.batch();
      
      for (const issue of issues) {
        batch.set(db.collection('marketingAlerts').doc(), {
          ...issue,
          severity: 'critical',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          resolved: false
        });
      }
      
      await batch.commit();
      
      // Send critical alert via PACK 293
      await sendMarketingAlert({
        type: 'budget_firewall_triggered',
        severity: 'critical',
        issueCount: issues.length,
        issues
      });
    }
    
    console.log(`🛡️ Budget firewall check complete. Issues: ${issues.length}`);
    
    return { success: true, issuesDetected: issues.length, issues };
  });

// ========================================
// HELPER FUNCTIONS
// ========================================

async function validateInstall(userId: string, deviceInfo: any, metadata: any): Promise<number> {
  let fraudScore = 0;
  
  // Check device duplication (weight: 0.3)
  const deviceDup = await checkDeviceDuplication(deviceInfo);
  fraudScore += deviceDup ? 0.3 : 0;
  
  // Check VPN/Proxy (weight: 0.2)
  const vpnProxy = await checkVPNProxy(metadata.ip);
  fraudScore += vpnProxy ? 0.2 : 0;
  
  // Check bot patterns (weight: 0.3)
  const botPattern = await checkBotPattern(metadata.userAgent, deviceInfo);
  fraudScore += botPattern ? 0.3 : 0;
  
  // Check click farm (weight: 0.2)
  const clickFarm = await checkClickFarm(metadata.ip, deviceInfo);
  fraudScore += clickFarm ? 0.2 : 0;
  
  return fraudScore;
}

async function checkDeviceDuplication(deviceInfo: any): Promise<boolean> {
  if (!deviceInfo?.deviceId) return false;
  
  const count = await db.collection('users')
    .where('installMetadata.deviceInfo.deviceId', '==', deviceInfo.deviceId)
    .count()
    .get();
  
  return count.data().count > 3; // Same device used 3+ times
}

async function checkVPNProxy(ip: string): Promise<boolean> {
  // Simplified - in production, use IP intelligence service
  // Check against known VPN/proxy IP ranges
  return false; // Placeholder
}

async function checkBotPattern(userAgent: string, deviceInfo: any): Promise<boolean> {
  // Check for headless browser patterns
  const botPatterns = [
    'headless',
    'phantom',
    'selenium',
    'webdriver',
    'automation'
  ];
  
  const ua = (userAgent || '').toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
}

async function checkClickFarm(ip: string, deviceInfo: any): Promise<boolean> {
  if (!ip) return false;
  
  // Check recent installs from same IP
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await db.collection('installValidation')
    .where('ip', '==', ip)
    .where('timestamp', '>', oneHourAgo)
    .count()
    .get();
  
  return count.data().count > 5; // 5+ installs from same IP in 1 hour
}

async function getUserLifetimeRevenue(userId: string): Promise<number> {
  const transactionsSnapshot = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('status', '==', 'completed')
    .get();
  
  let total = 0;
  transactionsSnapshot.forEach(doc => {
    total += doc.data().amount || 0;
  });
  
  return total;
}

async function pauseCountryCampaigns(countryCode: string, reason: string): Promise<void> {
  const campaignsSnapshot = await db.collection('adCampaigns')
    .where('country', '==', countryCode)
    .where('status', '==', 'active')
    .get();
  
  const batch = db.batch();
  
  campaignsSnapshot.forEach(doc => {
    batch.update(doc.ref, {
      status: 'paused',
      pausedAt: admin.firestore.FieldValue.serverTimestamp(),
      pauseReason: reason,
      autoPaused: true
    });
  });
  
  await batch.commit();
  console.log(`⛔ Paused ${campaignsSnapshot.size} campaigns in ${countryCode}`);
}

async function sendMarketingAlert(alert: any): Promise<void> {
  // Integration with PACK 293 notifications
  try {
    await db.collection('adminNotifications').add({
      type: 'marketing_alert',
      priority: 'critical',
      data: alert,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    });
  } catch (error) {
    console.error('Failed to send marketing alert:', error);
  }
}

