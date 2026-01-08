#!/usr/bin/env node
/**
 * Avalo Pre-Build Validator
 * Validates monorepo integrity before deployment
 * @version 3.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  passed: boolean;
  category: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const results: ValidationResult[] = [];

function logResult(result: ValidationResult) {
  results.push(result);
  const icon = result.passed ? '✅' : result.severity === 'error' ? '❌' : '⚠️';
  console.log(`${icon} [${result.category}] ${result.message}`);
}

// ============================================================================
// SDK VALIDATION
// ============================================================================

function validateSDK(): void {
  console.log('\n📦 Validating SDK...');
  
  // Check SDK structure
  const sdkPath = path.join(process.cwd(), 'sdk');
  const requiredFiles = [
    'src/index.ts',
    'src/client.ts',
    'src/types.ts',
    'src/auth.ts',
    'src/profiles.ts',
    'src/feed.ts',
    'src/chat.ts',
    'src/payments.ts',
    'src/ai.ts',
    'src/creator.ts',
    'src/matchmaking.ts',
    'src/notifications.ts',
    'src/admin.ts',
    'package.json',
    'tsconfig.json',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(sdkPath, file);
    if (fs.existsSync(filePath)) {
      logResult({
        passed: true,
        category: 'SDK',
        message: `Found ${file}`,
        severity: 'info',
      });
    } else {
      logResult({
        passed: false,
        category: 'SDK',
        message: `Missing required file: ${file}`,
        severity: 'error',
      });
    }
  }

  // Check for .js extensions in imports
  const indexPath = path.join(sdkPath, 'src/index.ts');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');
    const hasJsExtensions = content.includes('.js');
    logResult({
      passed: hasJsExtensions,
      category: 'SDK',
      message: hasJsExtensions 
        ? 'Imports have .js extensions (NodeNext compatible)'
        : 'Imports missing .js extensions',
      severity: hasJsExtensions ? 'info' : 'error',
    });
  }

  // Validate package.json exports
  const pkgPath = path.join(sdkPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const hasExports = pkg.exports && pkg.exports['.'];
    logResult({
      passed: hasExports,
      category: 'SDK',
      message: hasExports ? 'Package exports configured' : 'Missing package exports',
      severity: hasExports ? 'info' : 'error',
    });
  }
}

// ============================================================================
// FUNCTIONS VALIDATION
// ============================================================================

function validateFunctions(): void {
  console.log('\n🔥 Validating Firebase Functions...');
  
  const functionsPath = path.join(process.cwd(), 'functions');
  const requiredFiles = [
    'src/index.ts',
    'src/validation.schemas.ts',
    'src/securityMiddleware.ts',
    'src/rateLimit.ts',
    'package.json',
    'tsconfig.json',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(functionsPath, file);
    if (fs.existsSync(filePath)) {
      logResult({
        passed: true,
        category: 'Functions',
        message: `Found ${file}`,
        severity: 'info',
      });
    } else {
      logResult({
        passed: false,
        category: 'Functions',
        message: `Missing required file: ${file}`,
        severity: 'error',
      });
    }
  }

  // Check TypeScript strict mode
  const tsconfigPath = path.join(functionsPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    const isStrict = tsconfig.compilerOptions?.strict === true;
    logResult({
      passed: isStrict,
      category: 'Functions',
      message: isStrict ? 'TypeScript strict mode enabled' : 'TypeScript strict mode disabled',
      severity: isStrict ? 'info' : 'warning',
    });
  }

  // Check for Zod dependency
  const pkgPath = path.join(functionsPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const hasZod = pkg.dependencies?.zod;
    logResult({
      passed: hasZod,
      category: 'Functions',
      message: hasZod ? 'Zod validation library installed' : 'Missing Zod dependency',
      severity: hasZod ? 'info' : 'error',
    });
  }
}

// ============================================================================
// SECURITY VALIDATION
// ============================================================================

function validateSecurity(): void {
  console.log('\n🔒 Validating Security Configuration...');
  
  // Check for environment variables template
  const envTemplatePath = path.join(process.cwd(), 'functions', '.env.example');
  logResult({
    passed: fs.existsSync(envTemplatePath),
    category: 'Security',
    message: fs.existsSync(envTemplatePath) 
      ? 'Environment template exists'
      : 'Missing .env.example template',
    severity: 'warning',
  });

  // Check for .gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const ignoresEnv = content.includes('.env');
    const ignoresSecrets = content.includes('secrets');
    
    logResult({
      passed: ignoresEnv && ignoresSecrets,
      category: 'Security',
      message: (ignoresEnv && ignoresSecrets)
        ? 'Sensitive files properly gitignored'
        : 'Gitignore missing sensitive file patterns',
      severity: (ignoresEnv && ignoresSecrets) ? 'info' : 'error',
    });
  }

  // Check firebase.json for proper configuration
  const firebasePath = path.join(process.cwd(), 'firebase.json');
  if (fs.existsSync(firebasePath)) {
    const config = JSON.parse(fs.readFileSync(firebasePath, 'utf-8'));
    const hasRules = config.firestore?.rules && config.storage?.rules;
    logResult({
      passed: hasRules,
      category: 'Security',
      message: hasRules 
        ? 'Firestore and Storage rules configured'
        : 'Missing security rules configuration',
      severity: hasRules ? 'info' : 'error',
    });
  }
}

// ============================================================================
// DEPENDENCY VALIDATION
// ============================================================================

function validateDependencies(): void {
  console.log('\n📚 Validating Dependencies...');
  
  const workspaces = ['sdk', 'functions', 'ops', 'monitoring'];
  
  for (const workspace of workspaces) {
    const pkgPath = path.join(process.cwd(), workspace, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const hasDeps = pkg.dependencies && Object.keys(pkg.dependencies).length > 0;
      logResult({
        passed: true,
        category: 'Dependencies',
        message: `${workspace}: ${hasDeps ? Object.keys(pkg.dependencies).length : 0} dependencies`,
        severity: 'info',
      });
    } else {
      logResult({
        passed: false,
        category: 'Dependencies',
        message: `Missing package.json in ${workspace}`,
        severity: 'warning',
      });
    }
  }
}

// ============================================================================
// DOCUMENTATION VALIDATION
// ============================================================================

function validateDocumentation(): void {
  console.log('\n📖 Validating Documentation...');
  
  const requiredDocs = [
    'README.md',
    'docs/AVALO_TECH_ARCHITECTURE_v5.md',
    'docs/AVALO_SDK_REFERENCE.md',
    'docs/AVALO_SECURITY_MODEL_V2.md',
  ];

  for (const doc of requiredDocs) {
    const docPath = path.join(process.cwd(), doc);
    if (fs.existsSync(docPath)) {
      const stats = fs.statSync(docPath);
      logResult({
        passed: stats.size > 100,
        category: 'Documentation',
        message: `Found ${doc} (${(stats.size / 1024).toFixed(1)}KB)`,
        severity: 'info',
      });
    } else {
      logResult({
        passed: false,
        category: 'Documentation',
        message: `Missing: ${doc}`,
        severity: 'warning',
      });
    }
  }
}

// ============================================================================
// BUILD SYSTEM VALIDATION
// ============================================================================

function validateBuildSystem(): void {
  console.log('\n🔨 Validating Build System...');
  
  const rootPkg = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(rootPkg)) {
    const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf-8'));
    
    const requiredScripts = [
      'build',
      'build:functions',
      'build:sdk',
      'test',
      'deploy',
    ];

    for (const script of requiredScripts) {
      const hasScript = pkg.scripts?.[script];
      logResult({
        passed: hasScript,
        category: 'Build',
        message: hasScript 
          ? `Script '${script}' configured`
          : `Missing script: ${script}`,
        severity: hasScript ? 'info' : 'error',
      });
    }

    // Check workspaces
    const hasWorkspaces = pkg.workspaces && pkg.workspaces.length > 0;
    logResult({
      passed: hasWorkspaces,
      category: 'Build',
      message: hasWorkspaces 
        ? `Workspaces configured: ${pkg.workspaces.join(', ')}`
        : 'No workspaces configured',
      severity: hasWorkspaces ? 'info' : 'warning',
    });
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         AVALO MONOREPO PRE-BUILD VALIDATOR v3.0.0             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  validateSDK();
  validateFunctions();
  validateSecurity();
  validateDependencies();
  validateDocumentation();
  validateBuildSystem();

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      VALIDATION SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const errors = results.filter(r => !r.passed && r.severity === 'error');
  const warnings = results.filter(r => !r.passed && r.severity === 'warning');
  const passed = results.filter(r => r.passed);

  console.log(`✅ Passed:   ${passed.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Errors:   ${errors.length}\n`);

  if (errors.length > 0) {
    console.log('❌ BUILD VALIDATION FAILED - Fix errors before proceeding\n');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('⚠️  BUILD VALIDATION PASSED WITH WARNINGS\n');
    process.exit(0);
  } else {
    console.log('✅ BUILD VALIDATION PASSED - Ready for deployment\n');
    process.exit(0);
  }
}

main();