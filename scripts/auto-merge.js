#!/usr/bin/env node

/**
 * Auto-Merge Script - Safe configuration merge preserving user code
 * Validates JSON, removes old configs, ensures proper setup
 */

const fs = require('fs');
const path = require('path');

const APP_MOBILE_DIR = path.join(__dirname, '..', 'app-mobile');
const APP_JSON_PATH = path.join(APP_MOBILE_DIR, 'app.json');
const BABEL_CONFIG_PATH = path.join(APP_MOBILE_DIR, 'babel.config.js');
const ENV_EXAMPLE_PATH = path.join(APP_MOBILE_DIR, '.env.example');

const changes = [];

function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function validateAppJson() {
  console.log('🔍 Validating app.json...');
  
  const validation = validateJSON(APP_JSON_PATH);
  
  if (!validation.valid) {
    console.error(`✗ Invalid JSON in app.json: ${validation.error}`);
    process.exit(1);
  }
  
  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
  
  // Check entryPoint
  if (!appJson.expo?.entryPoint) {
    console.log('⚠ Missing entryPoint in app.json');
    appJson.expo = appJson.expo || {};
    appJson.expo.entryPoint = './index.js';
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
    changes.push('Added entryPoint: ./index.js to app.json');
  }
  
  // Check plugins
  if (!appJson.expo?.plugins || appJson.expo.plugins.length === 0) {
    console.log('⚠ No plugins configured in app.json');
    changes.push('Warning: No plugins found in app.json (expected 6 plugins)');
  } else {
    console.log(`✓ Found ${appJson.expo.plugins.length} plugins in app.json`);
  }
  
  console.log('✓ app.json is valid\n');
}

function cleanBabelConfig() {
  console.log('🔍 Checking babel.config.js...');
  
  if (!fs.existsSync(BABEL_CONFIG_PATH)) {
    console.log('⚠ babel.config.js not found\n');
    return;
  }
  
  const content = fs.readFileSync(BABEL_CONFIG_PATH, 'utf8');
  
  // Check for dotenv plugin
  if (content.includes('react-native-dotenv') || content.includes('module:react-native-dotenv')) {
    console.log('⚠ Found react-native-dotenv plugin - removing...');
    
    // Remove dotenv plugin references
    const cleanedContent = content
      .replace(/['"]module:react-native-dotenv['"],?\s*/g, '')
      .replace(/\[\s*['"]module:react-native-dotenv['"],\s*{[^}]*}\s*\],?\s*/g, '')
      .replace(/,\s*,/g, ',') // Clean up double commas
      .replace(/,\s*\]/g, ']'); // Clean up trailing commas
    
    fs.writeFileSync(BABEL_CONFIG_PATH, cleanedContent, 'utf8');
    changes.push('Removed react-native-dotenv from babel.config.js');
  }
  
  console.log('✓ babel.config.js is clean\n');
}

function ensureEnvExample() {
  console.log('🔍 Checking .env.example...');
  
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    console.log('⚠ .env.example not found - it should have been created');
    changes.push('Warning: .env.example is missing');
  } else {
    console.log('✓ .env.example exists\n');
  }
}

function checkNodeModules() {
  console.log('🔍 Checking node_modules...');
  
  const nodeModulesPath = path.join(APP_MOBILE_DIR, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('⚠ node_modules not found - dependencies need to be installed\n');
    changes.push('Warning: node_modules not found - run pnpm install');
    return;
  }
  
  const requiredPackages = [
    'expo',
    'react',
    'react-native',
    'firebase',
    '@react-navigation/native',
    'expo-location',
    'expo-camera',
    'expo-image-picker',
    'expo-font',
    'expo-secure-store',
    'expo-build-properties'
  ];
  
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    const pkgPath = path.join(nodeModulesPath, pkg);
    if (!fs.existsSync(pkgPath)) {
      missingPackages.push(pkg);
    }
  }
  
  if (missingPackages.length > 0) {
    console.log(`⚠ Missing packages: ${missingPackages.join(', ')}\n`);
    changes.push(`Warning: Missing packages - run pnpm -F app-mobile install`);
  } else {
    console.log('✓ All required packages are installed\n');
  }
}

function printSummary() {
  console.log('═'.repeat(60));
  console.log('📋 AUTO-MERGE SUMMARY');
  console.log('═'.repeat(60));
  
  if (changes.length === 0) {
    console.log('\n✅ No changes needed - configuration is correct!\n');
  } else {
    console.log('\n📝 Changes applied:\n');
    changes.forEach((change, index) => {
      console.log(`   ${index + 1}. ${change}`);
    });
    console.log('');
  }
  
  console.log('═'.repeat(60));
  console.log('✅ AUTO-MERGE COMPLETED SUCCESSFULLY');
  console.log('═'.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Run: pnpm install');
  console.log('  2. Run: pnpm -F app-mobile install');
  console.log('  3. Run: node scripts/codemod-react19.js');
  console.log('  4. Run: cd app-mobile && npx expo start --clear');
  console.log('');
}

function main() {
  console.log('🚀 Starting Auto-Merge Script...\n');
  
  try {
    validateAppJson();
    cleanBabelConfig();
    ensureEnvExample();
    checkNodeModules();
    printSummary();
  } catch (error) {
    console.error('\n❌ Auto-merge failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateJSON, validateAppJson, cleanBabelConfig };