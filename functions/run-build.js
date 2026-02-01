const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('npx tsc', { encoding: 'utf8', cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'] });
  fs.writeFileSync('build-output.txt', output);
  console.log('Build succeeded!');
  process.exit(0);
} catch (error) {
  fs.writeFileSync('build-output.txt', error.stdout + '\n' + error.stderr);
  console.log('Build failed. Output saved to build-output.txt');
  
  // Count errors
  const content = error.stdout + '\n' + error.stderr;
  const errors = {};
  const regex = /error (TS\d+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    errors[match[1]] = (errors[match[1]] || 0) + 1;
  }
  const sorted = Object.entries(errors).sort((a, b) => b[1] - a[1]);
  console.log('\nError distribution:');
  sorted.forEach(([k, v]) => console.log(`${k}: ${v}`));
  console.log('\nTotal:', sorted.reduce((sum, [, v]) => sum + v, 0));
  
  process.exit(1);
}
