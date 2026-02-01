/**
 * Analyze TypeScript build errors
 */
const fs = require('fs');
const path = require('path');

const buildOutput = fs.readFileSync(path.join(__dirname, 'build-output.txt'), 'utf8');
const lines = buildOutput.split('\n').filter(l => l.includes('error TS'));

// Count errors by file
const fileErrors = {};
lines.forEach(line => {
  const match = line.match(/^src\/([^(]+)/);
  if (match) {
    const file = match[1];
    fileErrors[file] = (fileErrors[file] || 0) + 1;
  }
});

// Sort by error count
const sorted = Object.entries(fileErrors).sort((a, b) => b[1] - a[1]);

console.log('Files with most errors:');
sorted.slice(0, 30).forEach(([file, count]) => {
  console.log(`  ${count.toString().padStart(3)} ${file}`);
});

// Count errors by type
const typeErrors = {};
lines.forEach(line => {
  const match = line.match(/error (TS\d+)/);
  if (match) {
    const type = match[1];
    typeErrors[type] = (typeErrors[type] || 0) + 1;
  }
});

console.log('\nErrors by type:');
Object.entries(typeErrors).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  console.log(`  ${count.toString().padStart(3)} ${type}`);
});

// Find void-related errors
console.log('\nVoid-related errors:');
const voidErrors = lines.filter(l => l.includes("'void'") || l.includes('type void'));
voidErrors.slice(0, 20).forEach(l => console.log('  ' + l.substring(0, 150)));

// Find missing enum values
console.log('\nMissing enum values:');
const enumErrors = lines.filter(l => l.includes("does not exist on type 'typeof"));
const enumMissing = {};
enumErrors.forEach(line => {
  const match = line.match(/Property '(\w+)' does not exist on type 'typeof (\w+)'/);
  if (match) {
    const key = `${match[2]}.${match[1]}`;
    enumMissing[key] = (enumMissing[key] || 0) + 1;
  }
});
Object.entries(enumMissing).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([key, count]) => {
  console.log(`  ${count.toString().padStart(2)} ${key}`);
});
