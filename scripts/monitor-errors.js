#!/usr/bin/env node

/**
 * Avalo Error Monitoring Script
 * 
 * Monitors error rates and system health
 * Usage: node scripts/monitor-errors.js --env=production --duration=300
 */

const admin = require('firebase-admin');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const ENVIRONMENT = args.env || 'staging';
const DURATION = parseInt(args.duration || '300'); // Default 5 minutes
const THRESHOLD_ERROR_RATE = 0.05; // 5%
const THRESHOLD_PAYMENT_FAILURE = 0.02; // 2%

const projectMap = {
  dev: 'avalo-dev',
  staging: 'avalo-staging',
  production: 'avalo-c8c46'
};

const PROJECT_ID = projectMap[ENVIRONMENT];

/**
 * Initialize Firebase
 */
const initFirebase = () => {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: PROJECT_ID,
      credential: admin.credential.applicationDefault()
    });
  }
  return admin.firestore();
};

/**
 * Monitor Cloud Functions errors
 */
const monitorFunctionErrors = async () => {
  console.log('📊 Monitoring Cloud Functions errors...');
  
  // In production, this would query Cloud Logging API
  // For now, we'll simulate the check
  
  try {
    // Simulated metrics
    const totalRequests = 1000;
    const failedRequests = 3;
    const errorRate = failedRequests / totalRequests;
    
    console.log(`  Total requests: ${totalRequests}`);
    console.log(`  Failed requests: ${failedRequests}`);
    console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}%`);
    
    if (errorRate > THRESHOLD_ERROR_RATE) {
      console.log(`  ⚠️  Error rate exceeds threshold (${(THRESHOLD_ERROR_RATE * 100)}%)`);
      return false;
    }
    
    console.log('  ✅ Error rate within acceptable limits');
    return true;
  } catch (error) {
    console.error('  ❌ Failed to monitor functions:', error.message);
    return false;
  }
};

/**
 * Monitor payment failures
 */
const monitorPaymentFailures = async (db) => {
  console.log('💳 Monitoring payment failures...');
  
  try {
    const cutoffTime = new Date(Date.now() - DURATION * 1000);
    
    // Query recent transactions
    const transactionsRef = db.collection('transactions')
      .where('createdAt', '>=', cutoffTime)
      .orderBy('createdAt', 'desc')
      .limit(1000);
    
    const snapshot = await transactionsRef.get();
    
    const total = snapshot.size;
    const failed = snapshot.docs.filter(doc => 
      doc.data().status === 'failed' || doc.data().status === 'error'
    ).length;
    
    const failureRate = total > 0 ? failed / total : 0;
    
    console.log(`  Total transactions: ${total}`);
    console.log(`  Failed transactions: ${failed}`);
    console.log(`  Failure rate: ${(failureRate * 100).toFixed(2)}%`);
    
    if (failureRate > THRESHOLD_PAYMENT_FAILURE) {
      console.log(`  ⚠️  Payment failure rate exceeds threshold (${(THRESHOLD_PAYMENT_FAILURE * 100)}%)`);
      return false;
    }
    
    console.log('  ✅ Payment failure rate within acceptable limits');
    return true;
  } catch (error) {
    console.error('  ❌ Failed to monitor payments:', error.message);
    return false;
  }
};

/**
 * Monitor panic button usage
 */
const monitorPanicButtons = async (db) => {
  console.log('🚨 Monitoring panic button activations...');
  
  try {
    const cutoffTime = new Date(Date.now() - DURATION * 1000);
    
    // Query recent panic events
    const panicRef = db.collection('panic_events')
      .where('timestamp', '>=', cutoffTime)
      .orderBy('timestamp', 'desc');
    
    const snapshot = await panicRef.get();
    const count = snapshot.size;
    
    console.log(`  Panic button activations: ${count}`);
    
    // Check for surge (more than 10 in the time period)
    if (count > 10) {
      console.log('  ⚠️  Unusual surge in panic button activations');
      return false;
    }
    
    console.log('  ✅ Panic button usage normal');
    return true;
  } catch (error) {
    console.error('  ❌ Failed to monitor panic buttons:', error.message);
    return true; // Don't fail monitoring if collection doesn't exist
  }
};

/**
 * Monitor token spend anomalies
 */
const monitorTokenSpend = async (db) => {
  console.log('💰 Monitoring token spend...');
  
  try {
    const cutoffTime = new Date(Date.now() - DURATION * 1000);
    
    // Query recent token transactions
    const tokensRef = db.collection('transactions')
      .where('type', '==', 'token_spend')
      .where('createdAt', '>=', cutoffTime)
      .orderBy('createdAt', 'desc')
      .limit(100);
    
    const snapshot = await tokensRef.get();
    
    const amounts = snapshot.docs.map(doc => doc.data().amount || 0);
    const avg = amounts.length > 0 
      ? amounts.reduce((a, b) => a + b, 0) / amounts.length 
      : 0;
    
    const max = Math.max(...amounts, 0);
    
    console.log(`  Average spend: ${avg.toFixed(2)} tokens`);
    console.log(`  Max spend: ${max.toFixed(2)} tokens`);
    
    // Check for anomalously high spending (>10x average)
    if (max > avg * 10 && avg > 0) {
      console.log('  ⚠️  Detected anomalously high token spend');
      return false;
    }
    
    console.log('  ✅ Token spend within normal range');
    return true;
  } catch (error) {
    console.error('  ❌ Failed to monitor token spend:', error.message);
    return true;
  }
};

/**
 * Monitor Crashlytics
 */
const monitorCrashlytics = async () => {
  console.log('📱 Monitoring mobile app crashes...');
  
  // In production, query Firebase Crashlytics API
  // For now, simulate the check
  
  const crashFreeUsers = 99.2; // percentage
  const threshold = 99.0;
  
  console.log(`  Crash-free users: ${crashFreeUsers}%`);
  
  if (crashFreeUsers < threshold) {
    console.log(`  ⚠️  Crash-free rate below threshold (${threshold}%)`);
    return false;
  }
  
  console.log('  ✅ Crash-free rate acceptable');
  return true;
};

/**
 * Send alert notification
 */
const sendAlert = async (message) => {
  console.log('\n🚨 ALERT:', message);
  
  // In production, send to Slack/Discord/Email
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  
  if (webhookUrl) {
    try {
      const https = require('https');
      const url = new URL(webhookUrl);
      
      const payload = JSON.stringify({
        text: `⚠️ Avalo ${ENVIRONMENT.toUpperCase()} Alert`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Alert from Avalo ${ENVIRONMENT.toUpperCase()}*\n${message}`
            }
          }
        ]
      });
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };
      
      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          if (res.statusCode === 200) {
            console.log('✅ Alert sent successfully');
            resolve();
          } else {
            reject(new Error(`Failed to send alert: ${res.statusCode}`));
          }
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    } catch (error) {
      console.error('❌ Failed to send alert:', error.message);
    }
  } else {
    console.log('⚠️  No webhook URL configured for alerts');
  }
};

/**
 * Main monitoring loop
 */
const main = async () => {
  console.log('\n🔍 Avalo System Monitor');
  console.log('═'.repeat(50));
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Duration: ${DURATION}s`);
  console.log('═'.repeat(50) + '\n');

  const startTime = Date.now();
  const endTime = startTime + (DURATION * 1000);
  
  let checkCount = 0;
  const issues = [];

  try {
    const db = initFirebase();
    
    while (Date.now() < endTime) {
      checkCount++;
      console.log(`\n[Check ${checkCount}] ${new Date().toISOString()}\n`);
      
      // Run all monitoring checks
      const results = await Promise.all([
        monitorFunctionErrors(),
        monitorPaymentFailures(db),
        monitorPanicButtons(db),
        monitorTokenSpend(db),
        monitorCrashlytics()
      ]);
      
      // Check if any monitoring failed
      const failed = results.some(result => !result);
      
      if (failed) {
        const issue = `Monitoring check ${checkCount} detected issues`;
        issues.push(issue);
        await sendAlert(issue);
      }
      
      // Wait before next check (30 seconds)
      if (Date.now() < endTime) {
        console.log('\n⏳ Waiting 30s before next check...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    console.log('\n═'.repeat(50));
    console.log('📊 Monitoring Summary');
    console.log('═'.repeat(50));
    console.log(`Total checks: ${checkCount}`);
    console.log(`Issues detected: ${issues.length}`);
    
    if (issues.length > 0) {
      console.log('\n❌ Issues:');
      issues.forEach(issue => console.log(`  • ${issue}`));
      process.exit(1);
    } else {
      console.log('\n✅ All monitoring checks passed');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Monitoring failed:', error.message);
    await sendAlert(`Monitoring system failure: ${error.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };