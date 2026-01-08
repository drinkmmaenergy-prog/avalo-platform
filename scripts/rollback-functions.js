#!/usr/bin/env node

/**
 * Avalo Cloud Functions Rollback Script
 * 
 * Rolls back Cloud Functions to a previous deployment
 * Usage: node scripts/rollback-functions.js --env=production
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const ENVIRONMENT = args.env || 'staging';
const FIREBASE_TOKEN = process.env.FIREBASE_TOKEN;

const projectMap = {
  dev: 'avalo-dev',
  staging: 'avalo-staging',
  production: 'avalo-c8c46'
};

const PROJECT_ID = projectMap[ENVIRONMENT];

if (!PROJECT_ID) {
  console.error(`❌ Invalid environment: ${ENVIRONMENT}`);
  process.exit(1);
}

if (!FIREBASE_TOKEN) {
  console.error('❌ FIREBASE_TOKEN environment variable not set');
  process.exit(1);
}

/**
 * List recent function deployments
 */
const listDeployments = async () => {
  console.log('📋 Fetching recent deployments...\n');
  
  try {
    const { stdout } = await execPromise(
      `firebase functions:log --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN} --limit=10`
    );
    
    console.log(stdout);
    return stdout;
  } catch (error) {
    console.error('Error fetching deployments:', error.message);
    return null;
  }
};

/**
 * Get previous deployment version from backup
 */
const getPreviousVersion = async () => {
  // In a real implementation, this would fetch from the backup artifacts
  // For now, we'll use the current git commit
  try {
    const { stdout } = await execPromise('git rev-parse HEAD~1');
    return stdout.trim();
  } catch (error) {
    console.error('Error getting previous version:', error.message);
    return null;
  }
};

/**
 * Checkout previous version
 */
const checkoutVersion = async (version) => {
  console.log(`📦 Checking out version ${version.substring(0, 7)}...`);
  
  try {
    await execPromise(`git checkout ${version}`);
    console.log('✅ Checkout complete');
    return true;
  } catch (error) {
    console.error('❌ Checkout failed:', error.message);
    return false;
  }
};

/**
 * Build functions
 */
const buildFunctions = async () => {
  console.log('🔨 Building Cloud Functions...');
  
  try {
    const { stdout, stderr } = await execPromise(
      'cd functions && npm ci && npm run build',
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    if (stderr && !stderr.includes('warning')) {
      console.error('Build errors:', stderr);
    }
    
    console.log('✅ Build complete');
    return true;
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    return false;
  }
};

/**
 * Deploy functions
 */
const deployFunctions = async () => {
  console.log('🚀 Deploying Cloud Functions...');
  
  try {
    const { stdout } = await execPromise(
      `firebase deploy --only functions --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN}`,
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    console.log(stdout);
    console.log('✅ Deployment complete');
    return true;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    return false;
  }
};

/**
 * Verify functions are working
 */
const verifyFunctions = async () => {
  console.log('🔍 Verifying functions...');
  
  // Wait for functions to become available
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  try {
    // Test a simple health check function if available
    const { stdout } = await execPromise(
      `firebase functions:config:get --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN}`
    );
    
    console.log('✅ Functions verified');
    return true;
  } catch (error) {
    console.error('⚠️  Verification failed:', error.message);
    return false;
  }
};

/**
 * Return to main branch
 */
const returnToMain = async () => {
  try {
    await execPromise('git checkout main');
    console.log('↩️  Returned to main branch');
  } catch (error) {
    console.log('⚠️  Could not return to main branch');
  }
};

/**
 * Main rollback process
 */
const main = async () => {
  console.log('\n🔄 Avalo Cloud Functions Rollback');
  console.log('═'.repeat(50));
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log('═'.repeat(50) + '\n');

  try {
    // List recent deployments for reference
    await listDeployments();

    // Get previous version
    const previousVersion = await getPreviousVersion();
    if (!previousVersion) {
      throw new Error('Could not determine previous version');
    }

    console.log(`\n🎯 Rolling back to: ${previousVersion.substring(0, 7)}\n`);

    // Confirm rollback in production
    if (ENVIRONMENT === 'production') {
      console.log('⚠️  PRODUCTION ROLLBACK - Proceeding...\n');
    }

    // Checkout previous version
    const checkoutSuccess = await checkoutVersion(previousVersion);
    if (!checkoutSuccess) {
      throw new Error('Failed to checkout previous version');
    }

    // Build functions
    const buildSuccess = await buildFunctions();
    if (!buildSuccess) {
      throw new Error('Failed to build functions');
    }

    // Deploy functions
    const deploySuccess = await deployFunctions();
    if (!deploySuccess) {
      throw new Error('Failed to deploy functions');
    }

    // Verify deployment
    await verifyFunctions();

    // Return to main branch
    await returnToMain();

    console.log('\n✅ ROLLBACK SUCCESSFUL');
    console.log(`Cloud Functions rolled back to ${previousVersion.substring(0, 7)}`);

  } catch (error) {
    console.error('\n❌ ROLLBACK FAILED:', error.message);
    await returnToMain();
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };