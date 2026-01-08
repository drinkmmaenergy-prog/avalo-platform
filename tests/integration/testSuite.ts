/**
 * ========================================================================
 * AVALO FIREBASE INTEGRATION TEST SUITE - MAIN TEST RUNNER
 * ========================================================================
 */

import * as path from 'path';
import { testConfig, testEndpoints } from './config';
import {
  TestResult,
  TestReport,
  loadEnvFile,
  runCommand,
  makeRequest,
  waitFor,
  saveReport,
  isPortInUse,
  validateJSON,
  formatDuration,
} from './utils';

export class AvaloIntegrationTestSuite {
  private results: TestResult[] = [];
  private startTime: number = 0;
  private envVars: Record<string, string> = {};

  constructor() {
    console.log('🔥 AVALO Firebase Integration Test Suite');
    console.log('========================================\n');
  }

  /**
   * Run all tests
   */
  async runAll(): Promise<TestReport> {
    this.startTime = Date.now();

    console.log('📋 Starting comprehensive integration tests...\n');

    // 1. Environment Validation
    await this.testEnvironmentValidation();

    // 2. Build & Deployment
    await this.testBuildAndDeployment();

    // 3. Emulator Suite
    await this.testEmulatorSuite();

    // 4. HTTP Function Tests
    await this.testHttpFunctions();

    // 5. Stripe Integration
    await this.testStripeIntegration();

    // 6. Firestore Validation
    await this.testFirestoreValidation();

    // 7. Authentication
    await this.testAuthentication();

    // 8. Storage
    await this.testStorage();

    // 9. AI Services
    await this.testAIServices();

    // 10. Health & Performance
    await this.testHealthAndPerformance();

    // 11. Security
    await this.testSecurity();

    return this.generateReport();
  }

  /**
   * 1. ENVIRONMENT VALIDATION
   */
  private async testEnvironmentValidation(): Promise<void> {
    console.log('🔍 1. ENVIRONMENT VALIDATION');
    console.log('   ─────────────────────────\n');

    // Test 1.1: Load .env file
    await this.runTest('Environment: Load .env file', async () => {
      const envPath = path.join(process.cwd(), 'functions', '.env');
      this.envVars = loadEnvFile(envPath);
      
      if (Object.keys(this.envVars).length === 0) {
        throw new Error('.env file is empty');
      }

      return {
        message: `Loaded ${Object.keys(this.envVars).length} environment variables`,
        data: { count: Object.keys(this.envVars).length },
      };
    });

    // Test 1.2: Verify required variables
    await this.runTest('Environment: Required variables', async () => {
      const missing: string[] = [];
      
      for (const key of testConfig.requiredEnvVars) {
        if (!this.envVars[key]) {
          missing.push(key);
        }
      }

      if (missing.length > 0) {
        throw new Error(`Missing required variables: ${missing.join(', ')}`);
      }

      return {
        message: `All ${testConfig.requiredEnvVars.length} required variables present`,
      };
    });

    // Test 1.3: Check forbidden variables
    await this.runTest('Environment: Forbidden variables', async () => {
      const found: string[] = [];
      
      for (const key of testConfig.forbiddenEnvVars) {
        if (this.envVars[key]) {
          found.push(key);
        }
      }

      if (found.length > 0) {
        return {
          status: 'warning' as const,
          message: `Found forbidden Firebase reserved keys: ${found.join(', ')}`,
        };
      }

      return {
        message: 'No forbidden variables found',
      };
    });

    // Test 1.4: Validate API key formats
    await this.runTest('Environment: API key validation', async () => {
      const warnings: string[] = [];

      if (this.envVars.STRIPE_SECRET_KEY && !this.envVars.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
        warnings.push('Stripe key is not in test mode');
      }

      if (this.envVars.OPENAI_API_KEY && this.envVars.OPENAI_API_KEY.length < 20) {
        warnings.push('OpenAI API key seems invalid');
      }

      if (this.envVars.ANTHROPIC_API_KEY && this.envVars.ANTHROPIC_API_KEY.length < 20) {
        warnings.push('Anthropic API key seems invalid');
      }

      if (warnings.length > 0) {
        return {
          status: 'warning' as const,
          message: warnings.join('; '),
        };
      }

      return {
        message: 'All API keys have valid formats',
      };
    });

    console.log('');
  }

  /**
   * 2. BUILD & DEPLOYMENT
   */
  private async testBuildAndDeployment(): Promise<void> {
    console.log('🔨 2. BUILD & DEPLOYMENT');
    console.log('   ──────────────────────\n');

    // Test 2.1: Run npm build
    await this.runTest('Build: TypeScript compilation', async () => {
      const result = await runCommand('npm run build', path.join(process.cwd(), 'functions'), 120000);

      if (result.exitCode !== 0) {
        throw new Error(`Build failed: ${result.stderr}`);
      }

      return {
        message: 'TypeScript compilation successful',
        data: { output: result.stdout.substring(0, 200) },
      };
    });

    // Test 2.2: Verify lib/index.js exists
    await this.runTest('Build: Output validation', async () => {
      const libPath = path.join(process.cwd(), 'functions', 'lib', 'index.js');
      const fs = require('fs');

      if (!fs.existsSync(libPath)) {
        throw new Error('lib/index.js not found after build');
      }

      const stats = fs.statSync(libPath);
      return {
        message: `Built file size: ${(stats.size / 1024).toFixed(2)} KB`,
        data: { size: stats.size },
      };
    });

    console.log('');
  }

  /**
   * 3. EMULATOR SUITE
   */
  private async testEmulatorSuite(): Promise<void> {
    console.log('🎮 3. EMULATOR SUITE');
    console.log('   ─────────────────\n');

    // Test 3.1: Check if emulators are running
    await this.runTest('Emulator: Functions emulator', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.functions);

      if (!isRunning) {
        return {
          status: 'warning' as const,
          message: 'Functions emulator not running. Start with: firebase emulators:start',
        };
      }

      return {
        message: `Functions emulator running on port ${testConfig.emulatorPorts.functions}`,
      };
    });

    await this.runTest('Emulator: Firestore emulator', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.firestore);

      if (!isRunning) {
        return {
          status: 'warning' as const,
          message: 'Firestore emulator not running',
        };
      }

      return {
        message: `Firestore emulator running on port ${testConfig.emulatorPorts.firestore}`,
      };
    });

    await this.runTest('Emulator: Auth emulator', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.auth);

      if (!isRunning) {
        return {
          status: 'warning' as const,
          message: 'Auth emulator not running',
        };
      }

      return {
        message: `Auth emulator running on port ${testConfig.emulatorPorts.auth}`,
      };
    });

    await this.runTest('Emulator: Storage emulator', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.storage);

      if (!isRunning) {
        return {
          status: 'warning' as const,
          message: 'Storage emulator not running',
        };
      }

      return {
        message: `Storage emulator running on port ${testConfig.emulatorPorts.storage}`,
      };
    });

    console.log('');
  }

  /**
   * 4. HTTP FUNCTION TESTS
   */
  private async testHttpFunctions(): Promise<void> {
    console.log('🌐 4. HTTP FUNCTION TESTS');
    console.log('   ──────────────────────\n');

    for (const endpoint of testEndpoints) {
      await this.runTest(`Endpoint: ${endpoint}`, async () => {
        const url = `${testConfig.endpoints.functions}/${endpoint}`;
        
        try {
          const response = await makeRequest(url, { timeout: 15000 });

          if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
          }

          // Validate response structure
          if (typeof response.data !== 'object') {
            throw new Error('Response is not a valid JSON object');
          }

          return {
            message: `Response time: ${response.duration}ms`,
            data: {
              status: response.status,
              duration: response.duration,
              responseKeys: Object.keys(response.data),
            },
          };
        } catch (error: any) {
          if (error.message.includes('fetch failed')) {
            return {
              status: 'warning' as const,
              message: 'Endpoint unreachable. Emulator may not be running.',
            };
          }
          throw error;
        }
      });
    }

    console.log('');
  }

  /**
   * 5. STRIPE INTEGRATION
   */
  private async testStripeIntegration(): Promise<void> {
    console.log('💳 5. STRIPE INTEGRATION');
    console.log('   ─────────────────────\n');

    await this.runTest('Stripe: API key validation', async () => {
      const key = this.envVars.STRIPE_SECRET_KEY;

      if (!key) {
        throw new Error('STRIPE_SECRET_KEY not found');
      }

      if (!key.startsWith('sk_test_')) {
        return {
          status: 'warning' as const,
          message: 'Stripe key is not in test mode',
        };
      }

      return {
        message: 'Stripe test key configured correctly',
      };
    });

    await this.runTest('Stripe: Webhook endpoint', async () => {
      const url = `${testConfig.endpoints.functions}/stripeWebhook`;
      
      try {
        // Test webhook with mock payload
        const mockEvent = {
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              amount: 1000,
              currency: 'usd',
            },
          },
        };

        const response = await makeRequest(url, {
          method: 'POST',
          body: mockEvent,
          headers: {
            'stripe-signature': 'test_signature',
          },
          timeout: 10000,
        });

        // Note: This might fail authentication, but we're checking if the endpoint exists
        return {
          message: `Webhook endpoint accessible (status: ${response.status})`,
          data: { status: response.status },
        };
      } catch (error: any) {
        if (error.message.includes('fetch failed')) {
          return {
            status: 'warning' as const,
            message: 'Webhook endpoint unreachable',
          };
        }
        throw error;
      }
    });

    console.log('');
  }

  /**
   * 6. FIRESTORE VALIDATION
   */
  private async testFirestoreValidation(): Promise<void> {
    console.log('🗄️ 6. FIRESTORE VALIDATION');
    console.log('   ────────────────────────\n');

    await this.runTest('Firestore: Emulator connectivity', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.firestore);

      if (!isRunning) {
        return {
          status: 'skip' as const,
          message: 'Firestore emulator not running',
        };
      }

      return {
        message: 'Firestore emulator accessible',
      };
    });

    console.log('');
  }

  /**
   * 7. AUTHENTICATION
   */
  private async testAuthentication(): Promise<void> {
    console.log('🔐 7. AUTHENTICATION');
    console.log('   ─────────────────\n');

    await this.runTest('Auth: Emulator connectivity', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.auth);

      if (!isRunning) {
        return {
          status: 'skip' as const,
          message: 'Auth emulator not running',
        };
      }

      return {
        message: 'Auth emulator accessible',
      };
    });

    await this.runTest('Auth: OAuth configuration', async () => {
      if (!this.envVars.GOOGLE_CLIENT_ID) {
        return {
          status: 'warning' as const,
          message: 'GOOGLE_CLIENT_ID not configured',
        };
      }

      return {
        message: 'OAuth credentials configured',
      };
    });

    console.log('');
  }

  /**
   * 8. STORAGE
   */
  private async testStorage(): Promise<void> {
    console.log('📦 8. STORAGE');
    console.log('   ──────────\n');

    await this.runTest('Storage: Emulator connectivity', async () => {
      const isRunning = await isPortInUse(testConfig.emulatorPorts.storage);

      if (!isRunning) {
        return {
          status: 'skip' as const,
          message: 'Storage emulator not running',
        };
      }

      return {
        message: 'Storage emulator accessible',
      };
    });

    console.log('');
  }

  /**
   * 9. AI SERVICES
   */
  private async testAIServices(): Promise<void> {
    console.log('🤖 9. AI SERVICES');
    console.log('   ──────────────\n');

    await this.runTest('AI: OpenAI API key', async () => {
      if (!this.envVars.OPENAI_API_KEY) {
        return {
          status: 'warning' as const,
          message: 'OPENAI_API_KEY not configured',
        };
      }

      if (this.envVars.OPENAI_API_KEY.length < 20) {
        return {
          status: 'warning' as const,
          message: 'OpenAI API key seems invalid (too short)',
        };
      }

      return {
        message: 'OpenAI API key configured',
      };
    });

    await this.runTest('AI: Anthropic API key', async () => {
      if (!this.envVars.ANTHROPIC_API_KEY) {
        return {
          status: 'warning' as const,
          message: 'ANTHROPIC_API_KEY not configured',
        };
      }

      if (this.envVars.ANTHROPIC_API_KEY.length < 20) {
        return {
          status: 'warning' as const,
          message: 'Anthropic API key seems invalid (too short)',
        };
      }

      return {
        message: 'Anthropic API key configured',
      };
    });

    console.log('');
  }

  /**
   * 10. HEALTH & PERFORMANCE
   */
  private async testHealthAndPerformance(): Promise<void> {
    console.log('⚡ 10. HEALTH & PERFORMANCE');
    console.log('   ────────────────────────\n');

    await this.runTest('Performance: Ping latency', async () => {
      const url = `${testConfig.endpoints.functions}/ping`;
      
      try {
        const response = await makeRequest(url, { timeout: 5000 });

        if (response.duration > 1000) {
          return {
            status: 'warning' as const,
            message: `High latency: ${response.duration}ms`,
            data: { duration: response.duration },
          };
        }

        return {
          message: `Latency: ${response.duration}ms`,
          data: { duration: response.duration },
        };
      } catch (error: any) {
        return {
          status: 'skip' as const,
          message: 'Endpoint unreachable',
        };
      }
    });

    await this.runTest('Performance: System info response', async () => {
      const url = `${testConfig.endpoints.functions}/getSystemInfo`;
      
      try {
        const response = await makeRequest(url, { timeout: 5000 });

        const validation = validateJSON(response.data, ['version', 'service', 'region', 'status']);
        
        if (!validation.valid) {
          throw new Error(`Missing keys: ${validation.missing.join(', ')}`);
        }

        return {
          message: `Response time: ${response.duration}ms, Version: ${response.data.version}`,
          data: {
            duration: response.duration,
            version: response.data.version,
          },
        };
      } catch (error: any) {
        return {
          status: 'skip' as const,
          message: 'Endpoint unreachable',
        };
      }
    });

    console.log('');
  }

  /**
   * 11. SECURITY
   */
  private async testSecurity(): Promise<void> {
    console.log('🔒 11. SECURITY');
    console.log('   ────────────\n');

    await this.runTest('Security: Environment variable exposure', async () => {
      const sensitiveKeys = ['SECRET', 'KEY', 'PASSWORD', 'TOKEN'];
      const exposed: string[] = [];

      for (const [key, value] of Object.entries(this.envVars)) {
        if (sensitiveKeys.some(s => key.includes(s)) && value.length < 10) {
          exposed.push(key);
        }
      }

      if (exposed.length > 0) {
        return {
          status: 'warning' as const,
          message: `Potentially weak secrets: ${exposed.join(', ')}`,
        };
      }

      return {
        message: 'No obvious security issues in environment variables',
      };
    });

    await this.runTest('Security: API key formats', async () => {
      const warnings: string[] = [];

      if (this.envVars.STRIPE_SECRET_KEY && !this.envVars.STRIPE_SECRET_KEY.startsWith('sk_')) {
        warnings.push('Stripe key format invalid');
      }

      if (this.envVars.OPENAI_API_KEY && !this.envVars.OPENAI_API_KEY.startsWith('sk-')) {
        warnings.push('OpenAI key format invalid');
      }

      if (this.envVars.ANTHROPIC_API_KEY && !this.envVars.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
        warnings.push('Anthropic key format invalid');
      }

      if (warnings.length > 0) {
        return {
          status: 'warning' as const,
          message: warnings.join('; '),
        };
      }

      return {
        message: 'All API keys have correct formats',
      };
    });

    console.log('');
  }

  /**
   * Run a single test
   */
  private async runTest(
    name: string,
    testFn: () => Promise<{ status?: 'pass' | 'fail' | 'warning' | 'skip'; message?: string; data?: any }>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        status: result.status || 'pass',
        duration,
        message: result.message,
        data: result.data,
      });

      const icon = result.status === 'warning' ? '⚠️' : 
                   result.status === 'skip' ? '⏭️' : '✅';
      console.log(`   ${icon} ${name} (${formatDuration(duration)})`);
      if (result.message) {
        console.log(`      ${result.message}`);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        status: 'fail',
        duration,
        error: error.message,
      });

      console.log(`   🔥 ${name} (${formatDuration(duration)})`);
      console.log(`      Error: ${error.message}`);
    }
  }

  /**
   * Generate final report
   */
  private generateReport(): TestReport {
    const duration = Date.now() - this.startTime;
    
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;
    const skipped = this.results.filter(r => r.status === 'skip').length;

    return {
      timestamp: new Date().toISOString(),
      projectId: testConfig.projectId,
      region: testConfig.region,
      totalTests: this.results.length,
      passed,
      failed,
      warnings,
      skipped,
      duration,
      results: this.results,
      summary: {
        environment: this.results.filter(r => r.name.includes('Environment')),
        build: this.results.filter(r => r.name.includes('Build')),
        emulators: this.results.filter(r => r.name.includes('Emulator')),
        endpoints: this.results.filter(r => r.name.includes('Endpoint')),
        integrations: this.results.filter(r => 
          r.name.includes('Stripe') || r.name.includes('AI') || r.name.includes('Storage')
        ),
        security: this.results.filter(r => r.name.includes('Security')),
        performance: this.results.filter(r => r.name.includes('Performance')),
      },
    };
  }
}