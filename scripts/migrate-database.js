#!/usr/bin/env node

/**
 * Avalo Database Migration Engine
 * 
 * Manages schema versioning and migrations across environments
 * Usage: node scripts/migrate-database.js --env=staging --dry-run=false
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const ENVIRONMENT = args.env || 'dev';
const DRY_RUN = args['dry-run'] !== 'false';
const FORCE = args.force === 'true';

// Schema version tracking
const SCHEMA_VERSION_COLLECTION = '_schema_version';
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Initialize Firebase Admin
const initFirebase = () => {
  const projectId = {
    dev: 'avalo-dev',
    staging: 'avalo-staging',
    production: 'avalo-c8c46'
  }[ENVIRONMENT];

  if (!projectId) {
    throw new Error(`Invalid environment: ${ENVIRONMENT}`);
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId,
      credential: admin.credential.applicationDefault()
    });
  }

  return admin.firestore();
};

// Get current schema version
const getCurrentSchemaVersion = async (db) => {
  try {
    const doc = await db.collection(SCHEMA_VERSION_COLLECTION).doc('current').get();
    
    if (!doc.exists) {
      console.log('📍 No schema version found. Starting from 1.0.0');
      return '1.0.0';
    }
    
    return doc.data().version || '1.0.0';
  } catch (error) {
    console.error('Error getting schema version:', error);
    return '1.0.0';
  }
};

// Update schema version
const updateSchemaVersion = async (db, newVersion, migrationName) => {
  const versionRef = db.collection(SCHEMA_VERSION_COLLECTION).doc('current');
  const historyRef = db.collection(SCHEMA_VERSION_COLLECTION).doc('history');
  
  await versionRef.set({
    version: newVersion,
    lastMigration: migrationName,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    environment: ENVIRONMENT
  });

  // Track migration history
  await historyRef.set({
    migrations: admin.firestore.FieldValue.arrayUnion({
      version: newVersion,
      name: migrationName,
      appliedAt: new Date().toISOString(),
      environment: ENVIRONMENT
    })
  }, { merge: true });
};

// Load migration files
const loadMigrations = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('📂 Creating migrations directory...');
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  return files.map(file => {
    const migration = require(path.join(MIGRATIONS_DIR, file));
    return {
      file,
      version: migration.version,
      name: migration.name,
      up: migration.up,
      down: migration.down
    };
  });
};

// Compare version numbers
const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};

// Run migrations
const runMigrations = async (db, currentVersion, migrations) => {
  const pendingMigrations = migrations.filter(m => 
    compareVersions(m.version, currentVersion) > 0
  );

  if (pendingMigrations.length === 0) {
    console.log('✅ Database is up to date. No migrations needed.');
    return;
  }

  console.log(`\n📊 Found ${pendingMigrations.length} pending migration(s):\n`);
  
  for (const migration of pendingMigrations) {
    console.log(`  • ${migration.version} - ${migration.name}`);
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE - No changes will be applied');
    console.log('Run with --dry-run=false to apply migrations');
    return;
  }

  if (!FORCE && ENVIRONMENT === 'production') {
    console.log('\n⚠️  PRODUCTION ENVIRONMENT');
    console.log('Add --force=true to confirm production migrations');
    return;
  }

  console.log('\n🚀 Applying migrations...\n');

  for (const migration of pendingMigrations) {
    console.log(`Applying ${migration.version} - ${migration.name}...`);
    
    try {
      await migration.up(db, admin);
      await updateSchemaVersion(db, migration.version, migration.name);
      console.log(`✅ Successfully applied ${migration.version}`);
    } catch (error) {
      console.error(`❌ Failed to apply ${migration.version}:`, error);
      throw error;
    }
  }

  console.log('\n✅ All migrations applied successfully!');
};

// Create snapshot for rollback
const createSnapshot = async (db) => {
  const currentVersion = await getCurrentSchemaVersion(db);
  const snapshotRef = db.collection('_schema_snapshots').doc(currentVersion);
  
  console.log(`📸 Creating snapshot for version ${currentVersion}...`);
  
  await snapshotRef.set({
    version: currentVersion,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    environment: ENVIRONMENT
  });
  
  console.log('✅ Snapshot created');
};

// Main execution
const main = async () => {
  console.log('\n🔄 Avalo Database Migration Tool');
  console.log('═'.repeat(50));
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Dry Run: ${DRY_RUN}`);
  console.log('═'.repeat(50) + '\n');

  try {
    const db = initFirebase();
    
    // Get current version
    const currentVersion = await getCurrentSchemaVersion(db);
    console.log(`📌 Current schema version: ${currentVersion}\n`);

    // Load migrations
    const migrations = loadMigrations();
    console.log(`📦 Loaded ${migrations.length} migration file(s)\n`);

    // Create snapshot before migrations (production only)
    if (ENVIRONMENT === 'production' && !DRY_RUN) {
      await createSnapshot(db);
    }

    // Run migrations
    await runMigrations(db, currentVersion, migrations);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
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