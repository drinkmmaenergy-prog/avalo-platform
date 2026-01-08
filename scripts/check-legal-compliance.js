#!/usr/bin/env node

/**
 * Legal & Compliance Check
 * 
 * Verifies that all legal requirements are met before production deployment
 * Usage: node scripts/check-legal-compliance.js
 */

const fs = require('fs');
const path = require('path');

/**
 * Check if Terms of Service exist and are up to date
 */
const checkTermsOfService = () => {
  console.log('📄 Checking Terms of Service...');
  
  const termsPath = path.join(__dirname, '../docs/legal/TERMS_OF_SERVICE.md');
  
  if (!fs.existsSync(termsPath)) {
    console.log('  ❌ Terms of Service not found');
    return false;
  }
  
  const stats = fs.statSync(termsPath);
  const daysSinceUpdate = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
  
  console.log(`  ✅ Terms of Service found`);
  console.log(`  📅 Last updated: ${Math.floor(daysSinceUpdate)} days ago`);
  
  if (daysSinceUpdate > 365) {
    console.log('  ⚠️  Terms of Service may need review (>1 year old)');
  }
  
  return true;
};

/**
 * Check if Privacy Policy exists and are up to date
 */
const checkPrivacyPolicy = () => {
  console.log('🔒 Checking Privacy Policy...');
  
  const privacyPath = path.join(__dirname, '../docs/legal/PRIVACY_POLICY.md');
  
  if (!fs.existsSync(privacyPath)) {
    console.log('  ❌ Privacy Policy not found');
    return false;
  }
  
  const content = fs.readFileSync(privacyPath, 'utf8');
  
  // Check for required sections
  const requiredSections = [
    'Data Collection',
    'Data Usage',
    'Data Sharing',
    'User Rights',
    'GDPR Compliance',
    'California Privacy Rights',
    'Cookies',
    'Contact Information'
  ];
  
  const missingSections = requiredSections.filter(section => 
    !content.toLowerCase().includes(section.toLowerCase())
  );
  
  if (missingSections.length > 0) {
    console.log('  ❌ Missing required sections:');
    missingSections.forEach(section => console.log(`    • ${section}`));
    return false;
  }
  
  console.log('  ✅ Privacy Policy complete with all required sections');
  return true;
};

/**
 * Check age verification gate
 */
const checkAgeGate = () => {
  console.log('🔞 Checking Age Verification Gate...');
  
  // Check if age gate is implemented in mobile app
  const ageGateFiles = [
    path.join(__dirname, '../app-mobile/app/auth/age-verification.tsx'),
    path.join(__dirname, '../app-web/src/components/AgeGate.tsx')
  ];
  
  let found = false;
  
  for (const file of ageGateFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for 18+ verification
      if (content.includes('18') || content.includes('age')) {
        console.log(`  ✅ Age gate found: ${path.basename(file)}`);
        found = true;
      }
    }
  }
  
  if (!found) {
    console.log('  ❌ Age verification gate not found');
    return false;
  }
  
  return true;
};

/**
 * Check content moderation system
 */
const checkContentModeration = () => {
  console.log('🛡️  Checking Content Moderation...');
  
  // Check for moderation implementation
  const moderationFiles = [
    path.join(__dirname, '../functions/src/moderation'),
    path.join(__dirname, '../lib/moderation.ts')
  ];
  
  let found = false;
  
  for (const file of moderationFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Moderation system found: ${path.basename(file)}`);
      found = true;
    }
  }
  
  if (!found) {
    console.log('  ❌ Content moderation system not found');
    return false;
  }
  
  return true;
};

/**
 * Check refund policy implementation
 */
const checkRefundPolicy = () => {
  console.log('💰 Checking Refund Policy...');
  
  // Check for refund policy document
  const refundPolicyPath = path.join(__dirname, '../docs/legal/REFUND_POLICY.md');
  
  if (!fs.existsSync(refundPolicyPath)) {
    console.log('  ⚠️  Refund policy document not found');
  } else {
    console.log('  ✅ Refund policy document found');
  }
  
  // Check for refund implementation in code
  const refundFiles = [
    path.join(__dirname, '../functions/src/payments/refunds.ts'),
    path.join(__dirname, '../lib/refunds.ts')
  ];
  
  let implemented = false;
  
  for (const file of refundFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Refund system implemented: ${path.basename(file)}`);
      implemented = true;
    }
  }
  
  if (!implemented) {
    console.log('  ❌ Refund system not implemented');
    return false;
  }
  
  return true;
};

/**
 * Check data export capability (GDPR requirement)
 */
const checkDataExport = () => {
  console.log('📥 Checking Data Export (GDPR)...');
  
  const exportFiles = [
    path.join(__dirname, '../functions/src/gdpr/data-export.ts'),
    path.join(__dirname, '../lib/data-export.ts')
  ];
  
  let found = false;
  
  for (const file of exportFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Data export capability found: ${path.basename(file)}`);
      found = true;
    }
  }
  
  if (!found) {
    console.log('  ⚠️  Data export capability not found (GDPR requirement)');
    return false;
  }
  
  return true;
};

/**
 * Check data deletion capability (GDPR requirement)
 */
const checkDataDeletion = () => {
  console.log('🗑️  Checking Data Deletion (GDPR)...');
  
  const deletionFiles = [
    path.join(__dirname, '../functions/src/gdpr/data-deletion.ts'),
    path.join(__dirname, '../lib/data-deletion.ts')
  ];
  
  let found = false;
  
  for (const file of deletionFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Data deletion capability found: ${path.basename(file)}`);
      found = true;
    }
  }
  
  if (!found) {
    console.log('  ⚠️  Data deletion capability not found (GDPR requirement)');
    return false;
  }
  
  return true;
};

/**
 * Check cookie consent
 */
const checkCookieConsent = () => {
  console.log('🍪 Checking Cookie Consent...');
  
  const cookieFiles = [
    path.join(__dirname, '../app-web/src/components/CookieConsent.tsx'),
    path.join(__dirname, '../web-landing/src/components/CookieConsent.tsx')
  ];
  
  let found = false;
  
  for (const file of cookieFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Cookie consent found: ${path.basename(file)}`);
      found = true;
    }
  }
  
  if (!found) {
    console.log('  ⚠️  Cookie consent not found');
    return false;
  }
  
  return true;
};

/**
 * Check accessibility compliance
 */
const checkAccessibility = () => {
  console.log('♿ Checking Accessibility Compliance...');
  
  // Check for accessibility documentation
  const a11yPath = path.join(__dirname, '../docs/ACCESSIBILITY.md');
  
  if (fs.existsSync(a11yPath)) {
    console.log('  ✅ Accessibility documentation found');
    return true;
  } else {
    console.log('  ⚠️  Accessibility documentation not found');
    console.log('  📝 Consider adding WCAG 2.1 compliance documentation');
    return true; // Not blocking, but recommended
  }
};

/**
 * Main execution
 */
const main = async () => {
  console.log('\n⚖️  Legal & Compliance Check');
  console.log('═'.repeat(50) + '\n');

  const checks = [
    { name: 'Terms of Service', fn: checkTermsOfService, required: true },
    { name: 'Privacy Policy', fn: checkPrivacyPolicy, required: true },
    { name: 'Age Verification', fn: checkAgeGate, required: true },
    { name: 'Content Moderation', fn: checkContentModeration, required: true },
    { name: 'Refund Policy', fn: checkRefundPolicy, required: true },
    { name: 'Data Export (GDPR)', fn: checkDataExport, required: true },
    { name: 'Data Deletion (GDPR)', fn: checkDataDeletion, required: true },
    { name: 'Cookie Consent', fn: checkCookieConsent, required: true },
    { name: 'Accessibility', fn: checkAccessibility, required: false }
  ];

  const results = [];
  
  for (const check of checks) {
    const passed = check.fn();
    results.push({ ...check, passed });
    console.log();
  }

  // Summary
  console.log('═'.repeat(50));
  console.log('📊 Compliance Summary');
  console.log('═'.repeat(50) + '\n');

  const required = results.filter(r => r.required);
  const passed = required.filter(r => r.passed).length;
  const total = required.length;

  console.log(`Required checks passed: ${passed}/${total}\n`);

  if (passed < total) {
    console.log('❌ Compliance check FAILED\n');
    console.log('Failed checks:');
    results.filter(r => r.required && !r.passed).forEach(r => {
      console.log(`  • ${r.name}`);
    });
    console.log('\n⚠️  Production deployment BLOCKED until all compliance requirements are met');
    process.exit(1);
  }

  console.log('✅ All required compliance checks PASSED');
  console.log('✨ Ready for production deployment\n');
  process.exit(0);
};

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };