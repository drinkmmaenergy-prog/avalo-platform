/**
 * Fix TS2440 - Import declaration conflicts with local declaration
 * 
 * Pattern: File imports X from runtime but also has local class/const X
 * Fix: Remove X from the import statement
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with known TS2440 conflicts
const filesToFix = [
  { file: 'liveEngine.ts', symbol: 'HttpsError' },
  { file: 'mediaUpload.ts', symbol: 'HttpsError' },
  { file: 'pack-225-match-comeback.ts', symbol: 'Timestamp' },
  { file: 'pack142-identity-fraud-engine.ts', symbol: 'logger' },
  { file: 'pack142-liveness-engine.ts', symbol: 'logger' },
  { file: 'pack142-photo-consistency-engine.ts', symbol: 'logger' },
  { file: 'pack142-stolen-photo-deepfake-engine.ts', symbol: 'logger' },
  { file: 'pack142-voice-signature-engine.ts', symbol: 'logger' },
  { file: 'pack328b-chat-session-timeouts.ts', symbol: 'HttpsError' },
  { file: 'pack350-subscriptions.ts', symbol: 'Timestamp' },
  { file: 'questionsEngine.ts', symbol: 'HttpsError' },
];

let totalFixed = 0;

function removeSymbolFromImport(content, symbol) {
  // Pattern 1: import { symbol } from './runtime'
  const singleImportPattern = new RegExp(
    `import\\s*\\{\\s*${symbol}\\s*\\}\\s*from\\s*['"]\\.\\/runtime['"];?`,
    'g'
  );
  
  // Pattern 2: import { symbol, other } from './runtime'
  const firstInListPattern = new RegExp(
    `(import\\s*\\{\\s*)${symbol}\\s*,\\s*([^}]+\\}\\s*from\\s*['"]\\.\\/runtime['"])`,
    'g'
  );
  
  // Pattern 3: import { other, symbol } from './runtime'
  const lastInListPattern = new RegExp(
    `(import\\s*\\{[^}]+),\\s*${symbol}(\\s*\\}\\s*from\\s*['"]\\.\\/runtime['"])`,
    'g'
  );
  
  // Pattern 4: import { other, symbol, another } from './runtime'
  const middleInListPattern = new RegExp(
    `(import\\s*\\{[^}]*),\\s*${symbol}\\s*,([^}]+\\}\\s*from\\s*['"]\\.\\/runtime['"])`,
    'g'
  );
  
  let result = content;
  
  // Try each pattern
  result = result.replace(singleImportPattern, '// Removed: HttpsError import conflicts with local declaration');
  result = result.replace(firstInListPattern, '$1$2');
  result = result.replace(lastInListPattern, '$1$2');
  result = result.replace(middleInListPattern, '$1,$2');
  
  return result;
}

for (const { file, symbol } of filesToFix) {
  const filePath = path.join(srcDir, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = removeSymbolFromImport(content, symbol);
  
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Fixed: ${file} - removed ${symbol} from import`);
    totalFixed++;
  } else {
    console.log(`No change needed: ${file}`);
  }
}

console.log(`\nFixed ${totalFixed} files`);
