/**
 * Firestore Payout System Setup Script
 * 
 * This script creates the required Firestore documents for the payout system.
 * Run this once to initialize the payout configuration.
 * 
 * Usage:
 * 1. Install Firebase Admin SDK: npm install firebase-admin
 * 2. Download your Firebase Admin SDK service account key
 * 3. Update the serviceAccount path below
 * 4. Run: node firestore-payout-setup.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./path/to/your-firebase-adminsdk-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://your-project-id.firebaseio.com'
});

const db = admin.firestore();

async function setupPayoutSystem() {
  console.log('🚀 Setting up Avalo Payout System...\n');

  try {
    // 1. Create payout fees configuration
    console.log('📝 Creating /system/payoutFees document...');
    await db.collection('system').doc('payoutFees').set({
      paypal: {
        type: 'percent',
        value: 7
      },
      bank: {
        type: 'flat',
        value: 4
      },
      revolut: {
        type: 'percent',
        value: 5
      },
      crypto: {
        type: 'percent',
        value: 2
      }
    });
    console.log('✅ Payout fees configured\n');

    // 2. Create token price configuration
    console.log('📝 Creating /system/tokenPrice document...');
    await db.collection('system').doc('tokenPrice').set({
      eurValue: 0.05  // 1 token = 0.05 EUR
    });
    console.log('✅ Token price configured (1 token = €0.05)\n');

    // 3. Verify setup
    console.log('🔍 Verifying configuration...');
    const feesDoc = await db.collection('system').doc('payoutFees').get();
    const priceDoc = await db.collection('system').doc('tokenPrice').get();
    
    if (feesDoc.exists && priceDoc.exists) {
      console.log('✅ All documents verified!\n');
      
      console.log('📊 Current Configuration:');
      console.log('Fee Structure:');
      const fees = feesDoc.data();
      console.log(`  - PayPal: ${fees.paypal.value}% fee`);
      console.log(`  - Bank: €${fees.bank.value} flat fee`);
      console.log(`  - Revolut: ${fees.revolut.value}% fee`);
      console.log(`  - Crypto: ${fees.crypto.value}% fee`);
      console.log(`\nToken Price: €${priceDoc.data().eurValue} per token\n`);
      
      console.log('🎉 Payout system setup complete!');
      console.log('You can now use the payout feature in the mobile app.\n');
    } else {
      console.error('❌ Verification failed - documents not found');
    }

  } catch (error) {
    console.error('❌ Error setting up payout system:', error);
  } finally {
    process.exit(0);
  }
}

// Optional: Create test user with tokens
async function createTestUser(userId = 'test-user-123') {
  console.log('\n🧪 Creating test user with tokens...');
  
  try {
    // Create user wallet with 1000 tokens
    await db.collection('balances').doc(userId).collection('wallet').doc('wallet').set({
      tokens: 1000,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Test user created: ${userId}`);
    console.log('   Balance: 1000 tokens\n');
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  }
}

// Run setup
console.log('═══════════════════════════════════════════════════');
console.log('     AVALO PAYOUT SYSTEM - FIRESTORE SETUP');
console.log('═══════════════════════════════════════════════════\n');

// Check if we should create test user
const args = process.argv.slice(2);
const createTest = args.includes('--test');

setupPayoutSystem().then(() => {
  if (createTest) {
    createTestUser();
  }
});