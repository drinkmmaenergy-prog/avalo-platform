#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Avalo CI/CD Environment...\n');

let hasErrors = false;
const results = [];

// Check Node.js version
function checkNodeVersion() {
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion >= 20) {
      results.push({ name: 'Node.js', status: '✅', version: nodeVersion, message: 'Version 20+ detected' });
      return true;
    } else {
      results.push({ name: 'Node.js', status: '❌', version: nodeVersion, message: 'Version 20+ required' });
      hasErrors = true;
      return false;
    }
  } catch (error) {
    results.push({ name: 'Node.js', status: '❌', message: 'Could not detect Node.js version' });
    hasErrors = true;
    return false;
  }
}

// Check Firebase CLI
function checkFirebaseCLI() {
  try {
    const firebaseVersion = execSync('firebase --version', { encoding: 'utf8' }).trim();
    const versionMatch = firebaseVersion.match(/(\d+)\.(\d+)\.(\d+)/);
    
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const version = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;
      
      if (major >= 13) {
        results.push({ name: 'Firebase CLI', status: '✅', version, message: 'Version 13.0.0+ detected' });
        return true;
      } else {
        results.push({ name: 'Firebase CLI', status: '❌', version, message: 'Version 13.0.0+ required' });
        hasErrors = true;
        return false;
      }
    } else {
      results.push({ name: 'Firebase CLI', status: '⚠️', message: 'Could not parse version' });
      return true; // Don't fail, just warn
    }
  } catch (error) {
    results.push({ name: 'Firebase CLI', status: '❌', message: 'Not installed. Run: npm install -g firebase-tools' });
    hasErrors = true;
    return false;
  }
}

// Check TypeScript
function checkTypeScript() {
  try {
    const tscVersion = execSync('npx tsc --version', { encoding: 'utf8', cwd: path.join(process.cwd(), 'functions') }).trim();
    results.push({ name: 'TypeScript', status: '✅', version: tscVersion, message: 'Available' });
    return true;
  } catch (error) {
    results.push({ name: 'TypeScript', status: '❌', message: 'Not available in functions directory' });
    hasErrors = true;
    return false;
  }
}

// Check required files
function checkRequiredFiles() {
  const requiredFiles = [
    'firebase.json',
    'functions/package.json',
    'functions/tsconfig.json',
    'tests/integration/package.json',
    'tests/integration/tsconfig.json',
    '.github/workflows/ci.yml'
  ];
  
  let allFound = true;
  
  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      results.push({ name: `File: ${file}`, status: '✅', message: 'Found' });
    } else {
      results.push({ name: `File: ${file}`, status: '❌', message: 'Missing' });
      hasErrors = true;
      allFound = false;
    }
  }
  
  return allFound;
}

// Check package.json scripts
function checkPackageScripts() {
  try {
    const functionsPackage = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'functions/package.json'), 'utf8')
    );
    
    if (functionsPackage.scripts && functionsPackage.scripts.build) {
      results.push({ name: 'Functions build script', status: '✅', message: 'Available' });
      return true;
    } else {
      results.push({ name: 'Functions build script', status: '❌', message: 'Missing in functions/package.json' });
      hasErrors = true;
      return false;
    }
  } catch (error) {
    results.push({ name: 'Functions package.json', status: '❌', message: 'Could not read' });
    hasErrors = true;
    return false;
  }
}

// Check environment variables in CI
function checkEnvironmentVariables() {
  const requiredVars = [
    'FIREBASE_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY'
  ];
  
  if (process.env.CI === 'true') {
    // In CI environment
    let allPresent = true;
    for (const varName of requiredVars) {
      if (process.env[varName]) {
        results.push({ name: `Env: ${varName}`, status: '✅', message: 'Set' });
      } else {
        results.push({ name: `Env: ${varName}`, status: '⚠️', message: 'Not set (may be required)' });
        // Don't fail for missing env vars in validation, as they might not be needed for all tests
      }
    }
    return allPresent;
  } else {
    // Local environment
    results.push({ name: 'Environment Variables', status: 'ℹ️', message: 'Skipped (not in CI)' });
    return true;
  }
}

// Run all checks
console.log('Running validation checks...\n');

checkNodeVersion();
checkFirebaseCLI();
checkTypeScript();
checkRequiredFiles();
checkPackageScripts();
checkEnvironmentVariables();

// Print results
console.log('\n' + '='.repeat(80));
console.log('VALIDATION RESULTS');
console.log('='.repeat(80) + '\n');

for (const result of results) {
  const version = result.version ? ` (${result.version})` : '';
  console.log(`${result.status} ${result.name}${version}`);
  if (result.message) {
    console.log(`   ${result.message}`);
  }
}

console.log('\n' + '='.repeat(80));

if (hasErrors) {
  console.log('\n❌ Validation FAILED. Please fix the errors above.\n');
  process.exit(1);
} else {
  console.log('\n✅ Validation PASSED. Environment is ready for CI/CD.\n');
  process.exit(0);
}