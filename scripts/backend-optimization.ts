/**
 * ========================================================================
 * AVALO BACKEND OPTIMIZATION & CDN VALIDATION SCRIPT
 * ========================================================================
 * Analyzes hosting performance, compression, CDN efficiency, and function allocations
 * 
 * @version 1.0.0
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TestEndpoint {
  name: string;
  url: string;
  type: 'static' | 'function' | 'api';
}

const ENDPOINTS: TestEndpoint[] = [
  { name: 'Health Check', url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/ping', type: 'function' },
  { name: 'System Info', url: 'https://europe-west3-avalo-c8c46.cloudfunctions.net/getSystemInfo', type: 'function' },
  { name: 'App Hosting', url: 'https://avalo-c8c46.web.app/', type: 'static' },
  { name: 'Web Hosting', url: 'https://avalo-c8c46.firebaseapp.com/', type: 'static' },
];

const FIREBASE_PROJECT = 'avalo-c8c46';
const FIREBASE_REGION = 'europe-west3';

// ============================================================================
// TYPES
// ============================================================================

interface CompressionResult {
  endpoint: string;
  originalSize: number;
  gzipSize: number;
  brotliSize: number;
  gzipRatio: number;
  brotliRatio: number;
  gzipSupported: boolean;
  brotliSupported: boolean;
}

interface TTFBResult {
  endpoint: string;
  ttfb: number;
  totalTime: number;
  statusCode: number;
  headers: Record<string, string>;
}

interface CDNResult {
  endpoint: string;
  cdnHit: boolean;
  cdnProvider: string | null;
  cacheControl: string | null;
  age: number | null;
  xCache: string | null;
}

interface FunctionAllocation {
  name: string;
  currentMemory: string;
  recommendedMemory: string;
  reason: string;
}

interface BundleAnalysis {
  file: string;
  size: number;
  sizeFormatted: string;
  oversized: boolean;
}

interface OptimizationReport {
  timestamp: string;
  compression: CompressionResult[];
  ttfb: TTFBResult[];
  cdn: CDNResult[];
  functions: FunctionAllocation[];
  bundles: BundleAnalysis[];
  recommendations: string[];
}

// ============================================================================
// COMPRESSION TESTING
// ============================================================================

async function testCompression(url: string): Promise<CompressionResult> {
  console.log(`🔍 Testing compression for: ${url}`);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Avalo-Optimizer/1.0'
      }
    };

    const req = https.request(options, async (res) => {
      const chunks: Buffer[] = [];
      
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const originalSize = buffer.length;
          
          // Test compression ratios
          const gzipBuffer = await gzip(buffer);
          const brotliBuffer = await brotliCompress(buffer);
          
          const gzipSize = gzipBuffer.length;
          const brotliSize = brotliBuffer.length;
          
          const result: CompressionResult = {
            endpoint: url,
            originalSize,
            gzipSize,
            brotliSize,
            gzipRatio: ((1 - gzipSize / originalSize) * 100),
            brotliRatio: ((1 - brotliSize / originalSize) * 100),
            gzipSupported: res.headers['content-encoding']?.includes('gzip') || false,
            brotliSupported: res.headers['content-encoding']?.includes('br') || false,
          };
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// ============================================================================
// TTFB MEASUREMENT
// ============================================================================

async function measureTTFB(url: string): Promise<TTFBResult> {
  console.log(`⏱️  Measuring TTFB for: ${url}`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let ttfbTime = 0;
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Avalo-Optimizer/1.0'
      }
    };

    const req = https.request(options, (res) => {
      ttfbTime = Date.now() - startTime;
      
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const totalTime = Date.now() - startTime;
        
        const headers: Record<string, string> = {};
        Object.keys(res.headers).forEach(key => {
          headers[key] = String(res.headers[key]);
        });
        
        resolve({
          endpoint: url,
          ttfb: ttfbTime,
          totalTime,
          statusCode: res.statusCode || 0,
          headers
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// ============================================================================
// CDN VALIDATION
// ============================================================================

async function validateCDN(url: string): Promise<CDNResult> {
  console.log(`🌐 Validating CDN for: ${url}`);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'HEAD',
      headers: {
        'User-Agent': 'Avalo-Optimizer/1.0'
      }
    };

    const req = https.request(options, (res) => {
      const headers = res.headers;
      
      // Detect CDN provider
      let cdnProvider: string | null = null;
      let cdnHit = false;

      // Cloudflare detection
      if (headers['cf-ray'] || headers['cf-cache-status']) {
        cdnProvider = 'Cloudflare';
        cdnHit = headers['cf-cache-status'] === 'HIT';
      }
      
      // Firebase CDN detection
      if (headers['x-firebase-hosting']) {
        cdnProvider = 'Firebase CDN';
        cdnHit = headers['x-cache'] === 'HIT';
      }

      // Generic cache detection
      if (headers['x-cache']?.includes('HIT')) {
        cdnHit = true;
      }

      const result: CDNResult = {
        endpoint: url,
        cdnHit,
        cdnProvider,
        cacheControl: String(headers['cache-control'] || null),
        age: headers['age'] ? parseInt(String(headers['age'])) : null,
        xCache: String(headers['x-cache'] || null),
      };

      resolve(result);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// ============================================================================
// FUNCTION MEMORY ANALYSIS
// ============================================================================

function analyzeFunctionMemory(): FunctionAllocation[] {
  console.log(`🧠 Analyzing Firebase Functions memory allocations...`);
  
  const allocations: FunctionAllocation[] = [];

  // AI-related functions should have 512MB
  const aiFunctions = [
    'analyzeContentV1',
    'sendAIMessageCallable',
    'startAIChatCallable',
    'listAICompanionsCallable',
    'analyzeUserRiskGraphV1',
    'getUserRiskAssessmentV1',
  ];

  aiFunctions.forEach(name => {
    allocations.push({
      name,
      currentMemory: '256MB (default)',
      recommendedMemory: '512MB',
      reason: 'AI processing requires more memory for ML models and inference'
    });
  });

  // Feed functions
  allocations.push({
    name: 'getGlobalFeedV1',
    currentMemory: '512MB (configured)',
    recommendedMemory: '256MB',
    reason: 'Current allocation is appropriate for feed queries with pagination'
  });

  allocations.push({
    name: 'createPostV1',
    currentMemory: '256MB (default)',
    recommendedMemory: '256MB',
    reason: 'Current allocation is sufficient for post creation'
  });

  // Heavy computation functions
  allocations.push({
    name: 'generatePredictionsV1',
    currentMemory: '2GB (configured)',
    recommendedMemory: '2GB',
    reason: 'Heavy ML prediction workload requires high memory'
  });

  allocations.push({
    name: 'exportMetricsV1',
    currentMemory: '1GB (configured)',
    recommendedMemory: '1GB',
    reason: 'Large data export operations need substantial memory'
  });

  // Payment functions
  allocations.push({
    name: 'purchaseTokensV2',
    currentMemory: '256MB (default)',
    recommendedMemory: '256MB',
    reason: 'Standard API processing is sufficient'
  });

  allocations.push({
    name: 'stripeWebhook',
    currentMemory: '256MB (default)',
    recommendedMemory: '256MB',
    reason: 'Webhook processing is lightweight'
  });

  return allocations;
}

// ============================================================================
// BUNDLE SIZE ANALYSIS
// ============================================================================

function analyzeBundleSizes(): BundleAnalysis[] {
  console.log(`📦 Analyzing bundle sizes...`);
  
  const bundles: BundleAnalysis[] = [];
  const functionsLibPath = path.join(process.cwd(), 'functions', 'lib');
  
  if (!fs.existsSync(functionsLibPath)) {
    console.log(`⚠️  Functions lib directory not found. Run 'npm run build:functions' first.`);
    return bundles;
  }

  function analyzeDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        analyzeDirectory(filePath);
      } else if (file.endsWith('.js')) {
        const size = stat.size;
        const sizeKB = (size / 1024).toFixed(2);
        const sizeMB = (size / 1024 / 1024).toFixed(2);
        const oversized = size > 1024 * 1024; // > 1MB
        
        bundles.push({
          file: path.relative(functionsLibPath, filePath),
          size,
          sizeFormatted: size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`,
          oversized
        });
      }
    });
  }

  analyzeDirectory(functionsLibPath);
  
  // Sort by size descending
  bundles.sort((a, b) => b.size - a.size);
  
  return bundles;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateRecommendations(report: OptimizationReport): string[] {
  const recommendations: string[] = [];

  // Compression recommendations
  const compressionIssues = report.compression.filter(c => 
    !c.gzipSupported && !c.brotliSupported
  );
  if (compressionIssues.length > 0) {
    recommendations.push(
      `⚠️  ${compressionIssues.length} endpoint(s) missing compression (gzip/brotli)`
    );
  }

  // TTFB recommendations
  const slowEndpoints = report.ttfb.filter(t => t.ttfb > 1000);
  if (slowEndpoints.length > 0) {
    recommendations.push(
      `⚠️  ${slowEndpoints.length} endpoint(s) with TTFB > 1s - consider caching or optimization`
    );
  }

  // CDN recommendations
  const nonCachedEndpoints = report.cdn.filter(c => !c.cdnHit && c.cacheControl?.includes('max-age'));
  if (nonCachedEndpoints.length > 0) {
    recommendations.push(
      `💡 ${nonCachedEndpoints.length} cacheable endpoint(s) not hitting CDN - may need warm-up`
    );
  }

  // Function memory recommendations
  const memoryAdjustments = report.functions.filter(f => 
    f.currentMemory !== f.recommendedMemory
  );
  if (memoryAdjustments.length > 0) {
    recommendations.push(
      `🧠 ${memoryAdjustments.length} function(s) need memory allocation adjustments`
    );
  }

  // Bundle size recommendations
  const oversizedBundles = report.bundles.filter(b => b.oversized);
  if (oversizedBundles.length > 0) {
    recommendations.push(
      `📦 ${oversizedBundles.length} bundle(s) exceed 1MB - consider code splitting or lazy loading`
    );
  }

  // General recommendations
  recommendations.push('✅ Enable Cloudflare CDN for all static assets');
  recommendations.push('✅ Implement lazy loading for heavy function imports');
  recommendations.push('✅ Use tree-shaking to eliminate unused dependencies');
  recommendations.push('✅ Consider Cloud CDN for Firebase Functions');

  return recommendations;
}

function formatReport(report: OptimizationReport): string {
  let output = `# 🧠 Avalo Backend Optimization & CDN Validation Report\n\n`;
  output += `**Generated:** ${report.timestamp}\n\n`;
  output += `---\n\n`;

  // Compression Analysis
  output += `## 📊 Compression Analysis\n\n`;
  report.compression.forEach(comp => {
    output += `### ${comp.endpoint}\n\n`;
    output += `- **Original Size:** ${(comp.originalSize / 1024).toFixed(2)} KB\n`;
    output += `- **Gzip Size:** ${(comp.gzipSize / 1024).toFixed(2)} KB (${comp.gzipRatio.toFixed(1)}% reduction)\n`;
    output += `- **Brotli Size:** ${(comp.brotliSize / 1024).toFixed(2)} KB (${comp.brotliRatio.toFixed(1)}% reduction)\n`;
    output += `- **Gzip Supported:** ${comp.gzipSupported ? '✅' : '❌'}\n`;
    output += `- **Brotli Supported:** ${comp.brotliSupported ? '✅' : '❌'}\n\n`;
  });

  // TTFB Analysis
  output += `## ⏱️ TTFB (Time to First Byte) Analysis\n\n`;
  report.ttfb.forEach(ttfb => {
    const status = ttfb.ttfb < 500 ? '🟢' : ttfb.ttfb < 1000 ? '🟡' : '🔴';
    output += `### ${status} ${ttfb.endpoint}\n\n`;
    output += `- **TTFB:** ${ttfb.ttfb}ms\n`;
    output += `- **Total Time:** ${ttfb.totalTime}ms\n`;
    output += `- **Status Code:** ${ttfb.statusCode}\n`;
    output += `- **Cache-Control:** ${ttfb.headers['cache-control'] || 'Not set'}\n\n`;
  });

  // CDN Analysis
  output += `## 🌐 CDN Validation\n\n`;
  report.cdn.forEach(cdn => {
    output += `### ${cdn.endpoint}\n\n`;
    output += `- **CDN Provider:** ${cdn.cdnProvider || 'None detected'}\n`;
    output += `- **Cache Hit:** ${cdn.cdnHit ? '✅' : '❌'}\n`;
    output += `- **Cache-Control:** ${cdn.cacheControl || 'Not set'}\n`;
    output += `- **Age:** ${cdn.age !== null ? `${cdn.age}s` : 'N/A'}\n`;
    output += `- **X-Cache:** ${cdn.xCache || 'Not set'}\n\n`;
  });

  // Function Memory Allocations
  output += `## 🧠 Firebase Functions Memory Allocations\n\n`;
  output += `| Function | Current | Recommended | Reason |\n`;
  output += `|----------|---------|-------------|--------|\n`;
  report.functions.forEach(func => {
    const status = func.currentMemory === func.recommendedMemory ? '✅' : '⚠️';
    output += `| ${status} ${func.name} | ${func.currentMemory} | ${func.recommendedMemory} | ${func.reason} |\n`;
  });
  output += `\n`;

  // Bundle Analysis
  if (report.bundles.length > 0) {
    output += `## 📦 Bundle Size Analysis\n\n`;
    output += `**Top 10 Largest Bundles:**\n\n`;
    output += `| File | Size | Status |\n`;
    output += `|------|------|--------|\n`;
    report.bundles.slice(0, 10).forEach(bundle => {
      const status = bundle.oversized ? '🔴' : '🟢';
      output += `| ${status} ${bundle.file} | ${bundle.sizeFormatted} | ${bundle.oversized ? 'Oversized' : 'OK'} |\n`;
    });
    output += `\n`;
  }

  // Recommendations
  output += `## 💡 Recommendations\n\n`;
  report.recommendations.forEach(rec => {
    output += `${rec}\n`;
  });
  output += `\n`;

  // Summary
  output += `## 📈 Summary\n\n`;
  output += `- **Endpoints Tested:** ${report.compression.length}\n`;
  output += `- **Average TTFB:** ${(report.ttfb.reduce((sum, t) => sum + t.ttfb, 0) / report.ttfb.length).toFixed(0)}ms\n`;
  output += `- **CDN Hit Rate:** ${((report.cdn.filter(c => c.cdnHit).length / report.cdn.length) * 100).toFixed(1)}%\n`;
  output += `- **Functions Analyzed:** ${report.functions.length}\n`;
  output += `- **Bundles Analyzed:** ${report.bundles.length}\n`;
  output += `- **Oversized Bundles:** ${report.bundles.filter(b => b.oversized).length}\n\n`;

  output += `---\n\n`;
  output += `*Report generated by Avalo Backend Optimizer v1.0.0*\n`;

  return output;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🚀 Starting Avalo Backend Optimization Analysis...\n');

  const report: OptimizationReport = {
    timestamp: new Date().toISOString(),
    compression: [],
    ttfb: [],
    cdn: [],
    functions: [],
    bundles: [],
    recommendations: []
  };

  // Test compression
  console.log('\n📊 Testing Compression...\n');
  for (const endpoint of ENDPOINTS) {
    try {
      const result = await testCompression(endpoint.url);
      report.compression.push(result);
    } catch (error) {
      console.error(`❌ Error testing ${endpoint.name}:`, error);
    }
  }

  // Measure TTFB
  console.log('\n⏱️  Measuring TTFB...\n');
  for (const endpoint of ENDPOINTS) {
    try {
      const result = await measureTTFB(endpoint.url);
      report.ttfb.push(result);
    } catch (error) {
      console.error(`❌ Error measuring ${endpoint.name}:`, error);
    }
  }

  // Validate CDN
  console.log('\n🌐 Validating CDN...\n');
  for (const endpoint of ENDPOINTS) {
    try {
      const result = await validateCDN(endpoint.url);
      report.cdn.push(result);
    } catch (error) {
      console.error(`❌ Error validating ${endpoint.name}:`, error);
    }
  }

  // Analyze function memory
  console.log('\n🧠 Analyzing Function Memory...\n');
  report.functions = analyzeFunctionMemory();

  // Analyze bundle sizes
  console.log('\n📦 Analyzing Bundle Sizes...\n');
  report.bundles = analyzeBundleSizes();

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  // Save reports
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const markdownReport = formatReport(report);
  const markdownPath = path.join(reportsDir, 'backend_optimization.md');
  const jsonPath = path.join(reportsDir, 'backend_optimization.json');

  fs.writeFileSync(markdownPath, markdownReport);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log(`\n✅ Reports generated:`);
  console.log(`   📄 ${markdownPath}`);
  console.log(`   📄 ${jsonPath}`);
  console.log(`\n🎉 Backend optimization analysis complete!\n`);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { main };
export type { OptimizationReport };