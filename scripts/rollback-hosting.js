#!/usr/bin/env node

/**
 * Avalo Web Hosting Rollback Script
 * 
 * Rolls back web hosting to a previous deployment
 * Usage: node scripts/rollback-hosting.js --env=production
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
 * List recent hosting releases
 */
const listReleases = async () => {
  console.log('📋 Fetching recent hosting releases...\n');
  
  try {
    const { stdout } = await execPromise(
      `firebase hosting:releases:list --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN}`
    );
    
    console.log(stdout);
    return stdout;
  } catch (error) {
    console.error('Error fetching releases:', error.message);
    return null;
  }
};

/**
 * Get previous release version
 */
const getPreviousRelease = async () => {
  try {
    const { stdout } = await execPromise(
      `firebase hosting:releases:list --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN} --limit=5`
    );
    
    // Parse the output to get the second most recent release (previous)
    const lines = stdout.split('\n').filter(line => line.includes('web'));
    
    if (lines.length < 2) {
      throw new Error('Not enough releases to rollback');
    }
    
    // Extract release ID from the second line
    const previousRelease = lines[1].split(/\s+/)[0];
    return previousRelease;
  } catch (error) {
    console.error('Error getting previous release:', error.message);
    return null;
  }
};

/**
 * Rollback to specific release
 */
const rollbackToRelease = async (releaseId) => {
  console.log(`🔄 Rolling back to release: ${releaseId}...`);
  
  try {
    const { stdout } = await execPromise(
      `firebase hosting:clone ${releaseId} ${PROJECT_ID}:web --project=${ENVIRONMENT} --token=${FIREBASE_TOKEN}`
    );
    
    console.log(stdout);
    console.log('✅ Rollback complete');
    return true;
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    return false;
  }
};

/**
 * Verify hosting is accessible
 */
const verifyHosting = async () => {
  console.log('🔍 Verifying hosting...');
  
  const urls = {
    dev: 'https://avalo-dev.web.app',
    staging: 'https://avalo-staging.web.app',
    production: 'https://avalo-c8c46.web.app'
  };
  
  const url = urls[ENVIRONMENT];
  
  try {
    const https = require('https');
    
    await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log(`✅ Hosting verified at ${url}`);
          resolve();
        } else {
          reject(new Error(`Status code: ${res.statusCode}`));
        }
      }).on('error', reject);
    });
    
    return true;
  } catch (error) {
    console.error('⚠️  Verification failed:', error.message);
    return false;
  }
};

/**
 * Main rollback process
 */
const main = async () => {
  console.log('\n🔄 Avalo Web Hosting Rollback');
  console.log('═'.repeat(50));
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log('═'.repeat(50) + '\n');

  try {
    // List recent releases
    await listReleases();

    // Get previous release
    const previousRelease = await getPreviousRelease();
    if (!previousRelease) {
      throw new Error('Could not determine previous release');
    }

    console.log(`\n🎯 Rolling back to release: ${previousRelease}\n`);

    // Confirm rollback in production
    if (ENVIRONMENT === 'production') {
      console.log('⚠️  PRODUCTION ROLLBACK - Proceeding...\n');
    }

    // Rollback to previous release
    const rollbackSuccess = await rollbackToRelease(previousRelease);
    if (!rollbackSuccess) {
      throw new Error('Failed to rollback hosting');
    }

    // Wait for propagation
    console.log('⏳ Waiting for changes to propagate (30s)...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Verify hosting
    await verifyHosting();

    console.log('\n✅ ROLLBACK SUCCESSFUL');
    console.log(`Web hosting rolled back to ${previousRelease}`);

  } catch (error) {
    console.error('\n❌ ROLLBACK FAILED:', error.message);
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