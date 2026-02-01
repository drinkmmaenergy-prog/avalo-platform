/**
 * Mass TypeScript Fix Script
 * Fixes common patterns across all files
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalFixes = 0;
const fixedFiles = new Set();

// Extended ReputationEventType enum values
const REPUTATION_EVENT_TYPES = `enum ReputationEventType { 
  POSITIVE = 'POSITIVE', 
  NEGATIVE = 'NEGATIVE', 
  NEUTRAL = 'NEUTRAL',
  TRUST_FLAG_ADDED = 'TRUST_FLAG_ADDED',
  NO_SAFETY_INCIDENTS = 'NO_SAFETY_INCIDENTS',
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  SESSION_ATTENDED = 'SESSION_ATTENDED',
  SESSION_NO_SHOW = 'SESSION_NO_SHOW',
  SESSION_LATE_CANCEL = 'SESSION_LATE_CANCEL',
  REVIEW_RECEIVED = 'REVIEW_RECEIVED',
  CURRICULUM_COMPLETED = 'CURRICULUM_COMPLETED',
  CURRICULUM_MODULE_COMPLETED = 'CURRICULUM_MODULE_COMPLETED',
  EVENT_ATTENDED = 'EVENT_ATTENDED',
  EVENT_NO_SHOW = 'EVENT_NO_SHOW',
  CHALLENGE_COMPLETED = 'CHALLENGE_COMPLETED',
  PRODUCT_DELIVERED = 'PRODUCT_DELIVERED',
  PRODUCT_REFUNDED = 'PRODUCT_REFUNDED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  DISPUTE_UNRESOLVED = 'DISPUTE_UNRESOLVED',
  CONSENT_VIOLATION = 'CONSENT_VIOLATION',
  HARASSMENT_DETECTED = 'HARASSMENT_DETECTED',
  SAFETY_VIOLATION = 'SAFETY_VIOLATION',
  TRUST_FLAG_REMOVED = 'TRUST_FLAG_REMOVED',
  REPORT_DISMISSED = 'REPORT_DISMISSED',
}`;

// Extended ReputationDimension enum values
const REPUTATION_DIMENSIONS = `enum ReputationDimension { 
  TRUST = 'TRUST', 
  ENGAGEMENT = 'ENGAGEMENT', 
  QUALITY = 'QUALITY', 
  SAFETY = 'SAFETY',
  RELIABILITY = 'RELIABILITY',
  COMMUNICATION = 'COMMUNICATION',
  DELIVERY = 'DELIVERY',
  EXPERTISE = 'EXPERTISE',
  SAFETY_CONSISTENCY = 'SAFETY_CONSISTENCY',
}`;

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      callback(filePath);
    }
  }
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const relativePath = path.relative(srcDir, filePath);
  
  // Fix 1: Replace short ReputationEventType enum with extended version
  if (content.includes('enum ReputationEventType {') && 
      !content.includes('TRUST_FLAG_ADDED')) {
    content = content.replace(
      /enum ReputationEventType\s*\{[^}]+\}/,
      REPUTATION_EVENT_TYPES
    );
    totalFixes++;
  }
  
  // Fix 2: Replace short ReputationDimension enum with extended version
  if (content.includes('enum ReputationDimension {') && 
      !content.includes('RELIABILITY')) {
    content = content.replace(
      /enum ReputationDimension\s*\{[^}]+\}/,
      REPUTATION_DIMENSIONS
    );
    totalFixes++;
  }
  
  // Fix 3: Fix logger import conflicts
  if (content.includes("import { logger }") && 
      content.includes("const logger =")) {
    content = content.replace(
      /const logger\s*=\s*[^;]+;/g,
      '// logger imported from runtime'
    );
    totalFixes++;
  }
  
  // Fix 4: Fix storage import conflicts
  if (content.includes("import {") && 
      content.includes("storage") &&
      content.includes("const storage =")) {
    content = content.replace(
      /const storage\s*=\s*admin\.storage\(\)/g,
      'const storageInstance = admin.storage()'
    );
    totalFixes++;
  }
  
  // Fix 5: Add missing FieldValue import where used
  if (content.includes('FieldValue.') && 
      !content.includes("import { FieldValue") &&
      !content.includes("import {FieldValue") &&
      !content.includes("FieldValue }") &&
      !content.includes("FieldValue,")) {
    
    // Check if there's an init import we can extend
    if (content.includes("from './init'")) {
      content = content.replace(
        /import \{([^}]+)\} from ['"]\.\/init['"]/,
        (match, imports) => {
          if (!imports.includes('FieldValue')) {
            return `import {${imports.trim()}, FieldValue } from './init'`;
          }
          return match;
        }
      );
      totalFixes++;
    } else if (content.includes("from '../init'")) {
      content = content.replace(
        /import \{([^}]+)\} from ['"]\.\.\/init['"]/,
        (match, imports) => {
          if (!imports.includes('FieldValue')) {
            return `import {${imports.trim()}, FieldValue } from '../init'`;
          }
          return match;
        }
      );
      totalFixes++;
    }
  }
  
  // Fix 6: Add FirestoreTimestamp type alias where needed
  if (content.includes('FirestoreTimestamp') && 
      !content.includes('type FirestoreTimestamp') &&
      !content.includes('interface FirestoreTimestamp')) {
    
    // Add after imports
    const importMatch = content.match(/^(import[^;]+;[\r\n]*)+/m);
    if (importMatch) {
      const insertPos = importMatch.index + importMatch[0].length;
      const alias = '\ntype FirestoreTimestamp = import("firebase-admin/firestore").Timestamp;\n';
      content = content.slice(0, insertPos) + alias + content.slice(insertPos);
      totalFixes++;
    }
  }
  
  // Fix 7: Fix DefenseEventType, EventSeverity, TriggerSource for pack429 files
  if (relativePath.includes('pack429')) {
    // DefenseEventType
    if (content.includes("type DefenseEventType =") && 
        !content.includes("const DefenseEventType =")) {
      content = content.replace(
        /type DefenseEventType\s*=\s*[^;]+;/,
        `const DefenseEventType = {
  SPIKE: 'SPIKE' as const,
  BOT_ATTACK: 'BOT_ATTACK' as const,
  SABOTAGE: 'SABOTAGE' as const,
  COORDINATED: 'COORDINATED' as const,
  ANOMALY: 'ANOMALY' as const,
} as const;
type DefenseEventType = typeof DefenseEventType[keyof typeof DefenseEventType];`
      );
      totalFixes++;
    }
    
    // EventSeverity
    if (content.includes("type EventSeverity =") && 
        !content.includes("const EventSeverity =")) {
      content = content.replace(
        /type EventSeverity\s*=\s*[^;]+;/,
        `const EventSeverity = {
  LOW: 'LOW' as const,
  MEDIUM: 'MEDIUM' as const,
  HIGH: 'HIGH' as const,
  CRITICAL: 'CRITICAL' as const,
} as const;
type EventSeverity = typeof EventSeverity[keyof typeof EventSeverity];`
      );
      totalFixes++;
    }
    
    // TriggerSource
    if (content.includes("type TriggerSource =") && 
        !content.includes("const TriggerSource =")) {
      content = content.replace(
        /type TriggerSource\s*=\s*[^;]+;/,
        `const TriggerSource = {
  REVIEWS: 'REVIEWS' as const,
  FRAUD: 'FRAUD' as const,
  MANUAL: 'MANUAL' as const,
  SYSTEM: 'SYSTEM' as const,
  SOCIAL: 'SOCIAL' as const,
} as const;
type TriggerSource = typeof TriggerSource[keyof typeof TriggerSource];`
      );
      totalFixes++;
    }
  }
  
  // Fix 8: Fix pack441 FieldValue access
  if (relativePath.includes('pack441')) {
    // Replace Firestore.FieldValue with FieldValue
    if (content.includes('Firestore.FieldValue')) {
      content = content.replace(/Firestore\.FieldValue/g, 'FieldValue');
      
      // Add FieldValue import if not present
      if (!content.includes("import { FieldValue") && 
          !content.includes("FieldValue }") &&
          !content.includes("FieldValue,")) {
        const importMatch = content.match(/^(import[^;]+;[\r\n]*)+/m);
        if (importMatch) {
          const insertPos = importMatch.index + importMatch[0].length;
          content = content.slice(0, insertPos) + "\nimport { FieldValue } from '../init';\n" + content.slice(insertPos);
        }
      }
      totalFixes++;
    }
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    fixedFiles.add(relativePath);
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log('Starting mass TypeScript fix...\n');

walkDir(srcDir, fixFile);

console.log('\n============================================');
console.log(`Total fixes applied: ${totalFixes}`);
console.log(`Files modified: ${fixedFiles.size}`);
console.log('============================================');
