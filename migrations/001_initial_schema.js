/**
 * Migration 001: Initial Schema Setup
 * Version: 1.0.0
 * 
 * Sets up the initial database schema with base collections
 */

module.exports = {
  version: '1.0.0',
  name: 'Initial Schema Setup',
  
  /**
   * Apply migration
   */
  async up(db, admin) {
    console.log('  Creating initial schema structure...');
    
    // Create schema version tracking
    await db.collection('_schema_version').doc('current').set({
      version: '1.0.0',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      description: 'Initial schema version'
    });
    
    // Create config collection with default settings
    await db.collection('config').doc('system').set({
      schemaVersion: '1.0.0',
      maintenanceMode: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('  ✓ Initial schema created');
  },
  
  /**
   * Rollback migration
   */
  async down(db, admin) {
    console.log('  Rolling back initial schema...');
    
    // Clean up collections
    await db.collection('_schema_version').doc('current').delete();
    await db.collection('config').doc('system').delete();
    
    console.log('  ✓ Rollback complete');
  }
};