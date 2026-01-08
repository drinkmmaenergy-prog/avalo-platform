/**
 * Migration 002: Add Feature Flags Collection
 * Version: 1.1.0
 * 
 * Adds feature flags collection for remote configuration
 */

module.exports = {
  version: '1.1.0',
  name: 'Add Feature Flags Collection',
  
  /**
   * Apply migration
   */
  async up(db, admin) {
    console.log('  Creating feature flags collection...');
    
    // Default feature flags for all environments
    const defaultFlags = {
      aiCompanions: {
        enabled: false,
        rolloutPercentage: 0,
        description: 'AI Companion chat feature'
      },
      videoCalls: {
        enabled: false,
        rolloutPercentage: 0,
        description: 'Video call functionality'
      },
      calendarPayments: {
        enabled: true,
        rolloutPercentage: 100,
        description: 'Calendar booking and payments'
      },
      events: {
        enabled: false,
        rolloutPercentage: 0,
        description: 'Events and meetups'
      },
      refundButtons: {
        enabled: true,
        rolloutPercentage: 100,
        description: 'Refund functionality'
      },
      panicTracking: {
        enabled: true,
        rolloutPercentage: 100,
        description: 'Panic button and safety tracking'
      }
    };
    
    await db.collection('config').doc('feature_flags').set({
      flags: defaultFlags,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: '1.1.0'
    });
    
    // Update system config
    await db.collection('config').doc('system').update({
      schemaVersion: '1.1.0',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('  ✓ Feature flags collection created');
  },
  
  /**
   * Rollback migration
   */
  async down(db, admin) {
    console.log('  Rolling back feature flags...');
    
    await db.collection('config').doc('feature_flags').delete();
    
    await db.collection('config').doc('system').update({
      schemaVersion: '1.0.0',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('  ✓ Rollback complete');
  }
};